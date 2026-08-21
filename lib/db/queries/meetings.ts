import { eq, asc, desc, and, ne, isNull, max, inArray, sql } from "drizzle-orm";
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
 * Check whether a guest is currently attached to a meeting in 'voting' status.
 * Used by promoteGuestToMemberAction (iter-022) to block promotion while a
 * meeting's voting is live -- deleting the guest mid-vote would pull them off
 * open voting screens and CASCADE-delete already-cast votes.
 *
 * Deliberately ignores votingEnabled (arch T-003 NIT-2): checking only
 * meeting.status = 'voting' is stricter but does not rely on the emergent,
 * unenforced assumption that votingEnabled is set once and never changes.
 */
export async function isGuestInVotingMeeting(guestId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ meetingId: meetingGuest.meetingId })
    .from(meetingGuest)
    .innerJoin(meeting, eq(meetingGuest.meetingId, meeting.id))
    .where(and(eq(meetingGuest.guestId, guestId), eq(meeting.status, "voting")))
    .limit(1);

  return rows.length > 0;
}

/**
 * Get the meeting scheduled for a given date, without filtering on status
 * (iter-026, arch 2.4 — replaces getActiveMeetingsForDate). meeting.date has
 * a UNIQUE constraint (schema.ts:122), so this returns at most one row. The
 * caller (voting-dispatch guard chain, cron phase 2) decides what to do with
 * whatever status it finds — a `closed` meeting is a guard rejection
 * ("meeting-closed"), not a "no meeting today" silence, and those two must
 * stay distinguishable.
 */
export async function getMeetingByDate(dateStr: string) {
  const results = await getDb()
    .select()
    .from(meeting)
    .where(eq(meeting.date, dateStr))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get meetings scheduled for any of the given dates (iter-026, arch 8.1) —
 * backs DraftMeetingBanner's `getMeetingsForDates([today, tomorrow])` call
 * from app/(app)/layout.tsx. `meeting.date` is UNIQUE (schema.ts:122), so at
 * most one row per date and at most `dates.length` rows total. Uses
 * `idx_meeting_date` (schema.ts:142), same as getMeetingByDate.
 */
export async function getMeetingsForDates(dates: string[]) {
  if (dates.length === 0) return [];

  return getDb()
    .select({ id: meeting.id, date: meeting.date, status: meeting.status })
    .from(meeting)
    .where(inArray(meeting.date, dates));
}

/**
 * Get the other meeting (if any) currently active or voting, for building
 * the conflict guard's message (arch 2.5). Deliberately separate from
 * hasActiveOrVotingMeeting: that function stays a pure boolean guard exactly
 * as it is used elsewhere (arch 2.5 pseudocode calls it directly), this one
 * is only ever called once the boolean guard has already tripped, purely to
 * fetch the date/uzávěrka for the human-readable message. Coder deviation
 * (not in arch 13.1/13.2's explicit "new functions" list) — see handoff.
 */
export async function getConflictingMeeting(excludeId: string) {
  const rows = await getDb()
    .select({
      id: meeting.id,
      date: meeting.date,
      votingClosesAt: meeting.votingClosesAt,
    })
    .from(meeting)
    .where(
      and(
        ne(meeting.id, excludeId),
        sql`${meeting.status} IN ('active', 'voting')`
      )
    )
    .limit(1);

  return rows[0] ?? null;
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
      displayOrder: meetingGuest.displayOrder,
      votingEnabled: meetingGuest.votingEnabled,
    })
    .from(meetingGuest)
    .innerJoin(guest, eq(meetingGuest.guestId, guest.id))
    .leftJoin(category, eq(guest.categoryId, category.id))
    .where(eq(meetingGuest.meetingId, id))
    .orderBy(asc(meetingGuest.displayOrder), asc(meetingGuest.addedAt));

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
 * Add a guest to a meeting. New guest goes to the end of the per-meeting order
 * (max+1 within this meeting_id). COALESCE(MAX,0)+1 yields 1 for the first guest.
 */
export async function addGuestToMeeting(meetingId: string, guestId: string) {
  const results = await getDb()
    .insert(meetingGuest)
    .values({
      meetingId,
      guestId,
      displayOrder: sql`(SELECT COALESCE(MAX(display_order), 0) + 1 FROM meeting_guest WHERE meeting_id = ${meetingId})`,
    })
    .returning();

  return results[0];
}

/**
 * Reorder guests within a single meeting by setting display_order = index+1
 * (1-based) for each guestId in orderedGuestIds. 1-based matches the insert
 * (COALESCE(MAX,0)+1) and migration backfill (ROW_NUMBER) schemes, keeping
 * display_order consistent (M-2). Sequential UPDATEs (LL-003: no transaction).
 * Each UPDATE is scoped to (meeting_id, guest_id) and idempotent on retry.
 */
export async function reorderMeetingGuests(
  meetingId: string,
  orderedGuestIds: string[]
): Promise<void> {
  const db = getDb();
  for (let i = 0; i < orderedGuestIds.length; i++) {
    await db
      .update(meetingGuest)
      .set({ displayOrder: i + 1 })
      .where(
        and(
          eq(meetingGuest.meetingId, meetingId),
          eq(meetingGuest.guestId, orderedGuestIds[i])
        )
      );
  }
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
 * Used by the "no-guests" guard in runVotingDispatch (iter-026, arch 2.6/#4):
 * a meeting with zero guests must never reach voting, in either mode and in
 * any pre-closed state — including via the Thursday cron under E1.
 */
export async function getMeetingGuestIds(meetingId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ guestId: meetingGuest.guestId })
    .from(meetingGuest)
    .where(eq(meetingGuest.meetingId, meetingId));
  return new Set(rows.map((r) => r.guestId));
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
