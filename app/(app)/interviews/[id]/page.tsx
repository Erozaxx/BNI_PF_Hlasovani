import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-guard";
import {
  getInterviewDetail,
  getInterviewQuestionsWithAnswers,
} from "@/lib/db/queries/interviews";
import { getMembers } from "@/lib/db/queries/members";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
import { sortMembersByName } from "@/lib/interviews/list-filters";
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
  month_5: "5 měsíců",
  month_10: "10 měsíců",
};

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: "Otevřený", variant: "info" },
  submitted: { label: "Odeslaný", variant: "success" },
  cancelled: { label: "Zrušený", variant: "neutral" },
};

/**
 * Admin/mod interview detail (arch section 8f, T-007). Answers are rendered
 * strictly read-only - there is no form, no input, no action wired to
 * interview_answer anywhere on this page. The leader fills answers in only
 * through the scoped magic link fill-form (T-008).
 */
export default async function InterviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await requirePageSession({ permission: "interviews.manage" });

  const detail = await getInterviewDetail(id);
  if (!detail) {
    notFound();
  }

  const [questions, allMembers, linkStatus] = await Promise.all([
    getInterviewQuestionsWithAnswers(id),
    getMembers(),
    getInterviewLinkStatus(id),
  ]);
  // iter-032 T-001b 5.2: výběr vedoucího (D3) a příjemce reportu (D4) abecedně.
  const members = sortMembersByName(allMembers);

  const leaderMember = detail.leaderId
    ? members.find((m) => m.id === detail.leaderId)
    : null;

  const typeLabel = TYPE_LABELS[detail.type] ?? detail.type;
  const badge = STATUS_BADGE[detail.status] ?? {
    label: detail.status,
    variant: "neutral" as const,
  };
  const questionApplies = (q: { appliesMonth5: boolean; appliesMonth10: boolean }) =>
    detail.type === "month_5" ? q.appliesMonth5 : q.appliesMonth10;

  // iter-021 (arch T-001 6.1): DeleteInterviewButton warning counts REAL
  // existing answers, unfiltered by applicability - unchanged semantics.
  const answeredCount = questions.filter(
    (q) => q.valueText !== null && q.valueText.trim() !== ""
  ).length;

  // Header "X/Y vyplneno" - Y = jen platne otazky pro tento typ, X =
  // zodpovezene z platnych (konzistentni s fill-form countem, T-007). Pro
  // stare pohovory (true/true) je applicableQuestions === questions, takze
  // se cislo nezmeni ani o znak.
  const applicableQuestions = questions.filter(questionApplies);
  const answeredApplicableCount = applicableQuestions.filter(
    (q) => q.valueText !== null && q.valueText.trim() !== ""
  ).length;

  const reportHtml = buildInterviewReportHtml({
    memberName: detail.memberName,
    typeLabel,
    leaderName: detail.leaderName,
    createdAt: detail.createdAt,
    submittedAt: detail.submittedAt,
    questions: questions.map((q) => ({
      text: q.text,
      valueText: q.valueText,
      applies: questionApplies(q),
    })),
  });

  const reportRecipients = members
    .filter((m) => Boolean(m.email) && isMemberActive(m, pragueToday()))
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/interviews">
        <Button variant="link" size="sm">
          &larr; Zpět na pohovory
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            {detail.memberName}: {typeLabel}
          </h1>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Založeno: {new Date(detail.createdAt).toLocaleDateString("cs-CZ")}
            {detail.submittedAt && (
              <>
                {" "}
                &middot; Odesláno:{" "}
                {new Date(detail.submittedAt).toLocaleDateString("cs-CZ")}
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/interviews/compare/${detail.memberId}`}>
            <Button variant="secondary" size="sm" className="min-h-[44px]">
              Porovnat 5 a 10 měsíců
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
          Vedoucí pohovoru
        </h2>
        <p className="text-text-main mb-3">
          {detail.leaderName ?? "Nepřiřazeno"}
        </p>
        <ChangeLeaderForm
          interviewId={detail.id}
          currentLeaderId={detail.leaderId}
          // iter-037 (K13): vedoucí jen aktivní. Současný vedoucí zůstane ve
          // výběru, i když je neaktivní, ať je jasné, kdo to teď je.
          members={members
            .filter((m) => m.id === detail.leaderId || isMemberActive(m, pragueToday()))
            .map((m) => ({
              id: m.id,
              name: isMemberActive(m, pragueToday()) ? m.name : `${m.name} (neaktivní)`,
              email: m.email ?? null,
            }))}
          disabled={detail.status !== "open"}
        />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Odkaz pro vedoucího
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
          Otázky a odpovědi ({answeredApplicableCount}/{applicableQuestions.length} vyplněno)
        </h2>
        {questions.length > 0 ? (
          <div className="space-y-3">
            {questions.map((q) => {
              const applies = questionApplies(q);
              const hasAnswer = q.valueText !== null && q.valueText.trim() !== "";
              return (
                <Card key={q.snapshotId}>
                  <p
                    className={
                      applies
                        ? "text-sm font-medium text-text-main mb-2"
                        : "text-sm font-medium text-text-muted line-through opacity-60 mb-2"
                    }
                  >
                    {q.text}
                  </p>
                  {hasAnswer ? (
                    <p className="text-sm text-text-main whitespace-pre-wrap">
                      {q.valueText}
                    </p>
                  ) : applies ? (
                    <p className="text-sm text-text-muted italic">
                      Bez odpovědi
                    </p>
                  ) : (
                    <p className="text-sm text-text-muted italic">
                      Neplatí pro tento typ pohovoru
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <p className="text-sm text-text-muted">
              Tento pohovor nemá žádné otázky.
            </p>
          </Card>
        )}
      </section>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Náhled reportu
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
