import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { verifyMeetingToken } from "@/lib/auth/meeting-magic";

export const dynamic = "force-dynamic";
import { meetingGuest, note } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/m/[token]/notes
 *
 * Add a note to a guest scoped to the current meeting.
 * meetingId is ALWAYS taken server-side from the verified token — never from the request body.
 *
 * Body: { guestId: string, text: string }
 *
 * Auth: magic token in URL — no session required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;

  // 1. Verify token
  const tokenResult = await verifyMeetingToken(rawToken);
  if (tokenResult.status === "expired") {
    return err(401, "Token expired");
  }
  if (tokenResult.status === "revoked") {
    return err(401, "Token revoked");
  }
  if (tokenResult.status === "invalid") {
    return err(401, "Invalid token");
  }

  // meetingId is server-side only — NEVER from body (MINOR-002)
  const { meetingId, memberId } = tokenResult;

  // 2. Parse body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).guestId !== "string" ||
    typeof (body as Record<string, unknown>).text !== "string"
  ) {
    return err(400, "Missing required fields: guestId, text");
  }

  const { guestId, text } = body as { guestId: string; text: string };

  if (text.trim().length === 0) {
    return err(400, "text must not be empty");
  }

  // 3. Validate guestId belongs to this meeting
  const meetingGuestRows = await getDb()
    .select({ guestId: meetingGuest.guestId })
    .from(meetingGuest)
    .where(
      eq(meetingGuest.meetingId, meetingId)
    )
    .limit(100);

  const guestIds = new Set(meetingGuestRows.map((r) => r.guestId));
  if (!guestIds.has(guestId)) {
    return err(403, "Guest not part of this meeting");
  }

  // 4. Insert note with meetingId from server-side token (MINOR-002)
  const inserted = await getDb()
    .insert(note)
    .values({
      memberId,
      guestId,
      meetingId,
      text: text.trim(),
    })
    .returning({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
    });

  return NextResponse.json({ note: inserted[0] }, { status: 201 });
}
