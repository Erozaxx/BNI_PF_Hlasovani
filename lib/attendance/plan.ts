/**
 * iter-039 (T-003, arch 5, 6, 7, 8): čistá pravidla kalendáře plánovaných omluv
 * pro správce docházky. Rozsah, seskupení po dnech, texty, počty a výchozí den.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend. Bezpečné
 * pro scripts/test-iter-039-omluvy.ts i pro klientskou komponentu.
 *
 * K2 (Tom, 20. 10. 2026): pod jménem je jen „ohlášeno <datum>“, kdo omluvu
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
  nextThursday,
} from "@/lib/attendance/rules";

export const PLAN_TEXTS = {
  title: "Omluvy",
  legend:
    "Číslo pod dnem je počet omluvených. Modrý den je běžná schůzka s hosty, zelený den interní schůzka.",
  empty: "–",
  link: "Zápis dne",
  prevMonth: "Předchozí měsíc",
  nextMonth: "Další měsíc",
} as const;

/** Jedna ohlášená omluva (řádek z `member_absence` s jménem aktivního člena). */
export interface PlanEntry {
  /** `YYYY-MM-DD`, den omluvy. */
  date: string;
  /** Jen klíč v seznamu. */
  memberId: string;
  name: string;
  /** `null` = bez náhradníka. */
  substituteName: string | null;
  /** `YYYY-MM-DD`, kdy byla omluva ohlášena (pražský den). */
  announcedOn: string;
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

/** Mapa datum na omluvy toho dne, jména řazená česky. */
export function groupPlan(rows: readonly PlanEntry[]): Record<string, PlanEntry[]> {
  const out: Record<string, PlanEntry[]> = {};
  for (const r of rows) (out[r.date] ??= []).push(r);
  for (const list of Object.values(out)) {
    list.sort((a, b) => a.name.localeCompare(b.name, "cs") || a.memberId.localeCompare(b.memberId));
  }
  return out;
}

/** „1 omluvený“, „3 omluvení“, „5 omluvených“ (do `aria-label`). */
export function planCountText(n: number): string {
  if (n === 1) return "1 omluvený";
  if (n >= 2 && n <= 4) return `${n} omluvení`;
  return `${n} omluvených`;
}

/** `aria-label` dne: „čtvrtek 22. října, 3 omluvení, schůzka v aplikaci“. */
export function planDayAria(date: string, count: number, hasMeeting: boolean, hasInternal = false): string {
  const base = dayAriaLabel(date, { mark: "none", result: null, hasMeeting: false });
  const parts = [base];
  if (count > 0) parts.push(planCountText(count));
  if (hasMeeting) parts.push("schůzka v aplikaci");
  else if (hasInternal) parts.push("interní schůzka");
  return parts.join(", ");
}

/** Hlavní řádek pod jménem: „s náhradníkem: Jan Novák“ / „bez náhradníka“. */
export function planEntryLine(row: Pick<PlanEntry, "substituteName">): string {
  return row.substituteName ? `s náhradníkem: ${row.substituteName}` : "bez náhradníka";
}

/**
 * Šedý řádek: „ohlášeno 15. 10.“ (jen datum, K2). Když ohlášení není v roce
 * `today`, přidá se rok („ohlášeno 30. 12. 2025“), ať se nepletou dva roky.
 */
export function planEntryMeta(row: Pick<PlanEntry, "announcedOn">, today: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(row.announcedOn);
  if (!m) return "ohlášeno";
  const base = `ohlášeno ${Number(m[3])}. ${Number(m[2])}.`;
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
 * den od dneška včetně, na který je omluva, a když žádný není, nejbližší čtvrtek.
 */
export function pickInitialDay(input: {
  today: string;
  requested: string | null;
  datesWithAbsences: readonly string[];
  from: string;
  to: string;
}): string {
  const { today, requested, datesWithAbsences, from, to } = input;
  if (requested && requested >= from && requested <= to) return requested;
  let best: string | null = null;
  for (const d of datesWithAbsences) {
    if (d >= today && (best === null || d < best)) best = d;
  }
  return best ?? nextThursday(today);
}
