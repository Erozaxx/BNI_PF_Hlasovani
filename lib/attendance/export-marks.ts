/**
 * iter-043 (T-003a, arch 3 až 5, gate K1 až K4): označení omluvených, chybějících
 * a náhradníků v exportu seznamu schůzky s hosty.
 *
 * Čistý modul: žádný import DB ani next/*, jde spustit přes tsx. Stav řádku se
 * odvozuje z `effectiveStatus` (lib/attendance/sheet.ts), export nemá vlastní
 * kopii pravidla přednosti.
 */

import { effectiveStatus, type SheetRow } from "@/lib/attendance/sheet";

/**
 * Text poznámky ve sloupci E. Tisk je pro hosty, proto je každý šedý řádek
 * (omluven, chybí, chybí bez omluvy) označen jednotně „Omluven(a)“ (Tom
 * 28. 10. 2026, mění gate K2 a K3). Rozlišení zůstává jen v `kind`.
 */
export const EXPORT_NOTES = {
  excused: "Omluven(a)",
} as const;

/** Gate K4: odstín šedé a strop šířky sloupce B. */
export const GREY_RGB = "FFD9D9D9";
export const MAX_COL_B_WIDTH = 50;
export const ROW_HEIGHT = 19.5;
export const ROW_HEIGHT_TALL = 39;

export type MarkKind = "present" | "excused" | "substitute" | "missing" | "unexcused";

export interface MemberMark {
  kind: MarkKind;
  /** Text ve sloupci B. */
  nameCell: string;
  /** Text ve sloupci E, prázdný řetězec = prázdná buňka. */
  note: string;
  /** Šedé podbarvení sloupců B až E. */
  grey: boolean;
}

export type MarkSource = Pick<SheetRow, "status" | "excused" | "announcedName" | "substituteName">;

/**
 * Označení řádku člena. Bez řádku docházky (`undefined`) beze změny proti
 * dosavadnímu exportu. Jméno náhradníka: zápis správce, jinak ohlášení.
 */
export function memberMark(row: MarkSource | undefined, memberName: string): MemberMark {
  if (!row) return { kind: "present", nameCell: memberName, note: "", grey: false };
  const status = effectiveStatus(row);
  if (status === "substitute") {
    const sub = (row.substituteName ?? row.announcedName ?? "").trim();
    if (sub === "") return { kind: "present", nameCell: memberName, note: "", grey: false };
    return { kind: "substitute", nameCell: `${sub} (za ${memberName})`, note: "", grey: false };
  }
  if (status === "unexcused") {
    return { kind: "unexcused", nameCell: memberName, note: EXPORT_NOTES.excused, grey: true };
  }
  if (status === "absent") {
    return row.excused
      ? { kind: "excused", nameCell: memberName, note: EXPORT_NOTES.excused, grey: true }
      : { kind: "missing", nameCell: memberName, note: EXPORT_NOTES.excused, grey: true };
  }
  return { kind: "present", nameCell: memberName, note: "", grey: false };
}

// ── XML ──────────────────────────────────────────────────────

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function inlineCell(col: string, row: number, styleIdx: number, value: string): string {
  if (value === "") {
    return `<c r="${col}${row}" s="${styleIdx}"/>`;
  }
  return `<c r="${col}${row}" s="${styleIdx}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

/** Index buňky sloupce A v šabloně (bez obsahu, jen rámeček). */
export const STYLE_COL_A = 9;

/** Styly řádků členů v šabloně: první řádek / ostatní. */
export const MEMBER_STYLES = {
  first: { b: 13, c: 14, d: 15, e: 16 },
  mid: { b: 17, c: 18, d: 19, e: 16 },
} as const;

/** Šedé klony stylů členů (7 nových `cellXfs`, indexy 46 až 52 v dnešní šabloně). */
export const GREY_SOURCE_XFS = [13, 14, 15, 16, 17, 18, 19] as const;
const GREY_BASE_INDEX = 46;
export const GREY_STYLES = {
  first: { b: 46, c: 47, d: 48, e: 49 },
  mid: { b: 50, c: 51, d: 52, e: 49 },
} as const;

/** Šířka sloupce B podle nejdelšího textu, se stropem (gate K4). */
export function columnBWidth(texts: readonly string[]): number {
  const longest = Math.max(...texts.map((s) => s.length), 1);
  return Math.min(MAX_COL_B_WIDTH, Math.max(12, longest * 1.44));
}

/** Text se nevejde na jeden řádek sloupce B, řádek dostane dvojitou výšku (gate K4). */
export function needsTallRow(bText: string, widthB: number): boolean {
  return bText.length * 1.44 > widthB;
}

/** Obecný řádek tabulky: sloupec A prázdný, B až E s texty a styly. */
export function buildRowXml(
  rowNum: number,
  cells: { b: string; c: string; d: string; e: string },
  styles: { b: number; c: number; d: number; e: number },
  tall: boolean
): string {
  const ht = tall ? ROW_HEIGHT_TALL : ROW_HEIGHT;
  return (
    `<row r="${rowNum}" ht="${ht}" customHeight="1">` +
    `<c r="A${rowNum}" s="${STYLE_COL_A}"/>` +
    inlineCell("B", rowNum, styles.b, cells.b) +
    inlineCell("C", rowNum, styles.c, cells.c) +
    inlineCell("D", rowNum, styles.d, cells.d) +
    inlineCell("E", rowNum, styles.e, cells.e) +
    `</row>`
  );
}

/** Řádek člena: styl podle pořadí a šedé, text B a E podle `mark`. */
export function memberRowXml(
  rowNum: number,
  member: { company: string | null; obor: string | null },
  mark: MemberMark,
  isFirst: boolean,
  widthB: number
): string {
  const group = mark.grey ? GREY_STYLES : MEMBER_STYLES;
  const styles = isFirst ? group.first : group.mid;
  return buildRowXml(
    rowNum,
    { b: mark.nameCell, c: member.company ?? "", d: member.obor ?? "", e: mark.note },
    styles,
    needsTallRow(mark.nameCell, widthB)
  );
}

// ── Styly ────────────────────────────────────────────────────

function extractXfs(cellXfsInner: string): string[] {
  return cellXfsInner.match(/<xf\b[^>]*?\/>|<xf\b[^>]*?>[\s\S]*?<\/xf>/g) ?? [];
}

/**
 * Doplní do `xl/styles.xml` šedé výplně (nový `fill`) a 7 klonů stylů členů
 * s `fillId` šedé. Rámečky a zarovnání se kopírují. Při chybějící kotvě nebo
 * jiném uspořádání šablony vyhodí chybu (route vrátí 500, test selže hlasitě).
 */
export function addGreyStyles(stylesXml: string): string {
  const fillsMatch = stylesXml.match(/<fills count="(\d+)">([\s\S]*?)<\/fills>/);
  const xfsMatch = stylesXml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/);
  if (!fillsMatch || !xfsMatch) {
    throw new Error("Šablona exportu: ve styles.xml chybí fills nebo cellXfs.");
  }
  const fillsCount = Number(fillsMatch[1]);
  const xfsCount = Number(xfsMatch[1]);
  const xfs = extractXfs(xfsMatch[2]);
  if (xfs.length !== xfsCount || fillsCount !== (fillsMatch[2].match(/<fill>/g) ?? []).length) {
    throw new Error("Šablona exportu: počty ve styles.xml nesedí.");
  }
  if (xfsCount !== GREY_BASE_INDEX) {
    throw new Error("Šablona exportu: změnil se počet stylů, přepočítej GREY_STYLES.");
  }
  const greyFillId = fillsCount;
  const clones = GREY_SOURCE_XFS.map((src) => {
    const xf = xfs[src];
    if (!xf || !/\bfillId="\d+"/.test(xf)) {
      throw new Error(`Šablona exportu: styl ${src} nemá očekávaný tvar.`);
    }
    const cloned = xf.replace(/\bfillId="\d+"/, `fillId="${greyFillId}"`);
    return /\bapplyFill="/.test(cloned) ? cloned : cloned.replace(/^<xf\b/, '<xf applyFill="1"');
  });
  const greyFill =
    `<fill><patternFill patternType="solid"><fgColor rgb="${GREY_RGB}"/>` +
    `<bgColor indexed="64"/></patternFill></fill>`;
  return stylesXml
    .replace(
      /<fills count="\d+">([\s\S]*?)<\/fills>/,
      (_m, inner: string) => `<fills count="${fillsCount + 1}">${inner}${greyFill}</fills>`
    )
    .replace(
      /<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/,
      (_m, inner: string) =>
        `<cellXfs count="${xfsCount + clones.length}">${inner}${clones.join("")}</cellXfs>`
    );
}
