/**
 * iter-037 (T-003b, arch 4.1, 4.2, 5.1, gate Z1): aktivita člena k datu a čistá
 * rozhodnutí o deaktivaci.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * Bezpečné pro scripts/test-iter-037-members.ts.
 *
 * Pravidlo (jedno místo pravdy v TS, SQL protějšek je `memberActiveSql` v
 * lib/db/queries/member-active.ts):
 *
 *   aktivní(m, dnes) = m.deactivated_at IS NULL
 *                      OR (m.inactive_until IS NOT NULL AND m.inactive_until < dnes)
 *   dnes = kalendářní den v Europe/Prague
 *
 * `inactive_until` je POSLEDNÍ neaktivní den včetně: deaktivace „do 30. 11.“
 * znamená, že 30. 11. je člen celý den neaktivní a 1. 12. od 00:00 pražského
 * času zase aktivní. Bez poznámky k důvodu (gate Z1).
 */

/** Dnešní den v Praze jako „YYYY-MM-DD“ (stejná logika jako `todayInPrague` ve voting-window). */
export function pragueToday(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

/** Nejmenší tvar člena, který aktivita potřebuje (sloupce `member`). */
export interface MemberActivityFields {
  deactivatedAt: Date | string | null;
  /** „YYYY-MM-DD“ nebo `null` (= do odvolání, když je `deactivatedAt` vyplněné). */
  inactiveUntil: string | null;
}

export function isMemberActive(m: MemberActivityFields, todayPrague: string): boolean {
  if (m.deactivatedAt === null || m.deactivatedAt === undefined) return true;
  return m.inactiveUntil !== null && m.inactiveUntil < todayPrague;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` je skutečné kalendářní datum (ne 2026-02-31). */
export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Přičte dny ke kalendářnímu dni, bez časových pásem. */
export function addDaysToDateString(value: string, days: number): string {
  const m = DATE_RE.exec(value);
  if (!m) throw new Error("invalid date");
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return dt.toISOString().slice(0, 10);
}

/** Nejdál smí být konec deaktivace za dva roky (730 dní). */
export const MAX_INACTIVE_DAYS = 730;

export const DEACTIVATION_TEXTS = {
  invalidDate: "Neplatné datum.",
  pastDate: "Datum nesmí být v minulosti.",
  tooFar: "Datum může být nejpozději za dva roky.",
  self: "Sám sebe deaktivovat nejde.",
  lastManager: "Posledního aktivního admina deaktivovat nejde.",
  alreadyInactive: "Člen je už neaktivní, obnov stránku.",
  notFound: "Člen nebyl nalezen.",
  notInactive: "Člen je aktivní, obnov stránku.",
} as const;

export type InactiveUntilResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * `null` = do odvolání. Jinak formát `YYYY-MM-DD`, nejdřív dnešek (dnešek =
 * jen dnešní den neaktivní), nejpozději dnešek + 730 dní.
 */
export function validateInactiveUntil(
  value: string | null | undefined,
  todayPrague: string
): InactiveUntilResult {
  if (value === null || value === undefined || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !isValidDateString(value)) {
    return { ok: false, error: DEACTIVATION_TEXTS.invalidDate };
  }
  if (value < todayPrague) return { ok: false, error: DEACTIVATION_TEXTS.pastDate };
  if (value > addDaysToDateString(todayPrague, MAX_INACTIVE_DAYS)) {
    return { ok: false, error: DEACTIVATION_TEXTS.tooFar };
  }
  return { ok: true, value };
}

/** „30. 11. 2026“ z „2026-11-30“. */
export function formatCzDate(value: string): string {
  const m = DATE_RE.exec(value);
  if (!m) return value;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

/**
 * Štítek deaktivace. `withDate: false` ukáže jen „Neaktivní“ (členské a
 * provozní stránky datum nesmí prozradit, arch 10). `null` u aktivního.
 */
export function deactivationLabel(
  m: MemberActivityFields,
  todayPrague: string,
  opts: { withDate: boolean }
): string | null {
  if (isMemberActive(m, todayPrague)) return null;
  if (!opts.withDate) return "Neaktivní";
  return m.inactiveUntil ? `Neaktivní do ${formatCzDate(m.inactiveUntil)}` : "Neaktivní do odvolání";
}

// ── Rozhodnutí o deaktivaci (jen pro srozumitelnou hlášku, pojistky drží SQL) ──

export interface DeactivationTarget {
  id: string;
  deactivatedAt: Date | string | null;
  inactiveUntil: string | null;
  /** Aktivní člen s právem správy členů (role admin nebo funkce s `members.manage`). */
  isActiveManager: boolean;
}

export type DeactivationDecision =
  | { ok: true }
  | { ok: false; error: "not-found" | "self" | "already-inactive" | "last-manager"; message: string };

/**
 * Pořadí: neexistuje, sebe ne, už neaktivní, poslední aktivní účet se správou
 * členů. Prošlá deaktivace (stará data před úklidem) není „už neaktivní“, jde
 * přepsat.
 */
export function decideDeactivation(input: {
  actorId: string;
  target: DeactivationTarget | null;
  /** Aktivní účty se správou členů kromě cíle. */
  otherActiveManagers: number;
  todayPrague: string;
}): DeactivationDecision {
  const { actorId, target, otherActiveManagers, todayPrague } = input;
  if (!target) {
    return { ok: false, error: "not-found", message: DEACTIVATION_TEXTS.notFound };
  }
  if (target.id === actorId) {
    return { ok: false, error: "self", message: DEACTIVATION_TEXTS.self };
  }
  if (!isMemberActive(target, todayPrague)) {
    return { ok: false, error: "already-inactive", message: DEACTIVATION_TEXTS.alreadyInactive };
  }
  if (target.isActiveManager && otherActiveManagers === 0) {
    return { ok: false, error: "last-manager", message: DEACTIVATION_TEXTS.lastManager };
  }
  return { ok: true };
}
