import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForRoute } from "@/lib/auth/guards";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { getMemberById } from "@/lib/db/queries/members";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
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
  const authz = await requirePermissionForRoute("meetings.manage");
  if ("response" in authz) return authz.response;
  const { session } = authz;

  const { id: meetingId, memberId } = await params;

  // 2. Load meeting
  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Meeting not found");
  }

  // iter-037 (T-003b, gate sekce 5): neaktivnímu členovi odkaz přegenerovat nejde.
  const memberData = await getMemberById(memberId);
  if (!memberData) {
    return err(404, "Member not found");
  }
  if (!isMemberActive(memberData, pragueToday())) {
    return err(409, "Člen je neaktivní, odkaz mu teď poslat nejde.");
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
