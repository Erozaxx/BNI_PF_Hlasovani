import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meetingMemberLink } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

/**
 * Get all meeting_member_link rows for a meeting (iter-026, arch 13.2 —
 * replaces getActiveMeetingLinks + getPendingMorningEmailLinks). Returns
 * every row for the meeting, revoked or not, with or without a sent marker —
 * planVotingDispatch (lib/meetings/voting-plan.ts) needs the full picture to
 * decide who gets skipped and why, not a pre-filtered subset. Does not join
 * member: the caller already has the member list from getMembers() for step
 * 4 of runVotingDispatch (arch 2.3).
 */
export async function getMeetingLinkRows(meetingId: string) {
  return getDb()
    .select({
      memberId: meetingMemberLink.memberId,
      linkId: meetingMemberLink.id,
      revokedAt: meetingMemberLink.revokedAt,
      linkEmailSentAt: meetingMemberLink.morningEmailSentAt,
    })
    .from(meetingMemberLink)
    .where(eq(meetingMemberLink.meetingId, meetingId));
}

/**
 * Mark a member's voting link as "email sent" for a specific meeting
 * (iter-026, arch 2.4 — renamed from markMorningEmailSent; sémantika sloupce
 * se mění na "odkaz odeslán", schema.ts:morningEmailSentAt nese komentář).
 *
 * Coder deviation from the literal "rename" instruction: resignatured from
 * (linkId, sentAt) to (meetingId, memberId, sentAt). Step 8 of
 * runVotingDispatch (arch 2.3) regenerates the token for every recipient,
 * including links that were just created in step 5 via generateMeetingToken
 * — that call only returns the raw token, not the row id, so linkId is not
 * available at the point markLinkEmailSent needs to be called. Matching by
 * (meetingId, memberId) is available for every recipient immediately and the
 * UPDATE is still a plain WHERE-guarded write (LL-003).
 */
export async function markLinkEmailSent(
  meetingId: string,
  memberId: string,
  sentAt: Date
): Promise<void> {
  await getDb()
    .update(meetingMemberLink)
    .set({ morningEmailSentAt: sentAt })
    .where(
      and(
        eq(meetingMemberLink.meetingId, meetingId),
        eq(meetingMemberLink.memberId, memberId)
      )
    );
}
