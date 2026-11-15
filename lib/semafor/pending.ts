/**
 * iter-045 (arch 3.1, 3.2, 4.2, gate 4.3): záznamy, které čekají na započtení.
 * Sdílí je Přehled semaforu (`/semafor/prehled`, se jmény, jen
 * `semafor.view_all`) a „Můj semafor“ (`/semafor`, jen `session.memberId`).
 *
 * Hranice okna: událost čeká, když `after < datum <= today`, kde `after` je
 * poslední den POSLEDNÍHO nahraného měsíce (`getLatestMonth`, nikdy `?m=`).
 * Je to přesný doplněk okna posledního snímku (`bonusWindow`), nic se tedy
 * nezapočte dvakrát. Funkce (R-08) čeká jen přidělená po `after`.
 *
 * Čistý modul, bez DB a Next. Žádné jméno ani číslo člena.
 */
import { monthEnd, monthOf, monthStart, shiftMonth } from "@/lib/attendance/rules";
import {
  BONUS_CATEGORIES,
  BONUS_POINTS,
  CATEGORY_SOURCE,
  WORK_POINTS,
  type BonusCategory,
  type BonusSources,
} from "@/lib/semafor/bonus";
import { POINT_TEXTS, SEMAFOR_TEXTS } from "@/lib/semafor/texts";

export interface PendingRange {
  /** Poslední den posledního nahraného měsíce. Datum události musí být ostře větší. */
  after: string;
  /** Dnešek v Praze, včetně. */
  to: string;
  /** První den měsíce, s jehož daty se záznamy započtou (`YYYY-MM-01`). */
  nextMonth: string;
}

/** `null`: není nahraný měsíc, nebo dnešek není po konci posledního nahraného měsíce. */
export function pendingRange(latest: string | null, today: string): PendingRange | null {
  if (!latest) return null;
  const { year, month } = monthOf(latest);
  const after = monthEnd(year, month);
  if (today <= after) return null;
  const next = shiftMonth(year, month, 1);
  return { after, to: today, nextMonth: monthStart(next.year, next.month) };
}

/** Body jedné události: ostatní práce ořez na `WORK_POINTS.max` (stejně jako `bonusForMonth`), jinak `BONUS_POINTS`. */
export function pendingPoints(category: BonusCategory, points?: number | null): number {
  if (category !== "work") return BONUS_POINTS[category];
  const p = Math.floor(Number(points));
  if (!Number.isFinite(p)) return 0;
  return Math.min(WORK_POINTS.max, Math.max(0, p));
}

/** Řádek sekce „Čeká na započtení“ v Přehledu. Bez textu poděkování a popisu práce (gate Q3). */
export interface PendingRow {
  key: string;
  memberId: string;
  memberName: string;
  active: boolean;
  category: BonusCategory;
  /** `YYYY-MM-DD` */
  date: string;
  points: number;
  /** Doplněk k názvu kategorie ve sloupci „Za co“ (název Master mindu, funkce, akce, nového člena). */
  detail: string | null;
  /** Potvrdil, využil/a, přidělil, zapsal. `null` = bývalý člen. */
  fromName: string | null;
}

/** Řádek `pendingAutoSql` (Master mind, Burza pomoci, funkce). */
export interface PendingAutoDbRow {
  key: string;
  member_id: string;
  member_name: string;
  active: boolean;
  category: BonusCategory;
  d: string;
  detail: string | null;
  /** Jen Burza pomoci: `help` nebo `contact`. */
  kind: "help" | "contact" | null;
  from_name: string | null;
}

/** Ruční záznam (`listPointsForManagement`), jen pole, která sekce potřebuje. Pole `note` se sem nebere. */
export interface PendingManualInput {
  id: string;
  memberId: string;
  memberName: string;
  memberActive: boolean;
  category: BonusCategory;
  earnedOn: string;
  points: number | null;
  authorName: string | null;
  activityTitle: string | null;
  refName: string | null;
}

function manualDetail(r: PendingManualInput): string | null {
  if (r.category === "activity") return r.activityTitle;
  if (r.category === "host_member") return r.refName;
  return null;
}

export function toPendingRows(auto: readonly PendingAutoDbRow[], manual: readonly PendingManualInput[]): PendingRow[] {
  return [
    ...auto.map((x) => ({
      key: x.key,
      memberId: x.member_id,
      memberName: x.member_name,
      active: Boolean(x.active),
      category: x.category,
      date: x.d,
      points: pendingPoints(x.category),
      detail:
        x.kind === "help"
          ? SEMAFOR_TEXTS.pendingBurzaHelp
          : x.kind === "contact"
            ? SEMAFOR_TEXTS.pendingBurzaContact
            : x.detail,
      fromName: x.from_name,
    })),
    ...manual.map((r) => ({
      key: `sp:${r.id}`,
      memberId: r.memberId,
      memberName: r.memberName,
      active: r.memberActive,
      category: r.category,
      date: r.earnedOn,
      points: pendingPoints(r.category, r.points),
      detail: manualDetail(r),
      // Autor ručního záznamu je při zápisu vždy vyplněný, `null` = smazaný účet (jako na záložce Body).
      fromName: r.authorName ?? POINT_TEXTS.formerMember,
    })),
  ];
}

export interface PendingFilter {
  memberId?: string;
  category?: BonusCategory;
}

function single(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Filtr z URL (`?c=`, `?k=`). `c` platí jen jako `memberId` z načtených řádků,
 * `k` jen jako kategorie se zapnutým zdrojem. Cokoli jiného (cizí uuid, text,
 * pole) se ignoruje. Do SQL z URL nejde nic.
 */
export function parsePendingFilter(
  raw: { c?: string | string[]; k?: string | string[] },
  rows: readonly PendingRow[],
  sources: BonusSources
): PendingFilter {
  const out: PendingFilter = {};
  const c = single(raw.c);
  if (c && rows.some((r) => r.memberId === c)) out.memberId = c;
  const k = single(raw.k);
  const category = BONUS_CATEGORIES.find((x) => x === k);
  if (category && sources[CATEGORY_SOURCE[category]]) out.category = category;
  return out;
}

export function filterPending(rows: readonly PendingRow[], f: PendingFilter): PendingRow[] {
  return rows.filter(
    (r) => (f.memberId === undefined || r.memberId === f.memberId) && (f.category === undefined || r.category === f.category)
  );
}

/** Datum sestupně, pak jméno (česky), pak pořadí kategorií. */
export function sortPending(rows: readonly PendingRow[]): PendingRow[] {
  return [...rows].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      a.memberName.localeCompare(b.memberName, "cs") ||
      BONUS_CATEGORIES.indexOf(a.category) - BONUS_CATEGORIES.indexOf(b.category) ||
      a.key.localeCompare(b.key)
  );
}

/** Členové s čekajícím záznamem pro výběr „Komu“, abecedně. */
export function pendingMembers(rows: readonly PendingRow[]): { id: string; name: string; active: boolean }[] {
  const byId = new Map<string, { id: string; name: string; active: boolean }>();
  for (const r of rows) if (!byId.has(r.memberId)) byId.set(r.memberId, { id: r.memberId, name: r.memberName, active: r.active });
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export interface PendingSummaryLine {
  category: BonusCategory;
  count: number;
  /** Součet bodů kategorie bez podstropu a stropu (funkce nejvýš jednou). */
  points: number;
  /** Body jedné události, u ostatní práce `null`. */
  each: number | null;
}

/**
 * Rozpis vlastních čekajících bonusů po kategoriích (gate Q5 A) v pořadí
 * `BONUS_CATEGORIES`, jen kategorie s `count > 0`. Bez podstropů a stropu:
 * uplatní se až při započtení (gate Q6 A, bez odhadu).
 */
export function pendingSummary(events: readonly { category: BonusCategory; points?: number | null }[]): PendingSummaryLine[] {
  const lines: PendingSummaryLine[] = [];
  for (const category of BONUS_CATEGORIES) {
    const mine = events.filter((e) => e.category === category);
    if (mine.length === 0) continue;
    if (category === "function") {
      lines.push({ category, count: 1, points: BONUS_POINTS.function, each: BONUS_POINTS.function });
      continue;
    }
    if (category === "work") {
      const points = mine.reduce((sum, e) => sum + pendingPoints("work", e.points), 0);
      lines.push({ category, count: mine.length, points, each: null });
      continue;
    }
    const each = BONUS_POINTS[category];
    lines.push({ category, count: mine.length, points: mine.length * each, each });
  }
  return lines;
}
