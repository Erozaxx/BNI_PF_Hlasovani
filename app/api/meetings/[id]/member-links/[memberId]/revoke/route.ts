import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { revokeMeetingToken } from "@/lib/auth/meeting-magic";

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/meetings/[id]/member-links/[memberId]/revoke
 *
 * Soft-revokes the magic token for a specific member in a meeting.
 * Sets revoked_at = now() on the meeting_member_link row.
 *
 * Auth: admin or moderator session required.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  // 1. Auth check
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  if (!isManagement) {
    return err(401, "Unauthorized");
  }

  const { id: meetingId, memberId } = await params;

  // 2. Load meeting
  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Meeting not found");
  }

  // 3. Revoke the token
  const revoked = await revokeMeetingToken(meetingId, memberId);

  if (!revoked) {
    return err(404, "No link found for this member in this meeting");
  }

  console.info(
    `[revoke] meetingId=${meetingId} memberId=${memberId} by=${session.memberId}`
  );

  return NextResponse.json({ success: true, memberId }, { status: 200 });
}
