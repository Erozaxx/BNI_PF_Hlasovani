import { NextRequest, NextResponse } from "next/server";
import { verifyInterviewToken } from "@/lib/auth/interview-magic";
import { getClientIp } from "@/lib/auth/throttle";
import {
  getInterviewDetail,
  getInterviewQuestionsWithAnswers,
} from "@/lib/db/queries/interviews";

// Opt out of Next.js Data Cache — DB state changes (answers, submit) must be
// reflected immediately (LL-004).
export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  month_5: "5 mesicu",
  month_10: "10 mesicu",
};

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
 * GET /api/i/[token]/form
 *
 * Returns the interview fill-form data for the leader identified by the
 * scoped magic token: member being interviewed, question type, current
 * status (open/submitted — drives read-only mode client-side) and the
 * snapshot questions LEFT JOINed with any saved answers.
 *
 * Auth: magic token in URL path — no session required. interview_id is
 * ALWAYS derived server-side from the verified token (H-7/H-8) — never from
 * a client-supplied id, since there is no client-supplied id here at all.
 */
export async function GET(
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

  const detail = await getInterviewDetail(interviewId);
  if (!detail) {
    // Extremely unlikely race (interview deleted between verify and this
    // read) — uniform 401, no enumeration (EN-001).
    return err(401, "Invalid token");
  }

  const questions = await getInterviewQuestionsWithAnswers(interviewId);

  return jsonNoStore({
    memberName: detail.memberName,
    type: detail.type,
    typeLabel: TYPE_LABELS[detail.type] ?? detail.type,
    status: interviewStatus,
    submittedAt: detail.submittedAt,
    questions: questions.map((q) => ({
      snapshotId: q.snapshotId,
      position: q.position,
      text: q.text,
      valueText: q.valueText,
    })),
  });
}
