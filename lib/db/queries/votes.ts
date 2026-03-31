import { eq, and, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as neonSql } from "@/lib/db/client";
import { vote, meeting, member, meetingGuest } from "@/lib/db/schema";

const db = drizzle(neonSql);

/**
 * Check whether a member has already voted for a guest in a meeting.
 */
export async function hasVoted(
  memberId: string,
  guestId: string,
  meetingId: string
): Promise<boolean> {
  const results = await db
    .select({ id: vote.id })
    .from(vote)
    .where(
      and(
        eq(vote.memberId, memberId),
        eq(vote.guestId, guestId),
        eq(vote.meetingId, meetingId)
      )
    )
    .limit(1);

  return results.length > 0;
}

/**
 * Get a member's vote for a specific guest in a meeting (if it exists).
 */
export async function getVoteForGuestInMeeting(
  memberId: string,
  guestId: string,
  meetingId: string
) {
  const results = await db
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
  const results = await db
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
  return db
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
 * Returns meetingId + meetingDate for each.
 */
export async function getActiveVotingMeetingsForGuest(guestId: string) {
  return db
    .select({
      meetingId: meeting.id,
      meetingDate: meeting.date,
    })
    .from(meetingGuest)
    .innerJoin(meeting, eq(meetingGuest.meetingId, meeting.id))
    .where(
      and(
        eq(meetingGuest.guestId, guestId),
        eq(meeting.status, "voting")
      )
    )
    .orderBy(meeting.date);
}

/**
 * Get all meetings in 'voting' status whose voting window has expired.
 * Used by the cron job.
 */
export async function getExpiredVotingMeetings() {
  const now = new Date();
  return db
    .select({ id: meeting.id, date: meeting.date })
    .from(meeting)
    .where(
      and(
        eq(meeting.status, "voting"),
        lt(meeting.votingClosesAt, now)
      )
    );
}
