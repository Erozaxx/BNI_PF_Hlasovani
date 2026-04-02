import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { eventParticipant } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

/**
 * Look up a participant by their magic token hash.
 * Used to verify magic link access to event pages.
 */
export async function getParticipantByToken(tokenHash: string) {
  const results = await getDb()
    .select()
    .from(eventParticipant)
    .where(eq(eventParticipant.magicTokenHash, tokenHash))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get a single participant by ID.
 */
export async function getParticipantById(id: string) {
  const results = await getDb()
    .select()
    .from(eventParticipant)
    .where(eq(eventParticipant.id, id))
    .limit(1);

  return results[0] ?? null;
}
