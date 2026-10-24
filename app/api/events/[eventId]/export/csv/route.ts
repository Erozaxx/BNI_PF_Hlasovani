import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForRoute } from "@/lib/auth/guards";
import { getEventById, getEventOptions, getEventParticipants } from "@/lib/db/queries/events";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { eventVote } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function getDb() {
  return drizzle(getSql());
}

function csvEscape(value: string): string {
  // Wrap in double-quotes if value contains comma, newline, or double-quote
  if (value.includes(",") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  // Auth: require managementRole
  const authz = await requirePermissionForRoute("events.manage", { status: 403 });
  if ("response" in authz) return authz.response;

  const { eventId } = await params;

  const ev = await getEventById(eventId);
  if (!ev) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const [options, participants] = await Promise.all([
    getEventOptions(eventId),
    getEventParticipants(eventId),
  ]);

  // Load all votes for this event
  const votes = await getDb()
    .select()
    .from(eventVote)
    .where(eq(eventVote.eventId, eventId));

  // Build a Set for quick lookup: "participantId:optionId"
  const voteSet = new Set(votes.map((v) => `${v.participantId}:${v.optionId}`));

  // Build CSV
  // Header: Účastník, E-mail, Členství, <option1>, <option2>, ...
  const headerRow = [
    "Účastník",
    "E-mail",
    "Členství",
    ...options.map((o) => o.label),
  ]
    .map(csvEscape)
    .join(",");

  const dataRows = participants.map((p) => {
    const name = p.memberName ?? p.externalName ?? "";
    const email = p.memberEmail ?? p.externalEmail ?? "";
    const membership = p.memberId ? "Člen BNI" : "Externí";
    const optionCols = options.map((o) =>
      voteSet.has(`${p.id}:${o.id}`) ? "1" : "0"
    );

    return [name, email, membership, ...optionCols].map(csvEscape).join(",");
  });

  // UTF-8 BOM ensures Excel opens the file with correct encoding
  const BOM = "\uFEFF";
  const csv = BOM + [headerRow, ...dataRows].join("\r\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${eventId}-report.csv"`,
    },
  });
}
