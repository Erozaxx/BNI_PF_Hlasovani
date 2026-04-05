import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { meeting as meetingTable, meetingMemberLink } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

const VOTING_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours
const TOKEN_EXPIRY_EXTRA_MS = 24 * 60 * 60 * 1000; // +24h → total 72h after votingOpenAt

/**
 * POST /api/meetings/[id]/activate-voting
 *
 * Transitions a meeting from active -> voting.
 * Sets votingOpenAt = now(), votingClosesAt = now() + 48h.
 * Sets expires_at = votingOpenAt + 72h on all meeting_member_link rows.
 *
 * Auth: admin or moderator session required.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth check
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  if (!isManagement) {
    return err(401, "Unauthorized");
  }

  const { id: meetingId } = await params;

  // 2. Load meeting
  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Meeting not found");
  }

  // 3. State guard: must be active
  if (meetingData.status !== "active") {
    return err(409, `Cannot activate voting for meeting in status '${meetingData.status}'`);
  }

  const now = new Date();
  const votingOpenAt = now;
  const votingClosesAt = new Date(now.getTime() + VOTING_DURATION_MS);
  const expiresAt = new Date(now.getTime() + VOTING_DURATION_MS + TOKEN_EXPIRY_EXTRA_MS);

  // 4. Update meeting status — guard: WHERE status='active' prevents double-transition
  // Two separate queries (no transaction) — neon-http doesn't support transactions.
  // If link expiry update fails, links remain valid indefinitely; cron handles cleanup.
  const updated = await getDb()
    .update(meetingTable)
    .set({
      status: "voting",
      votingOpenAt,
      votingClosesAt,
    })
    .where(and(eq(meetingTable.id, meetingId), eq(meetingTable.status, "active")))
    .returning({
      id: meetingTable.id,
      status: meetingTable.status,
      votingOpenAt: meetingTable.votingOpenAt,
      votingClosesAt: meetingTable.votingClosesAt,
    });

  if (updated.length === 0) {
    return err(409, "Meeting is not in active status or was already transitioned");
  }

  // 5. Set expiry on all member links — separate query, idempotent
  await getDb()
    .update(meetingMemberLink)
    .set({ expiresAt })
    .where(eq(meetingMemberLink.meetingId, meetingId));

  console.info(
    `[activate-voting] meetingId=${meetingId} activatedBy=${session.memberId} votingOpenAt=${votingOpenAt.toISOString()} expiresAt=${expiresAt.toISOString()}`
  );

  return NextResponse.json(
    {
      status: "voting",
      votingOpenAt: votingOpenAt.toISOString(),
      votingClosesAt: votingClosesAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
    { status: 200 }
  );
}
