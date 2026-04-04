import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { drizzle } from "drizzle-orm/neon-http";
import { inArray } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { guest, meetingGuest } from "@/lib/db/schema";
import { getMeetingById } from "@/lib/db/queries/meetings";

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 500;
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];

function getDb() {
  return drizzle(getSql());
}

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function trimOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim().slice(0, 255);
  return s.length > 0 ? s : null;
}

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

  // 2. Load meeting — validate exists
  const meetingData = await getMeetingById(meetingId);
  if (!meetingData) {
    return err(404, "Meeting not found");
  }

  // 3. Status guard (UX-001)
  if (meetingData.status !== "draft") {
    return err(409, "Meeting is not in draft status");
  }

  // 4. Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return err(400, "Invalid form data");
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return err(400, "No file uploaded");
  }

  // 5. File size check
  if (file.size > MAX_FILE_SIZE) {
    return err(413, "File too large (max 5MB)");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // 6. MIME magic bytes validation (SEC-001)
  if (
    buffer.length < 4 ||
    !ZIP_SIGNATURE.every((b, i) => buffer[i] === b)
  ) {
    return err(400, "Invalid file signature");
  }

  // 7. Parse workbook
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: "buffer" });
  } catch {
    return err(400, "Invalid file format");
  }

  // 8. Find sheet — prefer "All_Registrations", fallback to first
  const sheetName =
    wb.SheetNames.includes("All_Registrations")
      ? "All_Registrations"
      : wb.SheetNames[0];

  if (!sheetName) {
    return err(400, "No sheets found in workbook");
  }

  const ws = wb.Sheets[sheetName];

  // 9. Parse rows as arrays (header: 1 keeps raw arrays, row 0 = headers)
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

  if (rawRows.length < 2) {
    // No data rows (only header or empty)
    return NextResponse.json(
      { created: 0, existing: 0, linkedToMeeting: 0, skipped: 0 },
      { status: 200 }
    );
  }

  const headerRow = (rawRows[0] as unknown[]).map((h) =>
    String(h ?? "").trim()
  );

  // Map header names to column indices
  const colIdx = {
    name: headerRow.indexOf("Full Name"),
    email: headerRow.indexOf("Email"),
    phone: headerRow.indexOf("Phone Number"),
    company: headerRow.indexOf("Company Name"),
    // "Poznamka" takes priority over "Company profile"
    description:
      headerRow.indexOf("Poznamka") !== -1
        ? headerRow.indexOf("Poznamka")
        : headerRow.indexOf("Company profile"),
  };

  if (colIdx.name === -1) {
    return err(400, "Required column 'Full Name' not found in sheet");
  }

  // 10. Collect data rows (max 500)
  const dataRows = rawRows.slice(1, MAX_ROWS + 1);
  const truncated = rawRows.length - 1 > MAX_ROWS;
  if (truncated) {
    console.warn(
      `[import-guests] File has ${rawRows.length - 1} data rows; truncated to ${MAX_ROWS}`
    );
  }

  // Parse all rows first to collect emails for batch lookup
  interface ParsedRow {
    name: string;
    email: string | null;
    phone: string | null;
    company: string | null;
    description: string | null;
  }

  const parsedRows: ParsedRow[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const arr = row as unknown[];
    const name = trimOrNull(arr[colIdx.name]);
    // Rows without Full Name are skipped — they cannot be stored as a guest
    if (!name) {
      skipped++;
      continue;
    }
    parsedRows.push({
      name,
      email:
        colIdx.email !== -1
          ? trimOrNull(String(arr[colIdx.email] ?? "").toLowerCase())
          : null,
      phone: colIdx.phone !== -1 ? trimOrNull(arr[colIdx.phone]) : null,
      company: colIdx.company !== -1 ? trimOrNull(arr[colIdx.company]) : null,
      description:
        colIdx.description !== -1 ? trimOrNull(arr[colIdx.description]) : null,
    });
  }

  // 11. Batch email lookup (PERF-001)
  const emails = parsedRows
    .map((r) => r.email)
    .filter((e): e is string => Boolean(e));

  const emailMap = new Map<string, string>(); // email → guest.id

  if (emails.length > 0) {
    const existingGuests = await getDb()
      .select({ id: guest.id, email: guest.email })
      .from(guest)
      .where(inArray(guest.email, emails));

    for (const g of existingGuests) {
      if (g.email) emailMap.set(g.email, g.id);
    }
  }

  // 12. Process each row: insert or reuse guest, then link to meeting
  const db = getDb();
  let created = 0;
  let existing = 0;
  const linkedGuestIds: string[] = [];

  for (const row of parsedRows) {
    let guestId: string;

    if (row.email && emailMap.has(row.email)) {
      // Existing guest — reuse
      guestId = emailMap.get(row.email)!;
      existing++;
    } else {
      // Insert new guest.
      // NOTE: Guests without email (email = NULL) are ALWAYS inserted as new records.
      // NULL != NULL in SQL, so email-based deduplication cannot match them.
      // Each import run may create duplicate guests if the same person appears without email.
      const inserted = await db
        .insert(guest)
        .values({
          name: row.name,
          email: row.email,
          phone: row.phone,
          company: row.company,
          description: row.description,
        })
        .returning({ id: guest.id });

      guestId = inserted[0].id;

      // Add to map so later duplicate rows (same email) reuse this guest
      if (row.email) {
        emailMap.set(row.email, guestId);
      }
      created++;
    }

    linkedGuestIds.push(guestId);
  }

  // 13. Batch link guests to meeting — ON CONFLICT DO NOTHING
  let linkedToMeeting = 0;
  if (linkedGuestIds.length > 0) {
    // Deduplicate guest IDs (same guest may appear twice in the file without email)
    const uniqueGuestIds = [...new Set(linkedGuestIds)];
    const values = uniqueGuestIds.map((guestId) => ({ meetingId, guestId }));

    const linked = await db
      .insert(meetingGuest)
      .values(values)
      .onConflictDoNothing()
      .returning({ guestId: meetingGuest.guestId });

    linkedToMeeting = linked.length;
  }

  // SEC-004: Audit log
  console.info(
    `[import-guests] meeting=${meetingId} created=${created} existing=${existing} linked=${linkedToMeeting} skipped=${skipped} truncated=${truncated}`
  );

  return NextResponse.json(
    { created, existing, linkedToMeeting, skipped },
    { status: 200 }
  );
}
