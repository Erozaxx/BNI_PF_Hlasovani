import { eq, and, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meetingMemberLink, meeting, member } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

/**
 * Get all active meetings (status='active') whose date matches the given date string.
 * Date is compared as a plain DATE string (YYYY-MM-DD) matching meeting.date.
 */
export async function getActiveMeetingsForDate(dateStr: string) {
  return getDb()
    .select({ id: meeting.id, date: meeting.date })
    .from(meeting)
    .where(and(eq(meeting.status, "active"), eq(meeting.date, dateStr)));
}

/**
 * Get all meeting_member_link rows for a meeting where morningEmailSentAt IS NULL.
 * Joins member to get email and name for sending the email.
 * Does NOT include revoked links.
 */
export async function getPendingMorningEmailLinks(meetingId: string) {
  return getDb()
    .select({
      linkId: meetingMemberLink.id,
      meetingId: meetingMemberLink.meetingId,
      memberId: meetingMemberLink.memberId,
      memberEmail: member.email,
      memberName: member.name,
    })
    .from(meetingMemberLink)
    .innerJoin(member, eq(meetingMemberLink.memberId, member.id))
    .where(
      and(
        eq(meetingMemberLink.meetingId, meetingId),
        isNull(meetingMemberLink.revokedAt),
        isNull(meetingMemberLink.morningEmailSentAt)
      )
    );
}

/**
 * Mark morningEmailSentAt on a specific meeting_member_link row.
 * Called immediately after each successful email send (idempotency per brief A2).
 */
export async function markMorningEmailSent(
  linkId: string,
  sentAt: Date
): Promise<void> {
  await getDb()
    .update(meetingMemberLink)
    .set({ morningEmailSentAt: sentAt })
    .where(eq(meetingMemberLink.id, linkId));
}

/**
 * Transition a meeting from 'active' to 'voting'.
 * Sets votingOpenAt and votingClosesAt (now + 48h).
 * Returns the updated row or null if not found / wrong status.
 */
export async function activateMeetingVoting(meetingId: string) {
  const now = new Date();
  const votingClosesAt = new Date(now.getTime() + 48 * 3600 * 1000);

  const rows = await getDb()
    .update(meeting)
    .set({
      status: "voting",
      votingOpenAt: now,
      votingClosesAt,
    })
    .where(and(eq(meeting.id, meetingId), eq(meeting.status, "active")))
    .returning({
      id: meeting.id,
      votingOpenAt: meeting.votingOpenAt,
      votingClosesAt: meeting.votingClosesAt,
    });

  return rows[0] ?? null;
}
