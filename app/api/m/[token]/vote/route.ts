import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { verifyMeetingToken } from "@/lib/auth/meeting-magic";

export const dynamic = "force-dynamic";
import { meeting, meetingGuest, vote } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

type VoteValue = "up" | "neutral" | "down";
const VALID_VOTE_VALUES: ReadonlySet<string> = new Set(["up", "neutral", "down"]);

/**
 * POST /api/m/[token]/vote
 *
 * Cast a vote for a guest in the current meeting.
 * Only allowed when meeting is in 'voting' phase.
 * meetingId is ALWAYS taken server-side from the verified token.
 * guestId is validated against meeting guests.
 *
 * Body: { guestId: string, value: "up"|"neutral"|"down", reason?: string }
 *
 * Auth: magic token in URL — no session required.
 */
export async function POST(
  req: NextRequest,
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

  // meetingId is server-side only — never from body
  const { meetingId, memberId } = tokenResult;

  // 2. Check meeting is in voting phase
  const meetingRows = await getDb()
    .select({ status: meeting.status })
    .from(meeting)
    .where(eq(meeting.id, meetingId))
    .limit(1);

  if (meetingRows.length === 0) {
    return err(404, "Meeting not found");
  }

  if (meetingRows[0].status !== "voting") {
    return err(403, `Voting not open — meeting is in '${meetingRows[0].status}' phase`);
  }

  // 3. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).guestId !== "string" ||
    typeof (body as Record<string, unknown>).value !== "string"
  ) {
    return err(400, "Missing required fields: guestId, value");
  }

  const { guestId, value, reason } = body as {
    guestId: string;
    value: string;
    reason?: unknown;
  };

  if (!VALID_VOTE_VALUES.has(value)) {
    return err(400, "Invalid vote value — must be one of: up, neutral, down");
  }

  const voteValue = value as VoteValue;
  const voteReason = typeof reason === "string" ? reason.trim() : undefined;

  if (voteValue === "down" && (!voteReason || voteReason.length === 0)) {
    return err(400, "reason is required for a 'down' vote");
  }

  // 4. Validate guestId is part of this meeting and voting-enabled
  const meetingGuestRows = await getDb()
    .select({ votingEnabled: meetingGuest.votingEnabled })
    .from(meetingGuest)
    .where(
      and(
        eq(meetingGuest.meetingId, meetingId),
        eq(meetingGuest.guestId, guestId)
      )
    )
    .limit(1);

  if (meetingGuestRows.length === 0) {
    return err(403, "Guest not part of this meeting");
  }

  if (!meetingGuestRows[0].votingEnabled) {
    return err(403, "Voting is not enabled for this guest");
  }

  // 5. Insert vote (unique constraint prevents duplicates)
  try {
    const inserted = await getDb()
      .insert(vote)
      .values({
        memberId,
        guestId,
        meetingId,
        value: voteValue,
        reason: voteReason ?? null,
      })
      .returning({
        id: vote.id,
        value: vote.value,
        reason: vote.reason,
        createdAt: vote.createdAt,
      });

    return NextResponse.json({ vote: inserted[0] }, { status: 201 });
  } catch (e: unknown) {
    // PostgreSQL unique violation = 23505
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "23505"
    ) {
      return err(409, "Vote already cast for this guest in this meeting");
    }
    throw e;
  }
}
