/**
 * iter-027 (T-005) — retence bez druhého cronu (arch iter-027 T-001, sekce
 * 10). Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/server ani
 * resend. Bezpečné pro scripts/test-ops-events.ts (tsx bez DATABASE_URL).
 *
 * Mechanismus (DELETE ... WHERE id IN (SELECT id ... LIMIT 5000)) žije v
 * lib/db/queries/ops-events.ts (purgeOldOpsEvents) — tenhle soubor drží jen
 * čisté rozhodnutí "co je staré".
 */

/**
 * Resend drží historii ~30 dní. Zadání žádá, aby vlastní záznam přežil déle
 * než jeho — 180 dní pokryje "co se dělo před třemi týdny" i celou sezónu
 * schůzek zpětně (10.2).
 */
export const OPS_EVENT_RETENTION_DAYS = 180;

/** Řádky s `occurred_at` starším než tenhle cutoff smí retence smazat. */
export function retentionCutoff(now: Date): Date {
  return new Date(now.getTime() - OPS_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}
