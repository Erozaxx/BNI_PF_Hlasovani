import { eq, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { authThrottle } from "@/lib/db/schema";
import { THROTTLE_WINDOW_MINUTES } from "@/lib/auth/login-link-core";

function getDb() {
  return drizzle(getSql());
}

/**
 * DB-backed fixed-window rate-limit (H-4 lesson, iter-019 pentest — no Upstash/Redis
 * dependency in this project). One row per key ("<scope>:<ip>", e.g. "i-verify:1.2.3.4").
 *
 * Design: throttleCheck() is read-only (call BEFORE doing expensive/sensitive work,
 * e.g. token hash lookup); throttleFail() records a failed attempt via a single
 * atomic UPSERT (LL-003 safe — no db.transaction()). Only failures are counted, so
 * a legitimate user never gets throttled by their own successful attempts.
 *
 * Isolated interface: swapping to Upstash `@upstash/ratelimit` in a future security
 * iteration only requires changing this file, not call sites.
 */

export { THROTTLE_WINDOW_MINUTES };
export const THROTTLE_MAX_ATTEMPTS = 20;

/**
 * Check whether a throttle key is currently blocked.
 * Read-only — does NOT record an attempt. Call throttleFail() to record one.
 * Blocked = window still active AND count >= THROTTLE_MAX_ATTEMPTS.
 */
export async function throttleCheck(key: string): Promise<{ blocked: boolean }> {
  const rows = await getDb()
    .select({ windowStart: authThrottle.windowStart, count: authThrottle.count })
    .from(authThrottle)
    .where(eq(authThrottle.key, key))
    .limit(1);

  const row = rows[0];
  if (!row) return { blocked: false };

  const windowExpired =
    row.windowStart.getTime() < Date.now() - THROTTLE_WINDOW_MINUTES * 60 * 1000;
  if (windowExpired) return { blocked: false };

  return { blocked: row.count >= THROTTLE_MAX_ATTEMPTS };
}

/**
 * Record a failed attempt for a throttle key.
 * Single atomic UPSERT: resets count=1 and window_start when the previous window
 * has expired, otherwise increments count in place. Safe under concurrent calls
 * without a transaction (Postgres UPSERT is atomic per-row).
 */
export async function throttleFail(key: string): Promise<void> {
  const windowInterval = sql.raw(`INTERVAL '${THROTTLE_WINDOW_MINUTES} minutes'`);

  await getDb()
    .insert(authThrottle)
    .values({ key, windowStart: new Date(), count: 1 })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: {
        count: sql`CASE WHEN ${authThrottle.windowStart} < NOW() - ${windowInterval}
                        THEN 1 ELSE ${authThrottle.count} + 1 END`,
        windowStart: sql`CASE WHEN ${authThrottle.windowStart} < NOW() - ${windowInterval}
                        THEN NOW() ELSE ${authThrottle.windowStart} END`,
      },
    });
}

/**
 * iter-032 (arch 9.3, F2): zapíše pokus pro všechny klíče a vrátí jejich
 * počty jedním atomickým `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`.
 * Souběžné požadavky se řadí na řádkovém zámku UPSERTu, každý dostane jiné
 * číslo, limit tak neobejde ani paralelní volání (na rozdíl od
 * throttleCheck + throttleFail). Rozhodnutí `count > max` dělá volající
 * (`findBlockedRule` v login-link-core.ts). Okno jde jako bind parametr,
 * ne přes sql.raw. Bez transakcí (LL-003).
 */
export async function throttleHit(
  keys: string[],
  windowMinutes: number
): Promise<{ key: string; count: number }[]> {
  if (keys.length === 0) return [];
  const values = sql.join(
    keys.map((k) => sql`(${k}, now(), 1)`),
    sql`, `
  );
  const result = await getDb().execute<{ key: string; count: number }>(sql`
    INSERT INTO auth_throttle (key, window_start, count)
    VALUES ${values}
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN auth_throttle.window_start < now() - make_interval(mins => ${windowMinutes}::int)
                   THEN 1 ELSE auth_throttle.count + 1 END,
      window_start = CASE WHEN auth_throttle.window_start < now() - make_interval(mins => ${windowMinutes}::int)
                   THEN now() ELSE auth_throttle.window_start END
    RETURNING key, count
  `);
  return result.rows.map((r) => ({ key: r.key, count: Number(r.count) }));
}

/** Smaže jeden klíč (po úspěšném přihlášení heslem jen klíč dvojice, 9.3). */
export async function throttleClear(key: string): Promise<void> {
  await getDb().delete(authThrottle).where(eq(authThrottle.key, key));
}

/**
 * Extract the client IP from request headers (Vercel sets x-forwarded-for reliably).
 * .split(",")[0]?.trim() handles the "ip1, ip2" multi-proxy format.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

/**
 * Best-effort cleanup of stale throttle rows (deletes rows whose window started
 * more than a day ago). Intended to be called as an extra step inside the
 * EXISTING close-voting cron — no new cron is introduced (Vercel Hobby: 1 cron).
 * The table stays small even without cleanup (1 row per IP), so this is a
 * housekeeping nicety, not a correctness requirement.
 */
export async function cleanupStaleThrottleRows(): Promise<void> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await getDb().delete(authThrottle).where(lt(authThrottle.windowStart, oneDayAgo));
}
