import { eq, and, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { vote, meeting, member, meetingGuest } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get a member's vote for a specific guest in a meeting (if it exists).
 */
export async function getVoteForGuestInMeeting(
  memberId: string,
  guestId: string,
  meetingId: string
) {
  const results = await getDb()
    .select({
      id: vote.id,
      value: vote.value,
      reason: vote.reason,
      createdAt: vote.createdAt,
    })
    .from(vote)
    .where(
      and(
        eq(vote.memberId, memberId),
        eq(vote.guestId, guestId),
        eq(vote.meetingId, meetingId)
      )
    )
    .limit(1);

  return results[0] ?? null;
}

/**
 * Cast a vote. Throws on duplicate (DB unique constraint).
 */
export async function castVote(data: {
  memberId: string;
  guestId: string;
  meetingId: string;
  value: "up" | "neutral" | "down";
  reason?: string;
}) {
  const results = await getDb()
    .insert(vote)
    .values({
      memberId: data.memberId,
      guestId: data.guestId,
      meetingId: data.meetingId,
      value: data.value,
      reason: data.reason || null,
    })
    .returning();

  return results[0];
}

/**
 * Get all votes for a guest in a meeting, with member names (roll-call results).
 * Used for displaying results after voting is closed or for admin/mod preview.
 */
export async function getVotingResults(guestId: string, meetingId: string) {
  return getDb()
    .select({
      id: vote.id,
      memberId: vote.memberId,
      memberName: member.name,
      value: vote.value,
      reason: vote.reason,
      createdAt: vote.createdAt,
    })
    .from(vote)
    .innerJoin(member, eq(vote.memberId, member.id))
    .where(
      and(eq(vote.guestId, guestId), eq(vote.meetingId, meetingId))
    )
    .orderBy(member.name);
}

/**
 * Get all active voting meetings that include a specific guest.
 * Only returns meetings where the guest has voting_enabled = true (D-001).
 * Returns meetingId + meetingDate for each.
 */
export async function getActiveVotingMeetingsForGuest(guestId: string) {
  return getDb()
    .select({
      meetingId: meeting.id,
      meetingDate: meeting.date,
    })
    .from(meetingGuest)
    .innerJoin(meeting, eq(meetingGuest.meetingId, meeting.id))
    .where(
      and(
        eq(meetingGuest.guestId, guestId),
        eq(meeting.status, "voting"),
        eq(meetingGuest.votingEnabled, true)
      )
    )
    .orderBy(meeting.date);
}

/**
 * Get the single active voting meeting (status = 'voting'), if any.
 * Returns { id, date } or null.
 */
export async function getActiveVotingMeeting(): Promise<{
  id: string;
  date: string;
} | null> {
  const results = await getDb()
    .select({ id: meeting.id, date: meeting.date })
    .from(meeting)
    .where(eq(meeting.status, "voting"))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get all guestIds where the given member has already voted in the given meeting.
 * Returns a Set<string> of guestIds.
 */
export async function getUserVotesForMeeting(
  memberId: string,
  meetingId: string
): Promise<Set<string>> {
  const rows = await getDb()
    .select({ guestId: vote.guestId })
    .from(vote)
    .where(and(eq(vote.memberId, memberId), eq(vote.meetingId, meetingId)));

  return new Set(rows.map((r) => r.guestId));
}

/**
 * Get all meetings in 'voting' status whose voting window has expired.
 * Used by the cron job.
 */
export async function getExpiredVotingMeetings() {
  const now = new Date();
  return getDb()
    .select({ id: meeting.id, date: meeting.date })
    .from(meeting)
    .where(
      and(
        eq(meeting.status, "voting"),
        lt(meeting.votingClosesAt, now)
      )
    );
}
