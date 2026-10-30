import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import path from "path";
import fs from "fs";
import { requirePermissionForRoute } from "@/lib/auth/guards";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { getActiveMembers } from "@/lib/db/queries/members";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meetingGuest, guest, category } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { listSheetRows } from "@/lib/db/queries/attendance";
import {
  STYLE_COL_A,
  addGreyStyles,
  buildRowXml,
  columnBWidth,
  escapeXml,
  memberMark,
  memberRowXml,
  needsTallRow,
} from "@/lib/attendance/export-marks";

/** Třída chyby do logu, bez zprávy a bez osobních údajů. */
function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function getDb() {
  return drizzle(getSql());
}

function formatDateCzech(dateStr: string): string {
  const [year, month, day] = dateStr.split("-");
  return `${parseInt(day, 10)}.${parseInt(month, 10)}.${year}`;
}

// Style indices from Vystup_schuzka_template.xlsx (xl/styles.xml)
const S = {
  colA: STYLE_COL_A,
  // Řádky členů (běžné i šedé) jsou v lib/attendance/export-marks.ts
  // "Hosté:" separator
  sepHoste_B: 30, sepHoste_C: 31, sepHoste_D: 31, sepHoste_E: 16,
  // Guest rows: first / middle / last
  gstFirst_B: 32, gstFirst_C: 33, gstFirst_D: 34, gstFirst_E: 35,
  gstMid_B: 23,   gstMid_C: 25,   gstMid_D: 26,   gstMid_E: 16,
  gstLast_B: 42,  gstLast_C: 43,  gstLast_D: 44,  gstLast_E: 38,
} as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authz = await requirePermissionForRoute("meetings.manage");
  if ("response" in authz) return authz.response;

  const { id } = await params;

  const meetingData = await getMeetingById(id);
  if (!meetingData) {
    return NextResponse.json({ error: "Schůzka nebyla nalezena." }, { status: 404 });
  }

  // iter-037 (T-003b, arch 5.3): výstup schůzky jen s aktivními členy.
  const members = await getActiveMembers();

  // iter-043 (arch 2): stav docházky na datum schůzky, jedno místo pravdy je listSheetRows.
  let sheetRows: Awaited<ReturnType<typeof listSheetRows>>;
  try {
    sheetRows = await listSheetRows(meetingData.date);
  } catch (err) {
    console.error(`[export-list] attendance: ${errClass(err)}`);
    return NextResponse.json({ error: "Docházku pro export se nepodařilo načíst." }, { status: 500 });
  }
  const rowByMember = new Map(sheetRows.map((r) => [r.memberId, r]));

  const meetingGuests = await getDb()
    .select({
      name: guest.name,
      company: guest.company,
      description: guest.description,
      categoryName: category.name,
      displayOrder: meetingGuest.displayOrder,
      addedAt: meetingGuest.addedAt,
    })
    .from(meetingGuest)
    .innerJoin(guest, eq(meetingGuest.guestId, guest.id))
    .leftJoin(category, eq(guest.categoryId, category.id))
    .where(eq(meetingGuest.meetingId, id))
    .orderBy(asc(meetingGuest.displayOrder), asc(meetingGuest.addedAt));

  const formattedDate = formatDateCzech(meetingData.date);

  // Load template
  const templatePath = path.join(process.cwd(), "lib/templates/Vystup_schuzka_template.xlsx");
  let templateBuffer: Buffer;
  try {
    templateBuffer = fs.readFileSync(templatePath);
  } catch (err) {
    console.error(`[export-list] template-missing: ${errClass(err)}`);
    return NextResponse.json({ error: "Šablona exportu nebyla nalezena." }, { status: 500 });
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(templateBuffer);
  } catch (err) {
    console.error(`[export-list] template-load: ${errClass(err)}`);
    return NextResponse.json({ error: "Šablonu exportu se nepodařilo načíst." }, { status: 500 });
  }

  // Scale font sizes in styles.xml by ~12%
  const stylesFile = zip.file("xl/styles.xml");
  if (!stylesFile) {
    return NextResponse.json({ error: "V šabloně exportu chybí styly." }, { status: 500 });
  }
  let stylesXml = await stylesFile.async("text");
  try {
    stylesXml = addGreyStyles(stylesXml);
  } catch (err) {
    console.error(`[export-list] template-corrupt: ${errClass(err)}`);
    return NextResponse.json({ error: "Šablona exportu je poškozená." }, { status: 500 });
  }
  const scaledStyles = stylesXml.replace(/<sz val="([0-9]+(?:\.[0-9]+)?)"\s*\/>/g, (_m, v) => {
    const scaled = Math.round(parseFloat(v) * 1.12);
    return `<sz val="${scaled}"/>`;
  });
  zip.file("xl/styles.xml", scaledStyles);

  // Read sheet1.xml
  const sheet1File = zip.file("xl/worksheets/sheet1.xml");
  if (!sheet1File) {
    return NextResponse.json({ error: "V šabloně exportu chybí list." }, { status: 500 });
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
    return NextResponse.json({ error: "Šablona exportu je poškozená." }, { status: 500 });
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

  // Označení členů (iter-043) a šířka sloupce B se stropem (gate K4)
  const marks = members.map((m) => memberMark(rowByMember.get(m.id), m.name));
  const widthB = columnBWidth([
    ...marks.map((k) => k.nameCell),
    ...meetingGuests.map((g) => g.name),
    "Jméno a příjmení",
  ]);

  // Member rows
  for (let i = 0; i < members.length; i++) {
    rows.push(memberRowXml(rowNum, members[i], marks[i], i === 0, widthB));
    rowNum++;
  }

  // "Hosté:" separator row
  rows.push(
    `<row r="${rowNum}" ht="19.5" customHeight="1">` +
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
    rows.push(buildRowXml(rowNum, { b: "", c: "", d: "", e: "" }, { b: S.gstLast_B, c: S.gstLast_C, d: S.gstLast_D, e: S.gstLast_E }, false));
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

      rows.push(buildRowXml(rowNum, { b: g.name, c: g.company ?? "", d: obor, e: "" }, { b: bS, c: cS, d: dS, e: eS }, needsTallRow(g.name, widthB)));
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
  const maxB = widthB;
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
