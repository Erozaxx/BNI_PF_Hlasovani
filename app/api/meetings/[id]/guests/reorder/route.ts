import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getMeetingById,
  getMeetingGuestIds,
  reorderMeetingGuests,
} from "@/lib/db/queries/meetings";

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/meetings/[id]/guests/reorder
 *
 * Body: { orderedGuestIds: string[] } — guest IDs in the desired per-meeting
 * display order. Persists display_order = index per guest within this meeting
 * (sequential UPDATEs, no transaction — LL-003).
 *
 * Auth: admin or moderator session required.
 * State guard: only allowed while meeting status is 'draft' or 'active'.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  if (!isManagement) {
    return err(401, "Unauthorized");
  }

  const { id: meetingId } = await params;

  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Meeting not found");
  }

  if (meetingData.status !== "draft" && meetingData.status !== "active") {
    return err(
      409,
      `Cannot reorder guests for meeting in status '${meetingData.status}'`
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "Invalid JSON body");
  }

  const orderedGuestIds = (body as { orderedGuestIds?: unknown })?.orderedGuestIds;
  if (
    !Array.isArray(orderedGuestIds) ||
    orderedGuestIds.some((x) => typeof x !== "string" || x.length === 0)
  ) {
    return err(400, "orderedGuestIds must be a non-empty array of strings");
  }

  if (new Set(orderedGuestIds).size !== orderedGuestIds.length) {
    return err(400, "orderedGuestIds contains duplicates");
  }

  // Subset validation: every id must belong to this meeting.
  const meetingGuestIds = await getMeetingGuestIds(meetingId);
  for (const gid of orderedGuestIds as string[]) {
    if (!meetingGuestIds.has(gid)) {
      return err(400, "orderedGuestIds contains a guest not in this meeting");
    }
  }

  try {
    await reorderMeetingGuests(meetingId, orderedGuestIds as string[]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[meetings/guests/reorder] error:", error);
    return err(500, "Failed to reorder guests");
  }
}
