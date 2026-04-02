import { eq, and, desc, count, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  event,
  eventOption,
  eventParticipant,
  eventVote,
  member,
} from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

/**
 * Get all events with participant count and selected option label.
 * Optionally filter by status.
 */
export async function getEvents(
  filter?: "draft" | "active" | "closed" | "done"
) {
  const db = getDb();

  // Subquery for participant count per event
  const participantCounts = db
    .select({
      eventId: eventParticipant.eventId,
      participantCount: count(eventParticipant.id).as("participant_count"),
    })
    .from(eventParticipant)
    .groupBy(eventParticipant.eventId)
    .as("participant_counts");

  const rows = await db
    .select({
      id: event.id,
      title: event.title,
      description: event.description,
      status: event.status,
      votingType: event.votingType,
      votingMaxX: event.votingMaxX,
      whoCanVote: event.whoCanVote,
      customOptionsAllowed: event.customOptionsAllowed,
      whoCanAddOptions: event.whoCanAddOptions,
      optionType: event.optionType,
      selectedOptionId: event.selectedOptionId,
      createdBy: event.createdBy,
      createdAt: event.createdAt,
      activatedAt: event.activatedAt,
      closedAt: event.closedAt,
      doneAt: event.doneAt,
      tokensRevokedAt: event.tokensRevokedAt,
      participantCount: sql<number>`COALESCE(${participantCounts.participantCount}, 0)`,
      selectedOptionLabel: eventOption.label,
    })
    .from(event)
    .leftJoin(participantCounts, eq(event.id, participantCounts.eventId))
    .leftJoin(eventOption, eq(event.selectedOptionId, eventOption.id))
    .where(filter ? eq(event.status, filter) : undefined)
    .orderBy(desc(event.createdAt));

  return rows;
}

/**
 * Get a single event by ID.
 */
export async function getEventById(id: string) {
  const results = await getDb()
    .select()
    .from(event)
    .where(eq(event.id, id))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get all options for an event, with vote counts per option.
 */
export async function getEventOptions(eventId: string) {
  const db = getDb();

  // Subquery for vote counts per option
  const voteCounts = db
    .select({
      optionId: eventVote.optionId,
      voteCount: count(eventVote.id).as("vote_count"),
    })
    .from(eventVote)
    .where(eq(eventVote.eventId, eventId))
    .groupBy(eventVote.optionId)
    .as("vote_counts");

  return db
    .select({
      id: eventOption.id,
      eventId: eventOption.eventId,
      label: eventOption.label,
      addedByParticipantId: eventOption.addedByParticipantId,
      createdAt: eventOption.createdAt,
      voteCount: sql<number>`COALESCE(${voteCounts.voteCount}, 0)`,
    })
    .from(eventOption)
    .leftJoin(voteCounts, eq(eventOption.id, voteCounts.optionId))
    .where(eq(eventOption.eventId, eventId))
    .orderBy(eventOption.createdAt);
}

/**
 * Get all participants for an event with their member name (if BNI member),
 * magic token hash and vote count.
 */
export async function getEventParticipants(eventId: string) {
  const db = getDb();

  const voteCounts = db
    .select({
      participantId: eventVote.participantId,
      voteCount: count(eventVote.id).as("vote_count"),
    })
    .from(eventVote)
    .where(eq(eventVote.eventId, eventId))
    .groupBy(eventVote.participantId)
    .as("vote_counts");

  return db
    .select({
      id: eventParticipant.id,
      eventId: eventParticipant.eventId,
      memberId: eventParticipant.memberId,
      externalName: eventParticipant.externalName,
      externalEmail: eventParticipant.externalEmail,
      magicTokenHash: eventParticipant.magicTokenHash,
      tokenCreatedAt: eventParticipant.tokenCreatedAt,
      createdAt: eventParticipant.createdAt,
      memberName: member.name,
      memberEmail: member.email,
      voteCount: sql<number>`COALESCE(${voteCounts.voteCount}, 0)`,
    })
    .from(eventParticipant)
    .leftJoin(member, eq(eventParticipant.memberId, member.id))
    .leftJoin(voteCounts, eq(eventParticipant.id, voteCounts.participantId))
    .where(eq(eventParticipant.eventId, eventId))
    .orderBy(eventParticipant.createdAt);
}

/**
 * Get all votes cast by a specific participant.
 */
export async function getEventVotesByParticipant(participantId: string) {
  return getDb()
    .select({
      id: eventVote.id,
      eventId: eventVote.eventId,
      participantId: eventVote.participantId,
      optionId: eventVote.optionId,
      createdAt: eventVote.createdAt,
      optionLabel: eventOption.label,
    })
    .from(eventVote)
    .leftJoin(eventOption, eq(eventVote.optionId, eventOption.id))
    .where(eq(eventVote.participantId, participantId))
    .orderBy(eventVote.createdAt);
}

/**
 * Get all votes for an event, with participant name for display in reports.
 */
export async function getEventVotesWithNames(eventId: string) {
  return getDb()
    .select({
      optionId: eventVote.optionId,
      participantId: eventVote.participantId,
      memberName: member.name,
      externalName: eventParticipant.externalName,
    })
    .from(eventVote)
    .innerJoin(eventParticipant, eq(eventVote.participantId, eventParticipant.id))
    .leftJoin(member, eq(eventParticipant.memberId, member.id))
    .where(eq(eventVote.eventId, eventId));
}

/**
 * Verify a magic link token — find event + participant by token hash.
 * Returns { event, participant } or null if not found.
 */
export async function getEventByParticipantToken(tokenHash: string) {
  const results = await getDb()
    .select({
      event: {
        id: event.id,
        title: event.title,
        description: event.description,
        status: event.status,
        votingType: event.votingType,
        votingMaxX: event.votingMaxX,
        whoCanVote: event.whoCanVote,
        customOptionsAllowed: event.customOptionsAllowed,
        whoCanAddOptions: event.whoCanAddOptions,
        optionType: event.optionType,
        selectedOptionId: event.selectedOptionId,
        createdAt: event.createdAt,
        activatedAt: event.activatedAt,
        closedAt: event.closedAt,
        doneAt: event.doneAt,
        tokensRevokedAt: event.tokensRevokedAt,
      },
      participant: {
        id: eventParticipant.id,
        eventId: eventParticipant.eventId,
        memberId: eventParticipant.memberId,
        externalName: eventParticipant.externalName,
        externalEmail: eventParticipant.externalEmail,
        magicTokenHash: eventParticipant.magicTokenHash,
        tokenCreatedAt: eventParticipant.tokenCreatedAt,
        createdAt: eventParticipant.createdAt,
      },
    })
    .from(eventParticipant)
    .innerJoin(event, eq(eventParticipant.eventId, event.id))
    .where(eq(eventParticipant.magicTokenHash, tokenHash))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Find all events eligible for auto-done transition:
 * status = 'closed' AND closed_at <= now() - interval '1 day'.
 */
export async function getEventsEligibleForDone() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return getDb()
    .select()
    .from(event)
    .where(
      and(
        eq(event.status, "closed"),
        lt(event.closedAt, oneDayAgo)
      )
    );
}

/**
 * Transition an event from closed → done:
 * - Set magic_token_hash = NULL for all participants
 * - Set tokens_revoked_at, done_at, status = 'done' on the event
 */
export async function markEventDone(eventId: string): Promise<void> {
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    // Revoke all participant tokens
    await tx
      .update(eventParticipant)
      .set({ magicTokenHash: null })
      .where(eq(eventParticipant.eventId, eventId));

    // Mark event as done
    await tx
      .update(event)
      .set({
        status: "done",
        doneAt: now,
        tokensRevokedAt: now,
      })
      .where(eq(event.id, eventId));
  });
}
