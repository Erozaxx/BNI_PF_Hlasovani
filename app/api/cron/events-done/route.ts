import { NextRequest, NextResponse } from "next/server";
import { getEventsEligibleForDone, markEventDone } from "@/lib/db/queries/events";

/**
 * Cron endpoint: auto-done transition for closed events.
 *
 * Finds all events where status='closed' AND closed_at <= now() - 1 day,
 * then for each event:
 *   - Sets magic_token_hash = NULL for all participants (revokes access)
 *   - Sets tokens_revoked_at, done_at, status = 'done' on the event
 *
 * Protected by Authorization: Bearer <CRON_SECRET>.
 * Vercel sends GET requests for cron jobs.
 */
async function handler(request: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[events-done] CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const eligible = await getEventsEligibleForDone();

    if (eligible.length === 0) {
      return NextResponse.json({ done: 0, message: "No events to close" });
    }

    const processed: string[] = [];
    const errors: string[] = [];

    for (const ev of eligible) {
      try {
        await markEventDone(ev.id);
        processed.push(ev.id);
        console.log(`[events-done] Event ${ev.id} (${ev.title}) marked as done`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[events-done] Failed to mark event ${ev.id} as done:`, msg);
        errors.push(`${ev.id}: ${msg}`);
      }
    }

    return NextResponse.json({
      done: processed.length,
      processedIds: processed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("[events-done] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Vercel cron sends GET requests. */
export async function GET(request: NextRequest) {
  return handler(request);
}

/** Keep POST for manual/programmatic invocation. */
export async function POST(request: NextRequest) {
  return handler(request);
}
