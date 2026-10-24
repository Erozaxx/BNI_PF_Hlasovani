/**
 * iter-033 (T-005, arch T-001 sekce 4, 6, 7, 8): čistá pravidla zásobníku
 * „Master mind“.
 *
 * Čistý modul: žádný import DB, Next ani Resend. Jde spustit v holém Node
 * (tsx) bez DATABASE_URL, viz scripts/test-iter-033-mastermind.ts.
 *
 * Pravidla „kdo smí co“ žijí tady. UI z nich skrývá tlačítka, akce je volá
 * před příkazem a WHERE v lib/db/queries/mastermind.ts je opakuje v DB
 * (autorita je SQL, ne UI).
 *
 * Datumy jsou vždy řetězce „YYYY-MM-DD“ (kalendářní dny, bez časového pásma),
 * „dnešek“ dodává volající z todayInPrague().
 */

import { DEFAULT_CHAPTER_SETTINGS, weekdayOfDate } from "../chapter/settings";

export type CaseStatus = "proposed" | "scheduled" | "presented";

/** Nejvýš tolik otevřených (navržených + zařazených) případů na člena (U14). */
export const CASE_LIMIT = 5;
/** Téma se ohlašuje 14 dní předem, aplikace to nevynucuje (U12, Z4). */
export const NOTICE_DAYS = 14;
/** Nabídka termínů k zařazení (K17): 12 týdnů = 84 dní = přesně 12 pravidelných dnů. */
export const SCHEDULE_WEEKS = 12;
/** Kolik proběhlých se ukáže na přehledu. */
export const PRESENTED_LIMIT = 20;
export const TITLE_MAX = 120;
/** Popis „O čem to bude“: dvě až tři věty, nejvýš tolik znaků. */
export const DESCRIPTION_MAX = 600;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface Actor {
  memberId: string;
  isManagement: boolean;
}

export interface CaseLike {
  memberId: string;
  status: CaseStatus;
  internalDate: string | null;
}

// ── Kalendářní dny ──

/** Platné „YYYY-MM-DD“ (včetně kontroly, že den existuje), jinak null. */
function parseIso(iso: string): { y: number; m: number; d: number } | null {
  if (typeof iso !== "string" || !ISO_DATE_RE.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  return { y, m, d };
}

export function isValidIsoDate(iso: unknown): iso is string {
  return typeof iso === "string" && parseIso(iso) !== null;
}

function dayNumber(iso: string): number {
  const p = parseIso(iso);
  if (!p) throw new Error(`Neplatné datum: ${iso}`);
  return Math.round(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
}

/** Kalendářní dny z `a` do `b` (kladné, když je `b` později). Přes změnu času drží celé dny. */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

export function addDays(iso: string, days: number): string {
  const p = parseIso(iso);
  if (!p) throw new Error(`Neplatné datum: ${iso}`);
  const out = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  const mm = String(out.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(out.getUTCDate()).padStart(2, "0");
  return `${out.getUTCFullYear()}-${mm}-${dd}`;
}

/** Pravidelný den schůzky z nastavení chapteru (iter-042). Bez parametru platí výchozí den. */
const DEFAULT_WEEKDAY = DEFAULT_CHAPTER_SETTINGS.meetingWeekday;

/** Datum `iso` padá na den v týdnu `weekday` (0 = neděle). Neplatné datum = `false`. */
export function isMeetingWeekday(iso: string, weekday: number = DEFAULT_WEEKDAY): boolean {
  return weekdayOfDate(iso) === weekday;
}

const WEEKDAY_SHORT = ["ne", "po", "út", "st", "čt", "pá", "so"];

/** „22. 10.“ */
export function formatDM(iso: string): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return `${p.d}. ${p.m}.`;
}

/** „22. 10. 2026“ */
export function formatDMY(iso: string): string {
  const p = parseIso(iso);
  if (!p) return iso;
  return `${p.d}. ${p.m}. ${p.y}`;
}

/** „čt 22. 10.“ */
export function formatWeekdayDM(iso: string): string {
  const p = parseIso(iso);
  if (!p) return iso;
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${WEEKDAY_SHORT[wd]} ${p.d}. ${p.m}.`;
}

// ── Limit a lhůta ──

/** Do limitu se počítá navržený a zařazený případ, proběhlý ne (U14). */
export function countsTowardLimit(status: CaseStatus): boolean {
  return status === "proposed" || status === "scheduled";
}

/** Kalendářní dny do interní (záporné, když už byla). */
export function noticeDays(internalDate: string, todayPrague: string): number {
  return daysBetween(todayPrague, internalDate);
}

export function isShortNotice(internalDate: string, todayPrague: string): boolean {
  return noticeDays(internalDate, todayPrague) < NOTICE_DAYS;
}

// ── Kdo smí co (4.3) ──

/** Zájem smí dát každý mimo autora, dokud případ neproběhl (U5, K10). */
export function canSetInterest(actor: Actor, c: CaseLike): boolean {
  if (c.memberId === actor.memberId) return false;
  return c.status === "proposed" || c.status === "scheduled";
}

/**
 * Úprava: autor navržený kdykoli a zařazený do dne před interní, vedení
 * cokoli, co ještě neproběhlo (K3 A).
 */
export function canEdit(actor: Actor, c: CaseLike, todayPrague: string): boolean {
  if (c.status === "presented") return false;
  if (actor.isManagement) return true;
  if (c.memberId !== actor.memberId) return false;
  if (c.status === "proposed") return true;
  return c.internalDate !== null && c.internalDate > todayPrague;
}

/** Odstranění: autor jen navržený, vedení navržený i zařazený (K3 A). */
export function canRemove(actor: Actor, c: CaseLike): boolean {
  if (c.status === "presented") return false;
  if (actor.isManagement) return true;
  return c.memberId === actor.memberId && c.status === "proposed";
}

export function canSchedule(actor: Actor, c: CaseLike): boolean {
  return actor.isManagement && c.status === "proposed";
}

export function canUnschedule(actor: Actor, c: CaseLike): boolean {
  return actor.isManagement && c.status === "scheduled";
}

/**
 * Potvrzení „Proběhlo“ až v den interní nebo po ní. iter-041 (gate Z10): vedení
 * nepotvrdí VLASTNÍ případ, protože odprezentovaný případ dává bonus do
 * semaforu (7 bodů) a vedoucí by si dobarvoval sám. SQL protějšek má stejnou
 * podmínku (`confirmPresentedGuarded`), tohle je jen skrytí tlačítka a hláška.
 */
export function canConfirm(actor: Actor, c: CaseLike, todayPrague: string): boolean {
  return (
    actor.isManagement &&
    c.memberId !== actor.memberId &&
    c.status === "scheduled" &&
    c.internalDate !== null &&
    c.internalDate <= todayPrague
  );
}

export function canUndoPresented(actor: Actor, c: CaseLike): boolean {
  return actor.isManagement && c.status === "presented";
}

// ── Zařazení na pravidelný den (3.5) ──

/** Poslední (vyloučený) den okna: dnešek + 84 dní. */
function windowEnd(todayPrague: string, weeks: number): string {
  return addDays(todayPrague, weeks * 7);
}

/**
 * Pravidelný den schůzky (z nastavení, výchozí den bez parametru), ne dřív než dnes a v
 * okně 12 týdnů (K17). DB to nehlídá, aby přesun interní na jiný den nebo delší
 * okno nepotřebovalo migraci.
 */
export function isSchedulableDate(
  date: string,
  todayPrague: string,
  weeks: number = SCHEDULE_WEEKS,
  weekday: number = DEFAULT_WEEKDAY
): boolean {
  if (!isValidIsoDate(date) || !isValidIsoDate(todayPrague)) return false;
  if (!isMeetingWeekday(date, weekday)) return false;
  if (date < todayPrague) return false;
  return date < windowEnd(todayPrague, weeks);
}

export type DayState = "free" | "open-meeting" | "taken";

export interface DayOption {
  date: string;
  state: DayState;
  shortNotice: boolean;
}

/**
 * Pravidelné dny od dneška (včetně, když je dnes ten den) na 12 týdnů dopředu.
 * `open-meeting` má přednost před `taken`: otevřená schůzka na ten den
 * zakazuje výběr v obou případech a upozornění je pro vedení důležitější.
 */
export function dayOptions(
  todayPrague: string,
  openMeetingDates: readonly string[],
  takenDates: readonly string[],
  weeks: number = SCHEDULE_WEEKS,
  weekday: number = DEFAULT_WEEKDAY
): DayOption[] {
  const open = new Set(openMeetingDates);
  const taken = new Set(takenDates);
  const end = windowEnd(todayPrague, weeks);
  const out: DayOption[] = [];
  for (let d = todayPrague; d < end; d = addDays(d, 1)) {
    if (!isMeetingWeekday(d, weekday)) continue;
    out.push({
      date: d,
      state: open.has(d) ? "open-meeting" : taken.has(d) ? "taken" : "free",
      shortNotice: isShortNotice(d, todayPrague),
    });
  }
  return out;
}

// ── Popisky (4.2) ──

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

export interface InterestLabels {
  /** Počet u karty, např. „3 zájemci“. */
  countText: (n: number) => string;
  /** Text tlačítka, když člen zájem / přihlášku ještě nemá; null = tlačítko není. */
  buttonOn: string | null;
  /** Text tlačítka, když ho už má. */
  buttonOff: string | null;
  /** Stav u počtu (role="status"). */
  stateText: string | null;
  /** Nadpis seznamu jmen po rozkliknutí. */
  namesLabel: string;
  /** Záhlaví rozbalené části karty. */
  summaryText: string;
  /** Zda se řádek smí měnit. */
  editable: boolean;
}

export function interestLabels(status: CaseStatus): InterestLabels {
  if (status === "proposed") {
    return {
      countText: (n) => `${n} ${plural(n, "zájemce", "zájemci", "zájemců")}`,
      buttonOn: "Mám zájem",
      buttonOff: "Zrušit zájem",
      stateText: "Máš zájem",
      namesLabel: "Zájem mají",
      summaryText: "Popis a zájemci",
      editable: true,
    };
  }
  if (status === "scheduled") {
    return {
      countText: (n) => `${n} ${plural(n, "účastník", "účastníci", "účastníků")}`,
      buttonOn: "Přihlásit se",
      buttonOff: "Odhlásit se",
      stateText: "Jsi přihlášený(á)",
      namesLabel: "Přihlášení",
      summaryText: "Popis a účastníci",
      editable: true,
    };
  }
  return {
    countText: (n) => `${n} ${plural(n, "účastník", "účastníci", "účastníků")}`,
    buttonOn: null,
    buttonOff: null,
    stateText: null,
    namesLabel: "Přihlášení",
    summaryText: "Popis a účastníci",
    editable: false,
  };
}

// ── Validace vstupu (7.5, 4.1) ──

export interface CaseInput {
  title: string;
  /** Popis „O čem to bude“ (sloupec `situation`). */
  situation: string;
}

/** `path`, `takeaway` a `ask` se ukládají vždy jako NULL (iter-034). */
export interface CleanCaseInput {
  title: string;
  situation: string;
  path: null;
  takeaway: null;
  ask: null;
}

export type CaseInputResult =
  | { ok: true; value: CleanCaseInput }
  | { ok: false; error: string };

const TITLE_LINK_RE = /(https?:\/\/|www\.)/i;
const MESSAGES_TITLE_LINK = "Do tématu nepatří odkaz.";

/**
 * `trim`, povinné téma a popis, délky 120 a 600. Čte jen `title` a
 * `situation`: cokoli jiného z formuláře (staré body osnovy) se zahodí.
 */
export function validateCaseInput(input: Partial<CaseInput> | null | undefined): CaseInputResult {
  const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  // Téma je jednořádkové: všechny bílé znaky a nové řádky splynou v jednu mezeru (L-3).
  const title = str(input?.title).replace(/\s+/g, " ");
  const situation = str(input?.situation);

  if (title.length === 0) return { ok: false, error: "Vyplň téma případu." };
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Téma může mít nejvýš ${TITLE_MAX} znaků.` };
  }
  if (TITLE_LINK_RE.test(title)) return { ok: false, error: MESSAGES_TITLE_LINK };
  if (situation.length === 0) return { ok: false, error: "Napiš, o čem to bude." };
  if (situation.length > DESCRIPTION_MAX) {
    return { ok: false, error: `O čem to bude: nejvýš ${DESCRIPTION_MAX} znaků.` };
  }
  return {
    ok: true,
    value: { title, situation, path: null, takeaway: null, ask: null },
  };
}

/**
 * Popis případu k zobrazení a úpravě. Starší případy mají text rozdělený do
 * čtyř sloupců, nové jen do `situation`. Neprázdné části se spojí prázdným
 * řádkem, bez nadpisů a bez pomlček u prázdných.
 */
export function caseDescription(c: {
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
}): string {
  return [c.situation, c.path, c.takeaway, c.ask]
    .map((v) => (v ?? "").trim())
    .filter((v) => v.length > 0)
    .join("\n\n");
}

// ── Dashboard (8.1, Z5) ──

export interface DashboardCaseRow {
  id: string;
  presenterId: string;
  presenterName: string;
  title: string;
  internalDate: string;
  listenerCount: number;
  /** Přihlášený člen má u případu řádek v `mastermind_interest`. */
  listening: boolean;
}

export interface DashboardSummary {
  /** Nejbližší zařazený případ s datem dnes nebo později. */
  next: DashboardCaseRow | null;
  /** Nejbližší zařazený případ, který přináší přihlášený člen. */
  mine: DashboardCaseRow | null;
  /** Nejbližší zařazený případ, na který je přihlášený účastníkem (ne vlastní). */
  listening: DashboardCaseRow | null;
  /** Zařazené případy s datem před dneškem, čekají na potvrzení. */
  awaitingConfirm: number;
}

export function summarizeDashboard(
  rows: readonly DashboardCaseRow[],
  memberId: string,
  todayPrague: string
): DashboardSummary {
  const sorted = [...rows].sort((a, b) =>
    a.internalDate < b.internalDate ? -1 : a.internalDate > b.internalDate ? 1 : a.id < b.id ? -1 : 1
  );
  const upcoming = sorted.filter((r) => r.internalDate >= todayPrague);
  return {
    next: upcoming[0] ?? null,
    mine: upcoming.find((r) => r.presenterId === memberId) ?? null,
    listening: upcoming.find((r) => r.listening && r.presenterId !== memberId) ?? null,
    awaitingConfirm: sorted.length - upcoming.length,
  };
}

// ── Texty hlášek (sdílené akcemi a testy) ──

/**
 * iter-042 (#14, #15, #31, gate sekce 6): texty potvrzení a popisků vedení.
 * UI tyká. Věta o bonusu jen při zapnutém semaforu (Z3), bez počtu bodů.
 */
export const UI_TEXTS = {
  confirmPresented: (bonusOn: boolean) =>
    bonusOn
      ? "Potvrdit, že případ proběhl? Autor za něj dostane bonus do interního semaforu."
      : "Potvrdit, že případ proběhl?",
  confirmUnschedule: "Vrátit případ do zásobníku? Termín se uvolní a přihlášení se vrátí mezi zájemce.",
  awaitingIntro: "Termín už byl. Potvrď, že případ proběhl, nebo ho vrať do zásobníku.",
  pickDay: "Vyber termín",
  optionOpenMeeting: "(schůzka s hosty)",
  optionTaken: "(už má jiný případ)",
  scheduleHint: "Případ se ukáže v Na řadě u vybraného dne a ze zájemců se stanou přihlášení.",
  collision: "Na tento den je v aplikaci otevřená schůzka. Přesuň případ, nebo zkontroluj datum schůzky.",
  removeButton: "Smazat případ",
  removeConfirmScheduled: "Smazat zařazený případ? Přihlášení účastníci o něj přijdou.",
  removeConfirmProposed: "Smazat případ? Smaže se i zájem ostatních.",
  removed: "Případ je smazaný.",
  removeFailed: "Případ se nepodařilo smazat.",
} as const;

export const MESSAGES = {
  limitSelf:
    "Máš už 5 otevřených případů. Počkej, až některý proběhne, nebo jeden smaž.",
  limitOther: (name: string) => `${name} má už 5 otevřených případů.`,
  notFound: "Případ už neexistuje.",
  // iter-037 (T-003b, gate sekce 5): téma neaktivního člena je skryté i pro vedení.
  unavailable: "Téma teď není k dispozici.",
  // iter-037 (security L-3): vedení nezapisuje případ za neaktivního člena.
  memberInactive: "Člen je neaktivní, případ za něj zapsat nejde.",
  cannotEdit: "Případ už nejde upravit.",
  cannotRemove: "Případ už nejde smazat.",
  ownInterest: "Vlastní případ nejde označit zájmem.",
  presentedInterest: "Případ už proběhl, zájem nejde měnit.",
  forOtherByManagementOnly: "Případ za jiného člena zapíše jen vedení.",
  takenDate: "Na tenhle den už je případ.",
  openMeetingDate: "Na tenhle den je otevřená schůzka.",
  badDate: "Vyber termín v nabídce.",
  notProposed: "Případ už není v zásobníku.",
  notScheduled: "Případ už není zařazený.",
  cannotConfirm: "Proběhlo jde potvrdit až v den interní.",
  /** iter-041 (Z10): shodné s `SEMAFOR_TEXTS.mmOwnCase`, test to hlídá. */
  ownCase: "Vlastní případ potvrdí jiný člen vedení.",
  notPresented: "Případ ještě neproběhl.",
  undoLimit: (name: string) =>
    `${name} má už 5 otevřených případů, potvrzení vrátit nejde. Nejdřív některý smažte nebo potvrďte, že proběhl.`,
  invalidInput: "Neplatný vstup.",
  denied: "Na tuhle akci nemáš oprávnění.",
  generic: "Akci se nepodařilo provést.",
} as const;
