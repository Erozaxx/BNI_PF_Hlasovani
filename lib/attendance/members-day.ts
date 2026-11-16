/**
 * iter-046 (arch 9.3, D10): čistý modul pohledu na den pro každého přihlášeného
 * člena. Převádí řádky z DB na to, co smí do HTML: jméno a štítek. Žádné id
 * člena, důvod omluvy, medical ani e-mail. Medical je v loaderu už jen
 * „Omluven(a)“, tenhle modul o něm neví.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 */
import { MEMBERS_VIEW_TEXTS as T } from "@/lib/attendance/texts";

/** Jediný tvar řádku dne, který jde do HTML. */
export interface PublicDayRow {
  name: string;
  label: string;
}

/** Jediný tvar počtu absencí, který jde do HTML. */
export interface PublicCountRow {
  name: string;
  absences: number;
}

export interface ClosedDayInput {
  name: string;
  status: string;
  substituteName: string | null;
  excused: boolean;
}

export interface PlannedDayInput {
  name: string;
  substituteName: string | null;
}

function cleanName(value: string | null): string | null {
  const t = value?.trim();
  return t ? t : null;
}

/** Štítek řádku uzavřeného dne (tabulka 9.2). */
export function publicDayLabel(row: ClosedDayInput): string {
  const sub = cleanName(row.substituteName);
  switch (row.status) {
    case "present":
      return T.present;
    case "substitute":
      return sub ? T.substitute(sub) : T.substituteUnknown;
    case "absent":
      if (!row.excused) return T.unexcused;
      return sub ? T.excusedWithSub(sub) : T.excused;
    default:
      // `unexcused` a cokoli neznámého: stejný štítek jako report
      return T.unexcused;
  }
}

/** Štítek řádku neuzavřeného dne: omluva, případně s náhradníkem. */
export function publicPlannedLabel(row: PlannedDayInput): string {
  const sub = cleanName(row.substituteName);
  return sub ? T.excusedWithSub(sub) : T.excused;
}

function byName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export interface PublicDay {
  state: "closed" | "open";
  rows: PublicDayRow[];
  /** Věta pod seznamem („Ostatní se …“), nebo `null`. */
  footnote: string | null;
}

/**
 * Seznam dne. `closed`: uzavřený den, `unrecorded` = jen výjimky a pod seznamem
 * „Ostatní se počítají jako přítomní.“. `open`: neuzavřený, jen omluvy a pod
 * seznamem „Ostatní se zatím neomluvili.“. Výstup má jen klíče `name`, `label`.
 */
export function buildPublicDay(
  input:
    | { state: "closed"; dayMode: "recorded" | "unrecorded" | null; rows: ClosedDayInput[] }
    | { state: "open"; rows: PlannedDayInput[] }
): PublicDay {
  if (input.state === "open") {
    return {
      state: "open",
      rows: byName(input.rows.map((r) => ({ name: r.name, label: publicPlannedLabel(r) }))),
      footnote: T.restOpen,
    };
  }
  return {
    state: "closed",
    rows: byName(input.rows.map((r) => ({ name: r.name, label: publicDayLabel(r) }))),
    footnote: input.dayMode === "unrecorded" ? T.restPresent : null,
  };
}

/** Počty absencí: jen `name` a `absences`, česká kolace. */
export function buildPublicCounts(rows: { name: string; absences: number }[]): PublicCountRow[] {
  return byName(rows.map((r) => ({ name: r.name, absences: r.absences })));
}

/**
 * Sousední schůzkový den. `days` jsou schůzkové dny (pravidelný den, den
 * schůzky, interní den), `date` nemusí být mezi nimi. `null` = žádný.
 */
export function neighbourMeetingDays(
  days: readonly string[],
  date: string
): { prev: string | null; next: string | null } {
  let prev: string | null = null;
  let next: string | null = null;
  for (const d of days) {
    if (d < date && (prev === null || d > prev)) prev = d;
    if (d > date && (next === null || d < next)) next = d;
  }
  return { prev, next };
}

/**
 * Zobrazený den: požadovaný `d` platí jen když je to schůzkový den v rozsahu
 * `[min, max]`, jinak výchozí den (iter-046, M-2). Medical období platí na každý
 * kalendářní den, takže jiný den by seznam „Omluven(a)“ proměnil v seznam členů
 * s medical.
 */
export function pickMembersViewDate(
  requested: unknown,
  meetingDays: readonly string[],
  min: string,
  max: string,
  fallback: string
): string {
  if (
    typeof requested === "string" &&
    requested >= min &&
    requested <= max &&
    meetingDays.includes(requested)
  ) {
    return requested;
  }
  return fallback;
}
