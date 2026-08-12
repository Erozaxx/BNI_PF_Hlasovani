import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { drizzle } from "drizzle-orm/neon-http";
import { inArray, eq, max, asc } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getSql } from "@/lib/db/client";
import { category, guest, meetingGuest } from "@/lib/db/schema";
import { getMeetingById } from "@/lib/db/queries/meetings";
import {
  buildDedupKey,
  emptyGuestImportResult,
  planGuestDedup,
  type DedupDecision,
  type ExistingGuest,
  type GuestImportCreatedRow,
  type GuestImportMergedRow,
  type GuestImportResult,
  type GuestImportSkippedRow,
  type ImportGuestRow,
} from "@/lib/import/dedup-guests";

// Dávkový import až 500 řádků (viz krok 14 níže) — skutečný časový limit
// funkce nejde z repa zjistit (vercel.json nemá `functions` sekci a
// `maxDuration` není v žádné jiné route v projektu). Žádné chování v téhle
// route na té hodnotě nezávisí, je to jen pojistka: při potížích s
// deployem se tenhle řádek dá beze škody smazat.
export const maxDuration = 60;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 500;
const GUEST_INSERT_CHUNK_SIZE = 200;
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

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isCreateDecision(
  d: DedupDecision
): d is Extract<DedupDecision, { kind: "create" }> {
  return d.kind === "create";
}

function isLinkableDecision(
  d: DedupDecision
): d is Exclude<DedupDecision, { kind: "skipped-no-name" }> {
  return d.kind !== "skipped-no-name";
}

function isMergedDecision(
  d: DedupDecision
): d is Extract<DedupDecision, { kind: "reuse-existing" | "duplicate-in-file" }> {
  return d.kind === "reuse-existing" || d.kind === "duplicate-in-file";
}

function isSkippedDecision(
  d: DedupDecision
): d is Extract<DedupDecision, { kind: "skipped-no-name" }> {
  return d.kind === "skipped-no-name";
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
    // No data rows (only header or empty) — a status-200 return must still
    // carry a full-shape GuestImportResult, so the client never has to guard
    // against undefined fields (architecture 4.4).
    return NextResponse.json(emptyGuestImportResult(), { status: 200 });
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
    // "Company profile" → category (find-or-create)
    categoryProfile: headerRow.indexOf("Company profile"),
    // "Poznamka" → description (optional)
    description: headerRow.indexOf("Poznamka"),
  };

  if (colIdx.name === -1) {
    return err(400, "Required column 'Full Name' not found in sheet");
  }

  // 10. Parse every row after the header into an ImportGuestRow. rowNumber
  // is the index in rawRows (header = 1), assigned BEFORE any filtering, so
  // it keeps matching what the moderator sees in Excel (gate P1). Rows
  // without a name are NOT filtered here — they flow through with
  // name: "" and are resolved by planGuestDedup ("skipped-no-name").
  const allParsedRows: ImportGuestRow[] = rawRows.slice(1).map((row, i) => {
    const arr = row as unknown[];
    return {
      rowNumber: i + 2, // rawRows[0] is the header (rowNumber 1)
      name: trimOrNull(arr[colIdx.name]) ?? "",
      email:
        colIdx.email !== -1
          ? trimOrNull(String(arr[colIdx.email] ?? "").toLowerCase())
          : null,
      phone: colIdx.phone !== -1 ? trimOrNull(arr[colIdx.phone]) : null,
      company: colIdx.company !== -1 ? trimOrNull(arr[colIdx.company]) : null,
      description:
        colIdx.description !== -1 ? trimOrNull(arr[colIdx.description]) : null,
      categoryName:
        colIdx.categoryProfile !== -1
          ? trimOrNull(arr[colIdx.categoryProfile])
          : null,
    };
  });

  // 10b. Gate P1 — a row where every mapped column is empty is not a
  // skipped row, it is a non-existent row: xlsx "header: 1" parsing emits
  // blank rows that are inside the sheet's used range (e.g. left over from
  // manual edits). Drop those completely, BEFORE the MAX_ROWS cut, so
  // `totalRows` and `truncated` are computed over real data only. A row
  // still counts as real (and later "skipped-no-name") if the name is
  // missing but anything else is filled in.
  const realRows = allParsedRows.filter(
    (r) =>
      r.name !== "" ||
      r.email !== null ||
      r.phone !== null ||
      r.company !== null ||
      r.description !== null ||
      r.categoryName !== null
  );

  // 11. Cap at MAX_ROWS, applied on real rows only (P1).
  const dataRows = realRows.slice(0, MAX_ROWS);
  const truncated = realRows.length > MAX_ROWS;
  if (truncated) {
    console.warn(
      `[import-guests] File has ${realRows.length} real data rows; truncated to ${MAX_ROWS}`
    );
  }

  // 12. Load ALL guest candidates, no WHERE (architecture 7.1) — the old
  // `where(inArray(guest.email, emails))` can't dedup by name and compares
  // un-normalized values. 89 rows today (~11 kB), one round trip; revisit
  // with a filter if the `guest` table grows past ~10 000 rows.
  // ORDER BY is part of the contract, not cosmetics: it is what makes
  // "first wins" on a duplicate key deterministic across repeated imports.
  const existingGuests: ExistingGuest[] = await getDb()
    .select({ id: guest.id, name: guest.name, email: guest.email })
    .from(guest)
    .orderBy(asc(guest.createdAt), asc(guest.id));

  // 12b. Find-or-create categories for all unique "Company profile" values
  // (logic unchanged from before this iteration).
  const categoryNames = [
    ...new Set(dataRows.map((r) => r.categoryName).filter(Boolean) as string[]),
  ];
  const categoryMap = new Map<string, string>(); // name → category.id

  if (categoryNames.length > 0) {
    const db2 = getDb();
    // Fetch existing categories matching these names
    const existingCategories = await db2
      .select({ id: category.id, name: category.name })
      .from(category)
      .where(inArray(category.name, categoryNames));

    for (const c of existingCategories) categoryMap.set(c.name, c.id);

    // Create missing categories one by one (name has unique constraint)
    for (const name of categoryNames) {
      if (!categoryMap.has(name)) {
        const inserted = await db2
          .insert(category)
          .values({ name })
          .onConflictDoNothing()
          .returning({ id: category.id, name: category.name });
        if (inserted.length > 0) {
          categoryMap.set(inserted[0].name, inserted[0].id);
        } else {
          // Race condition: another request inserted it — fetch it
          const fetched = await db2
            .select({ id: category.id })
            .from(category)
            .where(eq(category.name, name))
            .limit(1);
          if (fetched.length > 0) categoryMap.set(name, fetched[0].id);
        }
      }
    }
  }

  // 13. Decide what happens to each row — pure function, no DB
  // (lib/import/dedup-guests.ts). The "first wins" guard on duplicate DB
  // keys lives inside planGuestDedup, not here.
  const plan = planGuestDedup(dataRows, existingGuests);
  const createDecisions = plan.decisions.filter(isCreateDecision);

  // 14. Batch INSERT new guests, sequentially, NO db.transaction() (LL-003).
  // Guard on empty array is required, not defensive decoration (7.5, gate
  // P6): every row reusing an existing card — the idempotent second import
  // of the same file — leaves createDecisions empty, and calling
  // `.insert(guest).values([])` is untested territory without a dev DB.
  const db = getDb();
  const dedupKeyToGuestId = new Map<string, string>();

  for (const decision of plan.decisions) {
    if (decision.kind === "reuse-existing") {
      dedupKeyToGuestId.set(decision.dedupKey, decision.guestId);
    }
  }

  if (createDecisions.length > 0) {
    for (const chunk of chunksOf(createDecisions, GUEST_INSERT_CHUNK_SIZE)) {
      const inserted = await db
        .insert(guest)
        .values(
          chunk.map((d) => ({
            name: d.row.name,
            email: d.row.email,
            phone: d.row.phone,
            company: d.row.company,
            description: d.row.description,
            categoryId: d.row.categoryName
              ? (categoryMap.get(d.row.categoryName) ?? null)
              : null,
          }))
        )
        .returning({ id: guest.id, name: guest.name, email: guest.email });

      // Map RETURNING rows back to decisions via buildDedupKey, NOT row
      // order (gate P6) — Postgres does not guarantee RETURNING preserves
      // the VALUES order.
      for (const returned of inserted) {
        const key = buildDedupKey(returned.name, returned.email);
        dedupKeyToGuestId.set(key, returned.id);
      }
    }
  }

  // 15. Batch link guests to meeting — ON CONFLICT DO NOTHING, order
  // preserved from the file (architecture 7.2): guestIds are collected in
  // file order first, THEN de-duplicated, so [...new Set(...)] keeps the
  // first occurrence's position.
  const guestIdsInFileOrder = plan.decisions
    .filter(isLinkableDecision)
    .map((d) => {
      if (d.kind === "reuse-existing") return d.guestId;
      // create + duplicate-in-file both resolve through the dedupKey map
      // populated above (create rows always populate their own key first).
      return dedupKeyToGuestId.get(d.dedupKey)!;
    });
  const uniqueGuestIds = [...new Set(guestIdsInFileOrder)];

  let linkedToMeeting = 0;
  let alreadyLinked = 0;
  if (uniqueGuestIds.length > 0) {
    // Continue the per-meeting display order from the current max (max+1, …).
    // Guests already linked to this meeting are skipped by ON CONFLICT DO
    // NOTHING, so their reserved index leaves a small gap — intentional,
    // see architecture 7.2 (no re-numbering after partial merges).
    const maxRows = await db
      .select({ maxOrder: max(meetingGuest.displayOrder) })
      .from(meetingGuest)
      .where(eq(meetingGuest.meetingId, meetingId));
    let nextOrder = (maxRows[0]?.maxOrder ?? 0) + 1;

    const values = uniqueGuestIds.map((guestId) => ({
      meetingId,
      guestId,
      displayOrder: nextOrder++,
    }));

    const linked = await db
      .insert(meetingGuest)
      .values(values)
      .onConflictDoNothing()
      .returning({ guestId: meetingGuest.guestId });

    linkedToMeeting = linked.length;
    alreadyLinked = uniqueGuestIds.length - linkedToMeeting;
  }

  // 16. Build the jmenovitý report (gate P2, P3) straight from the plan —
  // it is the single source of truth for what happened to each row.
  const createdRowsReport: GuestImportCreatedRow[] = createDecisions.map(
    (d) => ({
      rowNumber: d.row.rowNumber,
      name: d.row.name,
      email: d.row.email,
    })
  );

  const merged: GuestImportMergedRow[] = plan.decisions
    .filter(isMergedDecision)
    .map((d): GuestImportMergedRow => {
      if (d.kind === "reuse-existing") {
        return {
          reason: "existing-guest",
          rowNumber: d.row.rowNumber,
          name: d.row.name,
          email: d.row.email,
          guestId: d.guestId,
          matchedName: d.matchedName,
          matchedEmail: d.matchedEmail,
        };
      }
      return {
        reason: "duplicate-row",
        rowNumber: d.row.rowNumber,
        name: d.row.name,
        email: d.row.email,
        firstRowNumber: d.firstRowNumber,
        firstName: d.firstName,
      };
    });

  const skippedRowsReport: GuestImportSkippedRow[] = plan.decisions
    .filter(isSkippedDecision)
    .map((d) => ({
      rowNumber: d.row.rowNumber,
      name: d.row.name === "" ? null : d.row.name,
      email: d.row.email,
      reason: "missing-name",
    }));

  // SEC-004: Audit log — counts only. Names and emails are personal data;
  // they belong in the response to the logged-in moderator, not in Vercel
  // logs (architecture 7.4).
  console.info(
    `[import-guests] meeting=${meetingId} created=${plan.counts.create} existing=${plan.counts.reuseExisting} duplicates=${plan.counts.duplicateInFile} linked=${linkedToMeeting} alreadyLinked=${alreadyLinked} skipped=${plan.counts.skippedNoName} truncated=${truncated}`
  );

  const result: GuestImportResult = {
    created: plan.counts.create,
    existing: plan.counts.reuseExisting,
    duplicates: plan.counts.duplicateInFile,
    skipped: plan.counts.skippedNoName,
    totalRows: dataRows.length,
    linkedToMeeting,
    alreadyLinked,
    truncated,
    createdRows: createdRowsReport,
    merged,
    skippedRows: skippedRowsReport,
  };

  return NextResponse.json(result, { status: 200 });
}
