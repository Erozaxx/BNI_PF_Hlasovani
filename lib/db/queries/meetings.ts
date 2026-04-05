import { eq, desc, and, ne, isNull, max, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meeting, meetingGuest, guest, category } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get the active meeting: voting not open, status != 'closed'.
 * Returns the most recent non-closed draft meeting or null.
 */
export async function getActiveMeeting(): Promise<{
  id: string;
  date: string;
} | null> {
  const results = await getDb()
    .select({ id: meeting.id, date: meeting.date })
    .from(meeting)
    .where(
      and(
        isNull(meeting.votingOpenAt),
        ne(meeting.status, "closed")
      )
    )
    .orderBy(desc(meeting.date))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get all meetings ordered by status priority (voting > active > draft > closed),
 * then by date DESC within each group.
 */
export async function getMeetings() {
  return getDb()
    .select()
    .from(meeting)
    .orderBy(
      sql`CASE ${meeting.status}
        WHEN 'voting' THEN 0
        WHEN 'active' THEN 1
        WHEN 'draft'  THEN 2
        WHEN 'closed' THEN 3
      END`,
      desc(meeting.date)
    );
}

/**
 * Check if any meeting (other than excludeId) is currently active or voting.
 * Used to enforce the max-1-active-or-voting business rule.
 * Returns true if a conflict exists.
 */
export async function hasActiveOrVotingMeeting(excludeId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: meeting.id })
    .from(meeting)
    .where(
      and(
        ne(meeting.id, excludeId),
        sql`${meeting.status} IN ('active', 'voting')`
      )
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Get a single meeting by ID.
 */
export async function getMeetingById(id: string) {
  const results = await getDb()
    .select()
    .from(meeting)
    .where(eq(meeting.id, id))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get a meeting with its associated guests (and their categories).
 * Includes votingEnabled flag per guest from meeting_guest.
 */
export async function getMeetingWithGuests(id: string) {
  const meetingData = await getMeetingById(id);
  if (!meetingData) return null;

  const guests = await getDb()
    .select({
      guestId: guest.id,
      guestName: guest.name,
      guestDescription: guest.description,
      categoryId: guest.categoryId,
      categoryName: category.name,
      addedAt: meetingGuest.addedAt,
      votingEnabled: meetingGuest.votingEnabled,
    })
    .from(meetingGuest)
    .innerJoin(guest, eq(meetingGuest.guestId, guest.id))
    .leftJoin(category, eq(guest.categoryId, category.id))
    .where(eq(meetingGuest.meetingId, id))
    .orderBy(guest.name);

  return { ...meetingData, guests };
}

/**
 * Create a new meeting.
 */
export async function createMeeting(dateStr: string, location?: string) {
  const results = await getDb()
    .insert(meeting)
    .values({
      date: dateStr,
      status: "draft",
      location: location ?? null,
    })
    .returning();

  return results[0];
}

/**
 * Add a guest to a meeting.
 */
export async function addGuestToMeeting(meetingId: string, guestId: string) {
  const results = await getDb()
    .insert(meetingGuest)
    .values({ meetingId, guestId })
    .returning();

  return results[0];
}

/**
 * Remove a guest from a meeting.
 */
export async function removeGuestFromMeeting(
  meetingId: string,
  guestId: string
) {
  await getDb()
    .delete(meetingGuest)
    .where(
      and(
        eq(meetingGuest.meetingId, meetingId),
        eq(meetingGuest.guestId, guestId)
      )
    );
}

/**
 * Get guest IDs that are assigned to a specific meeting.
 * Returns a Set<string> of guestIds.
 */
export async function getGuestIdsForMeeting(meetingId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ guestId: meetingGuest.guestId })
    .from(meetingGuest)
    .where(and(eq(meetingGuest.meetingId, meetingId), eq(meetingGuest.votingEnabled, true)));
  return new Set(rows.map((r) => r.guestId));
}

/**
 * Get all guest IDs for a meeting (regardless of votingEnabled).
 * Used for B-001 subset validation in openVotingAction.
 */
export async function getMeetingGuestIds(meetingId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ guestId: meetingGuest.guestId })
    .from(meetingGuest)
    .where(eq(meetingGuest.meetingId, meetingId));
  return new Set(rows.map((r) => r.guestId));
}

/**
 * Bulk-update voting_enabled on meeting_guest for all guests of a meeting.
 * Guests in enabledIds get voting_enabled = true; all others get voting_enabled = false.
 * Single atomic UPDATE: SET voting_enabled = (guest_id = ANY($enabledIds)) WHERE meeting_id = $meetingId.
 */
export async function setVotingEnabled(meetingId: string, enabledIds: string[]): Promise<void> {
  await getDb()
    .update(meetingGuest)
    .set({
      votingEnabled: sql<boolean>`(${meetingGuest.guestId} = ANY(ARRAY[${sql.join(enabledIds.map((id) => sql`${id}::uuid`), sql`, `)}]))`,
    })
    .where(eq(meetingGuest.meetingId, meetingId));
}

/**
 * Get the last meeting date (most recent) for each of the given guest IDs.
 * Returns a Map<guestId, dateString>.
 */
export async function getLastMeetingDatesForGuests(
  guestIds: string[]
): Promise<Map<string, string>> {
  if (guestIds.length === 0) return new Map();

  const rows = await getDb()
    .select({
      guestId: meetingGuest.guestId,
      lastDate: max(meeting.date),
    })
    .from(meetingGuest)
    .innerJoin(meeting, eq(meetingGuest.meetingId, meeting.id))
    .where(inArray(meetingGuest.guestId, guestIds))
    .groupBy(meetingGuest.guestId);

  return new Map(
    rows
      .filter((r) => r.lastDate !== null)
      .map((r) => [r.guestId, r.lastDate as string])
  );
}

/**
 * Get the last meeting date for a single guest.
 */
export async function getLastMeetingDateForGuest(
  guestId: string
): Promise<string | null> {
  const rows = await getDb()
    .select({ lastDate: max(meeting.date) })
    .from(meetingGuest)
    .innerJoin(meeting, eq(meetingGuest.meetingId, meeting.id))
    .where(eq(meetingGuest.guestId, guestId));
  return rows[0]?.lastDate ?? null;
}

/**
 * Delete a meeting by ID (cascades meeting_guest and vote rows).
 */
export async function deleteMeeting(id: string) {
  await getDb().delete(meeting).where(eq(meeting.id, id));
}

/**
 * Update meeting status and voting timestamps.
 */
export async function updateMeetingStatus(
  id: string,
  data: {
    status: string;
    votingOpenAt?: Date | null;
    votingClosesAt?: Date | null;
  }
) {
  const results = await getDb()
    .update(meeting)
    .set({
      status: data.status,
      votingOpenAt: data.votingOpenAt ?? undefined,
      votingClosesAt: data.votingClosesAt ?? undefined,
    })
    .where(eq(meeting.id, id))
    .returning();

  return results[0] ?? null;
}
