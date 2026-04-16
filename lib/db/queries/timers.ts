import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { timer } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

export type Timer = typeof timer.$inferSelect;

/**
 * Compute remaining seconds for a timer.
 * Server is the authoritative source — never trust client-side time.
 *
 * GUI display: displayed_remaining = max(0, min(remaining_seconds, display_seconds))
 * This absorbs the LATENCY_PADDING_SECONDS while keeping the display at 0 minimum.
 */
export function computeRemaining(t: Timer): number {
  if (t.status === "paused") {
    return Math.max(0, t.initialSeconds - t.elapsedSeconds);
  }
  // status === 'running'
  const now = Date.now();
  const startedAt = t.startedAt!.getTime();
  const elapsed = t.elapsedSeconds + Math.floor((now - startedAt) / 1000);
  return Math.max(0, t.initialSeconds - elapsed);
}

/**
 * Get a timer by its view token (for the public display page).
 * Returns null if not found.
 */
export async function getTimerByViewToken(viewToken: string): Promise<Timer | null> {
  const rows = await getDb()
    .select()
    .from(timer)
    .where(eq(timer.viewToken, viewToken))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get a timer by its control token (for the admin control page / control API).
 * Returns null if not found.
 */
export async function getTimerByControlToken(controlToken: string): Promise<Timer | null> {
  const rows = await getDb()
    .select()
    .from(timer)
    .where(eq(timer.controlToken, controlToken))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * List all timers ordered by creation date descending (for admin overview).
 */
export async function listTimers(): Promise<Timer[]> {
  return getDb().select().from(timer).orderBy(desc(timer.createdAt));
}
