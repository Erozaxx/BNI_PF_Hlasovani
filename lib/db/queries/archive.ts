import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  meeting,
  meetingGuest,
  guest,
  category,
  note,
  vote,
} from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get all closed meetings, ordered by date desc.
 * Used for the meeting multiselect filter.
 */
export async function getArchivedMeetings() {
  return getDb()
    .select({
      id: meeting.id,
      date: meeting.date,
      status: meeting.status,
    })
    .from(meeting)
    .orderBy(desc(meeting.date));
}

/**
 * Get guests for specific meetings, optionally filtered by category.
 * Returns guest info + category + notes + vote summary.
 */
export async function getGuestsForMeetings(
  meetingIds: string[],
  categoryId?: string
) {
  if (meetingIds.length === 0) return [];

  // Get guests linked to the selected meetings
  const conditions = [inArray(meetingGuest.meetingId, meetingIds)];

  const guestsInMeetings = await getDb()
    .select({
      guestId: guest.id,
      guestName: guest.name,
      guestDescription: guest.description,
      categoryId: guest.categoryId,
      categoryName: category.name,
      meetingId: meetingGuest.meetingId,
      meetingDate: meeting.date,
    })
    .from(meetingGuest)
    .innerJoin(guest, eq(meetingGuest.guestId, guest.id))
    .innerJoin(meeting, eq(meetingGuest.meetingId, meeting.id))
    .leftJoin(category, eq(guest.categoryId, category.id))
    .where(and(...conditions))
    .orderBy(guest.name);

  // Apply category filter in-memory (simpler than adding to join conditions)
  const filtered = categoryId
    ? guestsInMeetings.filter((g) => g.categoryId === categoryId)
    : guestsInMeetings;

  // Deduplicate guests (a guest may appear in multiple meetings)
  const uniqueGuestIds = [...new Set(filtered.map((g) => g.guestId))];

  // Enrich with notes and votes
  return enrichGuests(uniqueGuestIds, filtered);
}

/**
 * Get guests from closed meetings within a date range, optionally filtered by category.
 */
export async function getGuestsForDateRange(
  from: string,
  to: string,
  categoryId?: string
) {
  // First get closed meetings in date range
  const closedMeetings = await getDb()
    .select({
      id: meeting.id,
      date: meeting.date,
    })
    .from(meeting)
    .where(
      and(
        eq(meeting.status, "closed"),
        gte(meeting.date, from),
        lte(meeting.date, to)
      )
    )
    .orderBy(desc(meeting.date));

  if (closedMeetings.length === 0) return { meetings: [], guests: [] };

  const meetingIds = closedMeetings.map((m) => m.id);
  const guests = await getGuestsForMeetings(meetingIds, categoryId);

  return { meetings: closedMeetings, guests };
}

/**
 * Internal: enrich guest list with notes and vote summary.
 */
async function enrichGuests(
  guestIds: string[],
  rawGuests: Array<{
    guestId: string;
    guestName: string;
    guestDescription: string | null;
    categoryId: string | null;
    categoryName: string | null;
    meetingId: string;
    meetingDate: string;
  }>
) {
  if (guestIds.length === 0) return [];

  // Fetch notes for all guests
  const allNotes = await getDb()
    .select({
      id: note.id,
      guestId: note.guestId,
      text: note.text,
      createdAt: note.createdAt,
    })
    .from(note)
    .where(inArray(note.guestId, guestIds))
    .orderBy(desc(note.createdAt));

  // Fetch votes for all guests
  const allVotes = await getDb()
    .select({
      guestId: vote.guestId,
      meetingId: vote.meetingId,
      value: vote.value,
      reason: vote.reason,
    })
    .from(vote)
    .where(inArray(vote.guestId, guestIds));

  // Group by guest
  const notesByGuest = new Map<string, typeof allNotes>();
  for (const n of allNotes) {
    const list = notesByGuest.get(n.guestId) ?? [];
    list.push(n);
    notesByGuest.set(n.guestId, list);
  }

  const votesByGuest = new Map<
    string,
    Array<{ meetingId: string; value: string; reason: string | null }>
  >();
  for (const v of allVotes) {
    const list = votesByGuest.get(v.guestId) ?? [];
    list.push(v);
    votesByGuest.set(v.guestId, list);
  }

  // Build enriched guest list (deduplicated)
  const seen = new Set<string>();
  const enriched: ArchiveGuest[] = [];

  for (const g of rawGuests) {
    if (seen.has(g.guestId)) {
      // Add meeting to existing entry
      const existing = enriched.find((e) => e.id === g.guestId);
      if (existing && !existing.meetings.some((m) => m.id === g.meetingId)) {
        existing.meetings.push({ id: g.meetingId, date: g.meetingDate });
      }
      continue;
    }
    seen.add(g.guestId);

    const guestNotes = notesByGuest.get(g.guestId) ?? [];
    const guestVotes = votesByGuest.get(g.guestId) ?? [];

    const voteSummary = {
      up: guestVotes.filter((v) => v.value === "up").length,
      neutral: guestVotes.filter((v) => v.value === "neutral").length,
      down: guestVotes.filter((v) => v.value === "down").length,
      total: guestVotes.length,
    };

    enriched.push({
      id: g.guestId,
      name: g.guestName,
      description: g.guestDescription,
      categoryId: g.categoryId,
      categoryName: g.categoryName,
      meetings: [{ id: g.meetingId, date: g.meetingDate }],
      notes: guestNotes.map((n) => ({
        id: n.id,
        text: n.text,
        createdAt: n.createdAt,
      })),
      voteSummary,
    });
  }

  return enriched;
}

/** Type for enriched archive guest */
export interface ArchiveGuest {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  meetings: Array<{ id: string; date: string }>;
  notes: Array<{ id: string; text: string; createdAt: Date }>;
  voteSummary: {
    up: number;
    neutral: number;
    down: number;
    total: number;
  };
}
