import { NextRequest, NextResponse } from "next/server";
import { verifyInterviewToken } from "@/lib/auth/interview-magic";
import { getClientIp } from "@/lib/auth/throttle";
import { upsertInterviewAnswer } from "@/lib/db/queries/interviews";

export const dynamic = "force-dynamic";

const MAX_ANSWER_LENGTH = 10000;

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
 * PUT /api/i/[token]/answers
 *
 * Upsert a single answer for the interview identified by the scoped magic
 * token. Only allowed while interview.status === 'open' (arch 8d) — once
 * submitted, writes are dead (the leader can still view via GET .../form,
 * which returns a read-only payload).
 *
 * Body: { snapshotQuestionId: string, valueText: string | null }
 *
 * interview_id is ALWAYS derived server-side from the verified token
 * (H-7/H-8) — snapshotQuestionId is client-supplied but the ownership guard
 * lives in upsertInterviewAnswer() (WHERE snapshot.interview_id = derived id),
 * with the composite FK as a second line of defense at the DB level.
 */
export async function PUT(
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

  const { interviewId, interviewStatus } = result;

  if (interviewStatus !== "open") {
    return err(403, "Pohovor je uzavren, odpovedi nelze upravovat.");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "Invalid JSON body");
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).snapshotQuestionId !== "string"
  ) {
    return err(400, "Missing required field: snapshotQuestionId");
  }

  const { snapshotQuestionId, valueText } = body as {
    snapshotQuestionId: string;
    valueText?: unknown;
  };

  if (
    valueText !== null &&
    valueText !== undefined &&
    typeof valueText !== "string"
  ) {
    return err(400, "valueText must be a string or null");
  }

  const normalizedValue = typeof valueText === "string" ? valueText : null;

  if (normalizedValue !== null && normalizedValue.length > MAX_ANSWER_LENGTH) {
    return err(400, `Odpoved je prilis dlouha (max ${MAX_ANSWER_LENGTH} znaku).`);
  }

  const upserted = await upsertInterviewAnswer({
    interviewId,
    snapshotQuestionId,
    valueText: normalizedValue,
  });

  if (!upserted.success) {
    // snapshotQuestionId did not belong to this interview — foreign/mismatched
    // id (H-7/H-8), not a system error.
    return err(400, "Otazka nepatri k tomuto pohovoru.");
  }

  return jsonNoStore({ success: true });
}
