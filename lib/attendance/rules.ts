/**
 * iter-038 (T-003a, arch 3, 7, 12, gate Z5): čistá pravidla docházky. Časy,
 * uzávěrka člena, okno absencí, validace jména náhradníka, kalendářní pomocníci
 * a texty člena (gate sekce 5, doslova).
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend. Bezpečné
 * pro scripts/test-iter-038-attendance.ts i pro klientské komponenty.
 *
 * Den docházky je kalendářní datum v Europe/Prague (`YYYY-MM-DD`). Pravidla
 * chapteru: tři absence za posledních 6 měsíců, náhradník ani schválené volno
 * absence nejsou (`/pravidla/absence`, memory `project_praxe_chapteru`).
 */

import {
  addDaysToDateString,
  formatCzDate,
  isValidDateString,
  pragueToday,
} from "@/lib/members/activity";

/**
 * iter-041 (arch 7.3): stavy záznamu, které se počítají jako absence. Jediné
 * místo pravdy pro TS (SQL protějšek je `absenceStatusSql` v
 * lib/db/queries/attendance.ts). `unexcused` = „Chyběl(a) bez omluvy“.
 */
export const ABSENCE_STATUSES = ["absent", "unexcused"] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];

export function isAbsenceStatus(status: string | null | undefined): status is AbsenceStatus {
  return status === "absent" || status === "unexcused";
}

/** Zdroje záznamu docházky (`attendance_record.source`); `palms` = doplnění z PALMS (iter-041). */
export const RECORD_SOURCES = ["manager", "auto", "palms"] as const;

/** Začátek schůzky (pražský čas), stejný pro každý den (K4). Zdroj: `/pravidla/absence`. */
export const ATTENDANCE_START = "07:30";

/** Nejdál smí být ohlášená nepřítomnost: dnes + 365 dní (K3). */
export const MAX_ADVANCE_DAYS = 365;

/** Limit absencí za okno (pravidla: čtvrtou může řešit výbor). */
export const ABSENCE_LIMIT = 3;

/** Okno absencí v měsících (plovoucí). */
export const ABSENCE_WINDOW_MONTHS = 6;

/** Kolik jmen náhradníků si aplikace pamatuje na člena; nejstarší vypadnou (security L-2). */
export const SUBSTITUTE_NAME_MEMORY_LIMIT = 20;

export const NAME_MIN = 2;
export const NAME_MAX = 80;

/** Texty člena, doslova z gate sekce 5. Test hlídá znění i absenci U+2014. */
export const MEMBER_TEXTS = {
  title: "Docházka",
  intro: "Když na schůzku nemůžeš, dej vědět tady. Bez záznamu počítáme, že přijdeš.",
  optionPresent: "Přijdu",
  optionAbsent: "Nepřijdu, bez náhradníka",
  optionSubstitute: "Nepřijdu, pošlu náhradníka",
  nameLabel: "Jméno náhradníka",
  save: "Uložit",
  recentNames: "Dřív:",
  legend:
    "Modrý den je běžná schůzka s hosty, zelený den interní schůzka. ● nepřijdu, ◐ pošlu náhradníka.",
  legendPast: "✓ přítomen, N náhradník, A absence",
  closedPanel: "Na tenhle den už změnu zapíše jen správce docházky.",
  listTitle: "Ohlášené nepřítomnosti",
  listEmpty: "–",
  cancel: "Zrušit",
  change: "Změnit",
  savedNamesTitle: "Uložená jména náhradníků",
  toastSaved: "Uloženo.",
  toastCancelled: "Nepřítomnost zrušena.",
  toastNameForgotten: "Jméno smazáno ze seznamu.",
  errClosed: "Na tenhle den už změnu zapíše jen správce docházky.",
  errTooFar: "Nepřítomnost jde ohlásit nejvýš rok dopředu.",
  errNameEmpty: "Napiš jméno náhradníka.",
  errNameShort: "Jméno náhradníka je moc krátké.",
  errNameLong: "Jméno náhradníka je moc dlouhé.",
  /** Mimo gate sekci 5: jediný případ, který sekce nepokrývá (řídicí znaky ve jménu). */
  errNameChars: "Jméno náhradníka obsahuje nepovolené znaky.",
  absenceListTitle: "Absence za posledních 6 měsíců",
} as const;

/** Karta „Docházka“ na dashboardu, doslova z gate sekce 5. */
export const DASHBOARD_TEXTS = {
  title: "Docházka",
  none: "Za posledních 6 měsíců nemáš žádnou absenci.",
  action: "Ohlásit nepřítomnost",
  showDays: "Zobrazit dny",
  rulesLink: "Jak se absence počítají",
  sinceFirstRecorded: "Počítáme od první zapsané schůzky.",
} as const;

// ── Datum a čas ──────────────────────────────────────────────

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(value);
  if (!m) throw new Error("invalid date");
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function toDateString(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const PRAGUE_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Posun Prahy proti UTC v milisekundách v daném okamžiku (3 600 000 zimní, 7 200 000 letní). */
function pragueOffsetMs(at: Date): number {
  const secs = Math.floor(at.getTime() / 1000) * 1000;
  const parts: Record<string, number> = {};
  for (const p of PRAGUE_PARTS.formatToParts(new Date(secs))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - secs;
}

/**
 * Okamžik, kdy je v Praze dané datum a čas (`HH:MM`). Počítá posun Prahy pro
 * ten den, takže funguje i v den přechodu letního času (DST bezpečně, test 2).
 */
export function pragueInstant(date: string, time: string): Date {
  const { y, m, d } = parseDate(date);
  const hm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!hm) throw new Error("invalid time");
  const local = Date.UTC(y, m - 1, d, Number(hm[1]), Number(hm[2]), 0);
  // Dvě iterace: první odhad posunu z okamžiku „jako by to bylo UTC“, druhá ho opraví.
  const off1 = pragueOffsetMs(new Date(local));
  const guess = local - off1;
  const off2 = pragueOffsetMs(new Date(guess));
  return new Date(local - off2);
}

/** Uzávěrka člena: začátek schůzky v daný den. */
export function memberDeadline(date: string): Date {
  return pragueInstant(date, ATTENDANCE_START);
}

/** Přičte měsíce, den se zkrátí na konec cílového měsíce (31. 8. − 6 měsíců = 28. 2.). */
export function addMonthsClamped(date: string, months: number): string {
  const { y, m, d } = parseDate(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12 + 12) % 12 + 1;
  return toDateString(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

// ── Člen mění svou nepřítomnost ──────────────────────────────

export type AbsenceEditDecision =
  | { ok: true }
  | { ok: false; reason: "invalid" | "closed" | "too-far"; message: string };

/**
 * Smí člen v okamžiku `now` změnit svou nepřítomnost na den `date`? Od dneška do
 * dnes + 365 dní a jen do 7:30 v ten den (arch 3.2, test 1). SQL protějšek je
 * `absenceEditGuardSql` v lib/db/queries/attendance.ts, tohle je jen
 * srozumitelná hláška a test; správnost drží SQL.
 */
export function decideMemberAbsenceEdit(now: Date, date: string): AbsenceEditDecision {
  if (typeof date !== "string" || !isValidDateString(date)) {
    return { ok: false, reason: "invalid", message: "Neplatné datum." };
  }
  const today = pragueToday(now);
  if (date > addDaysToDateString(today, MAX_ADVANCE_DAYS)) {
    return { ok: false, reason: "too-far", message: MEMBER_TEXTS.errTooFar };
  }
  if (now.getTime() >= memberDeadline(date).getTime()) {
    return { ok: false, reason: "closed", message: MEMBER_TEXTS.errClosed };
  }
  return { ok: true };
}

export function memberMayEditAbsence(now: Date, date: string): boolean {
  return decideMemberAbsenceEdit(now, date).ok;
}

// ── Jméno náhradníka ─────────────────────────────────────────

export type SubstituteNameResult = { ok: true; value: string } | { ok: false; error: string };

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;
/**
 * Neviditelné a směrové znaky (security L-3): zero-width a značky směru
 * U+200B až U+200F, U+202A až U+202E, U+2066 až U+2069, U+2060 až U+2064
 * (word joiner a neviditelné operátory), BOM U+FEFF. Jméno z nich by se
 * v seznamu, auditu a reportu vykreslilo prázdné nebo s přepsaným směrem.
 */
const INVISIBLE_RE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;

/**
 * Jméno náhradníka: ořezat, vnitřní bílé znaky sloučit do jedné mezery, 2 až 80
 * znaků (stejně jako CHECK v DB, počítá se po znacích), bez řídicích znaků.
 */
export function validateSubstituteName(raw: unknown): SubstituteNameResult {
  if (typeof raw !== "string") return { ok: false, error: MEMBER_TEXTS.errNameEmpty };
  // Tab a nový řádek jsou bílé znaky a sloučí se, ostatní řídicí znaky se odmítnou.
  const value = raw.replace(/\s+/g, " ").trim();
  if (value.length === 0) return { ok: false, error: MEMBER_TEXTS.errNameEmpty };
  if (CONTROL_RE.test(value) || INVISIBLE_RE.test(value)) {
    return { ok: false, error: MEMBER_TEXTS.errNameChars };
  }
  const len = [...value].length;
  if (len < NAME_MIN) return { ok: false, error: MEMBER_TEXTS.errNameShort };
  if (len > NAME_MAX) return { ok: false, error: MEMBER_TEXTS.errNameLong };
  return { ok: true, value };
}

// ── Okno absencí ─────────────────────────────────────────────

/**
 * Hranice okna: do počtu absencí se počítá `attendance_date > absenceWindowStart(today)`
 * a `<= today`. SQL dostane tuhle hodnotu jako parametr (arch 12.2), nepočítá si
 * ji samo, aby TS a SQL nemohly počítat jinak.
 */
export function absenceWindowStart(today: string): string {
  return addMonthsClamped(today, -ABSENCE_WINDOW_MONTHS);
}

/**
 * První den, kdy absence z `absenceDate` už do okna nepatří („vyprší“). Je to
 * nejmenší `t`, pro které je `absenceWindowStart(t) >= absenceDate`.
 */
export function absenceExpiresOn(absenceDate: string): string {
  let t = addMonthsClamped(absenceDate, ABSENCE_WINDOW_MONTHS);
  // Zkrácení na konec měsíce může posunout hranici; dohledat první platný den.
  for (let i = 0; i < 5 && absenceWindowStart(t) < absenceDate; i++) {
    t = addDaysToDateString(t, 1);
  }
  return t;
}

// ── Český kalendář ───────────────────────────────────────────

const WEEKDAY_SHORT = ["ne", "po", "út", "st", "čt", "pá", "so"] as const;
const WEEKDAY_LONG = [
  "neděle",
  "pondělí",
  "úterý",
  "středa",
  "čtvrtek",
  "pátek",
  "sobota",
] as const;
const MONTH_NOMINATIVE = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
] as const;
const MONTH_GENITIVE = [
  "ledna",
  "února",
  "března",
  "dubna",
  "května",
  "června",
  "července",
  "srpna",
  "září",
  "října",
  "listopadu",
  "prosince",
] as const;

/** 0 = neděle ... 6 = sobota. */
export function weekdayIndex(date: string): number {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isThursday(date: string): boolean {
  return weekdayIndex(date) === 4;
}

/** „čt 12. 11.“ */
export function formatWeekdayDM(date: string): string {
  const { m, d } = parseDate(date);
  return `${WEEKDAY_SHORT[weekdayIndex(date)]} ${d}. ${m}.`;
}

/** „čtvrtek 12. 11. 2026“ */
export function formatWeekdayLong(date: string): string {
  return `${WEEKDAY_LONG[weekdayIndex(date)]} ${formatCzDate(date)}`;
}

/** „čt 8. 10. 2026“ */
export function formatWeekdayFull(date: string): string {
  return `${WEEKDAY_SHORT[weekdayIndex(date)]} ${formatCzDate(date)}`;
}

/** „listopad 2026“ */
export function monthTitle(year: number, month: number): string {
  return `${MONTH_NOMINATIVE[month - 1]} ${year}`;
}

/** Hlavička sloupců mřížky, pondělí první. */
export const GRID_WEEKDAYS = ["Po", "Út", "St", "Čt", "Pá", "So", "Ne"] as const;

/** Týdny měsíce (pondělí první), prázdné buňky `null`. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = toDateString(year, month, 1);
  const offset = (weekdayIndex(first) + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth(year, month); d++) cells.push(toDateString(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** První den měsíce, `YYYY-MM-01`. */
export function monthStart(year: number, month: number): string {
  return toDateString(year, month, 1);
}

/** Poslední den měsíce. */
export function monthEnd(year: number, month: number): string {
  return toDateString(year, month, daysInMonth(year, month));
}

/** Rok a měsíc (1 až 12) z data. */
export function monthOf(date: string): { year: number; month: number } {
  const { y, m } = parseDate(date);
  return { year: y, month: m };
}

/** Posun o měsíce, měsíc 1 až 12. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 + 1 };
}

/** Nejbližší čtvrtek od `from` včetně. */
export function nextThursday(from: string): string {
  const diff = (4 - weekdayIndex(from) + 7) % 7;
  return addDaysToDateString(from, diff);
}

// ── Značky dne v kalendáři ───────────────────────────────────

export type AbsenceMark = "none" | "absent" | "substitute";
export type PastResult = "present" | "substitute" | "absent" | "unexcused";

export function absenceMark(substituteName: string | null | undefined, hasAbsence: boolean): AbsenceMark {
  if (!hasAbsence) return "none";
  return substituteName ? "substitute" : "absent";
}

/** „čt 12. 11., bez náhradníka“ / „čt 19. 11., náhradník Jméno“. */
export function absenceLine(date: string, substituteName: string | null): string {
  return `${formatWeekdayDM(date)}, ${
    substituteName ? `náhradník ${substituteName}` : "bez náhradníka"
  }`;
}

function pastResultText(result: PastResult): string {
  if (result === "present") return "přítomen";
  if (result === "substitute") return "náhradník";
  // iter-041: „Chyběl(a) bez omluvy“ (gate sekce 5: aria „absence bez omluvy“).
  if (result === "unexcused") return "absence bez omluvy";
  return "absence";
}

/** Znak výsledku uzavřené docházky v mřížce. */
export function pastResultGlyph(result: PastResult): string {
  return result === "present" ? "✓" : result === "substitute" ? "N" : "A";
}

/** `aria-label` dne: „čtvrtek 12. listopadu, nepřijdeš, bez náhradníka“. */
export function dayAriaLabel(
  date: string,
  opts: { mark: AbsenceMark; result: PastResult | null; hasMeeting: boolean; hasInternal?: boolean }
): string {
  const { m, d } = parseDate(date);
  const parts = [`${WEEKDAY_LONG[weekdayIndex(date)]} ${d}. ${MONTH_GENITIVE[m - 1]}`];
  if (opts.result) parts.push(pastResultText(opts.result));
  else if (opts.mark === "absent") parts.push("nepřijdeš, bez náhradníka");
  else if (opts.mark === "substitute") parts.push("nepřijdeš, pošleš náhradníka");
  if (opts.hasMeeting) parts.push("schůzka v aplikaci");
  else if (opts.hasInternal) parts.push("interní schůzka");
  return parts.join(", ");
}

// ── Karta na dashboardu a seznam absencí ─────────────────────

export interface AbsenceCardView {
  /** Počet absencí v okně. */
  count: number;
  /** Oranžově od 3 (barva i text). */
  warn: boolean;
  /** Věta o počtu. */
  text: string;
  /** Ohlášená budoucí nepřítomnost, nebo `null`. */
  nextText: string | null;
  /** „Počítáme od …“, dokud okno sahá před první uzavřený den. */
  sinceText: string | null;
}

/** Věta o počtu absencí, texty z gate sekce 5. Číslo se v UI zvýrazní tučně. */
export function absenceCountText(count: number): string {
  if (count <= 0) return DASHBOARD_TEXTS.none;
  if (count < ABSENCE_LIMIT) return `Absence za posledních 6 měsíců: ${count} ze ${ABSENCE_LIMIT}`;
  if (count === ABSENCE_LIMIT) {
    return `Absence za posledních 6 měsíců: ${ABSENCE_LIMIT} ze ${ABSENCE_LIMIT}. Čtvrtou už může řešit členský výbor.`;
  }
  return `Absence za posledních 6 měsíců: ${count}. Pravidla povolují tři.`;
}

/**
 * Věta o počtu rozdělená kolem čísla absencí (UI ho dá tučně). U nuly číslo ve
 * větě není: `strong` je `null`.
 */
export function absenceCountParts(count: number): { before: string; strong: string | null; after: string } {
  const text = absenceCountText(count);
  if (count <= 0) return { before: text, strong: null, after: "" };
  const marker = `: ${count}`;
  const at = text.indexOf(marker);
  if (at < 0) return { before: text, strong: null, after: "" };
  const split = at + 2;
  return { before: text.slice(0, split), strong: String(count), after: text.slice(split + String(count).length) };
}

/**
 * Pohled karty. `firstClosedDay` = nejstarší uzavřený den (`null` = žádný).
 * `next` = nejbližší ohlášená nepřítomnost od dneška (včetně).
 */
export function buildAbsenceCardView(input: {
  count: number;
  firstClosedDay: string | null;
  today: string;
  next: { date: string; substituteName: string | null } | null;
}): AbsenceCardView {
  const { count, firstClosedDay, today, next } = input;
  let sinceText: string | null = null;
  if (firstClosedDay === null) {
    sinceText = DASHBOARD_TEXTS.sinceFirstRecorded;
  } else if (absenceWindowStart(today) < firstClosedDay) {
    sinceText = `Počítáme od ${formatCzDate(firstClosedDay)}.`;
  }
  return {
    count,
    warn: count >= ABSENCE_LIMIT,
    text: absenceCountText(count),
    nextText: next
      ? `Příště chybíš: ${formatWeekdayDM(next.date)}${
          next.substituteName ? `, náhradník ${next.substituteName}` : ""
        }`
      : null,
    sinceText,
  };
}

/** Řádek seznamu absencí (`/dochazka#absence`): „čt 8. 10. 2026, bez omluvy, vyprší 8. 4. 2027“. */
export function absenceDayLine(date: string, excused: boolean): string {
  return `${formatWeekdayFull(date)}, ${excused ? "omluven(a)" : "bez omluvy"}, vyprší ${formatCzDate(
    absenceExpiresOn(date)
  )}`;
}
