import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { getMeetingById, hasActiveOrVotingMeeting } from "@/lib/db/queries/meetings";
import { getMembers } from "@/lib/db/queries/members";
import { meeting as meetingTable } from "@/lib/db/schema";
import {
  generateMeetingToken,
  buildMeetingMagicUrl,
  getMeetingMemberLink,
} from "@/lib/auth/meeting-magic";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/meetings/[id]/activate
 *
 * Transitions a meeting from draft -> active.
 * Generates meeting_member_link rows for all members with email.
 * Returns the generated raw tokens keyed by memberId (admin can copy links immediately).
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

  // 3. State guard: must be draft
  if (meetingData.status !== "draft") {
    return err(409, `Cannot activate meeting in status '${meetingData.status}'`);
  }

  // 3b. Max-1-active guard: no other meeting may be active or voting
  const conflict = await hasActiveOrVotingMeeting(meetingId);
  if (conflict) {
    return err(409, "Jiz existuje aktivni nebo hlasovaci schuzka. Nejdrive ji uzavrete.");
  }

  // 4. Load all members with an email address
  const allMembers = await getMembers();
  const membersWithEmail = allMembers.filter((m) => m.email);

  if (membersWithEmail.length === 0) {
    return err(422, "No members with email found — cannot generate links");
  }

  // 5. Generate tokens for each member (skip if link already exists)
  const generatedLinks: Array<{
    memberId: string;
    memberName: string;
    memberEmail: string;
    rawToken: string;
    magicUrl: string;
    alreadyExisted: boolean;
  }> = [];

  for (const m of membersWithEmail) {
    // Check if a link already exists (idempotent re-activation guard)
    const existing = await getMeetingMemberLink(meetingId, m.id);
    if (existing) {
      // Link already exists — do not overwrite
      generatedLinks.push({
        memberId: m.id,
        memberName: m.name,
        memberEmail: m.email!,
        rawToken: "",
        magicUrl: "",
        alreadyExisted: true,
      });
      continue;
    }

    const rawToken = await generateMeetingToken(meetingId, m.id);
    generatedLinks.push({
      memberId: m.id,
      memberName: m.name,
      memberEmail: m.email!,
      rawToken,
      magicUrl: buildMeetingMagicUrl(rawToken),
      alreadyExisted: false,
    });
  }

  // 6. Transition meeting to active
  const updated = await getDb()
    .update(meetingTable)
    .set({ status: "active" })
    .where(eq(meetingTable.id, meetingId))
    .returning({ id: meetingTable.id, status: meetingTable.status });

  if (updated.length === 0) {
    return err(500, "Failed to update meeting status");
  }

  console.info(
    `[activate] meetingId=${meetingId} activatedBy=${session.memberId} linksGenerated=${generatedLinks.filter((l) => !l.alreadyExisted).length}`
  );

  return NextResponse.json(
    {
      status: "active",
      links: generatedLinks.map((l) => ({
        memberId: l.memberId,
        memberName: l.memberName,
        memberEmail: l.memberEmail,
        // Only return raw token/url for newly created links
        rawToken: l.alreadyExisted ? null : l.rawToken,
        magicUrl: l.alreadyExisted ? null : l.magicUrl,
        alreadyExisted: l.alreadyExisted,
      })),
    },
    { status: 200 }
  );
}
