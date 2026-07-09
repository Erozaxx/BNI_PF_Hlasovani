import { NextRequest, NextResponse } from "next/server";
import { verifyInterviewToken } from "@/lib/auth/interview-magic";
import { getClientIp } from "@/lib/auth/throttle";
import { submitInterview } from "@/lib/db/queries/interviews";

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  });
}

function err(status: number, message: string) {
  return jsonNoStore({ error: message }, status);
}

/**
 * POST /api/i/[token]/submit
 *
 * Close (submit) the interview identified by the scoped magic token (arch
 * 8e). Idempotent: submitInterview() guards with WHERE status='open', so a
 * retry after the status already flipped to 'submitted' affects 0 rows —
 * that is reported as success with alreadySubmitted: true, never as an
 * error. Submit does not require every question to be answered (confirm
 * dialog with the unanswered summary lives client-side).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token: rawToken } = await params;
  const ip = getClientIp(req.headers);

  const result = await verifyInterviewToken(rawToken, ip);

  if (result.status === "rate_limited") {
    return err(429, "Too many attempts");
  }
  if (result.status === "invalid") {
    return err(401, "Invalid token");
  }

  const { interviewId } = result;

  const submitted = await submitInterview(interviewId);

  return jsonNoStore({ success: true, alreadySubmitted: !submitted });
}
