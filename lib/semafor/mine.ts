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

/** Bonus člena k měsíci snímku: počty událostí v okně `(poslední den - 6 měsíců, poslední den]`. */
export function bonusForMonth(month: string, memberId: string, events: readonly BonusEvent[]): BonusResult {
  const w = bonusWindow(month);
  const counts = { mastermind: 0, burza: 0 };
  for (const e of events) {
    if (e.memberId !== memberId) continue;
    if (inBonusWindow(w, e.date)) counts[e.category]++;
  }
  return computeBonus(counts);
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
