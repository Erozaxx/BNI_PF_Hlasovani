/**
 * iter-038 (T-003b, arch 3.3, 6, 8, 13, gate Z2 a Z5): čistá logika zápisu
 * správce, přehledu a auditu. Režim zápisu, validace těla požadavku, souhrn,
 * fronta požadavků jednoho řádku (verze řádku), překlad hodnot auditu a texty
 * správce (gate sekce 5, doslova).
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * Bezpečné pro scripts/test-iter-038-attendance.ts i pro klientské komponenty.
 */

import { addDaysToDateString, formatCzDate, isValidDateString } from "@/lib/members/activity";
import {
  MAX_ADVANCE_DAYS,
  MEMBER_TEXTS,
  formatWeekdayLong,
  validateSubstituteName,
} from "@/lib/attendance/rules";

// ── Texty správce (gate sekce 5, doslova) ────────────────────

export const SHEET_TEXTS = {
  filterAll: "Všichni",
  filterOpen: "Nezaškrtnutí",
  present: "Přítomen",
  withSubstitute: "s náhradníkem",
  excused: "Omluven(a)",
  saving: "ukládá se",
  nameLabel: "Jméno náhradníka",
  errSave: "Neuložilo se. Zkus to znovu.",
  errClosed: "Den je uzavřený. Opravy dělá admin, Prezident nebo Viceprezident.",
  errFutureDay: "Přítomnost se zapisuje v den schůzky.",
  errInactive: "Člen je neaktivní.",
  /** Mimo gate sekci 5: zápis bez práva `attendance.record` a bez `edit_history`. */
  errNoRecord: "Docházku zapisovat nemůžeš.",
  noMeeting: "Na dnešek není v aplikaci založená schůzka.",
  writeAnyway: "Zapisovat i tak",
  closedBanner: "Den je uzavřený.",
  unrecordedBanner:
    "Docházka se ten den nezapisovala. Počítají se jen ohlášené nepřítomnosti bez náhradníka.",
  auditTitle: "Historie oprav",
  /** Mimo gate sekci 5: prázdná historie, stejný zápis jako u prázdných seznamů. */
  auditEmpty: "–",
  /** Mimo gate sekci 5: původní hodnota, když pro den ještě nebyl žádný řádek. */
  auditNoRecord: "Bez záznamu",
  meetingLink: "Docházka tohoto dne",
  prevDay: "‹ den",
  nextDay: "den ›",
  showDay: "Zobrazit",
  dateLabel: "Datum",
} as const;

/**
 * Hláška při konfliktu verze (gate sekce 5). Řádek doplněný uzávěrkou cronu nemá
 * autora (`updated_by NULL`), pak se nepíše, že ho změnil správce.
 */
export function conflictText(updatedByName: string | null): string {
  return updatedByName
    ? `Mezitím to změnil(a) ${updatedByName}. Zkontroluj řádek a klikni znovu.`
    : "Mezitím se to změnilo. Zkontroluj řádek a klikni znovu.";
}

export const OVERVIEW_TEXTS = {
  title: "Přehled docházky",
  tabMine: "Moje",
  tabSheet: "Zápis",
  tabPlan: "Omluvy",
  tabOverview: "Přehled",
  membersTitle: "Členové",
  absencesLabel: "absence",
  substitutesLabel: "náhradníci",
  daysTitle: "Uzavřené dny",
  daysEmpty: "Zatím žádný uzavřený den.",
  detailDays: "Dny za posledních 6 měsíců",
  detailDaysEmpty: "–",
  detailUpcoming: "Ohlášené budoucí nepřítomnosti",
  detailHistory: "Historie oprav",
  back: "Zpět na přehled",
} as const;

/** Hlavička stránky zápisu: „Docházka · čtvrtek 22. 10. 2026“. */
export function sheetTitle(date: string): string {
  return `Docházka · ${formatWeekdayLong(date)}`;
}

// ── Režim zápisu (arch 6.1) ──────────────────────────────────

export type PresenceStatus = "present" | "substitute" | "absent";
export type WriteMode = "normal" | "history" | "denied";
export type WriteOp = "presence" | "excuse";

export interface WriteCan {
  record: boolean;
  editHistory: boolean;
}

export interface WriteModeDecision {
  mode: WriteMode;
  /** Hláška pro `denied`, jinak `null`. */
  message: string | null;
}

/**
 * Režim zápisu rozhoduje server, ne klient (arch 6.1). `normal` má přednost,
 * `history` jen když `normal` nejde a volající má `attendance.edit_history`.
 *
 * - budoucí den: přítomnost nikdy; cizí nepřítomnost („Omluven(a)“) jen jako
 *   oprava (`history`), do dnes + 365
 * - dnes, den neuzavřený, právo `record`: `normal`
 * - jinak (uzavřený nebo minulý den, nebo dnes bez `record`): `history` s právem
 *   `edit_history`, jinak `denied`
 */
export function decideAttendanceWriteMode(input: {
  date: string;
  today: string;
  finalized: boolean;
  can: WriteCan;
  op?: WriteOp;
}): WriteModeDecision {
  const { date, today, finalized, can } = input;
  const op = input.op ?? "presence";
  if (date > addDaysToDateString(today, MAX_ADVANCE_DAYS)) {
    return { mode: "denied", message: MEMBER_TEXTS.errTooFar };
  }
  if (date > today) {
    if (op === "excuse" && can.editHistory) return { mode: "history", message: null };
    return { mode: "denied", message: SHEET_TEXTS.errFutureDay };
  }
  if (date === today && !finalized && can.record) return { mode: "normal", message: null };
  if (can.editHistory) return { mode: "history", message: null };
  if (date === today && !finalized) return { mode: "denied", message: SHEET_TEXTS.errNoRecord };
  return { mode: "denied", message: SHEET_TEXTS.errClosed };
}

/**
 * Banner nad seznamem podle režimu a stavu dne (gate sekce 5). `finalizedTime`
 * je pražský čas uzavření („17:04“), `null` když den uzavřený není.
 */
export function dayBannerText(input: {
  mode: WriteMode;
  date: string;
  today: string;
  finalized: boolean;
  finalizedTime: string | null;
}): string | null {
  const { mode, date, today, finalized, finalizedTime } = input;
  if (mode === "history") {
    const tail = "Opravy se zapisují do historie, report se znovu neposílá.";
    return finalized && finalizedTime ? `Report odešel v ${finalizedTime}. ${tail}` : tail;
  }
  if (mode === "denied") {
    if (date > today) return SHEET_TEXTS.errFutureDay;
    if (finalized || date < today) return SHEET_TEXTS.closedBanner;
  }
  return null;
}

// ── Řádek zápisu ─────────────────────────────────────────────

/** Cílový stav řádku, který klient posílá spolu s verzí (arch 6.2). */
export interface PresenceTarget {
  status: PresenceStatus;
  substituteName: string | null;
}

export interface SheetRow {
  memberId: string;
  name: string;
  /** `null` = pro den zatím není řádek (verze 0). */
  status: PresenceStatus | null;
  substituteName: string | null;
  version: number;
  updatedById: string | null;
  updatedByName: string | null;
  /** ISO čas poslední změny, `null` bez řádku. */
  updatedAt: string | null;
  /** Člen má na den ohlášenou nepřítomnost (řádek v `member_absence`). */
  excused: boolean;
  /** Jméno ohlášeného náhradníka, `null` = bez náhradníka. */
  announcedName: string | null;
  /** Dřívější jména náhradníků člena (nejvýš 8, nejnovější první). */
  names: string[];
}

export function rowChecked(row: SheetRow): boolean {
  return row.status === "present" || row.status === "substitute";
}

/**
 * Cíl po zaškrtnutí „Přítomen“: ohlášený náhradník se vyplní sám (arch 6.2,
 * klient posílá `substitute` s jménem z `member_absence`), jinak `present`.
 */
export function targetOnCheck(row: SheetRow): PresenceTarget {
  if (row.announcedName) return { status: "substitute", substituteName: row.announcedName };
  return { status: "present", substituteName: null };
}

/** Odškrtnutí „Přítomen“ = explicitní řádek `absent`. */
export const TARGET_ABSENT: PresenceTarget = { status: "absent", substituteName: null };

export function targetsEqual(a: PresenceTarget | null, b: PresenceTarget | null): boolean {
  if (!a || !b) return a === b;
  return a.status === b.status && (a.substituteName ?? null) === (b.substituteName ?? null);
}

/** „Ohlásil(a): bez náhradníka“ / „Ohlásil(a): náhradník {jméno}“, `null` bez ohlášení. */
export function announcedText(row: Pick<SheetRow, "excused" | "announcedName">): string | null {
  if (!row.excused) return null;
  return row.announcedName
    ? `Ohlásil(a): náhradník ${row.announcedName}`
    : "Ohlásil(a): bez náhradníka";
}

export interface SheetSummary {
  total: number;
  present: number;
  substitutes: number;
  missing: number;
  excused: number;
}

/**
 * Souhrn dne. Přítomno = přišel sám nebo náhradník (obsazené místo), chybí =
 * ostatní, omluveno = z chybějících ti, kdo mají ohlášenou nepřítomnost.
 */
export function summarizeSheet(
  rows: readonly Pick<SheetRow, "status" | "excused">[]
): SheetSummary {
  let present = 0;
  let substitutes = 0;
  let excused = 0;
  for (const r of rows) {
    if (r.status === "present" || r.status === "substitute") {
      present++;
      if (r.status === "substitute") substitutes++;
    } else if (r.excused) {
      excused++;
    }
  }
  return { total: rows.length, present, substitutes, missing: rows.length - present, excused };
}

/** „Přítomno {p} z {n} · náhradníci {s} · chybí {a} (omluveno {o})“ */
export function summaryText(s: SheetSummary): string {
  return `Přítomno ${s.present} z ${s.total} · náhradníci ${s.substitutes} · chybí ${s.missing} (omluveno ${s.excused})`;
}

// ── Požadavek na zápis (arch 6.1, validace) ──────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WriteBody =
  | {
      op: "presence";
      memberId: string;
      status: PresenceStatus;
      substituteName: string | null;
      expectedVersion: number;
    }
  | { op: "excuse"; memberId: string; excused: boolean };

export type WriteBodyResult = { ok: true; value: WriteBody } | { ok: false; error: string };

const INVALID_INPUT = "Neplatný vstup.";

/**
 * Tělo POST: `date` se ověřuje zvlášť (je v cestě). `substitute` vyžaduje
 * jméno 2 až 80 znaků, `present` a `absent` jméno zahodí.
 */
export function parseWriteBody(raw: unknown): WriteBodyResult {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: INVALID_INPUT };
  const b = raw as Record<string, unknown>;
  if (typeof b.memberId !== "string" || !UUID_RE.test(b.memberId)) {
    return { ok: false, error: INVALID_INPUT };
  }
  if (b.op === "excuse") {
    if (typeof b.excused !== "boolean") return { ok: false, error: INVALID_INPUT };
    return { ok: true, value: { op: "excuse", memberId: b.memberId, excused: b.excused } };
  }
  if (b.op !== "presence") return { ok: false, error: INVALID_INPUT };
  if (b.status !== "present" && b.status !== "substitute" && b.status !== "absent") {
    return { ok: false, error: INVALID_INPUT };
  }
  const v = b.expectedVersion;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 1_000_000) {
    return { ok: false, error: INVALID_INPUT };
  }
  let substituteName: string | null = null;
  if (b.status === "substitute") {
    const name = validateSubstituteName(b.substituteName);
    if (!name.ok) return { ok: false, error: name.error };
    substituteName = name.value;
  }
  return {
    ok: true,
    value: {
      op: "presence",
      memberId: b.memberId,
      status: b.status,
      substituteName,
      expectedVersion: v,
    },
  };
}

/** Datum z cesty nebo z `?d=`: platné `YYYY-MM-DD`, jinak `null`. */
export function parseSheetDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return isValidDateString(value) ? value : null;
}

// ── Fronta požadavků jednoho řádku (arch 6.2, test 15) ───────

export interface RowSync {
  /** Verze řádku, kterou klient naposledy viděl a pošle jako `expectedVersion`. */
  version: number;
  /** Cíl právě odeslaného požadavku. */
  inFlight: PresenceTarget | null;
  /** Poslední cíl, který čeká na odpověď předchozího (starší čekající se zahazují). */
  queued: PresenceTarget | null;
}

export interface SendPlan {
  target: PresenceTarget;
  expectedVersion: number;
}

export function newRowSync(version: number): RowSync {
  return { version, inFlight: null, queued: null };
}

/**
 * Klik na řádek. Když už jeden požadavek letí, nový cíl čeká (a přepíše
 * dřívější čekající), takže rychlé dvojí kliknutí neodešle dvakrát stejnou
 * verzi a nevyrobí falešný konflikt.
 */
export function enqueueTarget(
  sync: RowSync,
  target: PresenceTarget
): { sync: RowSync; send: SendPlan | null } {
  if (sync.inFlight) return { sync: { ...sync, queued: target }, send: null };
  return {
    sync: { ...sync, inFlight: target },
    send: { target, expectedVersion: sync.version },
  };
}

export type SyncResponse =
  | { kind: "ok"; version: number }
  /** `target` = stav řádku na serveru (`null` = řádek tam není). */
  | { kind: "conflict"; version: number; target: PresenceTarget | null }
  | { kind: "error" };

export interface NextRequest {
  sync: RowSync;
  /** Další požadavek, který se má poslat (s verzí z této odpovědi). */
  send: SendPlan | null;
  /** Zobrazit hlášku o změně od jiného správce. */
  showConflict: boolean;
  /** Přepsat lokální stav řádku serverovým (konflikt nebo chyba). */
  adoptServer: boolean;
}

/**
 * Odpověď na odeslaný požadavek. `ok`: další čekající cíl jde s verzí z
 * odpovědi. `conflict`: čekající cíl se zahodí, lokální stav se přepíše
 * serverovým a rozhodne se znovu; hláška se neukáže, když server už má stejný
 * cíl, jaký se posílal (arch 6.5, 7:31:02). `error`: zahodí se i čekající.
 */
export function nextRequest(sync: RowSync, response: SyncResponse): NextRequest {
  if (response.kind === "ok") {
    const base: RowSync = { version: response.version, inFlight: null, queued: null };
    if (sync.queued) {
      return {
        sync: { ...base, inFlight: sync.queued },
        send: { target: sync.queued, expectedVersion: response.version },
        showConflict: false,
        adoptServer: false,
      };
    }
    return { sync: base, send: null, showConflict: false, adoptServer: false };
  }
  if (response.kind === "conflict") {
    return {
      sync: { version: response.version, inFlight: null, queued: null },
      send: null,
      showConflict: !targetsEqual(sync.inFlight, response.target),
      adoptServer: true,
    };
  }
  return {
    sync: { version: sync.version, inFlight: null, queued: null },
    send: null,
    showConflict: false,
    adoptServer: true,
  };
}

// ── Audit (arch 13) ──────────────────────────────────────────

export interface AuditRow {
  id: string;
  /** ISO čas zápisu. */
  at: string;
  actorName: string;
  memberName: string;
  /** Den, kterého se oprava týká, `YYYY-MM-DD`. */
  date: string;
  field: "presence" | "absence";
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Strojová hodnota auditu → text (gate sekce 5): `present` Přítomen, `absent`
 * Nepřítomen, `substitute:X` Náhradník X, `none` Bez omluvy, `absence`
 * Omluven(a), bez náhradníka, `absence:X` Omluven(a), náhradník X. `null` =
 * pro den ještě nebyl řádek.
 */
export function auditValueText(value: string | null): string {
  if (value === null) return SHEET_TEXTS.auditNoRecord;
  if (value === "present") return "Přítomen";
  if (value === "absent") return "Nepřítomen";
  if (value === "none") return "Bez omluvy";
  if (value === "absence") return "Omluven(a), bez náhradníka";
  if (value.startsWith("substitute:")) return `Náhradník ${value.slice("substitute:".length)}`;
  if (value.startsWith("absence:")) {
    return `Omluven(a), náhradník ${value.slice("absence:".length)}`;
  }
  return value;
}

const PRAGUE_DT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function pragueParts(iso: string): Record<string, string> | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const out: Record<string, string> = {};
  for (const p of PRAGUE_DT.formatToParts(d)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

/** „9:14“ (pražský čas, hodina bez nuly). Nečitelné datum dá prázdný řetězec. */
export function formatPragueTime(iso: string): string {
  const p = pragueParts(iso);
  if (!p) return "";
  return `${Number(p.hour)}:${p.minute}`;
}

/** „21. 10. 2026 9:14“ */
export function formatPragueDateTime(iso: string): string {
  const p = pragueParts(iso);
  if (!p) return "";
  return `${Number(p.day)}. ${Number(p.month)}. ${p.year} ${Number(p.hour)}:${p.minute}`;
}

/** „15. 10.“ z `YYYY-MM-DD`. */
function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d}. ${m}.`;
}

/**
 * Řádek historie oprav (gate sekce 5):
 * „21. 10. 2026 9:14 · {jméno} opravil(a) u {člen} den 15. 10.: Přítomen → Náhradník {jméno}“
 */
export function auditLine(row: AuditRow): string {
  return `${formatPragueDateTime(row.at)} · ${row.actorName} opravil(a) u ${row.memberName} den ${shortDate(
    row.date
  )}: ${auditValueText(row.oldValue)} → ${auditValueText(row.newValue)}`;
}

/** Čitelný den pro hlavičky přehledu, např. „22. 10. 2026“. */
export function overviewDate(date: string): string {
  return formatCzDate(date);
}

// ── Odpověď pro zápis dne (GET i první vykreslení) ───────────

export interface DayPayload {
  date: string;
  /** Dnešek v Praze, `YYYY-MM-DD`. */
  today: string;
  /** Prohlížející (pro „změnil(a) {jméno}“ jen u cizí změny). */
  viewerId: string;
  /** Režim zápisu přítomnosti. */
  mode: WriteMode;
  /** Režim „Omluven(a)“ (u budoucích dnů jde jen jako oprava). */
  excuseMode: WriteMode;
  /** Banner nad seznamem, `null` = žádný. */
  banner: string | null;
  /** Den se nezapisoval a byl uzavřen jako `unrecorded`. */
  unrecorded: boolean;
  /** Z2: dnešek bez založené schůzky a bez zápisu, zatržítka čekají na „Zapisovat i tak“. */
  guardUnrecordedDay: boolean;
  /** iter-040 (M9): druh dne, `internal` = interní schůzka bez běžné. */
  dayKind: "meeting" | "internal" | "none";
  finalized: boolean;
  rows: SheetRow[];
  /** Historie oprav dne, `null` bez práva `attendance.audit_view`. */
  audit: AuditRow[] | null;
}

/**
 * Z2 (gate): dnešní den bez schůzky v aplikaci (běžné i interní) a bez jediného řádku zapsaného
 * správcem. Jen UI pojistka, server zápis nechává (K5 A).
 */
export function isGuardedDay(input: {
  date: string;
  today: string;
  mode: WriteMode;
  hasMeeting: boolean;
  /** iter-040: na den je interní schůzka. */
  hasInternal: boolean;
  hasManagerRecord: boolean;
}): boolean {
  return (
    input.date === input.today &&
    input.mode === "normal" &&
    !input.hasMeeting &&
    !input.hasInternal &&
    !input.hasManagerRecord
  );
}
