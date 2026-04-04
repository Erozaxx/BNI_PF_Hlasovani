import { NextRequest, NextResponse } from "next/server";
import { eq, isNotNull, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { member as memberTable, meetingMemberLink } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * GET /api/meetings/[id]/member-links
 *
 * Returns ALL members with an email address (LEFT JOIN with meeting_member_link).
 * Each entry includes:
 *   - memberId, memberName, memberEmail
 *   - hasLink: whether a meeting_member_link row exists for this member+meeting
 *   - isRevoked: revokedAt != null
 *   - isExpired: expiresAt != null && expiresAt < now
 *   - createdAt, expiresAt (null if no link)
 *   - morningEmailSentAt (null if not sent or no link)
 *
 * Auth: admin or moderator session required.
 */
export async function GET(
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

  // 3. LEFT JOIN: all members with email + their link for this meeting (if any)
  const rows = await getDb()
    .select({
      memberId: memberTable.id,
      memberName: memberTable.name,
      memberEmail: memberTable.email,
      linkId: meetingMemberLink.id,
      tokenHash: meetingMemberLink.tokenHash,
      linkCreatedAt: meetingMemberLink.createdAt,
      expiresAt: meetingMemberLink.expiresAt,
      revokedAt: meetingMemberLink.revokedAt,
      morningEmailSentAt: meetingMemberLink.morningEmailSentAt,
    })
    .from(memberTable)
    .leftJoin(
      meetingMemberLink,
      and(
        eq(meetingMemberLink.memberId, memberTable.id),
        eq(meetingMemberLink.meetingId, meetingId)
      )
    )
    .where(isNotNull(memberTable.email));

  const now = new Date();

  const links = rows.map((row) => {
    const hasLink = row.linkId !== null;
    const isRevoked = hasLink && row.revokedAt !== null;
    const isExpired =
      hasLink && row.expiresAt !== null && row.expiresAt < now;

    return {
      memberId: row.memberId,
      memberName: row.memberName,
      memberEmail: row.memberEmail,
      hasLink,
      isRevoked,
      isExpired,
      createdAt: row.linkCreatedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      morningEmailSentAt: row.morningEmailSentAt?.toISOString() ?? null,
    };
  });

  // Sort: by memberName alphabetically
  links.sort((a, b) => a.memberName.localeCompare(b.memberName, "cs"));

  return NextResponse.json({ links }, { status: 200 });
}
