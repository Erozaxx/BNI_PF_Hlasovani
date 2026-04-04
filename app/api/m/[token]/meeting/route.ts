import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { verifyMeetingToken } from "@/lib/auth/meeting-magic";
import {
  meeting,
  meetingGuest,
  guest,
  category,
  note,
  vote,
  member,
} from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/m/[token]/meeting
 *
 * Returns meeting data for the authenticated member:
 * - phase (active|voting|closed)
 * - meetingDate, location
 * - memberName
 * - guests with notes and myVote
 *
 * Auth: magic token in URL — no session required.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;

  // 1. Verify token
  const tokenResult = await verifyMeetingToken(rawToken);
  if (tokenResult.status === "expired") {
    return err(401, "Token expired");
  }
  if (tokenResult.status === "revoked") {
    return err(401, "Token revoked");
  }
  if (tokenResult.status === "invalid") {
    return err(401, "Invalid token");
  }

  const { meetingId, memberId } = tokenResult;

  // 2. Load meeting
  const meetingRows = await getDb()
    .select({
      id: meeting.id,
      date: meeting.date,
      status: meeting.status,
      location: meeting.location,
    })
    .from(meeting)
    .where(eq(meeting.id, meetingId))
    .limit(1);

  if (meetingRows.length === 0) {
    return err(404, "Meeting not found");
  }

  const meetingData = meetingRows[0];

  // 3. Load member name
  const memberRows = await getDb()
    .select({ name: member.name })
    .from(member)
    .where(eq(member.id, memberId))
    .limit(1);

  const memberName = memberRows[0]?.name ?? null;

  // 4. Load guests for this meeting (with category)
  const guestRows = await getDb()
    .select({
      guestId: guest.id,
      guestName: guest.name,
      guestCompany: guest.company,
      guestEmail: guest.email,
      guestDescription: guest.description,
      categoryName: category.name,
      votingEnabled: meetingGuest.votingEnabled,
    })
    .from(meetingGuest)
    .innerJoin(guest, eq(meetingGuest.guestId, guest.id))
    .leftJoin(category, eq(guest.categoryId, category.id))
    .where(eq(meetingGuest.meetingId, meetingId))
    .orderBy(guest.name);

  // 5. Load notes scoped to this meeting
  const noteRows = await getDb()
    .select({
      id: note.id,
      guestId: note.guestId,
      text: note.text,
      createdAt: note.createdAt,
    })
    .from(note)
    .where(eq(note.meetingId, meetingId))
    .orderBy(note.createdAt);

  // 6. Load votes for this member in this meeting
  const voteRows = await getDb()
    .select({
      guestId: vote.guestId,
      value: vote.value,
      reason: vote.reason,
    })
    .from(vote)
    .where(and(eq(vote.memberId, memberId), eq(vote.meetingId, meetingId)));

  // Build lookup maps
  const notesByGuest = new Map<string, Array<{ id: string; text: string; createdAt: Date }>>();
  for (const n of noteRows) {
    if (!notesByGuest.has(n.guestId)) {
      notesByGuest.set(n.guestId, []);
    }
    notesByGuest.get(n.guestId)!.push({
      id: n.id,
      text: n.text,
      createdAt: n.createdAt,
    });
  }

  const voteByGuest = new Map<string, { value: string; reason: string | null }>();
  for (const v of voteRows) {
    voteByGuest.set(v.guestId, { value: v.value, reason: v.reason ?? null });
  }

  // 7. Assemble guests
  const guests = guestRows.map((g) => ({
    id: g.guestId,
    name: g.guestName,
    company: g.guestCompany ?? null,
    email: g.guestEmail ?? null,
    description: g.guestDescription ?? null,
    categoryName: g.categoryName ?? null,
    votingEnabled: g.votingEnabled,
    notes: (notesByGuest.get(g.guestId) ?? []).map((n) => ({
      id: n.id,
      text: n.text,
      createdAt: n.createdAt,
    })),
    myVote: voteByGuest.get(g.guestId) ?? null,
  }));

  return NextResponse.json({
    phase: meetingData.status,
    meetingDate: meetingData.date,
    location: meetingData.location ?? null,
    memberName,
    guests,
  });
}
