import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import {
  getInterviewDetail,
  getMemberInterviewsForCompare,
  pairInterviewAnswersForCompare,
  type PairedQuestionRow,
} from "@/lib/db/queries/interviews";
import { getMemberById, getMembers } from "@/lib/db/queries/members";
import { buildInterviewCompareReportHtml } from "@/lib/email/interview-report";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReportPreview } from "@/components/interviews/ReportPreview";
import { SendCompareReportForm } from "./SendCompareReportForm";

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: "Otevreny", variant: "info" },
  submitted: { label: "Odeslany", variant: "success" },
  cancelled: { label: "Zruseny", variant: "neutral" },
};

function AnswerCell({ value }: { value: string | null }) {
  return value && value.trim() !== "" ? (
    <>{value}</>
  ) : (
    <span className="text-text-muted italic">Bez odpovedi</span>
  );
}

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
        {rows.map((row, idx) => (
          <Card key={idx}>
            <p className="text-sm font-medium text-text-main mb-2">
              {row.questionText}
            </p>
            <p className="text-sm text-text-main whitespace-pre-wrap">
              <AnswerCell value={side === "5" ? row.answer5 : row.answer10} />
            </p>
          </Card>
        ))}
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
        <p className="text-sm text-text-muted">Zatim nezalozeno.</p>
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
        Vedouci: {detail?.leaderName ?? "Nepriradeno"}
      </p>
      {detail?.submittedAt && (
        <p className="text-sm text-text-muted">
          Odeslano: {new Date(detail.submittedAt).toLocaleDateString("cs-CZ")}
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
 * only — page-level guard, same pattern as /interviews and /interviews/[id]
 * (middleware only enforces a session on /(app), the role check happens
 * here). Pairing (source_question_id primary, normalized-text fallback,
 * unmatched rows kept in their own section) is done entirely by
 * pairInterviewAnswersForCompare() from T-005 — this page only renders it.
 */
export default async function InterviewComparePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;

  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  if (!isManagement) {
    redirect("/dashboard");
  }

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

  const recipients = members
    .filter((m) => Boolean(m.email))
    .map((m) => ({ id: m.id, name: m.name }));

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/interviews">
        <Button variant="link" size="sm">
          &larr; Zpet na pohovory
        </Button>
      </Link>

      <h1 className="text-2xl font-bold text-text-main">
        {member.name} — Porovnani 5 vs 10 mesicu
      </h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SideSummary label="Pohovor 5 mesicu" side={month5} detail={detail5} />
        <SideSummary label="Pohovor 10 mesicu" side={month10} detail={detail10} />
      </div>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Odpovedi vedle sebe
        </h2>
        {paired.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b-2 border-primary text-left">
                  <th className="px-4 py-3 font-semibold">Otazka</th>
                  <th className="px-4 py-3 font-semibold">Odpoved 5 m</th>
                  <th className="px-4 py-3 font-semibold">Odpoved 10 m</th>
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
                      <AnswerCell value={row.answer5} />
                    </td>
                    <td className="px-4 py-3 whitespace-pre-wrap text-text-main">
                      <AnswerCell value={row.answer10} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <p className="text-sm text-text-muted">Zadne sparovane otazky.</p>
          </Card>
        )}
      </section>

      <OnlyInSection title="Jen v pohovoru 5 mesicu" rows={onlyIn5} side="5" />
      <OnlyInSection title="Jen v pohovoru 10 mesicu" rows={onlyIn10} side="10" />

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Nahled reportu
        </h2>
        <ReportPreview html={compareHtml} />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Odeslat porovnavaci report
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
