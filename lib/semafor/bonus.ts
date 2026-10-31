/**
 * iter-041 (gate Z8 až Z11): bonus, který se přičítá k Total Score a dá
 * interní barvu. iter-044: osm kategorií (Master mind, Burza pomoci, funkce
 * a pět ručních: školení, přivedený host, který se stal členem, akce,
 * poděkování, ostatní práce).
 *
 * Čistý modul. Bonus se nikam neukládá, počítá se živě. Hodnoty, podstropy a
 * strop jsou jen tady (`BONUS_POINTS`, `CATEGORY_CAPS`, `WORK_POINTS`,
 * `BONUS_CAP`), změna kalibrace je jeden řádek. Číslo se ukládá jen u ostatní
 * práce (rozhoduje ho člen výboru).
 *
 *   interní skóre = min(100, totalScore + bonus)
 *   bonus         = min(BONUS_CAP, součet kategorií po podstropech)
 *
 * Nic se neodečítá: bonus je vždy nejméně 0, interní skóre nikdy nižší než
 * Total Score. Okno 6 měsíců ke konci měsíce snímku, stejné jako u souboru
 * BNI, přes `addMonthsClamped`. Funkce nemá spodní mez okna (iter-041 K10).
 *
 * Invariant (R-12): `BONUS_CAP` nesmí přesáhnout šířku nejužšího barevného
 * pásma (20), jinak by bonus posunul barvu o dvě. Hlídá ho test 4b.
 */
import { addMonthsClamped, monthEnd, monthOf } from "@/lib/attendance/rules";

/** Pevné body kategorií (jednotka Z9: 1 host = 5 bodů). Ostatní práce má body ve vstupu. */
export const BONUS_POINTS = {
  mastermind: 7,
  burza: 5,
  function: 5,
  training: 7,
  host_member: 10,
  activity: 2,
  thanks: 1,
} as const;

/** Podstropy „pasivních“ kategorií za okno (gate iter-044 Q2 A). */
export const CATEGORY_CAPS = { thanks: 5, activity: 6 } as const;

/** Rozsah bodů za ostatní práci (gate iter-044 Q3 A). */
export const WORK_POINTS = { min: 1, max: 10 } as const;

/** Vodítko k bodům za ostatní práci. Čísla z tabulky kategorií, test hlídá shodu. */
export const WORK_GUIDE = {
  small: 1,
  task: [2, 3],
  host: 5,
  mastermind: BONUS_POINTS.mastermind,
  member: BONUS_POINTS.host_member,
} as const;

export const BONUS_CAP = 20;
export const INTERNAL_MAX = 100;

/** Všech osm kategorií v pevném pořadí (pořadí řádků v rozpisu). */
export const BONUS_CATEGORIES = [
  "mastermind",
  "burza",
  "function",
  "training",
  "host_member",
  "activity",
  "thanks",
  "work",
] as const;

export type BonusCategory = (typeof BONUS_CATEGORIES)[number];

/** Počty událostí po kategoriích. Chybějící kategorie = 0. */
export type BonusCounts = Partial<Record<BonusCategory, number>>;

export interface BonusLine {
  category: BonusCategory;
  count: number;
  /** Body kategorie po podstropu kategorie (před celkovým stropem). */
  points: number;
  /** Body jedné události (u ostatní práce `null`, body jsou v záznamech). */
  each: number | null;
  /** Kategorie přesáhla svůj podstrop. */
  capped: boolean;
}

export interface BonusResult {
  lines: BonusLine[];
  /** Součet před stropem (po podstropech kategorií). */
  raw: number;
  /** Bonus po stropu, vždy 0 až `BONUS_CAP`. */
  bonus: number;
  /** Součet strop přesáhl. */
  capped: boolean;
}

function safeCount(n: number | undefined): number {
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function capOf(category: BonusCategory): number | null {
  if (category === "thanks") return CATEGORY_CAPS.thanks;
  if (category === "activity") return CATEGORY_CAPS.activity;
  return null;
}

/**
 * `counts` jsou počty událostí po kategoriích, `workPoints` součet bodů
 * udělených za ostatní práci (každý záznam 1 až 10, ořez dělá volající
 * `bonusForMonth`). Funkce se počítá nejvýš jednou.
 */
export function computeBonus(counts: BonusCounts, workPoints = 0): BonusResult {
  const lines: BonusLine[] = BONUS_CATEGORIES.map((category) => {
    let count = safeCount(counts[category]);
    if (category === "function") count = Math.min(1, count);
    if (category === "work") {
      const pts = Number.isFinite(workPoints) && workPoints > 0 ? Math.floor(workPoints) : 0;
      return { category, count, points: count === 0 ? 0 : pts, each: null, capped: false };
    }
    const each = BONUS_POINTS[category];
    const full = count * each;
    const cap = capOf(category);
    const points = cap === null ? full : Math.min(cap, full);
    return { category, count, points, each, capped: cap !== null && full > cap };
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

/**
 * Které části dávají bonus. Bonus existuje jen při zapnutém semaforu a zapnuté
 * části. `points` (iter-044) pokrývá funkci a pět ručních kategorií, je to
 * zapnutý semafor.
 */
export interface BonusSources {
  mastermind: boolean;
  burza: boolean;
  points: boolean;
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
    points: settings.semaforEnabled,
  };
}

/**
 * Aspoň jedna část dává bonus. Při zapnutém semaforu je to vždy `true`
 * (funkce a poděkování existují vždy, gate iter-044 4.6). Větev „bez zdroje
 * bonusu o bonusu nic“ zůstává pro vypnutý semafor.
 */
export function hasBonusSource(sources: BonusSources): boolean {
  return sources.mastermind || sources.burza || sources.points;
}

/** Zdroj, ze kterého kategorie pochází. `Record` vynutí úplnost při kompilaci. */
export const CATEGORY_SOURCE: Record<BonusCategory, keyof BonusSources> = {
  mastermind: "mastermind",
  burza: "burza",
  function: "points",
  training: "points",
  host_member: "points",
  activity: "points",
  thanks: "points",
  work: "points",
};

/** Události jen ze zapnutých částí. Data zůstávají v DB, po zapnutí se bonus vrátí. */
export function filterBonusEvents<T extends { category: BonusCategory }>(
  events: readonly T[],
  sources: BonusSources
): T[] {
  return events.filter((e) => sources[CATEGORY_SOURCE[e.category]]);
}
