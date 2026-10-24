/**
 * iter-041 (arch 5.3, 5.4): čtečka listu z xlsx nad `zip.ts` a `xml.ts`.
 *
 * Čistý modul. Vzorce se nikdy nevyhodnocují: buňka s `<f>` se bere jen přes
 * uloženou hodnotu `<v>`, bez `<v>` je prázdná. Chybová buňka (`t="e"`) je
 * prázdná. Číselné buňky se převedou na prostý desetinný řetězec (exponent
 * z uložené hodnoty je legální, v textu buňky ne, to hlídá `scores.ts`).
 *
 * Limity: nejvýš 200 neprázdných řádků, 40 sloupců, buňka 1 000 znaků.
 * Cíl listu z `workbook.xml.rels` se normalizuje a musí odpovídat
 * `^xl/worksheets/[A-Za-z0-9_]+\.xml$`, `TargetMode="External"` je chyba.
 */
import { SemaforFileError } from "@/lib/semafor/errors";
import { openZip, type ZipReader } from "@/lib/semafor/zip";
import {
  attrLocal,
  childrenLocal,
  collectText,
  firstChildLocal,
  parseXml,
  XmlError,
  type XmlNode,
} from "@/lib/semafor/xml";

export const MAX_ROWS = 200;
export const MAX_COLUMNS = 40;
export const MAX_CELL_CHARS = 1000;
/**
 * Stropy počtu prvků podle části souboru. Strom se drží v paměti (stovky bajtů
 * na prvek), proto 16 KB soubor s 500 000 prázdnými prvky zabral stovky MB.
 * Skutečný list má nejvýš 200 řádků x 40 sloupců x 3 uzly (24 000), reálně
 * kolem 30 x 19 x 3 (1 700); sdílené řetězce jsou 2 uzly na řetězec.
 */
export const MAX_ELEMENTS_SHEET = 50_000;
export const MAX_ELEMENTS_SHARED = 25_000;
export const MAX_ELEMENTS_OTHER = 2_000;
/** Kolik názvů listů a jak dlouhé se vrací v chybě `noSheet`. */
export const MAX_SHEET_NAMES_SHOWN = 5;
export const MAX_SHEET_NAME_CHARS = 40;
/** Kolik listů se nejvýš přečte při výběru listu podle obsahu. */
export const MAX_SHEETS_READ = 10;
const SHEET_PATH_RE = /^xl\/worksheets\/[A-Za-z0-9_]+\.xml$/;

export interface SheetRow {
  /** Číslo řádku v listu (1-based), tak jak ho vidí uživatel v Excelu. */
  r: number;
  /** Buňky podle sloupce (0-based), chybějící jsou prázdný řetězec. */
  cells: string[];
}

export interface SheetRead {
  rows: SheetRow[];
}

const broken = () => new SemaforFileError("broken");

function parseOrBroken(zip: ZipReader, name: string, maxElements: number): XmlNode {
  try {
    return parseXml(zip.read(name).toString("utf8"), { maxElements });
  } catch (err) {
    if (err instanceof XmlError) throw broken();
    throw err;
  }
}

/** Sloupec z odkazu buňky (`B3` -> 1). */
export function columnIndex(ref: string): number {
  const m = /^([A-Za-z]{1,3})(\d+)?$/.exec(ref);
  if (!m) throw broken();
  let n = 0;
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Prostý desetinný zápis čísla z uložené hodnoty buňky (bez exponentu). */
export function plainNumber(raw: string): string {
  const t = raw.trim();
  if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return "";
  const n = Number(t);
  if (!Number.isFinite(n) || Math.abs(n) > 1e15) return "";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(10).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeSheetTarget(target: string): string {
  const t = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
  if (!SHEET_PATH_RE.test(t)) throw broken();
  return t;
}

function readSharedStrings(zip: ZipReader, relsRoot: XmlNode): string[] {
  let path: string | null = null;
  for (const rel of childrenLocal(relsRoot, "Relationship")) {
    const type = attrLocal(rel, "Type") ?? "";
    if (type.endsWith("/sharedStrings")) {
      if (attrLocal(rel, "TargetMode") === "External") throw broken();
      const target = attrLocal(rel, "Target") ?? "";
      path = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
      break;
    }
  }
  if (path === null) path = "xl/sharedStrings.xml";
  if (!/^xl\/[A-Za-z0-9_]+\.xml$/.test(path)) throw broken();
  if (!zip.has(path)) return [];
  const root = parseOrBroken(zip, path, MAX_ELEMENTS_SHARED);
  return childrenLocal(root, "si").map((si) => collectText(si));
}

interface Workbook {
  zip: ZipReader;
  rels: XmlNode;
  sheets: XmlNode[];
  shared: string[] | null;
}

function openWorkbook(file: Uint8Array): Workbook {
  const zip = openZip(file);
  if (!zip.has("xl/workbook.xml") || !zip.has("xl/_rels/workbook.xml.rels")) throw broken();
  const workbook = parseOrBroken(zip, "xl/workbook.xml", MAX_ELEMENTS_OTHER);
  const rels = parseOrBroken(zip, "xl/_rels/workbook.xml.rels", MAX_ELEMENTS_OTHER);
  const sheetsNode = firstChildLocal(workbook, "sheets");
  const sheets = sheetsNode ? childrenLocal(sheetsNode, "sheet") : [];
  return { zip, rels, sheets, shared: null };
}

function noSheetError(sheets: XmlNode[]): SemaforFileError {
  // Jen prvních pár názvů a oříznuté, zbytek jako počet (soubor může mít tisíce listů).
  return new SemaforFileError("noSheet", {
    list: sheets.slice(0, MAX_SHEET_NAMES_SHOWN).map((s) => (attrLocal(s, "name") ?? "").slice(0, MAX_SHEET_NAME_CHARS)),
    more: Math.max(0, sheets.length - MAX_SHEET_NAMES_SHOWN),
  });
}

/** Přečte jeden list. Limity zipu a XML platí pro každý čtený list zvlášť. */
function readSheetNode(wb: Workbook, match: XmlNode): SheetRead {
  const { zip, rels } = wb;
  const rid = attrLocal(match, "id");
  if (!rid) throw broken();
  const rel = childrenLocal(rels, "Relationship").find((r) => r.attrs.get("Id") === rid);
  if (!rel) throw broken();
  if (attrLocal(rel, "TargetMode") === "External") throw broken();
  const sheetPath = normalizeSheetTarget(attrLocal(rel, "Target") ?? "");
  if (!zip.has(sheetPath)) throw broken();

  if (wb.shared === null) wb.shared = readSharedStrings(zip, rels);
  const shared = wb.shared;
  const sheet = parseOrBroken(zip, sheetPath, MAX_ELEMENTS_SHEET);
  const data = firstChildLocal(sheet, "sheetData");
  if (!data) throw broken();

  const rows: SheetRow[] = [];
  let seq = 0;
  for (const row of childrenLocal(data, "row")) {
    seq++;
    const rAttr = attrLocal(row, "r");
    const rowNo = rAttr && /^\d{1,7}$/.test(rAttr) ? Number(rAttr) : seq;
    const cells: string[] = [];
    let nonEmpty = false;
    let cursor = 0;
    for (const c of childrenLocal(row, "c")) {
      const ref = attrLocal(c, "r");
      const col = ref ? columnIndex(ref) : cursor;
      cursor = col + 1;
      const value = cellValue(c, shared);
      if (value.length > MAX_CELL_CHARS) throw broken();
      if (value.length === 0) continue;
      if (col >= MAX_COLUMNS) throw broken();
      while (cells.length <= col) cells.push("");
      cells[col] = value;
      nonEmpty = true;
    }
    if (!nonEmpty) continue;
    rows.push({ r: rowNo, cells });
    if (rows.length > MAX_ROWS) throw broken();
  }
  return { rows };
}

const sheetKey = (s: XmlNode) => (attrLocal(s, "name") ?? "").trim().toLowerCase();

/**
 * Přečte list `sheetName` (bez ohledu na velikost písmen, trim) z xlsx.
 * Chybí-li, vyhodí `noSheet` se seznamem názvů listů.
 */
export function readXlsxSheet(file: Uint8Array, sheetName: string): SheetRead {
  const wb = openWorkbook(file);
  const wanted = sheetName.trim().toLowerCase();
  const match = wb.sheets.find((s) => sheetKey(s) === wanted);
  if (!match) throw noSheetError(wb.sheets);
  return readSheetNode(wb, match);
}

/**
 * Vybere list podle obsahu: list `preferredName` (je-li) má přednost, pak
 * ostatní v pořadí sešitu. Bere první, který projde `accept`. Čte se nejvýš
 * `MAX_SHEETS_READ` listů. Žádný vhodný = `noSheet`.
 */
export function readFirstMatchingSheet(
  file: Uint8Array,
  preferredName: string,
  accept: (rows: readonly SheetRow[]) => boolean
): SheetRead {
  const wb = openWorkbook(file);
  const wanted = preferredName.trim().toLowerCase();
  const preferred = wb.sheets.filter((s) => sheetKey(s) === wanted);
  const ordered = [...preferred, ...wb.sheets.filter((s) => !preferred.includes(s))].slice(0, MAX_SHEETS_READ);
  for (const node of ordered) {
    const read = readSheetNode(wb, node);
    if (accept(read.rows)) return read;
  }
  throw noSheetError(wb.sheets);
}

function cellValue(c: XmlNode, shared: string[]): string {
  const t = attrLocal(c, "t") ?? "n";
  if (t === "e") return "";
  if (t === "inlineStr") {
    const is = firstChildLocal(c, "is");
    return is ? collectText(is) : "";
  }
  const v = firstChildLocal(c, "v");
  if (!v) return "";
  if (t === "s") {
    const idx = Number(v.text.trim());
    if (!Number.isInteger(idx) || idx < 0 || idx >= shared.length) return "";
    return shared[idx];
  }
  if (t === "str") return v.text;
  if (t === "b") return v.text.trim() === "1" ? "1" : "0";
  return plainNumber(v.text);
}
