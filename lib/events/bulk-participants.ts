import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { member, eventParticipant } from "@/lib/db/schema";
import { generateEventToken, hashEventToken } from "@/lib/events/magic-link";
import { encryptToken } from "@/lib/events/token-encryption";

function getDb() {
  return drizzle(getSql());
}

/**
 * Bulk-create event_participant records from all active members.
 * Called synchronously inside createEventAction after the event is inserted.
 *
 * - Includes ALL members (including admin/moderator) — they are BNI members.
 * - ON CONFLICT DO NOTHING — safe for repeated calls.
 * - Inserts participants with tokens. Email sending happens at activation time.
 */
export async function bulkCreateParticipantsFromMembers(
  eventId: string,
  eventTitle: string
): Promise<void> {
  const db = getDb();

  // Fetch all members (no is_active column in schema — include all)
  const members = await db.select().from(member);

  if (members.length === 0) return;

  const encKey = process.env.EVENT_TOKEN_ENCRYPTION_KEY!;

  // Build participant rows with tokens
  const rows = members.map((m) => {
    const rawToken = generateEventToken();
    const tokenHash = hashEventToken(rawToken);
    const encryptedToken = encryptToken(rawToken, encKey);
    return {
      eventId,
      memberId: m.id,
      magicTokenHash: tokenHash,
      encryptedToken,
      tokenCreatedAt: new Date(),
    };
  });

  // Bulk INSERT — ON CONFLICT (event_id, member_id) DO NOTHING
  await db
    .insert(eventParticipant)
    .values(rows)
    .onConflictDoNothing();
}
