import { headers } from "next/headers";
import { verifyInterviewToken } from "@/lib/auth/interview-magic";
import { getClientIp } from "@/lib/auth/throttle";
import {
  getInterviewDetail,
  getInterviewQuestionsWithAnswers,
} from "@/lib/db/queries/interviews";
import { InterviewExpired } from "./_components/InterviewExpired";
import {
  InterviewFillForm,
  type InterviewQuestionShape,
} from "./_components/InterviewFillForm";

const TYPE_LABELS: Record<string, string> = {
  month_5: "5 mesicu",
  month_10: "10 mesicu",
};

interface FormData {
  memberName: string;
  type: string;
  typeLabel: string;
  status: "open" | "submitted";
  submittedAt: string | null;
  questions: InterviewQuestionShape[];
}

type FetchResult = FormData | "expired" | null;

/**
 * Verify the token and load the fill-form data directly (no HTTP self-fetch
 * to /api/i/[token]/form). Security review M-1 (T-011): a self-fetch from a
 * server component would call the API route as a brand-new outbound request,
 * so getClientIp() would read x-forwarded-for from that internal hop (SSR
 * egress IP) rather than the real end-user IP, weakening per-IP throttle
 * isolation and risking a shared-bucket 429 for unrelated legitimate leaders.
 * Calling verifyInterviewToken()/the queries in-process instead means the
 * throttle key is keyed on headers() from THIS actual incoming request — the
 * real client IP, exactly like the direct API routes (form/answers/submit)
 * already get it. The mutating endpoints (PUT /answers, POST /submit) are
 * always called client-side from the browser (InterviewFillForm) and are
 * unaffected by this.
 */
async function loadFormData(token: string): Promise<FetchResult> {
  try {
    const ip = getClientIp(await headers());
    const result = await verifyInterviewToken(token, ip);

    if (result.status === "rate_limited" || result.status === "invalid") {
      return "expired";
    }

    const { interviewId, interviewStatus } = result;

    const detail = await getInterviewDetail(interviewId);
    if (!detail) {
      // Extremely unlikely race (interview deleted between verify and this
      // read) — treat the same as an expired/invalid link, no enumeration.
      return "expired";
    }

    const questions = await getInterviewQuestionsWithAnswers(interviewId);

    return {
      memberName: detail.memberName,
      type: detail.type,
      typeLabel: TYPE_LABELS[detail.type] ?? detail.type,
      status: interviewStatus as "open" | "submitted",
      submittedAt: detail.submittedAt ? detail.submittedAt.toISOString() : null,
      questions: questions.map((q) => ({
        snapshotId: q.snapshotId,
        position: q.position,
        text: q.text,
        valueText: q.valueText,
      })),
    };
  } catch {
    return null;
  }
}

/**
 * Public fill-form entry point for the interview leader (arch section 8d,
 * T-008). Server component — no iron-session, the scoped token is the sole
 * authority (verified server-side via verifyInterviewToken, same as the
 * /api/i/[token]/* routes used for save/submit).
 */
export default async function InterviewFillPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await loadFormData(token);

  if (data === "expired" || data === null) {
    return <InterviewExpired />;
  }

  return (
    <InterviewFillForm
      token={token}
      memberName={data.memberName}
      typeLabel={data.typeLabel}
      status={data.status}
      submittedAt={data.submittedAt}
      initialQuestions={data.questions}
    />
  );
}
