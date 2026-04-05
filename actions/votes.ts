"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guards";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { castVote as dbCastVote } from "@/lib/db/queries/votes";
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
 * - UPSERT — re-voting allowed (DB handles uniqueness via onConflictDoUpdate)
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

    // Cast vote (UPSERT — DB handles re-voting via unique constraint)
    await dbCastVote({
      memberId: auth.session.memberId,
      guestId,
      meetingId,
      value: voteValue,
      reason: voteValue === "down" ? voteReason!.trim() : undefined,
    });

    revalidatePath("/guests");
    revalidatePath(`/guests/${guestId}`);
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("castVoteAction error:", error);
    return { success: false, error: "Nepodarilo se odeslat hlas." };
  }
}
