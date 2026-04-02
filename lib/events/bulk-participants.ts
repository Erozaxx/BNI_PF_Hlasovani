import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { member, eventParticipant } from "@/lib/db/schema";
import { generateEventToken, hashEventToken, sendEventMagicLink } from "@/lib/events/magic-link";

function getDb() {
  return drizzle(getSql());
}

/**
 * Bulk-create event_participant records from all active members.
 * Called synchronously inside createEventAction after the event is inserted.
 *
 * - Includes ALL members (including admin/moderator) — they are BNI members.
 * - ON CONFLICT DO NOTHING — safe for repeated calls.
 * - Sends magic link email if member has an email address.
 * - eventTitle is used in the invitation email subject/body.
 */
export async function bulkCreateParticipantsFromMembers(
  eventId: string,
  eventTitle: string
): Promise<void> {
  const db = getDb();

  // Fetch all members (no is_active column in schema — include all)
  const members = await db.select().from(member);

  if (members.length === 0) return;

  // Build participant rows with tokens
  const rows = members.map((m) => {
    const rawToken = generateEventToken();
    const tokenHash = hashEventToken(rawToken);
    return {
      member: m,
      rawToken,
      values: {
        eventId,
        memberId: m.id,
        magicTokenHash: tokenHash,
        tokenCreatedAt: new Date(),
      },
    };
  });

  // Bulk INSERT — ON CONFLICT (event_id, member_id) DO NOTHING
  // Use RETURNING to get only actually inserted rows — emails must only be
  // sent for inserted rows. Sending an email with a newly-generated token
  // for a skipped (already-existing) row would produce a link that doesn't
  // match the token stored in the DB.
  const inserted = await db
    .insert(eventParticipant)
    .values(rows.map((r) => r.values))
    .onConflictDoNothing()
    .returning({ memberId: eventParticipant.memberId });

  const insertedMemberIds = new Set(
    inserted.map((r) => r.memberId).filter(Boolean)
  );

  // Send magic link emails only for participants that were just inserted
  for (const row of rows) {
    if (!insertedMemberIds.has(row.member.id)) continue;
    if (!row.member.email) continue;

    const emailResult = await sendEventMagicLink(
      row.member.email,
      row.member.name,
      eventTitle,
      row.rawToken,
      eventId
    );
    if (!emailResult.success) {
      console.warn(
        `[bulkCreateParticipants] Failed to send email to member ${row.member.id} (${row.member.email}): ${emailResult.error}`
      );
    }
  }
}
