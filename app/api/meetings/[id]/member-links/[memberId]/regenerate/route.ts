import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import {
  regenerateMeetingToken,
  buildMeetingMagicUrl,
} from "@/lib/auth/meeting-magic";

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/meetings/[id]/member-links/[memberId]/regenerate
 *
 * Regenerates the magic token for a specific member in a meeting.
 * Uses UPDATE (not INSERT) to preserve the UNIQUE constraint on (meeting_id, member_id).
 * Returns the new raw token and magic URL so the admin can copy it.
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

  // 3. Regenerate token (UPDATE existing row — no INSERT, preserves UNIQUE)
  const rawToken = await regenerateMeetingToken(meetingId, memberId);

  if (rawToken === null) {
    return err(404, "No link found for this member in this meeting");
  }

  const magicUrl = buildMeetingMagicUrl(rawToken);

  console.info(
    `[regenerate] meetingId=${meetingId} memberId=${memberId} by=${session.memberId}`
  );

  return NextResponse.json(
    {
      memberId,
      rawToken,
      magicUrl,
    },
    { status: 200 }
  );
}
