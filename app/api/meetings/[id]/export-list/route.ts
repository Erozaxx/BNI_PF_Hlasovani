import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { getMembers } from "@/lib/db/queries/members";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meetingGuest, guest, category } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { asc } from "drizzle-orm";

function getDb() {
  return drizzle(getSql());
}

/**
 * Format a date string (YYYY-MM-DD) to Czech format DD.M.YYYY (no leading zeros).
 */
function formatDateCzech(dateStr: string): string {
  // dateStr is "YYYY-MM-DD"
  const [year, month, day] = dateStr.split("-");
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  return `${d}.${m}.${year}`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: require managementRole admin or moderator
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  if (!isManagement) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Load meeting
  const meetingData = await getMeetingById(id);
  if (!meetingData) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // Load all members sorted by name
  const members = await getMembers();

  // Load guests for this meeting with category join, sorted by guest name
  const meetingGuests = await getDb()
    .select({
      name: guest.name,
      company: guest.company,
      description: guest.description,
      categoryName: category.name,
    })
    .from(meetingGuest)
    .innerJoin(guest, eq(meetingGuest.guestId, guest.id))
    .leftJoin(category, eq(guest.categoryId, category.id))
    .where(eq(meetingGuest.meetingId, id))
    .orderBy(asc(guest.name));

  // Format date for title row: DD.M.YYYY
  const formattedDate = formatDateCzech(meetingData.date);

  // Build worksheet rows (aoa = array of arrays)
  const rows: (string | number)[][] = [
    // Row 1: title
    ["", `BNI Fountains, seznam hostů a členů ${formattedDate}`, "", ""],
    // Row 2: empty
    [""],
    // Row 3: column headers
    ["", "Jméno a příjmení", "Firma:", "Obor", "Poznámka/Náhradník"],
    // Row 4: Members section header
    ["", "Členové:"],
  ];

  // Member rows
  for (const m of members) {
    rows.push(["", m.name, m.company ?? "", m.obor ?? "", ""]);
  }

  // Guests section header
  rows.push(["", "Hosté:"]);

  // Guest rows
  for (const g of meetingGuests) {
    const obor = g.categoryName ?? g.description ?? "";
    rows.push(["", g.name, g.company ?? "", obor, ""]);
  }

  // Build xlsx workbook
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Seznam hostu");

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  // Filename uses YYYY-MM-DD from meeting.date
  const filename = `seznam-hostu-${meetingData.date}.xlsx`;

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
