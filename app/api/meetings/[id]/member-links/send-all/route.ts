import { NextRequest, NextResponse } from "next/server";
import { eq, and, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { member as memberTable, meetingMemberLink } from "@/lib/db/schema";
import { buildMeetingMagicUrl, hashMeetingToken } from "@/lib/auth/meeting-magic";
import { sendMeetingMagicLinkEmail } from "@/lib/email/resend";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

interface SendResult {
  memberId: string;
  memberName: string;
  memberEmail: string;
  status: "sent" | "skipped" | "error";
  reason?: string;
}

/**
 * POST /api/meetings/[id]/member-links/send-all
 *
 * Sends meeting magic link emails to all members who have an active (non-revoked) link.
 * Uses Promise.allSettled — all sends are attempted in parallel; partial failures are reported.
 *
 * Body (optional):
 *   { rawTokens: { [memberId]: string } } — map of memberId -> rawToken
 *   If provided, uses supplied tokens. Otherwise only sends to members whose link
 *   can be identified (requires rawToken since we only store hash).
 *
 * Note: since we only store the hash, not the raw token, this endpoint requires
 * the caller to provide rawTokens (e.g., from the activate or regenerate response).
 * Members without a supplied token will be skipped.
 *
 * Auth: admin or moderator session required.
 */
export async function POST(
  req: NextRequest,
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

  // 3. Parse body — rawTokens map is required
  let body: { rawTokens?: Record<string, string> } = {};
  try {
    body = await req.json();
  } catch {
    // empty body
  }

  const rawTokens: Record<string, string> = body.rawTokens ?? {};

  if (Object.keys(rawTokens).length === 0) {
    return err(422, "rawTokens map is required (memberId -> rawToken). Activate or regenerate links first.");
  }

  // 4. Load all members with email that have an active (non-revoked) link for this meeting
  const rows = await getDb()
    .select({
      memberId: memberTable.id,
      memberName: memberTable.name,
      memberEmail: memberTable.email,
      tokenHash: meetingMemberLink.tokenHash,
      revokedAt: meetingMemberLink.revokedAt,
    })
    .from(memberTable)
    .innerJoin(
      meetingMemberLink,
      and(
        eq(meetingMemberLink.memberId, memberTable.id),
        eq(meetingMemberLink.meetingId, meetingId)
      )
    )
    .where(isNotNull(memberTable.email));

  if (rows.length === 0) {
    return NextResponse.json(
      { sent: 0, skipped: 0, errors: 0, results: [] },
      { status: 200 }
    );
  }

  // 5. Send sequentially with 250ms delay to stay under Resend rate limit (5 req/s)
  const results: SendResult[] = [];

  for (const row of rows) {
    const memberId = row.memberId;
    const rawToken = rawTokens[memberId];

    // Skip if no raw token supplied for this member
    if (!rawToken) {
      results.push({
        memberId,
        memberName: row.memberName,
        memberEmail: row.memberEmail!,
        status: "skipped",
        reason: "No rawToken supplied for this member",
      });
      continue;
    }

    // Verify rawToken matches stored hash (integrity check — prevents spoofed tokens)
    const expectedHash = hashMeetingToken(rawToken);
    if (expectedHash !== row.tokenHash) {
      results.push({
        memberId,
        memberName: row.memberName,
        memberEmail: row.memberEmail!,
        status: "skipped",
        reason: "Token mismatch — regenerate the link first",
      });
      continue;
    }

    // Skip revoked links
    if (row.revokedAt !== null) {
      results.push({
        memberId,
        memberName: row.memberName,
        memberEmail: row.memberEmail!,
        status: "skipped",
        reason: "Link is revoked",
      });
      continue;
    }

    const magicUrl = buildMeetingMagicUrl(rawToken);
    const result = await sendMeetingMagicLinkEmail(
      row.memberEmail!,
      magicUrl,
      row.memberName,
      meetingData.date
    );

    results.push({
      memberId,
      memberName: row.memberName,
      memberEmail: row.memberEmail!,
      status: result.success ? "sent" : "error",
      reason: result.success ? undefined : result.error,
    });

    // 250ms delay between sends — Resend limit is 5 req/s
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const sent = results.filter((r) => r.status === "sent").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error").length;

  console.info(
    `[send-all] meetingId=${meetingId} sent=${sent} skipped=${skipped} errors=${errors} by=${session.memberId}`
  );

  return NextResponse.json(
    { sent, skipped, errors, results },
    { status: 200 }
  );
}
