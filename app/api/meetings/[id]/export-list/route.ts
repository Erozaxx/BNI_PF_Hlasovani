import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { getMembers } from "@/lib/db/queries/members";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meetingGuest, guest, category } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

function getDb() {
  return drizzle(getSql());
}

function formatDateCzech(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${parseInt(day, 10)}.${parseInt(month, 10)}.${year}`;
}

// Style indices from Vystup_schuzka_template.xlsx (xl/styles.xml)
const S = {
  colA: 9,
  // Row 4 "Členové:" separator
  sepClen_B: 10, sepClen_C: 10, sepClen_D: 11, sepClen_E: 12,
  // Member rows: first / middle
  memFirst_B: 13, memFirst_C: 14, memFirst_D: 15, memFirst_E: 16,
  memMid_B: 17,  memMid_C: 18,  memMid_D: 19,  memMid_E: 16,
  // Row "Hosté:" separator
  sepHoste_B: 30, sepHoste_C: 31, sepHoste_D: 31, sepHoste_E: 16,
  // Guest rows: first / middle / last
  gstFirst_B: 32, gstFirst_C: 33, gstFirst_D: 34, gstFirst_E: 35,
  gstMid_B: 23,  gstMid_C: 25,  gstMid_D: 26,  gstMid_E: 16,
  gstLast_B: 42, gstLast_C: 43, gstLast_D: 44, gstLast_E: 38,
};

function cell(value: string, styleIdx: number): XLSX.CellObject {
  return { v: value, t: "s", s: styleIdx };
}

function emptyCell(styleIdx: number): XLSX.CellObject {
  return { v: "", t: "s", s: styleIdx };
}

function setRow(
  ws: XLSX.WorkSheet,
  rowIdx: number,
  bVal: string, bS: number,
  cVal: string, cS: number,
  dVal: string, dS: number,
  eS: number
) {
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = emptyCell(S.colA);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = cell(bVal, bS);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = cell(cVal, cS);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = cell(dVal, dS);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = emptyCell(eS);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  if (!isManagement) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const meetingData = await getMeetingById(id);
  if (!meetingData) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const members = await getMembers();

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

  const formattedDate = formatDateCzech(meetingData.date);

  // Load template
  const templatePath = path.join(process.cwd(), "lib/templates/Vystup_schuzka_template.xlsx");
  const templateBuffer = fs.readFileSync(templatePath);
  const wb = XLSX.read(templateBuffer, { type: "buffer", cellStyles: true });

  // Sheet name has trailing space in template
  const sheetName = wb.SheetNames.find((n) => n.trim() === "Seznam hostů") ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Update C1 title with meeting date (keep style, update value)
  if (ws["C1"]) {
    ws["C1"].v = `BNI Fountains, seznam hostů a členů ${formattedDate}`;
    ws["C1"].t = "s";
    delete (ws["C1"] as Record<string, unknown>).w; // clear cached formatted value
    delete (ws["C1"] as Record<string, unknown>).r; // clear rich text
  }

  // Clear all cells from row 5 onwards (0-indexed row 4+)
  const existingRange = XLSX.utils.decode_range(ws["!ref"] ?? "A1:E35");
  for (let r = 4; r <= existingRange.e.r; r++) {
    for (let c = 0; c <= 4; c++) {
      delete ws[XLSX.utils.encode_cell({ r, c })];
    }
  }
  // Truncate row metadata to first 4 rows
  if (ws["!rows"]) {
    ws["!rows"] = (ws["!rows"] as XLSX.RowInfo[]).slice(0, 4);
  }

  let rowIdx = 4; // 0-indexed → sheet row 5

  // Member rows
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const first = i === 0;
    setRow(
      ws, rowIdx,
      m.name,        first ? S.memFirst_B : S.memMid_B,
      m.company ?? "", first ? S.memFirst_C : S.memMid_C,
      m.obor ?? "",  first ? S.memFirst_D : S.memMid_D,
      first ? S.memFirst_E : S.memMid_E,
    );
    rowIdx++;
  }

  // "Hosté:" separator row
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = emptyCell(S.colA);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = cell("Hosté:", S.sepHoste_B);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = emptyCell(S.sepHoste_C);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = emptyCell(S.sepHoste_D);
  ws[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = emptyCell(S.sepHoste_E);
  rowIdx++;

  // Guest rows
  const guestCount = meetingGuests.length;
  if (guestCount === 0) {
    // Empty placeholder row with closing border
    ws[XLSX.utils.encode_cell({ r: rowIdx, c: 0 })] = emptyCell(S.colA);
    ws[XLSX.utils.encode_cell({ r: rowIdx, c: 1 })] = emptyCell(S.gstLast_B);
    ws[XLSX.utils.encode_cell({ r: rowIdx, c: 2 })] = emptyCell(S.gstLast_C);
    ws[XLSX.utils.encode_cell({ r: rowIdx, c: 3 })] = emptyCell(S.gstLast_D);
    ws[XLSX.utils.encode_cell({ r: rowIdx, c: 4 })] = emptyCell(S.gstLast_E);
    rowIdx++;
  } else {
    for (let i = 0; i < guestCount; i++) {
      const g = meetingGuests[i];
      const isFirst = i === 0;
      const isLast = i === guestCount - 1;
      const obor = g.categoryName ?? g.description ?? "";

      let bS: number, cS: number, dS: number, eS: number;
      if (isLast) {
        bS = S.gstLast_B; cS = S.gstLast_C; dS = S.gstLast_D; eS = S.gstLast_E;
      } else if (isFirst) {
        bS = S.gstFirst_B; cS = S.gstFirst_C; dS = S.gstFirst_D; eS = S.gstFirst_E;
      } else {
        bS = S.gstMid_B; cS = S.gstMid_C; dS = S.gstMid_D; eS = S.gstMid_E;
      }

      setRow(ws, rowIdx, g.name, bS, g.company ?? "", cS, obor, dS, eS);
      rowIdx++;
    }
  }

  // Update sheet range
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rowIdx - 1, c: 4 } });

  // Dynamic column widths based on content
  const allNames = [
    ...members.map((m) => m.name),
    ...meetingGuests.map((g) => g.name),
    "Jméno a příjmení",
  ];
  const allCompanies = [
    ...members.map((m) => m.company ?? ""),
    ...meetingGuests.map((g) => g.company ?? ""),
    "Firma:",
  ];
  const allObors = [
    ...members.map((m) => m.obor ?? ""),
    ...meetingGuests.map((g) => g.categoryName ?? g.description ?? ""),
    "Obor",
  ];
  const maxLen = (arr: string[]) => Math.max(...arr.map((s) => s.length), 1);

  ws["!cols"] = [
    { wch: 2 },                              // A: narrow left margin column
    { wch: Math.ceil(maxLen(allNames) * 1.1) },   // B: names
    { wch: Math.ceil(maxLen(allCompanies) * 1.1) }, // C: companies
    { wch: Math.ceil(maxLen(allObors) * 1.1) },   // D: obor/category
    { wch: 20 },                             // E: poznámka (fixed)
  ];

  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
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
