import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meeting, meetingGuest, guest, category } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get all meetings ordered by date desc.
 */
export async function getMeetings() {
  return getDb().select().from(meeting).orderBy(desc(meeting.date));
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
export async function createMeeting(dateStr: string) {
  const results = await getDb()
    .insert(meeting)
    .values({
      date: dateStr,
      status: "draft",
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
