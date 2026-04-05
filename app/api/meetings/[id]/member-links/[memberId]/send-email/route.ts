import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { getMemberById } from "@/lib/db/queries/members";
import { meetingMemberLink } from "@/lib/db/schema";
import { buildMeetingMagicUrl, hashMeetingToken } from "@/lib/auth/meeting-magic";
import { sendMeetingMagicLinkEmail } from "@/lib/email/resend";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/meetings/[id]/member-links/[memberId]/send-email
 *
 * Sends a magic link email to a specific member for a specific meeting.
 * The token is retrieved from the database (raw token is NOT stored — we reconstruct
 * the URL by looking up the link and relying on the fact that admin must regenerate
 * if they need the raw token again).
 *
 * NOTE: Since we store only the token hash (not the raw token), we cannot reconstruct
 * the URL from the stored hash. This endpoint requires the admin to provide the rawToken
 * in the request body — OR the token was regenerated just before calling this endpoint.
 *
 * Implementation: Accept rawToken in request body (optional).
 * If not provided, return 422 asking admin to regenerate first.
 *
 * Auth: admin or moderator session required.
 */
export async function POST(
  req: NextRequest,
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

  // 3. Parse body
  let body: { rawToken?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional
  }

  const rawToken = body.rawToken;
  if (!rawToken) {
    return err(422, "rawToken is required in request body. Regenerate the link first to get a new raw token.");
  }

  // 4. Verify the rawToken matches the stored hash for this member+meeting
  const tokenHash = hashMeetingToken(rawToken);
  const rows = await getDb()
    .select({ id: meetingMemberLink.id, revokedAt: meetingMemberLink.revokedAt })
    .from(meetingMemberLink)
    .where(
      and(
        eq(meetingMemberLink.meetingId, meetingId),
        eq(meetingMemberLink.memberId, memberId),
        eq(meetingMemberLink.tokenHash, tokenHash)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    return err(400, "Token does not match the stored link for this member. Regenerate the link first.");
  }

  if (rows[0].revokedAt !== null) {
    return err(409, "This link has been revoked. Regenerate before sending.");
  }

  // 5. Load member to get email and name
  const memberData = await getMemberById(memberId);
  if (!memberData) {
    return err(404, "Member not found");
  }

  if (!memberData.email) {
    return err(422, "Member has no email address");
  }

  // 6. Send email
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
    return NextResponse.json(
      { success: false, error: result.error },
      { status: 502 }
    );
  }

  console.info(
    `[send-email] meetingId=${meetingId} memberId=${memberId} email=${memberData.email} by=${session.memberId}`
  );

  return NextResponse.json(
    { success: true, sentTo: memberData.email },
    { status: 200 }
  );
}
