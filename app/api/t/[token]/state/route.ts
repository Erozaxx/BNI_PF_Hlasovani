/**
 * GET /api/t/[token]/state
 *
 * Public polling endpoint — no session required.
 * [token] is matched against view_token.
 *
 * Response: { name, status, remaining_seconds, display_seconds, updated_at }
 * remaining_seconds is always computed server-side (authoritative).
 * Client GUI: displayed_remaining = max(0, min(remaining_seconds, display_seconds))
 *
 * 404 → view_token not found
 */

// LL-004: force-dynamic prevents Next.js from caching this route handler response
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getTimerByViewToken, computeRemaining } from "@/lib/db/queries/timers";

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const t = await getTimerByViewToken(token);

  if (!t) {
    return NextResponse.json({ error: "Timer not found" }, { status: 404 });
  }

  const remainingSeconds = computeRemaining(t);

  return NextResponse.json({
    name: t.name,
    status: t.status,
    remaining_seconds: remainingSeconds,
    // Client uses: displayed_remaining = max(0, min(remaining_seconds, display_seconds))
    display_seconds: t.displaySeconds,
    updated_at: t.updatedAt.toISOString(),
  });
}
