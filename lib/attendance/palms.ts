/**
 * iter-041 C4 (arch T-001 sekce 8, gate T-002 K7, K8, Z2, Z3): jednorázové
 * doplnění docházky z exportu PALMS (`chapterpalmssummaryattendance_*.xls`,
 * SpreadsheetML 2003).
 *
 * Čistý modul bez DB a bez sítě. Používá ho `scripts/backfill-iter-041-palms.ts`
 * a testy. Obsahuje:
 *   - čtečku souboru (kódování, SpreadsheetML mřížka, parametry, hlavička),
 *   - určení roku týdnů,
 *   - mapování kódů (P, L, S, A, M, prázdné, neznámé),
 *   - párování řádků na členy a plán zápisu,
 *   - SQL (jeden příkaz na soubor, dry-run a apply mají společný prefix),
 *   - ochrany skriptu (cesta mimo repo, `EXPECT_DB_HOST`) a formát výpisu.
 *
 * Výstupy nikdy neobsahují jména ani jiný obsah buněk. Chyby souboru nesou
 * jen pevný text.
 */
import path from "node:path";
import { ABSENCE_LIMIT, ABSENCE_STATUSES } from "./rules";
import { EMAIL_HEADERS, matchNames, type MatchKind, type MatchMember } from "../semafor/names";
import { UNEXCUSED_TEXTS } from "./texts";
import { XmlError, attrLocal, childrenLocal, firstChildLocal, parseXml, type XmlNode } from "../semafor/xml";

// ── Chyby a limity ───────────────────────────────────────────

export class PalmsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PalmsError";
  }
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ALIAS_FILE_BYTES = 1024 * 1024;
const MAX_ROW_INDEX = 20_000;
const MAX_COL_INDEX = 1_000;
const MAX_WEEKS = 200;
const SPREADSHEET_NS = "urn:schemas-microsoft-com:office:spreadsheet";

/** Zástupné jméno náhradníka (K7). Do paměti jmen se nezapisuje. */
export const SUBSTITUTE_PLACEHOLDER = UNEXCUSED_TEXTS.substitutePlaceholder;

// ── Kódování souboru ─────────────────────────────────────────

/** UTF-8 (i s BOM), UTF-16 LE/BE s BOM, UTF-16 LE bez BOM začínající `<`. */
export function decodeFileBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2);
    const swapped = new Uint8Array(body.length - (body.length % 2));
    for (let i = 0; i + 1 < body.length; i += 2) {
      swapped[i] = body[i + 1];
      swapped[i + 1] = body[i];
    }
    return new TextDecoder("utf-16le").decode(swapped);
  }
  if (bytes.length >= 2 && bytes[0] === 0x3c && bytes[1] === 0x00) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PalmsError("Soubor není v kódování UTF-8 ani UTF-16.");
  }
}

// ── Mřížka SpreadsheetML ─────────────────────────────────────

type Grid = Map<number, Map<number, string>>;

function parseIndex(raw: string, max: number): number {
  if (!/^\d{1,6}$/.test(raw.trim())) throw new PalmsError("Neplatný index řádku nebo sloupce.");
  const n = Number(raw);
  if (n < 1 || n > max) throw new PalmsError("Index řádku nebo sloupce je mimo povolený rozsah.");
  return n;
}

/** Text `<Data>` včetně případného HTML rich textu (přímý text, pak potomci). */
function dataText(node: XmlNode): string {
  let out = node.text;
  for (const c of node.children) out += dataText(c);
  return out;
}

function buildGrid(worksheet: XmlNode): Grid {
  const table = firstChildLocal(worksheet, "Table");
  if (!table) throw new PalmsError("List nemá tabulku.");
  const grid: Grid = new Map();
  let r = 0;
  for (const row of childrenLocal(table, "Row")) {
    const ri = attrLocal(row, "Index");
    r = ri !== undefined ? parseIndex(ri, MAX_ROW_INDEX) : r + 1;
    if (r > MAX_ROW_INDEX) throw new PalmsError("Příliš mnoho řádků.");
    let c = 0;
    for (const cell of childrenLocal(row, "Cell")) {
      const ci = attrLocal(cell, "Index");
      c = ci !== undefined ? parseIndex(ci, MAX_COL_INDEX) : c + 1;
      const data = firstChildLocal(cell, "Data");
      const text = data ? dataText(data).trim() : "";
      if (text !== "") {
        let cols = grid.get(r);
        if (!cols) {
          cols = new Map();
          grid.set(r, cols);
        }
        cols.set(c, text);
      }
      const across = attrLocal(cell, "MergeAcross");
      if (across !== undefined) {
        const k = Number(across);
        if (!Number.isInteger(k) || k < 0 || k > MAX_COL_INDEX) throw new PalmsError("Neplatné MergeAcross.");
        c += k;
      }
      if (c > MAX_COL_INDEX) throw new PalmsError("Příliš mnoho sloupců.");
    }
  }
  return grid;
}

// ── Data a týdny ─────────────────────────────────────────────

/** `YYYY-MM-DD` nebo `null`, když datum neexistuje. */
export function isoDate(y: number, m: number, d: number): string | null {
  if (!Number.isInteger(y) || y < 1900 || y > 2200) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Přijme `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SS[.fff]`, `D.M.YYYY`. Jiný tvar je chyba. */
export function parseParamDate(raw: string): string {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,7})?)?)?$/.exec(s);
  let iso: string | null = null;
  if (m) iso = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
  else {
    m = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/.exec(s);
    if (m) iso = isoDate(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  if (!iso) throw new PalmsError("Datum From nebo To má nepodporovaný tvar.");
  return iso;
}

/** České zkratky měsíců v hlavičce týdnů (malá písmena, NFC). */
export const MONTH_ABBR: Readonly<Record<string, number>> = Object.freeze({
  led: 1,
  úno: 2,
  bře: 3,
  dub: 4,
  kvě: 5,
  čer: 6,
  čvn: 6,
  čec: 7,
  čvc: 7,
  srp: 8,
  zář: 9,
  říj: 10,
  lis: 11,
  pro: 12,
});

const WEEK_LABEL_RE = /^(\p{L}{3})\.?\s+(\d{1,2})$/u;

/** `{month, day}` z popisku týdne, `null` když to není popisek týdne. */
export function parseWeekLabel(raw: string): { month: number; day: number } | null {
  const m = WEEK_LABEL_RE.exec(raw.normalize("NFC").trim().toLocaleLowerCase("cs"));
  if (!m) return null;
  const month = Object.prototype.hasOwnProperty.call(MONTH_ABBR, m[1]) ? MONTH_ABBR[m[1]] : undefined;
  if (month === undefined) throw new PalmsError("Hlavička obsahuje neznámou zkratku měsíce.");
  return { month, day: Number(m[2]) };
}

export interface PalmsWeek {
  /** Číslo sloupce v listu (1-based). */
  col: number;
  /** Datum týdne `YYYY-MM-DD`. */
  date: string;
}

interface WeekLabel {
  col: number;
  month: number;
  day: number;
}

/**
 * Doplní rok k týdnům. S `to`: kandidáti `rok(from)..rok(to)`, datum musí
 * ležet v `[from, to]`, právě jeden kandidát. Bez `to`: roky se dopočtou
 * dopředu od `from` (pokles měsíce = nový rok). Sloupce musí jít chronologicky
 * vzestupně.
 */
export function resolveWeekDates(labels: readonly WeekLabel[], from: string, to: string | null): PalmsWeek[] {
  if (to !== null && to < from) throw new PalmsError("Datum To je před datem From.");
  const fromYear = Number(from.slice(0, 4));
  const out: PalmsWeek[] = [];

  if (to !== null) {
    const toYear = Number(to.slice(0, 4));
    for (const l of labels) {
      const cands: string[] = [];
      for (let y = fromYear; y <= toYear; y++) {
        const d = isoDate(y, l.month, l.day);
        if (d !== null && d >= from && d <= to) cands.push(d);
      }
      if (cands.length !== 1) throw new PalmsError("Některý týden nejde zařadit do roku.");
      out.push({ col: l.col, date: cands[0] });
    }
  } else {
    let year = fromYear;
    let prevMonth = Number(from.slice(5, 7));
    for (const l of labels) {
      if (l.month < prevMonth) year++;
      prevMonth = l.month;
      const d = isoDate(year, l.month, l.day);
      if (d === null || d < from) throw new PalmsError("Některý týden nejde zařadit do roku.");
      out.push({ col: l.col, date: d });
    }
  }

  for (let i = 1; i < out.length; i++) {
    if (out[i].date <= out[i - 1].date) throw new PalmsError("Týdny v hlavičce nejdou chronologicky za sebou.");
  }
  return out;
}

export function isThursday(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 4;
}

// ── Čtení listu ──────────────────────────────────────────────

export interface PalmsRow {
  /** Číslo řádku v listu (1-based), tak ho vidí Tom v Excelu. */
  rowNo: number;
  /** `Jméno Příjmení` pro párování. Do výpisu jen s `--show-names`. */
  name: string;
  /** Volitelný e-mail řádku (sloupec `Email`), jen pro párování. Do výpisu nikdy. */
  email: string | null;
  /** Kód v každém týdnu (stejné pořadí jako `weeks`), velká písmena, `""` = prázdná buňka. */
  codes: string[];
}

export interface PalmsSheet {
  from: string;
  to: string | null;
  weeks: PalmsWeek[];
  rows: PalmsRow[];
  /** Týdny, jejichž datum není čtvrtek (jen varování). */
  nonThursdayWeeks: number;
  /** Řádky s kódy, ale bez jména. */
  rowsWithoutName: number;
}

const PARAM_LABELS: Readonly<Record<string, "from" | "to" | "chapter">> = Object.freeze({
  "from": "from",
  "from:": "from",
  "to": "to",
  "to:": "to",
  "chapter": "chapter",
  "chapter:": "chapter",
});

function cellValueRight(cols: Map<number, string>, col: number): string | null {
  let best: number | null = null;
  for (const c of cols.keys()) {
    if (c > col && (best === null || c < best)) best = c;
  }
  return best === null ? null : (cols.get(best) ?? null);
}

/** Přečte export z textu XML. Chyby jsou `PalmsError` s pevným textem. */
export function parsePalmsXml(xml: string): PalmsSheet {
  let root: XmlNode;
  try {
    root = parseXml(xml);
  } catch (e) {
    if (e instanceof XmlError) throw new PalmsError("Soubor není platný SpreadsheetML (XML).");
    throw e;
  }
  if (root.local !== "Workbook" || attrLocal(root, "xmlns") !== SPREADSHEET_NS) {
    throw new PalmsError("Soubor není SpreadsheetML 2003.");
  }
  const sheet = childrenLocal(root, "Worksheet").find(
    (w) => (attrLocal(w, "Name") ?? "").trim().toLocaleLowerCase("cs") === "report"
  );
  if (!sheet) throw new PalmsError("V souboru chybí list Report.");

  const grid = buildGrid(sheet);
  const rowNos = [...grid.keys()].sort((a, b) => a - b);

  let headerRow = -1;
  let firstCol = -1;
  let lastCol = -1;
  let emailCol = -1;
  for (const r of rowNos) {
    let fc = -1;
    let lc = -1;
    let ec = -1;
    for (const [c, v] of grid.get(r)!) {
      const t = v.normalize("NFC").trim().toLocaleLowerCase("cs");
      if (t === "first name" && fc < 0) fc = c;
      else if (t === "last name" && lc < 0) lc = c;
      else if (EMAIL_HEADERS.includes(t) && ec < 0) ec = c;
    }
    if (fc >= 0 && lc >= 0) {
      headerRow = r;
      firstCol = fc;
      lastCol = lc;
      emailCol = ec;
      break;
    }
  }
  if (headerRow < 0) throw new PalmsError("V listu chybí hlavička First Name a Last Name.");

  const params: { from?: string; to?: string } = {};
  for (const r of rowNos) {
    if (r >= headerRow) break;
    const cols = grid.get(r)!;
    for (const [c, v] of cols) {
      const key = PARAM_LABELS[v.normalize("NFC").trim().toLocaleLowerCase("cs")];
      if (key !== "from" && key !== "to") continue;
      const val = cellValueRight(cols, c);
      if (val !== null && params[key] === undefined) params[key] = val;
    }
  }
  if (params.from === undefined) throw new PalmsError("V hlavičce chybí parametr From.");
  const from = parseParamDate(params.from);
  const to = params.to !== undefined ? parseParamDate(params.to) : null;

  const labels: WeekLabel[] = [];
  const headerCols = [...grid.get(headerRow)!.entries()].sort((a, b) => a[0] - b[0]);
  for (const [c, v] of headerCols) {
    if (c === firstCol || c === lastCol || c === emailCol) continue;
    const w = parseWeekLabel(v);
    if (w) labels.push({ col: c, month: w.month, day: w.day });
  }
  if (labels.length === 0) throw new PalmsError("V hlavičce nejsou žádné týdny.");
  if (labels.length > MAX_WEEKS) throw new PalmsError("V hlavičce je příliš mnoho týdnů.");
  const weeks = resolveWeekDates(labels, from, to);

  const rows: PalmsRow[] = [];
  let rowsWithoutName = 0;
  for (const r of rowNos) {
    if (r <= headerRow) continue;
    const cols = grid.get(r)!;
    const first = cols.get(firstCol) ?? "";
    const last = cols.get(lastCol) ?? "";
    const codes = weeks.map((w) => (cols.get(w.col) ?? "").normalize("NFC").trim().toLocaleUpperCase("cs"));
    const name = `${first} ${last}`.replace(/\s+/g, " ").trim();
    if (name === "") {
      if (codes.some((c) => c !== "")) rowsWithoutName++;
      continue;
    }
    const mail = emailCol >= 0 ? (cols.get(emailCol) ?? "").trim() : "";
    rows.push({ rowNo: r, name, email: mail.length > 0 && mail.length <= 254 ? mail : null, codes });
  }

  return {
    from,
    to,
    weeks,
    rows,
    nonThursdayWeeks: weeks.filter((w) => !isThursday(w.date)).length,
    rowsWithoutName,
  };
}

/** Přečte export z bajtů souboru. */
export function parsePalmsFile(bytes: Uint8Array): PalmsSheet {
  if (bytes.length > MAX_FILE_BYTES) throw new PalmsError("Soubor je větší než 5 MB.");
  return parsePalmsXml(decodeFileBytes(bytes));
}

// ── Mapování kódů ────────────────────────────────────────────

export type CodeAction =
  | { kind: "write"; status: "present" | "substitute" | "absent"; sub: string | null; excused: boolean }
  | { kind: "medical" }
  | { kind: "empty" }
  | { kind: "unknown"; code: string };

/** P, L = přítomen; S = náhradník (K7); A = omluvená absence; M nic (K8); prázdné nic; jiné neznámé. */
export function mapCode(raw: string): CodeAction {
  const code = raw.normalize("NFC").trim().toLocaleUpperCase("cs");
  switch (code) {
    case "":
      return { kind: "empty" };
    case "P":
    case "L":
      return { kind: "write", status: "present", sub: null, excused: false };
    case "S":
      return { kind: "write", status: "substitute", sub: SUBSTITUTE_PLACEHOLDER, excused: false };
    case "A":
      return { kind: "write", status: "absent", sub: null, excused: true };
    case "M":
      return { kind: "medical" };
    default:
      return { kind: "unknown", code };
  }
}

/** Kód do výpisu: jen krátké alfanumerické znaky, jinak `?`. */
export function safeCodeLabel(code: string): string {
  return /^[A-Z0-9]{1,3}$/.test(code) ? code : "?";
}

// ── Párování řádků na členy ──────────────────────────────────

const ACCEPTED_KINDS: readonly MatchKind[] = ["email", "alias", "exact", "loose", "swapped", "partial"];

export interface RowMatching {
  /** Id člena pro každý řádek souboru (stejné pořadí jako `sheet.rows`), `null` = nespárováno. */
  memberIds: (string | null)[];
  /** Počet párování podle druhu (jen přijaté druhy). */
  byKind: Record<"email" | "alias" | "exact" | "loose" | "swapped" | "partial" | "file", number>;
  /** Čísla nespárovaných řádků (bez jmen). */
  unmatchedRowNos: number[];
  /** Čísla řádků spárovaných bez diakritiky (bez jmen). */
  looseRowNos: number[];
  /** Čísla řádků spárovaných s prohozeným pořadím jména (bez jmen). */
  swappedRowNos: number[];
  /** Čísla řádků spárovaných částečnou shodou jména (bez jmen). */
  partialRowNos: number[];
}

/** Obsah `--alias-file`: `{ "řádek 14": "<uuid>" }`. Chybný tvar je `PalmsError`. */
export function parseAliasFile(text: string): Map<number, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new PalmsError("Soubor aliasů není platný JSON.");
  }
  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    throw new PalmsError("Soubor aliasů musí být objekt { \"řádek N\": \"uuid\" }.");
  }
  const out = new Map<number, string>();
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    const m = /^řádek (\d{1,6})$/.exec(k.normalize("NFC"));
    if (!m) throw new PalmsError("Klíč v souboru aliasů musí mít tvar \"řádek N\".");
    if (typeof v !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      throw new PalmsError("Hodnota v souboru aliasů musí být uuid člena.");
    }
    out.set(Number(m[1]), v.toLowerCase());
  }
  return out;
}

export function matchRows(
  sheet: PalmsSheet,
  members: readonly MatchMember[],
  aliases: ReadonlyMap<string, string>,
  fileAliases: ReadonlyMap<number, string> = new Map()
): RowMatching {
  const rowNos = new Set(sheet.rows.map((r) => r.rowNo));
  for (const n of fileAliases.keys()) {
    if (!rowNos.has(n)) throw new PalmsError("Soubor aliasů odkazuje na řádek, který v exportu není.");
  }
  const known = new Set(members.map((m) => m.id.toLowerCase()));
  const matches = matchNames(
    sheet.rows.map((r) => r.name),
    members,
    aliases,
    sheet.rows.map((r) => r.email)
  );
  const byKind = { email: 0, alias: 0, exact: 0, loose: 0, swapped: 0, partial: 0, file: 0 };
  const memberIds: (string | null)[] = [];
  const unmatchedRowNos: number[] = [];
  const looseRowNos: number[] = [];
  const swappedRowNos: number[] = [];
  const partialRowNos: number[] = [];
  sheet.rows.forEach((row, i) => {
    const fromFile = fileAliases.get(row.rowNo);
    let id: string | null = null;
    if (fromFile !== undefined) {
      if (known.has(fromFile)) {
        id = fromFile;
        byKind.file++;
      }
    } else {
      const m = matches[i];
      if (ACCEPTED_KINDS.includes(m.kind) && m.memberId !== null) {
        id = m.memberId;
        byKind[m.kind as "email" | "alias" | "exact" | "loose" | "swapped" | "partial"]++;
        if (m.kind === "loose") looseRowNos.push(row.rowNo);
        if (m.kind === "swapped") swappedRowNos.push(row.rowNo);
        if (m.kind === "partial") partialRowNos.push(row.rowNo);
      }
    }
    memberIds.push(id);
    if (id === null) unmatchedRowNos.push(row.rowNo);
  });
  const seen = new Set<string>();
  for (const id of memberIds) {
    if (id === null) continue;
    if (seen.has(id)) throw new PalmsError("Dva řádky souboru se spárovaly na stejného člena.");
    seen.add(id);
  }
  return { memberIds, byKind, unmatchedRowNos, looseRowNos, swappedRowNos, partialRowNos };
}

// ── Plán zápisu ──────────────────────────────────────────────

export interface PlanRow {
  rowNo: number;
  /** `YYYY-MM-DD`. */
  d: string;
  memberId: string;
  status: "present" | "substitute" | "absent";
  sub: string | null;
  excused: boolean;
}

export interface PlanStats {
  weeks: number;
  fileRows: number;
  matchedRows: number;
  unmatchedRowNos: number[];
  looseRowNos: number[];
  swappedRowNos: number[];
  partialRowNos: number[];
  byKind: RowMatching["byKind"];
  /** Počty buněk spárovaných řádků podle kódu (L se počítá zvlášť, zapisuje se jako P). */
  codeCounts: { P: number; L: number; S: number; A: number };
  /** Kód `M`, nezapsáno (K8). */
  medicalSkipped: number;
  /** Neznámé kódy a jejich počty. */
  unknown: Record<string, number>;
  emptyCells: number;
  nonThursdayWeeks: number;
  rowsWithoutName: number;
}

export interface PalmsPlan {
  rows: PlanRow[];
  stats: PlanStats;
}

export function buildPlan(sheet: PalmsSheet, matching: RowMatching): PalmsPlan {
  const rows: PlanRow[] = [];
  const codeCounts = { P: 0, L: 0, S: 0, A: 0 };
  const unknown: Record<string, number> = Object.create(null);
  let medicalSkipped = 0;
  let emptyCells = 0;
  let matchedRows = 0;

  sheet.rows.forEach((row, i) => {
    const memberId = matching.memberIds[i];
    if (memberId === null) return;
    matchedRows++;
    row.codes.forEach((raw, w) => {
      const act = mapCode(raw);
      if (act.kind === "empty") {
        emptyCells++;
      } else if (act.kind === "medical") {
        medicalSkipped++;
      } else if (act.kind === "unknown") {
        const label = safeCodeLabel(act.code);
        unknown[label] = (unknown[label] ?? 0) + 1;
      } else {
        const code = raw.trim().toLocaleUpperCase("cs") as "P" | "L" | "S" | "A";
        codeCounts[code]++;
        rows.push({
          rowNo: row.rowNo,
          d: sheet.weeks[w].date,
          memberId,
          status: act.status,
          sub: act.sub,
          excused: act.excused,
        });
      }
    });
  });

  return {
    rows,
    stats: {
      weeks: sheet.weeks.length,
      fileRows: sheet.rows.length,
      matchedRows,
      unmatchedRowNos: matching.unmatchedRowNos,
      looseRowNos: matching.looseRowNos,
      swappedRowNos: matching.swappedRowNos,
      partialRowNos: matching.partialRowNos,
      byKind: matching.byKind,
      codeCounts,
      medicalSkipped,
      unknown: { ...unknown },
      emptyCells,
      nonThursdayWeeks: sheet.nonThursdayWeeks,
      rowsWithoutName: sheet.rowsWithoutName,
    },
  };
}

/** Parametr `$1` příkazu: JSON se řádky plánu. */
export function planToJson(rows: readonly PlanRow[]): string {
  return JSON.stringify(
    rows.map((r) => ({ d: r.d, member_id: r.memberId, status: r.status, sub: r.sub, excused: r.excused, row_no: r.rowNo }))
  );
}

// ── SQL ──────────────────────────────────────────────────────

/**
 * Parametry příkazu: `$1` JSON řádků, `$2` dnes (pražské datum), `$3` začátek
 * okna absencí (`absenceWindowStart`), `$4` limit absencí. Dnes a okno počítá
 * TypeScript, SQL si je nepočítá samo (stejně jako v aplikaci, arch 12.2).
 */
export const SQL_PARAM_COUNT = 4;

/** Člen je v den `i.d` deaktivovaný (Z2). */
const DEACTIVATED_ON_DAY = `(m.deactivated_at IS NOT NULL
        AND (m.deactivated_at AT TIME ZONE 'Europe/Prague')::date <= i.d
        AND (m.inactive_until IS NULL OR i.d <= m.inactive_until))`;

/** Společný prefix dry-runu i apply (LL-006 bod 2): vstup, hranice aplikace, způsobilé řádky. */
export const SQL_PREFIX = `WITH input AS (
  SELECT * FROM jsonb_to_recordset($1::jsonb)
    AS x(d date, member_id uuid, status text, sub text, excused boolean, row_no int)
),
bounds AS (
  SELECT least(
    (SELECT min(attendance_date) FROM attendance_link),
    (SELECT min(r.attendance_date) FROM attendance_record r
      WHERE r.source IN ('manager', 'auto')
        AND NOT EXISTS (SELECT 1 FROM attendance_record p
                        WHERE p.attendance_date = r.attendance_date AND p.source = 'palms')),
    (SELECT min(ad.attendance_date) FROM attendance_day ad
      WHERE NOT EXISTS (SELECT 1 FROM attendance_record r
                        WHERE r.attendance_date = ad.attendance_date AND r.source = 'palms')),
    $2::date - 1
  ) AS app_start
),
elig AS (
  SELECT i.* FROM input i JOIN member m ON m.id = i.member_id, bounds b
  WHERE i.d < b.app_start
    AND NOT ${DEACTIVATED_ON_DAY}
)`;

const ABSENCE_STATUS_LIST = ABSENCE_STATUSES.map((s) => `'${s}'`).join(", ");

/** Společná analýza (nové řádky, aktuální počty absencí pro Z3). Stejná v dry-runu i apply. */
export const SQL_ANALYSIS = `,
newrows AS (
  SELECT e.* FROM elig e
  WHERE NOT EXISTS (SELECT 1 FROM attendance_record r
                    WHERE r.attendance_date = e.d AND r.member_id = e.member_id)
),
cur AS (
  SELECT m.id AS member_id, count(r.member_id)::int AS n
  FROM member m
  LEFT JOIN attendance_record r
    ON r.member_id = m.id
   AND r.attendance_date > $3::date AND r.attendance_date <= $2::date
   AND r.status IN (${ABSENCE_STATUS_LIST})
   AND EXISTS (SELECT 1 FROM attendance_day ad
               WHERE ad.attendance_date = r.attendance_date AND ad.finalized_at IS NOT NULL)
  WHERE (m.deactivated_at IS NULL OR COALESCE(m.inactive_until < $2::date, false))
  GROUP BY m.id
),
gain AS (
  SELECT n.member_id, count(*)::int AS k
  FROM newrows n JOIN cur c ON c.member_id = n.member_id
  WHERE n.status = 'absent' AND n.d > $3::date AND n.d <= $2::date
  GROUP BY n.member_id
)`;

/** Společné sloupce výsledku (počty bez jmen). */
export const SQL_STATS_COLUMNS = `(SELECT app_start FROM bounds)::text AS app_start,
       (SELECT count(*) FROM input)::int AS total_rows,
       (SELECT count(*) FROM elig)::int AS eligible,
       (SELECT count(*) FROM input i WHERE NOT EXISTS (SELECT 1 FROM member m WHERE m.id = i.member_id))::int AS skip_no_member,
       (SELECT count(*) FROM input i JOIN member m ON m.id = i.member_id, bounds b WHERE i.d >= b.app_start)::int AS skip_after_start,
       (SELECT count(*) FROM input i JOIN member m ON m.id = i.member_id, bounds b
         WHERE i.d < b.app_start AND ${DEACTIVATED_ON_DAY})::int AS skip_deactivated,
       (SELECT count(*) FROM newrows)::int AS new_records,
       (SELECT count(*) FROM elig e JOIN attendance_record r ON r.attendance_date = e.d AND r.member_id = e.member_id
         WHERE r.status = e.status AND r.substitute_name IS NOT DISTINCT FROM e.sub)::int AS same_records,
       (SELECT count(*) FROM elig e JOIN attendance_record r ON r.attendance_date = e.d AND r.member_id = e.member_id
         WHERE r.status IS DISTINCT FROM e.status OR r.substitute_name IS DISTINCT FROM e.sub)::int AS conflicts,
       (SELECT COALESCE(jsonb_agg(jsonb_build_array(e.d::text, e.row_no) ORDER BY e.d, e.row_no), '[]'::jsonb)
         FROM elig e JOIN attendance_record r ON r.attendance_date = e.d AND r.member_id = e.member_id
         WHERE r.status IS DISTINCT FROM e.status OR r.substitute_name IS DISTINCT FROM e.sub) AS conflict_rows,
       (SELECT count(*) FROM newrows WHERE excused)::int AS new_absences,
       (SELECT count(DISTINCT n.d) FROM newrows n
         WHERE NOT EXISTS (SELECT 1 FROM attendance_day ad WHERE ad.attendance_date = n.d))::int AS days_to_close,
       (SELECT count(*) FROM elig e JOIN member m ON m.id = e.member_id WHERE e.d < m.joined_at)::int AS before_joined,
       (SELECT count(*) FROM cur WHERE n >= $4::int)::int AS limit_now,
       (SELECT count(*) FROM cur c LEFT JOIN gain g ON g.member_id = c.member_id
         WHERE c.n + COALESCE(g.k, 0) >= $4::int)::int AS limit_after,
       (SELECT count(*) FROM gain)::int AS gaining`;

/** Dry-run: jen čtení. */
export const SQL_DRY_END = `
SELECT ${SQL_STATS_COLUMNS}`;

/** Apply: tři inserty v jednom příkazu (bez transakce, LL-003), `ON CONFLICT DO NOTHING`. */
export const SQL_APPLY_END = `,
ins_r AS (
  INSERT INTO attendance_record (attendance_date, member_id, status, substitute_name, source, version, updated_by, updated_at)
  SELECT d, member_id, status, sub, 'palms', 1, NULL, now() FROM elig
  ON CONFLICT (attendance_date, member_id) DO NOTHING
  RETURNING attendance_date, member_id
),
ins_a AS (
  INSERT INTO member_absence (member_id, absence_date, substitute_name, created_by, updated_by)
  SELECT e.member_id, e.d, NULL, NULL, NULL
  FROM elig e JOIN ins_r r ON r.attendance_date = e.d AND r.member_id = e.member_id
  WHERE e.excused
  ON CONFLICT (member_id, absence_date) DO NOTHING
  RETURNING 1
),
ins_d AS (
  INSERT INTO attendance_day (attendance_date, finalized_at, mode, report_late)
  SELECT DISTINCT r.attendance_date, ((r.attendance_date + time '17:00') AT TIME ZONE 'Europe/Prague'), 'recorded', false
  FROM ins_r r
  ON CONFLICT (attendance_date) DO NOTHING
  RETURNING 1
)
SELECT ${SQL_STATS_COLUMNS},
       (SELECT count(*) FROM ins_r)::int AS inserted_records,
       (SELECT count(*) FROM ins_a)::int AS inserted_absences,
       (SELECT count(*) FROM ins_d)::int AS inserted_days`;

/** Jen pro `--show-names` (Tom lokálně): členové, kterým se mění počet nebo jsou na limitu. */
export const SQL_NAMES_END = `
SELECT m.name AS name, c.n AS before, (c.n + COALESCE(g.k, 0))::int AS after
FROM cur c JOIN member m ON m.id = c.member_id LEFT JOIN gain g ON g.member_id = c.member_id
WHERE g.k IS NOT NULL OR c.n >= $4::int
ORDER BY m.name`;

export type BackfillMode = "dry" | "apply" | "names";

export function buildBackfillSql(mode: BackfillMode): string {
  const end = mode === "apply" ? SQL_APPLY_END : mode === "names" ? SQL_NAMES_END : SQL_DRY_END;
  return SQL_PREFIX + SQL_ANALYSIS + end;
}

// ── Výsledek a výpis ─────────────────────────────────────────

export interface BackfillCounts {
  appStart: string;
  totalRows: number;
  eligible: number;
  skipNoMember: number;
  skipAfterStart: number;
  skipDeactivated: number;
  newRecords: number;
  sameRecords: number;
  conflicts: number;
  conflictRows: [string, number][];
  newAbsences: number;
  daysToClose: number;
  beforeJoined: number;
  limitNow: number;
  limitAfter: number;
  gaining: number;
  inserted?: { records: number; absences: number; days: number };
}

function num(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new PalmsError("Databáze vrátila neplatné číslo.");
  return n;
}

export function parseCounts(row: Record<string, unknown>): BackfillCounts {
  const rawConflicts = typeof row.conflict_rows === "string" ? JSON.parse(row.conflict_rows) : row.conflict_rows;
  const conflictRows = (Array.isArray(rawConflicts) ? rawConflicts : []).map(
    (c: unknown): [string, number] => [String((c as unknown[])[0]), num((c as unknown[])[1])]
  );
  const counts: BackfillCounts = {
    appStart: String(row.app_start),
    totalRows: num(row.total_rows),
    eligible: num(row.eligible),
    skipNoMember: num(row.skip_no_member),
    skipAfterStart: num(row.skip_after_start),
    skipDeactivated: num(row.skip_deactivated),
    newRecords: num(row.new_records),
    sameRecords: num(row.same_records),
    conflicts: num(row.conflicts),
    conflictRows,
    newAbsences: num(row.new_absences),
    daysToClose: num(row.days_to_close),
    beforeJoined: num(row.before_joined),
    limitNow: num(row.limit_now),
    limitAfter: num(row.limit_after),
    gaining: num(row.gaining),
  };
  if (row.inserted_records !== undefined) {
    counts.inserted = {
      records: num(row.inserted_records),
      absences: num(row.inserted_absences),
      days: num(row.inserted_days),
    };
  }
  return counts;
}

function rowList(nos: readonly number[]): string {
  const shown = nos.slice(0, 30).join(", ");
  return nos.length > 30 ? `${shown}, další ${nos.length - 30}` : shown;
}

/** Výpis bez jmen (Z3 včetně limitu). `apply` = zápis proběhl. */
export function formatReport(stats: PlanStats, counts: BackfillCounts, apply: boolean): string[] {
  const lines: string[] = [];
  lines.push(`Soubor: týdnů ${stats.weeks}, řádků členů ${stats.fileRows}.`);
  const k = stats.byKind;
  lines.push(
    `Spárováno ${stats.matchedRows} (přesně ${k.exact}, paměť jmen ${k.alias}, soubor aliasů ${k.file}, e-mail ${k.email}, bez diakritiky ${k.loose}, prohozeně ${k.swapped}, částečná shoda jména ${k.partial}).`
  );
  if (stats.looseRowNos.length > 0) lines.push(`Spárováno bez diakritiky: řádky ${rowList(stats.looseRowNos)}.`);
  if (stats.swappedRowNos.length > 0) lines.push(`Spárováno prohozeně: řádky ${rowList(stats.swappedRowNos)}.`);
  if (stats.partialRowNos.length > 0) lines.push(`Spárováno částečnou shodou jména: řádky ${rowList(stats.partialRowNos)}.`);
  lines.push(
    `Nespárováno ${stats.unmatchedRowNos.length}` +
      (stats.unmatchedRowNos.length > 0 ? ` (řádky ${rowList(stats.unmatchedRowNos)})` : "") +
      "."
  );
  lines.push(
    `Kódy: P ${stats.codeCounts.P}, L ${stats.codeCounts.L}, S ${stats.codeCounts.S}, A ${stats.codeCounts.A}, M přeskočeno ${stats.medicalSkipped}, prázdné ${stats.emptyCells}.`
  );
  const unknownKeys = Object.keys(stats.unknown).sort();
  if (unknownKeys.length === 0) lines.push("Neznámé kódy: 0.");
  else for (const key of unknownKeys) lines.push(`Neznámý kód ${key}: ${stats.unknown[key]}.`);
  if (stats.rowsWithoutName > 0) lines.push(`Řádky s kódy, ale bez jména: ${stats.rowsWithoutName} (ignorovány).`);
  if (stats.nonThursdayWeeks > 0) lines.push(`Varování: týdnů, které nepřipadají na čtvrtek: ${stats.nonThursdayWeeks}.`);

  lines.push(`Začátek docházky v aplikaci: ${counts.appStart}. Zapisují se jen dny před ním.`);
  lines.push(
    `Řádky (člen a den): ${counts.totalRows}, způsobilé ${counts.eligible}, ` +
      `přeskočeno bez člena ${counts.skipNoMember}, od začátku aplikace ${counts.skipAfterStart}, ` +
      `v době deaktivace přeskočeno: ${counts.skipDeactivated}.`
  );
  lines.push(
    `Záznamy: k zápisu ${counts.newRecords}, už stejné ${counts.sameRecords}, konflikty ${counts.conflicts}. ` +
      `Z toho omluvených absencí ${counts.newAbsences}. Dny k uzavření: ${counts.daysToClose}.`
  );
  if (counts.beforeJoined > 0) lines.push(`Varování: řádků před datem vstupu člena: ${counts.beforeJoined}.`);
  if (counts.conflictRows.length > 0) {
    const shown = counts.conflictRows
      .slice(0, 30)
      .map(([d, r]) => `${d} řádek ${r}`)
      .join("; ");
    const more = counts.conflictRows.length > 30 ? `; další ${counts.conflictRows.length - 30}` : "";
    lines.push(`Konflikty (nepřepsáno): ${shown}${more}.`);
  }
  lines.push(
    `Členů se ${ABSENCE_LIMIT} a více absencemi za 6 měsíců: dnes ${counts.limitNow}, po doplnění ${counts.limitAfter}.`
  );
  lines.push(`Členů, kterým doplnění přidá absenci: ${counts.gaining}.`);
  if (apply && counts.inserted) {
    lines.push(
      `Režim: apply. Zapsáno: záznamů ${counts.inserted.records}, omluv ${counts.inserted.absences}, dnů ${counts.inserted.days}.`
    );
  } else {
    lines.push("Režim: dry-run, nic se nezapsalo.");
  }
  return lines;
}

// ── Ochrany skriptu ──────────────────────────────────────────

export interface CliArgs {
  help: boolean;
  path: string | null;
  apply: boolean;
  aliasFile: string | null;
  showNames: boolean;
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const out: CliArgs = { help: false, path: null, apply: false, aliasFile: null, showNames: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--apply") out.apply = true;
    else if (a === "--show-names") out.showNames = true;
    else if (a === "--alias-file") {
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new PalmsError("Přepínač --alias-file potřebuje cestu.");
      out.aliasFile = v;
    } else if (a.startsWith("-")) {
      throw new PalmsError(`Neznámý přepínač ${a}.`);
    } else if (out.path === null) {
      out.path = a;
    } else {
      throw new PalmsError("Cesta k souboru může být jen jedna.");
    }
  }
  if (!out.help && out.path === null) throw new PalmsError("Chybí cesta k souboru s exportem.");
  return out;
}

function isInside(child: string, parent: string): boolean {
  // /mnt/d (drvfs) nerozlišuje velikost písmen, `realpath` ji nesjednotí.
  const rel = path.relative(parent.toLowerCase(), child.toLowerCase());
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Soubor musí ležet mimo všechny zadané kořeny repa (`path.resolve`, bez symbolických odkazů). */
export function assertOutsideRepo(file: string, repoRoots: readonly string[]): string {
  const resolved = path.resolve(file);
  for (const root of repoRoots) {
    if (isInside(resolved, path.resolve(root))) {
      throw new PalmsError("Soubor musí ležet mimo repozitář.");
    }
  }
  return resolved;
}

/** Host bez portu a v malých písmenech (DNS nerozlišuje velikost písmen). */
function bareHost(host: string): string {
  return host.replace(/:\d+$/, "").toLowerCase();
}

/**
 * `EXPECT_DB_HOST` musí být celý host (bez portu), nebo jeho první DNS label
 * (část před první tečkou), případně první label bez přípony `-pooler`.
 * Podřetězec se nepřijímá, `neon.tech` ani `raspy-sound` hostu neodpovídají.
 */
export function hostMatchesExpect(dbHost: string, expect: string): boolean {
  const host = bareHost(dbHost);
  const want = bareHost(expect.trim());
  if (want.length === 0) return false;
  const label = host.split(".")[0];
  return want === host || want === label || want === label.replace(/-pooler$/, "");
}

/** Před čtením `.env`: `--apply` bez `EXPECT_DB_HOST` (aspoň 6 znaků) nepokračuje. */
export function assertExpectHostGiven(apply: boolean, expectHost: string | undefined): void {
  if (!apply) return;
  if ((expectHost ?? "").trim().length < 6) {
    throw new PalmsError("Pro --apply je povinné EXPECT_DB_HOST (aspoň 6 znaků, celý host nebo jeho první label).");
  }
}

/**
 * `--apply` vyžaduje `EXPECT_DB_HOST`, známý host z `DATABASE_URL` a jejich shodu
 * (viz `hostMatchesExpect`). Bez `--apply` se jen hlídá shoda, když je `EXPECT_DB_HOST` zadané.
 */
export function assertApplyAllowed(apply: boolean, expectHost: string | undefined, dbHost: string | null): void {
  if (!apply) {
    if (expectHost && dbHost !== null && !hostMatchesExpect(dbHost, expectHost)) {
      throw new PalmsError("Host databáze neodpovídá EXPECT_DB_HOST.");
    }
    return;
  }
  assertExpectHostGiven(apply, expectHost);
  if (dbHost === null) throw new PalmsError("Host databáze se z DATABASE_URL nepodařilo zjistit, --apply končí.");
  if (!hostMatchesExpect(dbHost, expectHost ?? "")) throw new PalmsError("Host databáze neodpovídá EXPECT_DB_HOST.");
}

/** Host z `DATABASE_URL` bez uživatele a hesla. */
export function hostOfUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export const ROLLBACK_SQL = `DELETE FROM member_absence ma USING attendance_record r
 WHERE r.source = 'palms' AND r.member_id = ma.member_id AND r.attendance_date = ma.absence_date
   AND ma.created_by IS NULL AND ma.updated_by IS NULL;
DELETE FROM attendance_day ad WHERE EXISTS (SELECT 1 FROM attendance_record r WHERE r.attendance_date = ad.attendance_date AND r.source = 'palms')
   AND NOT EXISTS (SELECT 1 FROM attendance_record r WHERE r.attendance_date = ad.attendance_date AND r.source <> 'palms');
DELETE FROM attendance_record WHERE source = 'palms';`;

export const HELP_TEXT = `Doplnění docházky z exportu PALMS (iter-041, jednorázově).

Použití:
  npx tsx scripts/backfill-iter-041-palms.ts <cesta> [--apply] [--alias-file <cesta>] [--show-names]

  <cesta>          export chapterpalmssummaryattendance_*.xls, MUSÍ ležet mimo repozitář
  --apply          zapíše do databáze (výchozí je dry-run, jen čtení);
                   vyžaduje EXPECT_DB_HOST a host z DATABASE_URL, který jde zjistit;
                   EXPECT_DB_HOST musí být CELÝ host, nebo jeho PRVNÍ label před první tečkou
                   (u Neonu tvar ep-<jméno>-<id>, přípona -pooler se smí vynechat),
                   například EXPECT_DB_HOST=ep-raspy-sound-a1b2c3d4. Podřetězec jako
                   "raspy-sound" nebo "neon.tech" se odmítne.
                   Bez --apply se EXPECT_DB_HOST, je-li zadané, kontroluje stejně.
  --alias-file     JSON mimo repozitář { "řádek 14": "<uuid člena>" } pro ruční párování
  --show-names     přidá jména (nespárované a nepřesně spárované řádky, členové na limitu absencí);
                   jen pro Toma lokálně, do terminálu

DATABASE_URL se načítá z .env.local. Skript neposílá žádné maily, nepíše do provozního logu a nezakládá členy.
Zapisuje jen dny před první docházkou v aplikaci, nic nepřepisuje.
Začátek docházky v aplikaci určují dny zapsané v aplikaci. Den, který má aspoň jeden záznam z PALMS, se do něj nepočítá,
ani když se jeho záznam ručně opravil (oprava nastaví zdroj manager). Skript jde tedy pustit i po ručních opravách doplněných dnů;
existující záznamy, i ručně opravené, nikdy nepřepíše.

Úklid, kdyby se doplnění nepovedlo (jen ručně, s Tomovým souhlasem, v tomto pořadí):

${ROLLBACK_SQL}
`;
