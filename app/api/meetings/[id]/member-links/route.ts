import { NextRequest, NextResponse } from "next/server";
import { eq, isNotNull, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { requirePermissionForRoute } from "@/lib/auth/guards";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { member as memberTable, meetingMemberLink } from "@/lib/db/schema";
import { memberActiveSql } from "@/lib/db/queries/member-active";

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
 *   - memberId, memberName, memberEmail, isInactive (iter-037: deaktivovaný člen)
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
  const authz = await requirePermissionForRoute("meetings.manage");
  if ("response" in authz) return authz.response;

  const { id: meetingId } = await params;

  // 2. Load meeting
  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Schůzka nebyla nalezena.");
  }

  // 3. LEFT JOIN: all members with email + their link for this meeting (if any)
  const rows = await getDb()
    .select({
      memberId: memberTable.id,
      memberName: memberTable.name,
      memberEmail: memberTable.email,
      // iter-037 (T-003b): neaktivní se ukáže se štítkem „Neaktivní“ bez akcí.
      // Jen příznak, datum deaktivace do odpovědi nejde.
      isInactive: sql<boolean>`NOT ${memberActiveSql("member")}`,
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
      isInactive: row.isInactive,
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
