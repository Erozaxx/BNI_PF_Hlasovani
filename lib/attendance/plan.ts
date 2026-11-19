/**
 * iter-039 (T-003, arch 5, 6, 7, 8): čistá pravidla kalendáře plánovaných omluv
 * pro správce docházky. Rozsah, seskupení po dnech, texty, počty a výchozí den.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend. Bezpečné
 * pro scripts/test-iter-039-omluvy.ts i pro klientskou komponentu.
 *
 * K2 (Tom, 20. 10. 2026): pod jménem je jen „omluveno <datum>“, kdo omluvu
 * zapsal se nezobrazuje a nikde se nenačítá.
 */

import { addDaysToDateString } from "@/lib/members/activity";
import {
  MAX_ADVANCE_DAYS,
  absenceWindowStart,
  dayAriaLabel,
  formatWeekdayLong,
  monthEnd,
  monthOf,
  monthStart,
} from "@/lib/attendance/rules";
import { MEMBERS_VIEW_TEXTS } from "@/lib/attendance/texts";
import {
  DEFAULT_CHAPTER_SETTINGS,
  isRegularDay,
  nextRegularDay,
  type ChapterSettings,
} from "@/lib/chapter/settings";

export const PLAN_TEXTS = {
  title: "Omluvy",
  legend:
    "Číslo pod dnem je počet omluvených. Světle modrý den je pravidelná schůzka, tmavě modrý schůzka s hosty, zelený interní schůzka.",
  empty: "–",
  link: "Zápis dne",
  prevMonth: "Předchozí měsíc",
  nextMonth: "Další měsíc",
  /** iter-047 (gate změna 2): věta pod nadpisem pro člena bez `attendance.view_all`. */
  readOnlyNote: "Svou omluvu zapíšeš v záložce Moje.",
  /** iter-047: odkaz pod dnem pro člena. */
  membersLink: "Celý den v záložce Členové",
} as const;

/**
 * iter-047 (arch 4.2): veřejný řádek omluvy pro člena bez `attendance.view_all`.
 * Jen datum, jméno a náhradník. Žádné id člena, `medical` ani datum ohlášení.
 */
export interface PublicPlanEntry {
  /** `YYYY-MM-DD`, den omluvy. */
  date: string;
  name: string;
  /** `null` = bez náhradníka. */
  substituteName: string | null;
}

/** Jedna ohlášená omluva (řádek z `member_absence` s jménem aktivního člena). */
export interface PlanEntry extends PublicPlanEntry {
  /** Jen klíč v seznamu. */
  memberId: string;
  /** `YYYY-MM-DD`, kdy byla omluva zapsána (pražský den). */
  announcedOn: string;
  /** iter-046: medical omluva (uložená, nebo odvozená z období člena). */
  medical?: boolean;
}

/** iter-046: období medical aktivního člena (jen pro odvození v kalendáři). */
export interface MedicalPeriod {
  memberId: string;
  name: string;
  medicalFrom: string;
  medicalUntil: string;
}

/**
 * iter-046 (arch 5.6): odvozené medical omluvy pro členy s obdobím. Pro každý
 * schůzkový den v `[from, to]` a v období člena, který v `existing` nemá vlastní
 * omluvu, vrátí položku `{ medical: true, substituteName: null, announcedOn:
 * medicalFrom }`. `scheduleDays` jsou schůzkové dny (pravidelný den, den
 * schůzky, interní den), pořadí nevadí.
 */
export function expandMedicalPeriods(
  periods: readonly MedicalPeriod[],
  scheduleDays: readonly string[],
  from: string,
  to: string,
  existing: readonly Pick<PlanEntry, "date" | "memberId">[]
): PlanEntry[] {
  const have = new Set(existing.map((e) => `${e.memberId}|${e.date}`));
  const out: PlanEntry[] = [];
  for (const day of scheduleDays) {
    if (day < from || day > to) continue;
    for (const p of periods) {
      if (day < p.medicalFrom || day > p.medicalUntil) continue;
      if (have.has(`${p.memberId}|${day}`)) continue;
      out.push({
        date: day,
        memberId: p.memberId,
        name: p.name,
        substituteName: null,
        announcedOn: p.medicalFrom,
        medical: true,
      });
    }
  }
  return out;
}

/** Schůzkové dny v `[from, to]`: pravidelný den týdne plus dané dny (bez duplicit, vzestupně). */
export function scheduleDaysInRange(
  from: string,
  to: string,
  regularWeekday: number,
  extraDays: readonly string[]
): string[] {
  const days = new Set<string>();
  for (const d of extraDays) if (d >= from && d <= to) days.add(d);
  let cur = from;
  for (let i = 0; i < 800 && cur <= to; i++) {
    const [y, m, d] = cur.split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, d)).getUTCDay() === regularWeekday) days.add(cur);
    cur = addDaysToDateString(cur, 1);
  }
  return [...days].sort();
}

export interface PlanRange {
  minMonth: { year: number; month: number };
  maxMonth: { year: number; month: number };
  /** První a poslední den načítaného rozsahu. */
  from: string;
  to: string;
}

/**
 * Rozsah kalendáře: stejně daleko jako kalendář člena (6 měsíců zpět, rok
 * dopředu), od prvního dne nejstaršího po poslední den nejnovějšího měsíce.
 */
export function planRange(today: string): PlanRange {
  const minMonth = monthOf(absenceWindowStart(today));
  const maxMonth = monthOf(addDaysToDateString(today, MAX_ADVANCE_DAYS));
  return {
    minMonth,
    maxMonth,
    from: monthStart(minMonth.year, minMonth.month),
    to: monthEnd(maxMonth.year, maxMonth.month),
  };
}

/** Mapa datum na omluvy toho dne, jména řazená česky (shodná jména podle `memberId`, když je). */
export function groupPlan<T extends PublicPlanEntry & { memberId?: string }>(
  rows: readonly T[]
): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of rows) (out[r.date] ??= []).push(r);
  for (const list of Object.values(out)) {
    list.sort(
      (a, b) =>
        a.name.localeCompare(b.name, "cs") || (a.memberId ?? "").localeCompare(b.memberId ?? "")
    );
  }
  return out;
}

/**
 * iter-047 (arch 4.3): ořez řádků vedení na veřejný tvar. Nový objekt po
 * klíčích, žádný spread, ať se nic dalšího nedostane do klienta.
 */
export function toPublicPlanEntries(rows: readonly PublicPlanEntry[]): PublicPlanEntry[] {
  return rows.map((r) => ({
    date: r.date,
    name: r.name,
    substituteName: r.substituteName?.trim() || null,
  }));
}

/** Tvar dat veřejné větve (strukturální, ať `plan.ts` zůstane čistý). */
export interface PublicPlanShape extends PlanRange {
  rows: PublicPlanEntry[];
  meetingDates: string[];
  internalDates: string[];
  regularWeekday: number;
}

/** Props kalendáře v režimu čtení (přesně tyhle klíče jdou do klienta). */
export interface PublicPlanCalendarProps {
  readOnly: true;
  today: string;
  serverNow: string;
  minMonth: { year: number; month: number };
  maxMonth: { year: number; month: number };
  meetingDates: string[];
  internalDates: string[];
  regularWeekday: number;
  rows: PublicPlanEntry[];
  canManageInternal: boolean;
  initialSelected: string;
}

/** iter-047 (D5): props veřejné větve stránky, nový objekt po klíčích. */
export function publicPlanCalendarProps(input: {
  plan: PublicPlanShape;
  today: string;
  serverNow: string;
  requested: string | null;
  canManageInternal: boolean;
}): PublicPlanCalendarProps {
  const { plan, today, serverNow, requested, canManageInternal } = input;
  const rows = toPublicPlanEntries(plan.rows);
  return {
    readOnly: true,
    today,
    serverNow,
    minMonth: plan.minMonth,
    maxMonth: plan.maxMonth,
    meetingDates: plan.meetingDates,
    internalDates: plan.internalDates,
    regularWeekday: plan.regularWeekday,
    rows,
    canManageInternal,
    initialSelected: pickInitialDay({
      today,
      requested,
      datesWithAbsences: rows.map((r) => r.date),
      from: plan.from,
      to: plan.to,
      settings: { meetingWeekday: plan.regularWeekday },
    }),
  };
}

/**
 * iter-047 (Q2): odkaz „Celý den v záložce Členové“ jen na schůzkový den v rozsahu
 * záložky Členové (`[absenceWindowStart, today + MAX_ADVANCE_DAYS]`).
 */
export function isPlanMembersDay(
  date: string,
  today: string,
  input: { meetingDates: readonly string[]; internalDates: readonly string[]; regularWeekday: number }
): boolean {
  if (date < absenceWindowStart(today) || date > addDaysToDateString(today, MAX_ADVANCE_DAYS)) return false;
  return (
    input.meetingDates.includes(date) ||
    input.internalDates.includes(date) ||
    isRegularDay(date, { meetingWeekday: input.regularWeekday })
  );
}

/** iter-047: štítek řádku pro člena, stejný jako v záložce Členové. */
export function publicPlanLabel(row: Pick<PublicPlanEntry, "substituteName">): string {
  const sub = row.substituteName?.trim();
  return sub ? MEMBERS_VIEW_TEXTS.excusedWithSub(sub) : MEMBERS_VIEW_TEXTS.excused;
}

/** „1 omluvený“, „3 omluvení“, „5 omluvených“ (do `aria-label`). */
export function planCountText(n: number): string {
  if (n === 1) return "1 omluvený";
  if (n >= 2 && n <= 4) return `${n} omluvení`;
  return `${n} omluvených`;
}

/** `aria-label` dne: „čtvrtek 22. října, 3 omluvení, schůzka s hosty“ (iter-042 B3: i „interní schůzka“, „pravidelná schůzka“). */
export function planDayAria(
  date: string,
  count: number,
  hasMeeting: boolean,
  hasInternal = false,
  isRegular = false
): string {
  const base = dayAriaLabel(date, { mark: "none", result: null, hasMeeting: false });
  const parts = [base];
  if (count > 0) parts.push(planCountText(count));
  if (hasMeeting) parts.push("schůzka s hosty");
  else if (hasInternal) parts.push("interní schůzka");
  else if (isRegular) parts.push("pravidelná schůzka");
  return parts.join(", ");
}

/** Hlavní řádek pod jménem: „s náhradníkem: Jan Novák“ / „bez náhradníka“. */
export function planEntryLine(row: Pick<PlanEntry, "substituteName">): string {
  return row.substituteName ? `s náhradníkem: ${row.substituteName}` : "bez náhradníka";
}

/**
 * Šedý řádek: „omluveno 15. 10.“ (jen datum, K2). Když omluva není v roce
 * `today`, přidá se rok („omluveno 30. 12. 2025“), ať se nepletou dva roky.
 */
export function planEntryMeta(
  row: Pick<PlanEntry, "announcedOn"> & { medical?: boolean },
  today: string
): string {
  if (row.medical) return "medical";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.announcedOn);
  if (!m) return "omluveno";
  const base = `omluveno ${Number(m[3])}. ${Number(m[2])}.`;
  return m[1] === today.slice(0, 4) ? base : `${base} ${m[1]}`;
}

/** Zápis dne umí otevřít dny do dnes + `MAX_ADVANCE_DAYS` (pravidlo `zapis/page.tsx`). */
export function planCanOpenSheet(date: string, today: string): boolean {
  return date <= addDaysToDateString(today, MAX_ADVANCE_DAYS);
}

/** Nadpis seznamu: „čtvrtek 22. 10. 2026“. */
export function planDayTitle(date: string): string {
  return formatWeekdayLong(date);
}

/**
 * Souhrn dne „Omluvení: 3 (s náhradníkem 1, bez náhradníka 2)“. U prázdného
 * dne `null`, u jediné omluvy bez závorky (řádek ji říká sám).
 */
export function planSummary(entries: readonly Pick<PlanEntry, "substituteName">[]): string | null {
  const n = entries.length;
  if (n === 0) return null;
  const withSub = entries.filter((e) => e.substituteName).length;
  const without = n - withSub;
  if (n === 1) return "Omluvení: 1";
  const parts: string[] = [];
  if (withSub > 0) parts.push(`s náhradníkem ${withSub}`);
  if (without > 0) parts.push(`bez náhradníka ${without}`);
  return `Omluvení: ${n} (${parts.join(", ")})`;
}

/**
 * Výchozí vybraný den (K1): platné `?d=` v rozsahu má přednost, jinak nejbližší
 * den od dneška včetně, na který je omluva, a když žádný není, nejbližší pravidelný
 * den schůzky (iter-042 B4, výchozí čtvrtek).
 */
export function pickInitialDay(input: {
  today: string;
  requested: string | null;
  datesWithAbsences: readonly string[];
  from: string;
  to: string;
  /** Den pravidelné schůzky z nastavení chapteru; bez něj čtvrtek. */
  settings?: Pick<ChapterSettings, "meetingWeekday">;
}): string {
  const { today, requested, datesWithAbsences, from, to } = input;
  if (requested && requested >= from && requested <= to) return requested;
  let best: string | null = null;
  for (const d of datesWithAbsences) {
    if (d >= today && (best === null || d < best)) best = d;
  }
  return best ?? nextRegularDay(today, input.settings ?? DEFAULT_CHAPTER_SETTINGS);
}
