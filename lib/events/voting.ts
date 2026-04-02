import { eq, and, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { eventVote } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

/**
 * Atomic vote operation per voting_type.
 *
 * pick_one:
 *   Transaction: DELETE all existing votes for participant → INSERT new vote.
 *   Atomicity required: two concurrent requests could otherwise leave the
 *   participant with two votes for different options.
 *
 * multiple:
 *   Toggle: INSERT ON CONFLICT DO NOTHING (add) or DELETE (remove).
 *   action = 'add' | 'remove'
 *   UNIQUE (participant_id, option_id) constraint prevents duplicates.
 *   No transaction needed — single statement is atomic.
 *
 * max_x:
 *   Transaction: COUNT existing votes → if count < maxX → INSERT ON CONFLICT DO NOTHING.
 *   Returns error when limit already reached.
 *   action = 'add' | 'remove'
 */
export async function castVote(
  participantId: string,
  eventId: string,
  optionId: string,
  votingType: "pick_one" | "multiple" | "max_x",
  options?: {
    action?: "add" | "remove";
    maxX?: number;
  }
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const action = options?.action ?? "add";

  try {
    switch (votingType) {
      case "pick_one": {
        // Atomic DELETE + INSERT in a transaction
        await db.transaction(async (tx) => {
          // Remove all previous votes for this participant in this event
          await tx
            .delete(eventVote)
            .where(
              and(
                eq(eventVote.participantId, participantId),
                eq(eventVote.eventId, eventId)
              )
            );

          // Insert the new vote
          await tx
            .insert(eventVote)
            .values({ eventId, participantId, optionId });
        });
        return { success: true };
      }

      case "multiple": {
        if (action === "remove") {
          await db
            .delete(eventVote)
            .where(
              and(
                eq(eventVote.participantId, participantId),
                eq(eventVote.optionId, optionId)
              )
            );
        } else {
          // Insert — ON CONFLICT DO NOTHING (idempotent)
          await db
            .insert(eventVote)
            .values({ eventId, participantId, optionId })
            .onConflictDoNothing();
        }
        return { success: true };
      }

      case "max_x": {
        const maxX = options?.maxX;
        if (maxX === undefined || maxX === null) {
          return { success: false, error: "max_x limit not provided" };
        }

        if (action === "remove") {
          await db
            .delete(eventVote)
            .where(
              and(
                eq(eventVote.participantId, participantId),
                eq(eventVote.optionId, optionId)
              )
            );
          return { success: true };
        }

        // Atomic COUNT + INSERT in a transaction
        await db.transaction(async (tx) => {
          const [{ currentCount }] = await tx
            .select({ currentCount: count() })
            .from(eventVote)
            .where(
              and(
                eq(eventVote.participantId, participantId),
                eq(eventVote.eventId, eventId)
              )
            );

          if (currentCount >= maxX) {
            throw new Error(`VOTE_LIMIT_EXCEEDED:${maxX}`);
          }

          await tx
            .insert(eventVote)
            .values({ eventId, participantId, optionId })
            .onConflictDoNothing();
        });

        return { success: true };
      }

      default: {
        const _exhaustive: never = votingType;
        return { success: false, error: `Unknown voting type: ${_exhaustive}` };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.startsWith("VOTE_LIMIT_EXCEEDED:")) {
      const limit = msg.split(":")[1];
      return {
        success: false,
        error: `Dosahli jste limitu ${limit} hlasu pro tuto akci.`,
      };
    }
    console.error("castVote error:", err);
    return { success: false, error: "Hlasovani se nepodarilo. Zkuste to znovu." };
  }
}
