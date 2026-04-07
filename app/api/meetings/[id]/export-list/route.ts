import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
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

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Style indices from Vystup_schuzka_template.xlsx (xl/styles.xml)
const S = {
  colA: 9,
  // Member rows: first / middle
  memFirst_B: 13, memFirst_C: 14, memFirst_D: 15, memFirst_E: 16,
  memMid_B: 17,   memMid_C: 18,   memMid_D: 19,   memMid_E: 16,
  // "Hosté:" separator
  sepHoste_B: 30, sepHoste_C: 31, sepHoste_D: 31, sepHoste_E: 16,
  // Guest rows: first / middle / last
  gstFirst_B: 32, gstFirst_C: 33, gstFirst_D: 34, gstFirst_E: 35,
  gstMid_B: 23,   gstMid_C: 25,   gstMid_D: 26,   gstMid_E: 16,
  gstLast_B: 42,  gstLast_C: 43,  gstLast_D: 44,  gstLast_E: 38,
} as const;

function inlineCell(col: string, row: number, styleIdx: number, value: string): string {
  if (value === "") {
    return `<c r="${col}${row}" s="${styleIdx}"/>`;
  }
  return `<c r="${col}${row}" s="${styleIdx}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function buildRow(
  rowNum: number,
  bVal: string, bS: number,
  cVal: string, cS: number,
  dVal: string, dS: number,
  eS: number
): string {
  const a = `<c r="A${rowNum}" s="${S.colA}"/>`;
  const b = inlineCell("B", rowNum, bS, bVal);
  const c = inlineCell("C", rowNum, cS, cVal);
  const d = inlineCell("D", rowNum, dS, dVal);
  const e = `<c r="E${rowNum}" s="${eS}"/>`;
  return `<row r="${rowNum}">${a}${b}${c}${d}${e}</row>`;
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
  let templateBuffer: Buffer;
  try {
    templateBuffer = fs.readFileSync(templatePath);
  } catch {
    return NextResponse.json({ error: "Template not found" }, { status: 500 });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(templateBuffer);
  } catch {
    return NextResponse.json({ error: "Failed to load template" }, { status: 500 });
  }

  // Read sheet1.xml
  const sheet1File = zip.file("xl/worksheets/sheet1.xml");
  if (!sheet1File) {
    return NextResponse.json({ error: "Template sheet not found" }, { status: 500 });
  }
  const originalXml = await sheet1File.async("text");

  // Split XML into 3 parts:
  // beforeData = everything up to (not including) <row r="5" or first <row with r >= 5
  // afterData  = from </sheetData> to end
  const rowSplitMatch = originalXml.match(/<row\s+r="([0-9]+)"/);
  let splitIdx = -1;
  if (rowSplitMatch) {
    // Find the index of the first row with r >= 5
    const rowRegex = /<row\s+r="([0-9]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = rowRegex.exec(originalXml)) !== null) {
      const rNum = parseInt(m[1], 10);
      if (rNum >= 5) {
        splitIdx = m.index;
        break;
      }
    }
  }

  const sheetDataEndIdx = originalXml.indexOf("</sheetData>");
  if (sheetDataEndIdx === -1) {
    return NextResponse.json({ error: "Invalid template XML" }, { status: 500 });
  }

  let beforeData: string;
  if (splitIdx !== -1) {
    beforeData = originalXml.slice(0, splitIdx);
  } else {
    // No rows with r >= 5, split just before </sheetData>
    beforeData = originalXml.slice(0, sheetDataEndIdx);
  }
  const afterData = originalXml.slice(sheetDataEndIdx);

  // Update C1 with meeting date (replace value in title cell)
  const titleValue = escapeXml(`BNI Fountains, seznam hostů a členů ${formattedDate}`);
  beforeData = beforeData.replace(
    /(<c\s+r="C1"[^>]*>(?:<v>[^<]*<\/v>|<is><t>[^<]*<\/t><\/is>)?<\/c>|<c\s+r="C1"[^>]*\/>)/,
    (match) => {
      // Replace or inject inlineStr value
      if (match.includes('t="inlineStr"')) {
        return match.replace(/<is><t>[^<]*<\/t><\/is>/, `<is><t>${titleValue}</t></is>`);
      } else if (match.includes('<v>')) {
        return match.replace(/<v>[^<]*<\/v>/, `<is><t>${titleValue}</t></is>`).replace(/t="[^"]*"/, 't="inlineStr"');
      }
      // Fallback: rebuild cell preserving style attribute
      const sAttr = match.match(/s="([0-9]+)"/);
      const sVal = sAttr ? ` s="${sAttr[1]}"` : "";
      return `<c r="C1"${sVal} t="inlineStr"><is><t>${titleValue}</t></is></c>`;
    }
  );

  // Build dynamic rows starting at row 5
  const rows: string[] = [];
  let rowNum = 5;

  // Member rows
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const first = i === 0;
    rows.push(buildRow(
      rowNum,
      m.name,         first ? S.memFirst_B : S.memMid_B,
      m.company ?? "", first ? S.memFirst_C : S.memMid_C,
      m.obor ?? "",   first ? S.memFirst_D : S.memMid_D,
      first ? S.memFirst_E : S.memMid_E,
    ));
    rowNum++;
  }

  // "Hosté:" separator row
  rows.push(
    `<row r="${rowNum}">` +
    `<c r="A${rowNum}" s="${S.colA}"/>` +
    `<c r="B${rowNum}" s="${S.sepHoste_B}" t="inlineStr"><is><t>Hosté:</t></is></c>` +
    `<c r="C${rowNum}" s="${S.sepHoste_C}"/>` +
    `<c r="D${rowNum}" s="${S.sepHoste_D}"/>` +
    `<c r="E${rowNum}" s="${S.sepHoste_E}"/>` +
    `</row>`
  );
  rowNum++;

  // Guest rows
  const guestCount = meetingGuests.length;
  if (guestCount === 0) {
    // Empty placeholder row with closing border
    rows.push(buildRow(rowNum, "", S.gstLast_B, "", S.gstLast_C, "", S.gstLast_D, S.gstLast_E));
    rowNum++;
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

      rows.push(buildRow(rowNum, g.name, bS, g.company ?? "", cS, obor, dS, eS));
      rowNum++;
    }
  }

  const lastRow = rowNum - 1;
  const newRows = rows.join("");

  // Update <dimension> ref
  let updatedBefore = beforeData.replace(
    /<dimension\s+ref="[^"]*"\s*\/>/,
    `<dimension ref="A1:E${lastRow}"/>`
  );

  // Update <cols> with dynamic widths
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
  const maxB = Math.max(12, maxLen(allNames) * 1.44);
  const maxC = Math.max(12, maxLen(allCompanies) * 1.44);
  const maxD = Math.max(10, maxLen(allObors) * 1.2);
  const maxE = 42;

  const newCols =
    `<cols>` +
    `<col min="1" max="1" width="2" customWidth="1"/>` +
    `<col min="2" max="2" width="${maxB.toFixed(2)}" bestFit="1" customWidth="1"/>` +
    `<col min="3" max="3" width="${maxC.toFixed(2)}" bestFit="1" customWidth="1"/>` +
    `<col min="4" max="4" width="${maxD.toFixed(2)}" bestFit="1" customWidth="1"/>` +
    `<col min="5" max="5" width="${maxE}" bestFit="1" customWidth="1"/>` +
    `</cols>`;

  updatedBefore = updatedBefore.replace(/<cols>[\s\S]*?<\/cols>/, newCols);

  const newXml = updatedBefore + newRows + afterData;

  zip.file("xl/worksheets/sheet1.xml", newXml);

  const outBuf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });

  const filename = `seznam-hostu-${meetingData.date}.xlsx`;

  return new NextResponse(new Uint8Array(outBuf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
