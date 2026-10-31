/**
 * iter-041 (arch 6.2, gate Z8, Z11): pohled jednoho člena na jeden měsíc.
 * Čistý modul, bez DB. Skládá oficiální barvu BNI, bonus za okno 6 měsíců
 * ke konci měsíce snímku a interní barvu (Total Score + bonus).
 *
 * Do klienta jde jen výsledek pro přihlášeného člena (nikdy cizí řádky).
 */
import { colorFromTotal, type SemaforColor } from "@/lib/semafor/color";
import {
  bonusWindow,
  computeBonus,
  inBonusWindow,
  internalScore,
  type BonusCategory,
  type BonusResult,
  WORK_POINTS,
} from "@/lib/semafor/bonus";

/** Jeden snímek ze `semafor_score` (čísla už jako `number`). */
export interface ScoreRecord {
  month: string;
  memberId: string;
  totalScore: number;
  attendanceRate: number | null;
  attendanceScore: number | null;
  ceuRate: number | null;
  ceuScore: number | null;
  oneToOneRate: number | null;
  oneToOneScore: number | null;
  referralsGivenRate: number | null;
  referralsGivenScore: number | null;
  tyfcb: number | null;
  tyfcbScore: number | null;
  visitors: number | null;
  visitorScore: number | null;
  sponsors: number | null;
  sponsorScore: number | null;
}

export interface BonusEvent {
  memberId: string;
  category: BonusCategory;
  /** `YYYY-MM-DD` */
  date: string;
  /** Jen ostatní práce (`work`): body udělené členem výboru, 1 až `WORK_POINTS.max`. */
  points?: number;
}

export type AreaKey = "attendance" | "ceu" | "oneToOne" | "referrals" | "tyfcb" | "visitors" | "sponsors";

export interface AreaView {
  key: AreaKey;
  score: number | null;
  /** Surová hodnota: poměr (docházka), počet za týden, Kč nebo počet. */
  value: number | null;
}

export const AREA_KEYS: readonly AreaKey[] = [
  "attendance",
  "ceu",
  "oneToOne",
  "referrals",
  "tyfcb",
  "visitors",
  "sponsors",
];

export function areasOf(r: ScoreRecord): AreaView[] {
  return [
    { key: "attendance", score: r.attendanceScore, value: r.attendanceRate },
    { key: "ceu", score: r.ceuScore, value: r.ceuRate },
    { key: "oneToOne", score: r.oneToOneScore, value: r.oneToOneRate },
    { key: "referrals", score: r.referralsGivenScore, value: r.referralsGivenRate },
    { key: "tyfcb", score: r.tyfcbScore, value: r.tyfcb },
    { key: "visitors", score: r.visitorScore, value: r.visitors },
    { key: "sponsors", score: r.sponsorScore, value: r.sponsors },
  ];
}

/**
 * Bonus člena k měsíci snímku: události v okně `(poslední den - 6 měsíců,
 * poslední den]`. Funkce (iter-044, K10) nemá spodní mez: počítá se, když ji
 * člen drží dnes a `date` (přidělení) je nejpozději poslední den měsíce.
 * Body ostatní práce se ořežou na `WORK_POINTS` a sečtou.
 */
export function bonusForMonth(month: string, memberId: string, events: readonly BonusEvent[]): BonusResult {
  const w = bonusWindow(month);
  const counts: Partial<Record<BonusCategory, number>> = {};
  let workPoints = 0;
  for (const e of events) {
    if (e.memberId !== memberId) continue;
    if (e.category === "function") {
      if (e.date <= w.to) counts.function = 1;
      continue;
    }
    if (!inBonusWindow(w, e.date)) continue;
    counts[e.category] = (counts[e.category] ?? 0) + 1;
    if (e.category === "work") {
      const p = Math.floor(Number(e.points));
      if (Number.isFinite(p)) workPoints += Math.min(WORK_POINTS.max, Math.max(0, p));
    }
  }
  return computeBonus(counts, workPoints);
}

/**
 * R-08: události po konci měsíce snímku. Funkce nemá spodní mez okna, takže
 * by se započetla vždy; zůstane jen ta přidělená po `afterDate`. Ostatní
 * kategorie beze změny.
 */
export function eventsAfterSnapshot<T extends { category: BonusCategory; date: string }>(
  events: readonly T[],
  afterDate: string
): T[] {
  return events.filter((e) => (e.category === "function" ? e.date > afterDate : true));
}

export interface MonthView {
  month: string;
  total: number;
  bniColor: SemaforColor;
  bonus: BonusResult;
  internal: number;
  internalColor: SemaforColor;
  areas: AreaView[];
}

export function buildMonthView(record: ScoreRecord, events: readonly BonusEvent[]): MonthView {
  const bonus = bonusForMonth(record.month, record.memberId, events);
  const internal = internalScore(record.totalScore, bonus.bonus);
  return {
    month: record.month,
    total: record.totalScore,
    bniColor: colorFromTotal(record.totalScore),
    bonus,
    internal,
    internalColor: colorFromTotal(internal),
    areas: areasOf(record),
  };
}
