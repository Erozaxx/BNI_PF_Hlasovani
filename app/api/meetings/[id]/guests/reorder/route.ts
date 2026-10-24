import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForRoute } from "@/lib/auth/guards";
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
 * Body: { orderedGuestIds: string[] }  - guest IDs in the desired per-meeting
 * display order. Persists display_order = index per guest within this meeting
 * (sequential UPDATEs, no transaction - LL-003).
 *
 * Auth: admin or moderator session required.
 * State guard: only allowed while meeting status is 'draft' or 'active'.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requirePermissionForRoute("meetings.manage");
  if ("response" in authz) return authz.response;

  const { id: meetingId } = await params;

  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Schůzka nebyla nalezena.");
  }

  if (meetingData.status !== "draft" && meetingData.status !== "active") {
    return err(
      409,
      "Pořadí hostů jde měnit jen u schůzky, která ještě nemá spuštěné hlasování."
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "Požadavek má neplatný formát.");
  }

  const orderedGuestIds = (body as { orderedGuestIds?: unknown })?.orderedGuestIds;
  if (
    !Array.isArray(orderedGuestIds) ||
    orderedGuestIds.some((x) => typeof x !== "string" || x.length === 0)
  ) {
    return err(400, "Pořadí hostů chybí nebo má neplatný formát.");
  }

  if (new Set(orderedGuestIds).size !== orderedGuestIds.length) {
    return err(400, "Pořadí hostů obsahuje duplicity.");
  }

  // Subset validation: every id must belong to this meeting.
  const meetingGuestIds = await getMeetingGuestIds(meetingId);
  for (const gid of orderedGuestIds as string[]) {
    if (!meetingGuestIds.has(gid)) {
      return err(400, "Pořadí obsahuje hosta, který k téhle schůzce nepatří.");
    }
  }

  // Completeness guard (M-1): the list must cover ALL guests of this meeting.
  // A partial list would leave the missing guests with their old display_order,
  // producing collisions / gaps. With the no-duplicates and subset checks above,
  // length equality guarantees a full permutation of this meeting's guests.
  if (orderedGuestIds.length !== meetingGuestIds.size) {
    return err(
      400,
      "Pořadí musí obsahovat každého hosta schůzky právě jednou."
    );
  }

  try {
    await reorderMeetingGuests(meetingId, orderedGuestIds as string[]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[meetings/guests/reorder] error:", error);
    return err(500, "Pořadí hostů se nepodařilo uložit. Zkus to znovu.");
  }
}
