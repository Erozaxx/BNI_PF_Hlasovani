/**
 * POST /api/t/[token]/control
 *
 * Control endpoint — authenticated by control_token in URL.
 * [token] is matched against control_token (NOT view_token).
 *
 * Body: { action: "start" | "pause" | "reset" | "set_duration", display_seconds?: number }
 *
 * 404 → control_token not found (intentional: no 403 to avoid revealing timer existence)
 * 409 → action cannot be applied in current state (WHERE guard matched 0 rows)
 * 400 → invalid request body
 * 200 → success with current timer state after operation
 *
 * No db.transaction() — each action is a single atomic UPDATE with WHERE guard (LL-003).
 * updated_at is set explicitly in every UPDATE.
 */

// LL-004: force-dynamic prevents Next.js from caching this route handler response
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { getTimerByControlToken } from "@/lib/db/queries/timers";

/**
 * Latency padding constant — sync with actions/timers.ts.
 * initial_seconds = display_seconds + LATENCY_PADDING_SECONDS
 */
const LATENCY_PADDING_SECONDS = 3; // sync with actions/timers.ts

type ControlAction = "start" | "pause" | "reset" | "set_duration";

interface ControlBody {
  action: ControlAction;
  display_seconds?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Parse and validate body
  let body: ControlBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { action, display_seconds } = body;

  if (!action || !["start", "pause", "reset", "set_duration"].includes(action)) {
    return NextResponse.json(
      { error: "action must be one of: start, pause, reset, set_duration" },
      { status: 400 }
    );
  }

  // Verify control token exists.
  // Return 404 (not 403) — do not reveal whether a timer exists for unknown callers.
  const existing = await getTimerByControlToken(token);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const db = drizzle(getSql());

  // -----------------------------------------------------------------------
  // START: paused → running
  // Single atomic UPDATE with WHERE guard — no transaction needed (LL-003)
  // -----------------------------------------------------------------------
  if (action === "start") {
    const result = await db.execute(
      sql`
        UPDATE timer
        SET status = 'running',
            started_at = now(),
            updated_at = now()
        WHERE control_token = ${token}
          AND status = 'paused'
        RETURNING id, name, status, display_seconds, initial_seconds,
                  elapsed_seconds, started_at, view_token, control_token,
                  created_by, created_at, updated_at
      `
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Timer is already running" },
        { status: 409 }
      );
    }

    return buildResponse(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // PAUSE: running → paused
  // Single atomic UPDATE accumulates elapsed_seconds inline — no transaction (LL-003)
  // PostgreSQL guarantees now() and started_at are evaluated in the same snapshot.
  // -----------------------------------------------------------------------
  if (action === "pause") {
    const result = await db.execute(
      sql`
        UPDATE timer
        SET status = 'paused',
            elapsed_seconds = elapsed_seconds
              + EXTRACT(EPOCH FROM (now() - started_at))::integer,
            started_at = NULL,
            updated_at = now()
        WHERE control_token = ${token}
          AND status = 'running'
        RETURNING id, name, status, display_seconds, initial_seconds,
                  elapsed_seconds, started_at, view_token, control_token,
                  created_by, created_at, updated_at
      `
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Timer is already paused" },
        { status: 409 }
      );
    }

    return buildResponse(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // RESET: any → paused, elapsed_seconds=0
  // Idempotent — always succeeds regardless of current status (no WHERE guard on status)
  // -----------------------------------------------------------------------
  if (action === "reset") {
    const result = await db.execute(
      sql`
        UPDATE timer
        SET status = 'paused',
            elapsed_seconds = 0,
            started_at = NULL,
            updated_at = now()
        WHERE control_token = ${token}
        RETURNING id, name, status, display_seconds, initial_seconds,
                  elapsed_seconds, started_at, view_token, control_token,
                  created_by, created_at, updated_at
      `
    );

    if (result.rows.length === 0) {
      // Unreachable: token verified above, but guard defensively
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return buildResponse(result.rows[0]);
  }

  // -----------------------------------------------------------------------
  // SET_DURATION: update display_seconds + initial_seconds, reset elapsed
  // Only allowed when paused (WHERE guard on status)
  // -----------------------------------------------------------------------
  if (action === "set_duration") {
    if (
      display_seconds === undefined ||
      !Number.isInteger(display_seconds) ||
      display_seconds <= 0 ||
      display_seconds > 86400
    ) {
      return NextResponse.json(
        { error: "display_seconds must be a positive integer ≤ 86400" },
        { status: 400 }
      );
    }

    const newDisplaySeconds = display_seconds;
    const newInitialSeconds = newDisplaySeconds + LATENCY_PADDING_SECONDS;

    const result = await db.execute(
      sql`
        UPDATE timer
        SET display_seconds = ${newDisplaySeconds},
            initial_seconds = ${newInitialSeconds},
            elapsed_seconds = 0,
            updated_at = now()
        WHERE control_token = ${token}
          AND status = 'paused'
        RETURNING id, name, status, display_seconds, initial_seconds,
                  elapsed_seconds, started_at, view_token, control_token,
                  created_by, created_at, updated_at
      `
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Timer must be paused to change duration" },
        { status: 409 }
      );
    }

    return buildResponse(result.rows[0]);
  }

  // Unreachable — action validated above
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/**
 * Build consistent JSON response from a raw DB row (snake_case columns from sql``).
 * Computes remaining_seconds server-side (authoritative).
 * Client GUI: displayed_remaining = max(0, min(remaining_seconds, display_seconds))
 */
function buildResponse(row: Record<string, unknown>): NextResponse {
  const initialSeconds = row.initial_seconds as number;
  const elapsedSeconds = row.elapsed_seconds as number;
  const status = row.status as string;
  const startedAt = row.started_at ? new Date(row.started_at as string) : null;

  let remainingSeconds: number;
  if (status === "paused") {
    remainingSeconds = Math.max(0, initialSeconds - elapsedSeconds);
  } else {
    const now = Date.now();
    const startMs = startedAt ? startedAt.getTime() : now;
    const elapsed = elapsedSeconds + Math.floor((now - startMs) / 1000);
    remainingSeconds = Math.max(0, initialSeconds - elapsed);
  }

  return NextResponse.json({
    name: row.name,
    status: row.status,
    remaining_seconds: remainingSeconds,
    display_seconds: row.display_seconds,
    updated_at: new Date(row.updated_at as string).toISOString(),
  });
}
