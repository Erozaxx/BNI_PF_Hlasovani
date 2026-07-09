import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  getInterviewDetail,
  getInterviewQuestionsWithAnswers,
} from "@/lib/db/queries/interviews";
import { getMembers } from "@/lib/db/queries/members";
import { getInterviewLinkStatus } from "@/lib/auth/interview-magic";
import { buildInterviewReportHtml } from "@/lib/email/interview-report";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportPreview } from "@/components/interviews/ReportPreview";
import { ChangeLeaderForm } from "./ChangeLeaderForm";
import { DeleteInterviewButton } from "./DeleteInterviewButton";
import { SendInterviewLinkForm } from "./SendInterviewLinkForm";
import { SendInterviewReportForm } from "./SendInterviewReportForm";

const TYPE_LABELS: Record<string, string> = {
  month_5: "5 mesicu",
  month_10: "10 mesicu",
};

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: "Otevreny", variant: "info" },
  submitted: { label: "Odeslany", variant: "success" },
  cancelled: { label: "Zruseny", variant: "neutral" },
};

/**
 * Admin/mod interview detail (arch section 8f, T-007). Answers are rendered
 * strictly read-only — there is no form, no input, no action wired to
 * interview_answer anywhere on this page. The leader fills answers in only
 * through the scoped magic link fill-form (T-008).
 */
export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  if (!isManagement) {
    redirect("/dashboard");
  }

  const detail = await getInterviewDetail(id);
  if (!detail) {
    notFound();
  }

  const [questions, members, linkStatus] = await Promise.all([
    getInterviewQuestionsWithAnswers(id),
    getMembers(),
    getInterviewLinkStatus(id),
  ]);

  const leaderMember = detail.leaderId
    ? members.find((m) => m.id === detail.leaderId)
    : null;

  const typeLabel = TYPE_LABELS[detail.type] ?? detail.type;
  const badge = STATUS_BADGE[detail.status] ?? {
    label: detail.status,
    variant: "neutral" as const,
  };
  const answeredCount = questions.filter(
    (q) => q.valueText !== null && q.valueText.trim() !== ""
  ).length;

  const reportHtml = buildInterviewReportHtml({
    memberName: detail.memberName,
    typeLabel,
    leaderName: detail.leaderName,
    createdAt: detail.createdAt,
    submittedAt: detail.submittedAt,
    questions: questions.map((q) => ({ text: q.text, valueText: q.valueText })),
  });

  const reportRecipients = members
    .filter((m) => Boolean(m.email))
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/interviews">
        <Button variant="link" size="sm">
          &larr; Zpet na pohovory
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            {detail.memberName} — {typeLabel}
          </h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Zalozeno: {new Date(detail.createdAt).toLocaleDateString("cs-CZ")}
            {detail.submittedAt && (
              <>
                {" "}
                &middot; Odeslano:{" "}
                {new Date(detail.submittedAt).toLocaleDateString("cs-CZ")}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/interviews/compare/${detail.memberId}`}>
            <Button variant="secondary" size="sm">
              Porovnat 5 vs 10
            </Button>
          </Link>
          <DeleteInterviewButton
            interviewId={detail.id}
            memberName={detail.memberName}
            typeLabel={typeLabel}
            isSubmitted={detail.status === "submitted"}
            answeredCount={answeredCount}
          />
        </div>
      </div>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Vedouci pohovoru
        </h2>
        <p className="text-text-main mb-3">
          {detail.leaderName ?? "Nepriradeno"}
        </p>
        <ChangeLeaderForm
          interviewId={detail.id}
          currentLeaderId={detail.leaderId}
          members={members.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email ?? null,
          }))}
          disabled={detail.status !== "open"}
        />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Magic link pro vedouciho
        </h2>
        <SendInterviewLinkForm
          interviewId={detail.id}
          interviewStatus={detail.status}
          leaderName={detail.leaderName}
          leaderHasEmail={Boolean(leaderMember?.email)}
          linkStatus={linkStatus}
        />
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Otazky a odpovedi ({answeredCount}/{questions.length} vyplneno)
        </h2>
        {questions.length > 0 ? (
          <div className="space-y-3">
            {questions.map((q) => (
              <Card key={q.snapshotId}>
                <p className="text-sm font-medium text-text-main mb-2">
                  {q.text}
                </p>
                {q.valueText && q.valueText.trim() !== "" ? (
                  <p className="text-sm text-text-main whitespace-pre-wrap">
                    {q.valueText}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted italic">
                    Bez odpovedi
                  </p>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-text-muted">
              Tento pohovor nema zadne otazky v zamrazenem snapshotu.
            </p>
          </Card>
        )}
      </section>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Nahled reportu
        </h2>
        <ReportPreview html={reportHtml} />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Odeslat report
        </h2>
        <SendInterviewReportForm
          interviewId={detail.id}
          canSend={detail.status === "submitted"}
          recipients={reportRecipients}
        />
      </Card>
    </div>
  );
}
