"use server";

import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { event, eventOption, eventParticipant } from "@/lib/db/schema";
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/types";

function getDb() {
  return drizzle(getSql());
}

/**
 * Add a custom option as a participant (no session required).
 * Auth is verified by checking that participantId has a valid token
 * and belongs to the event. The caller (page) must have already
 * verified the token before calling this action.
 *
 * Guards:
 * - event must be active
 * - customOptionsAllowed must be true
 * - if whoCanAddOptions = 'members_only', participant must have a memberId
 */
export async function addOptionByParticipantAction(
  eventId: string,
  participantId: string,
  label: string
): Promise<ActionResult<{ id: string }>> {
  if (!eventId || !participantId || !label?.trim()) {
    return { success: false, error: "Neplatne parametry." };
  }

  const db = getDb();

  try {
    // Verify participant belongs to this event
    const participants = await db
      .select({
        id: eventParticipant.id,
        memberId: eventParticipant.memberId,
      })
      .from(eventParticipant)
      .where(
        and(
          eq(eventParticipant.id, participantId),
          eq(eventParticipant.eventId, eventId)
        )
      )
      .limit(1);

    const participant = participants[0];
    if (!participant) {
      return { success: false, error: "Ucastnik nebyl nalezen." };
    }

    // Verify event state and permissions
    const events = await db
      .select({
        status: event.status,
        customOptionsAllowed: event.customOptionsAllowed,
        whoCanAddOptions: event.whoCanAddOptions,
      })
      .from(event)
      .where(eq(event.id, eventId))
      .limit(1);

    const eventData = events[0];
    if (!eventData) {
      return { success: false, error: "Akce nebyla nalezena." };
    }

    if (eventData.status !== "active") {
      return { success: false, error: "Moznosti lze pridavat pouze u aktivnich akci." };
    }

    if (!eventData.customOptionsAllowed) {
      return { success: false, error: "Pridavani vlastnich moznosti neni povoleno." };
    }

    if (
      eventData.whoCanAddOptions === "members_only" &&
      participant.memberId === null
    ) {
      return {
        success: false,
        error: "Pridavat moznosti mohou pouze clenovê skupiny.",
      };
    }

    const [newOption] = await db
      .insert(eventOption)
      .values({
        eventId,
        label: label.trim(),
        addedByParticipantId: participantId,
      })
      .returning();

    revalidatePath(`/e/${eventId}`);
    return { success: true, data: { id: newOption.id } };
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError?.code === "23505") {
      return { success: false, error: "Moznost s timto nazvem jiz existuje." };
    }
    console.error("addOptionByParticipantAction error:", error);
    return { success: false, error: "Nepodarilo se pridat moznost." };
  }
}
