import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-guard";
import {
  getInterviewDetail,
  getMemberInterviewsForCompare,
  pairInterviewAnswersForCompare,
  type PairedQuestionRow,
} from "@/lib/db/queries/interviews";
import { getMemberById, getMembers } from "@/lib/db/queries/members";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
import { sortMembersByName } from "@/lib/interviews/list-filters";
import { buildInterviewCompareReportHtml } from "@/lib/email/interview-report";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportPreview } from "@/components/interviews/ReportPreview";
import { SendCompareReportForm } from "./SendCompareReportForm";

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: "Otevřený", variant: "info" },
  submitted: { label: "Odeslaný", variant: "success" },
  cancelled: { label: "Zrušený", variant: "neutral" },
};

// iter-021 (arch T-001 6.2): applies === false -> struck-through muted "Neplati"
// (question exists in the snapshot but does not apply to this side's type).
// applies === true / null -> today's behaviour unchanged. In the paired table
// the question text itself is never struck through (it applies to at least
// one side, per the CHECK) - only this answer cell is.
// hasAnswer-first (T-009 review MINOR-2, mirrors OnlyInSection below): an
// existing non-empty value always wins over `applies === false`, so data is
// never hidden - unreachable today (server-side guard in upsertInterviewAnswer
// rejects writes to a non-applicable question), but keeps this defense-in-depth
// rule consistent with OnlyInSection and the detail page instead of only two
// out of three places implementing it.
function AnswerCell({
  value,
  applies,
}: {
  value: string | null;
  applies: boolean | null;
}) {
  const hasAnswer = value !== null && value.trim() !== "";
  if (hasAnswer) {
    return <>{value}</>;
  }
  if (applies === false) {
    return <span className="text-text-muted line-through opacity-60">Neplatí pro tento typ pohovoru</span>;
  }
  return <span className="text-text-muted italic">Bez odpovědi</span>;
}

// iter-021 (arch T-001 6.2): rows here represent a question that exists only
// on ONE side, so - unlike the paired table - the question text itself gets
// struck through when it doesn't apply to that side's own type, with "Neplati
// pro tento typ pohovoru" instead of "Bez odpovedi" (mirrors the detail page).
// `side` always reads its OWN applies flag (T-003 NIT-1 rule), never null here
// (own side can't legally be null in an onlyIn row).
function OnlyInSection({
  title,
  rows,
  side,
}: {
  title: string;
  rows: PairedQuestionRow[];
  side: "5" | "10";
}) {
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="text-lg font-semibold text-text-main mb-4">{title}</h2>
      <div className="space-y-3">
        {rows.map((row, idx) => {
          const value = side === "5" ? row.answer5 : row.answer10;
          const applies = side === "5" ? row.applies5 : row.applies10;
          const doesNotApply = applies === false;
          const hasAnswer = value !== null && value.trim() !== "";
          return (
            <Card key={idx}>
              <p
                className={
                  doesNotApply
                    ? "text-sm font-medium text-text-muted line-through opacity-60 mb-2"
                    : "text-sm font-medium text-text-main mb-2"
                }
              >
                {row.questionText}
              </p>
              <p className="text-sm text-text-main whitespace-pre-wrap">
                {hasAnswer ? (
                  value
                ) : doesNotApply ? (
                  <span className="text-text-muted italic">
                    Neplatí pro tento typ pohovoru
                  </span>
                ) : (
                  <span className="text-text-muted italic">Bez odpovědi</span>
                )}
              </p>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function SideSummary({
  label,
  side,
  detail,
}: {
  label: string;
  side: { id: string; status: string } | null;
  detail: Awaited<ReturnType<typeof getInterviewDetail>>;
}) {
  if (!side) {
    return (
      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-2">{label}</h2>
        <p className="text-sm text-text-muted">Zatím nezaložený.</p>
      </Card>
    );
  }

  const badge = STATUS_BADGE[side.status] ?? {
    label: side.status,
    variant: "neutral" as const,
  };

  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-text-muted">{label}</h2>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>
      <p className="text-sm text-text-main">
        Vedoucí: {detail?.leaderName ?? "Nepřiřazeno"}
      </p>
      {detail?.submittedAt && (
        <p className="text-sm text-text-muted">
          Odesláno: {new Date(detail.submittedAt).toLocaleDateString("cs-CZ")}
        </p>
      )}
      <Link href={`/interviews/${side.id}`}>
        <Button variant="link" size="sm" className="mt-1">
          Zobrazit detail
        </Button>
      </Link>
    </Card>
  );
}

/**
 * 5-vs-10 compare view for a member (arch sections 4.2 / 8f, T-009). Mod/admin
 * only - page-level guard, same pattern as /interviews and /interviews/[id]
 * (middleware only enforces a session on /(app), the role check happens
 * here). Pairing (source_question_id primary, normalized-text fallback,
 * unmatched rows kept in their own section) is done entirely by
 * pairInterviewAnswersForCompare() from T-005 - this page only renders it.
 */
export default async function InterviewComparePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;

  const session = await requirePageSession({ permission: "interviews.manage" });

  const member = await getMemberById(memberId);
  if (!member) {
    notFound();
  }

  const [{ month5, month10 }, members] = await Promise.all([
    getMemberInterviewsForCompare(memberId),
    getMembers(),
  ]);

  const [detail5, detail10] = await Promise.all([
    month5 ? getInterviewDetail(month5.id) : Promise.resolve(null),
    month10 ? getInterviewDetail(month10.id) : Promise.resolve(null),
  ]);

  const { paired, onlyIn5, onlyIn10 } = pairInterviewAnswersForCompare(
    month5?.questions ?? [],
    month10?.questions ?? []
  );

  const bothSubmitted =
    month5?.status === "submitted" && month10?.status === "submitted";

  const compareHtml = buildInterviewCompareReportHtml({
    memberName: member.name,
    paired,
    onlyIn5,
    onlyIn10,
  });

  // iter-032 T-001b 5.2: příjemci porovnání (D5) abecedně.
  const recipients = sortMembersByName(members)
    .filter((m) => Boolean(m.email) && isMemberActive(m, pragueToday()))
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/interviews">
        <Button variant="link" size="sm">
          &larr; Zpět na pohovory
        </Button>
      </Link>

      <h1 className="text-2xl font-bold text-text-main">
        {member.name}: porovnání 5 a 10 měsíců
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SideSummary label="Pohovor po 5 měsících" side={month5} detail={detail5} />
        <SideSummary label="Pohovor po 10 měsících" side={month10} detail={detail10} />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Odpovědi vedle sebe
        </h2>
        {paired.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-primary text-left">
                  <th className="px-4 py-3 font-semibold">Otázka</th>
                  <th className="px-4 py-3 font-semibold">Odpověď po 5 měsících</th>
                  <th className="px-4 py-3 font-semibold">Odpověď po 10 měsících</th>
                </tr>
              </thead>
              <tbody>
                {paired.map((row, idx) => (
                  <tr
                    key={idx}
                    className={`border-b border-border align-top ${idx % 2 === 1 ? "bg-background" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium">{row.questionText}</td>
                    <td className="px-4 py-3 whitespace-pre-wrap text-text-main">
                      <AnswerCell value={row.answer5} applies={row.applies5} />
                    </td>
                    <td className="px-4 py-3 whitespace-pre-wrap text-text-main">
                      <AnswerCell value={row.answer10} applies={row.applies10} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <p className="text-sm text-text-muted">Žádné spárované otázky.</p>
          </Card>
        )}
      </section>

      <OnlyInSection title="Jen v pohovoru po 5 měsících" rows={onlyIn5} side="5" />
      <OnlyInSection title="Jen v pohovoru po 10 měsících" rows={onlyIn10} side="10" />

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Náhled reportu
        </h2>
        <ReportPreview html={compareHtml} />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Odeslat srovnávací report
        </h2>
        <SendCompareReportForm
          memberId={memberId}
          canSend={Boolean(bothSubmitted)}
          recipients={recipients}
        />
      </Card>
    </div>
  );
}
