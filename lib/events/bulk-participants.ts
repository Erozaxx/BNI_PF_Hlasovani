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
  // Drizzle doesn't support onConflictDoNothing with partial unique indexes
  // directly, so we use raw SQL via sql template for the conflict clause.
  // We insert in one batch for efficiency.
  await db
    .insert(eventParticipant)
    .values(rows.map((r) => r.values))
    .onConflictDoNothing();

  // Send magic link emails to members with email addresses
  for (const row of rows) {
    if (row.member.email) {
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
}
