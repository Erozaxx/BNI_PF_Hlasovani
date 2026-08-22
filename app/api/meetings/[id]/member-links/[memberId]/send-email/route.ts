import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { getMemberById } from "@/lib/db/queries/members";
import { markLinkEmailSent } from "@/lib/db/queries/meeting-member-links";
import {
  regenerateMeetingToken,
  buildMeetingMagicUrl,
} from "@/lib/auth/meeting-magic";
import { sendMeetingMagicLinkEmail } from "@/lib/email/resend";
import { logOpsEvent } from "@/lib/ops/event-log";

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/meetings/[id]/member-links/[memberId]/send-email
 *
 * Sends a magic link email to a specific member for a specific meeting.
 *
 * Iter-026 (arch 4.4): the client never holds the raw token — this endpoint
 * regenerates it itself (UPDATE, preserves the UNIQUE constraint), builds
 * the URL server-side, sends the email, and marks morningEmailSentAt
 * ("odkaz odeslán", not the old morning-email semantics). Request body is
 * ignored entirely; the endpoint always works, reload or not — the whole
 * point is that the client no longer needs a rawToken from an earlier
 * response to use this button.
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

  // 3. Load member to get email and name
  const memberData = await getMemberById(memberId);
  if (!memberData) {
    return err(404, "Member not found");
  }

  if (!memberData.email) {
    return err(422, "Member has no email address");
  }

  // iter-027 (T-005, arch 6.5): ruční "Poslat odkaz" — jeden běh, source
  // "manual", actor = session.memberId.
  const runId = randomUUID();

  // 4. Regenerate the token server-side — returns null only if no link row
  // exists for this member/meeting yet (regenerate is UPDATE-only).
  const rawToken = await regenerateMeetingToken(meetingId, memberId);
  if (!rawToken) {
    return err(404, "No link found for this member in this meeting");
  }

  // 5. Send email
  const magicUrl = buildMeetingMagicUrl(rawToken);
  const result = await sendMeetingMagicLinkEmail(
    memberData.email,
    magicUrl,
    memberData.name,
    meetingData.date
  );

  if (!result.success) {
    console.error(
      `[send-email] Failed to send to ${memberData.email}: ${result.error}`
    );
    await logOpsEvent({
      runId,
      seq: 0,
      source: "manual",
      kind: "email.failed",
      severity: "error",
      actor: session.memberId,
      meetingId,
      meetingDate: meetingData.date,
      memberId,
      memberName: memberData.name,
      email: memberData.email,
      message: `Odeslani selhalo: ${memberData.name} - ${result.error}`,
    });
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 502 }
    );
  }

  // 6. Mark sent — after the email actually went out (LL-003 idempotency vzor).
  await markLinkEmailSent(meetingId, memberId, new Date());

  await logOpsEvent({
    runId,
    seq: 0,
    source: "manual",
    kind: "email.sent",
    severity: "info",
    actor: session.memberId,
    meetingId,
    meetingDate: meetingData.date,
    memberId,
    memberName: memberData.name,
    email: memberData.email,
    message: `Hlasovaci odkaz odeslan: ${memberData.name}.`,
    resendEmailId: result.resendId,
  });

  console.info(
    `[send-email] meetingId=${meetingId} memberId=${memberId} email=${memberData.email} by=${session.memberId}`
  );

  return NextResponse.json(
    { success: true, sentTo: memberData.email },
    { status: 200 }
  );
}
