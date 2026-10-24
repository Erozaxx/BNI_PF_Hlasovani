/**
 * iter-041 (arch 6.2, gate Z5, Z8): řádky přehledu vedení. Čistý modul.
 *
 * Aktivní člen bez řádku v měsíci má hodnoty `null` (zobrazí se „–“) a řadí se
 * na konec (podle skóre). Deaktivovaný člen se v přehledu ukáže jen když má
 * v měsíci řádek, s označením „(neaktivní)“. Řazení podle interního skóre
 * sestupně, nebo podle jména (česká kolace).
 */
import { colorFromTotal, type SemaforColor } from "@/lib/semafor/color";
import { internalScore, type BonusResult } from "@/lib/semafor/bonus";
import { areasOf, bonusForMonth, type AreaView, type BonusEvent, type ScoreRecord } from "@/lib/semafor/mine";

export type OverviewSort = "score" | "name";

export interface OverviewInput {
  memberId: string;
  name: string;
  active: boolean;
  record: ScoreRecord | null;
  updatedOn: string | null;
}

export interface OverviewItem {
  memberId: string;
  name: string;
  active: boolean;
  hasData: boolean;
  total: number | null;
  bniColor: SemaforColor | null;
  bonus: BonusResult | null;
  internal: number | null;
  internalColor: SemaforColor | null;
  areas: AreaView[] | null;
  updatedOn: string | null;
}

export function parseSort(value: string | string[] | undefined): OverviewSort {
  return value === "name" ? "name" : "score";
}

export function buildOverview(
  month: string,
  rows: readonly OverviewInput[],
  events: readonly BonusEvent[],
  sort: OverviewSort
): OverviewItem[] {
  const items: OverviewItem[] = rows.map((row) => {
    if (!row.record) {
      return {
        memberId: row.memberId,
        name: row.name,
        active: row.active,
        hasData: false,
        total: null,
        bniColor: null,
        bonus: null,
        internal: null,
        internalColor: null,
        areas: null,
        updatedOn: null,
      };
    }
    const bonus = bonusForMonth(month, row.memberId, events);
    const internal = internalScore(row.record.totalScore, bonus.bonus);
    return {
      memberId: row.memberId,
      name: row.name,
      active: row.active,
      hasData: true,
      total: row.record.totalScore,
      bniColor: colorFromTotal(row.record.totalScore),
      bonus,
      internal,
      internalColor: colorFromTotal(internal),
      areas: areasOf(row.record),
      updatedOn: row.updatedOn,
    };
  });
  const byName = (a: OverviewItem, b: OverviewItem) => a.name.localeCompare(b.name, "cs");
  if (sort === "name") return items.sort(byName);
  return items.sort((a, b) => {
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;
    if (a.internal !== null && b.internal !== null && a.internal !== b.internal) return b.internal - a.internal;
    return byName(a, b);
  });
}
