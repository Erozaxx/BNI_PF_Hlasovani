"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { getMeetingById } from "@/lib/db/queries/meetings";
import {
  hasVoted,
  castVote as dbCastVote,
} from "@/lib/db/queries/votes";
import type { ActionResult } from "@/lib/types";

const castVoteSchema = z.object({
  guestId: z.string().uuid("Neplatne ID hosta."),
  meetingId: z.string().uuid("Neplatne ID schuzky."),
  value: z.enum(["up", "neutral", "down"], {
    errorMap: () => ({ message: "Neplatna hodnota hlasu." }),
  }),
  reason: z.string().optional(),
});

/**
 * Cast a vote for a guest in a meeting.
 *
 * Rules:
 * - User must be authenticated
 * - Meeting must be in 'voting' status
 * - One vote per member per guest per meeting (no change allowed)
 * - 'down' requires a non-empty reason
 */
export async function castVoteAction(
  guestId: string,
  meetingId: string,
  value: string,
  reason?: string
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  // Validate input
  const parsed = castVoteSchema.safeParse({ guestId, meetingId, value, reason });
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Neplatny vstup.";
    return { success: false, error: firstError };
  }

  const { value: voteValue, reason: voteReason } = parsed.data;

  // Down requires reason
  if (voteValue === "down") {
    if (!voteReason || voteReason.trim().length === 0) {
      return {
        success: false,
        error: "Hlasovani proti vyzaduje uvedeni duvodu.",
      };
    }
  }

  try {
    // Check meeting exists and is in voting status
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schuzka nebyla nalezena." };
    }
    if (mtg.status !== "voting") {
      return {
        success: false,
        error: "Hlasovani neni aktivni pro tuto schuzku.",
      };
    }

    // Check duplicate vote
    const alreadyVoted = await hasVoted(
      auth.session.memberId,
      guestId,
      meetingId
    );
    if (alreadyVoted) {
      return {
        success: false,
        error: "Jiz jste hlasoval/a o tomto hostovi v teto schuzce.",
      };
    }

    // Cast vote
    await dbCastVote({
      memberId: auth.session.memberId,
      guestId,
      meetingId,
      value: voteValue,
      reason: voteValue === "down" ? voteReason!.trim() : undefined,
    });

    revalidatePath(`/guests/${guestId}`);
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("castVoteAction error:", error);
    // Handle unique constraint violation gracefully
    if (
      error instanceof Error &&
      error.message.includes("vote_unique_per_member_guest_meeting")
    ) {
      return {
        success: false,
        error: "Jiz jste hlasoval/a o tomto hostovi v teto schuzce.",
      };
    }
    return { success: false, error: "Nepodarilo se odeslat hlas." };
  }
}
