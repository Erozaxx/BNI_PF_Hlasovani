import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForRoute } from "@/lib/auth/guards";
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
  const authz = await requirePermissionForRoute("meetings.manage");
  if ("response" in authz) return authz.response;
  const { session } = authz;

  const { id: meetingId, memberId } = await params;

  // 2. Load meeting
  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Schůzka nebyla nalezena.");
  }

  // 3. Revoke the token
  const revoked = await revokeMeetingToken(meetingId, memberId);

  if (!revoked) {
    return err(404, "Tenhle člen nemá u téhle schůzky žádný odkaz.");
  }

  console.info(
    `[revoke] meetingId=${meetingId} memberId=${memberId} by=${session.memberId}`
  );

  return NextResponse.json({ success: true, memberId }, { status: 200 });
}
