/**
 * iter-041 (arch 5.7, 6.2): měsíc snímku. Čistý modul.
 *
 * Měsíc je vždy první den měsíce `YYYY-MM-01`. Import smí jen měsíce od
 * dnešního měsíce zpět do 24 měsíců. Parametr `?m=` na přehledu je `YYYY-MM`.
 */
import { monthOf, monthStart, shiftMonth } from "@/lib/attendance/rules";
import { isValidDateString, pragueToday } from "@/lib/members/activity";

export const IMPORT_MAX_MONTHS_BACK = 24;
export const IMPORT_MONTH_OPTIONS = 13;

const FIRST_RE = /^\d{4}-\d{2}-01$/;
const PARAM_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** `YYYY-MM-01` aktuálního měsíce v Praze. */
export function currentMonthStart(today: string = pragueToday()): string {
  const { year, month } = monthOf(today);
  return monthStart(year, month);
}

export function previousMonthStart(today: string = pragueToday()): string {
  const { year, month } = monthOf(today);
  const p = shiftMonth(year, month, -1);
  return monthStart(p.year, p.month);
}

/** Měsíc pro import: první den měsíce, ne budoucí, nejvýš 24 měsíců zpět. */
export function validateImportMonth(month: unknown, today: string = pragueToday()): month is string {
  if (typeof month !== "string" || !FIRST_RE.test(month) || !isValidDateString(month)) return false;
  const current = currentMonthStart(today);
  if (month > current) return false;
  const { year, month: m } = monthOf(current);
  const oldest = shiftMonth(year, m, -IMPORT_MAX_MONTHS_BACK);
  return month >= monthStart(oldest.year, oldest.month);
}

/** Posledních 13 měsíců (nejnovější první), pro select. */
export function importMonthOptions(today: string = pragueToday()): string[] {
  const { year, month } = monthOf(currentMonthStart(today));
  const out: string[] = [];
  for (let i = 0; i < IMPORT_MONTH_OPTIONS; i++) {
    const s = shiftMonth(year, month, -i);
    out.push(monthStart(s.year, s.month));
  }
  return out;
}

/** `?m=YYYY-MM` -> `YYYY-MM-01`, jinak `null` (volající použije poslední měsíc). */
export function parseMonthParam(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const m = PARAM_RE.exec(value);
  return m ? `${m[1]}-${m[2]}-01` : null;
}

/** `YYYY-MM-01` -> `YYYY-MM` pro URL. */
export function monthParam(month: string): string {
  return month.slice(0, 7);
}
