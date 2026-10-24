/**
 * iter-041 (gate Z8 až Z11): bonus za Master mind a Burzu pomoci, který se
 * přičítá k Total Score a dá interní barvu.
 *
 * Čistý modul. Bonus se nikam neukládá, počítá se živě při čtení z tabulek
 * `mastermind_case`, `burza_help` a `burza_contact_use`. Hodnoty a strop jsou
 * jen tady (`BONUS_POINTS`, `BONUS_CAP`), změna kalibrace je jeden řádek.
 *
 *   interní skóre = min(100, totalScore + bonus)
 *   bonus         = min(BONUS_CAP, součet bodů v okně)
 *
 * Nic se neodečítá: bonus je vždy nejméně 0, interní skóre nikdy nižší než
 * Total Score. Okno 6 měsíců ke konci měsíce snímku, stejné jako u souboru
 * BNI, přes `addMonthsClamped` (žádná nová logika měsíců).
 */
import { addMonthsClamped, monthEnd, monthOf } from "@/lib/attendance/rules";

export const BONUS_POINTS = { mastermind: 7, burza: 5 } as const;
export const BONUS_CAP = 20;
export const INTERNAL_MAX = 100;

export type BonusCategory = keyof typeof BONUS_POINTS;

export interface BonusCounts {
  mastermind: number;
  burza: number;
}

export interface BonusLine {
  category: BonusCategory;
  count: number;
  points: number;
}

export interface BonusResult {
  lines: BonusLine[];
  /** Součet před stropem. */
  raw: number;
  /** Bonus po stropu, vždy 0 až `BONUS_CAP`. */
  bonus: number;
  /** Součet strop přesáhl. */
  capped: boolean;
}

function safeCount(n: number): number {
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function computeBonus(counts: BonusCounts): BonusResult {
  const lines: BonusLine[] = (Object.keys(BONUS_POINTS) as BonusCategory[]).map((category) => {
    const count = safeCount(counts[category]);
    return { category, count, points: count * BONUS_POINTS[category] };
  });
  const raw = lines.reduce((sum, l) => sum + l.points, 0);
  return { lines, raw, bonus: Math.min(BONUS_CAP, raw), capped: raw > BONUS_CAP };
}

/** Interní skóre: Total Score plus bonus, oříznuté na 100, zaokrouhlené na setiny. */
export function internalScore(totalScore: number, bonus: number): number {
  const b = Number.isFinite(bonus) && bonus > 0 ? bonus : 0;
  return Math.round(Math.min(INTERNAL_MAX, totalScore + b) * 100) / 100;
}

export interface BonusWindow {
  /** Datum události musí být ostře větší. */
  after: string;
  /** Datum události musí být menší nebo rovno (poslední den měsíce snímku). */
  to: string;
}

/** Okno bonusu k měsíci snímku `YYYY-MM-01`: `(addMonthsClamped(posledníDen, -6), posledníDen]`. */
export function bonusWindow(month: string): BonusWindow {
  const { year, month: m } = monthOf(month);
  const to = monthEnd(year, m);
  return { after: addMonthsClamped(to, -6), to };
}

/** Událost s datem `d` (`YYYY-MM-DD`) patří do okna. */
export function inBonusWindow(window: BonusWindow, d: string): boolean {
  return d > window.after && d <= window.to;
}

// ── iter-042 (BK2, gate Z3): bonus jen ze zapnutých částí ─────

/** Které části dávají bonus. Bonus existuje jen při zapnutém semaforu a zapnuté části. */
export interface BonusSources {
  mastermind: boolean;
  burza: boolean;
}

/** Nastavení, ze kterého se zdroje bonusu skládají (`ChapterSettings` je splňuje). */
export interface BonusSettings {
  semaforEnabled: boolean;
  mastermindEnabled: boolean;
  burzaEnabled: boolean;
}

export function bonusSources(settings: BonusSettings): BonusSources {
  return {
    mastermind: settings.semaforEnabled && settings.mastermindEnabled,
    burza: settings.semaforEnabled && settings.burzaEnabled,
  };
}

/** Aspoň jedna část dává bonus. Jinak se bonus v UI vůbec neukazuje a skóre = BNI. */
export function hasBonusSource(sources: BonusSources): boolean {
  return sources.mastermind || sources.burza;
}

/** Události jen ze zapnutých částí. Data zůstávají v DB, po zapnutí se bonus vrátí. */
export function filterBonusEvents<T extends { category: BonusCategory }>(
  events: readonly T[],
  sources: BonusSources
): T[] {
  return events.filter((e) => sources[e.category]);
}
