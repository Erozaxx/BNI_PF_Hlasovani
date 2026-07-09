import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getInterviewsList } from "@/lib/db/queries/interviews";
import { getMembers } from "@/lib/db/queries/members";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { InterviewDueSection } from "@/components/interviews/InterviewDueSection";
import { CreateInterviewForm } from "./CreateInterviewForm";

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
 * Interview management landing page (arch section 8a/8f, T-007). Mod/admin
 * only — middleware only session-gates this route (like /interviews/questions,
 * T-004a delta 1), so the role check happens here, page-level (R-9), same as
 * every action in actions/interviews.ts re-checks it independently.
 */
export default async function InterviewsPage() {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";

  if (!isManagement) {
    redirect("/dashboard");
  }

  const [interviews, members] = await Promise.all([
    getInterviewsList(),
    getMembers(),
  ]);

  // memberId -> which types already have a non-cancelled interview — comfort
  // hint for the founding form only, the DB partial UNIQUE stays the authority.
  const existingByMember: Record<string, { month5: boolean; month10: boolean }> = {};
  for (const i of interviews) {
    const entry = existingByMember[i.memberId] ?? { month5: false, month10: false };
    if (i.type === "month_5") entry.month5 = true;
    if (i.type === "month_10") entry.month10 = true;
    existingByMember[i.memberId] = entry;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text-main">Pohovory</h1>
        <Link href="/interviews/questions">
          <Button variant="secondary" size="sm">
            Sprava otazek
          </Button>
        </Link>
      </div>

      <InterviewDueSection />

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Zalozit pohovor
        </h2>
        <CreateInterviewForm
          members={members.map((m) => ({
            id: m.id,
            name: m.name,
            email: m.email ?? null,
          }))}
          currentMemberId={session.memberId}
          existingByMember={existingByMember}
        />
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Seznam pohovoru ({interviews.length})
        </h2>
        {interviews.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-primary text-left">
                  <th className="px-4 py-3 font-semibold">Clen</th>
                  <th className="px-4 py-3 font-semibold">Typ</th>
                  <th className="px-4 py-3 font-semibold">Stav</th>
                  <th className="px-4 py-3 font-semibold">Vedouci</th>
                  <th className="px-4 py-3 font-semibold">Zalozeno</th>
                  <th className="px-4 py-3 font-semibold">Odeslano</th>
                  <th className="px-4 py-3 font-semibold" aria-label="Akce"></th>
                </tr>
              </thead>
              <tbody>
                {interviews.map((i, idx) => {
                  const badge = STATUS_BADGE[i.status] ?? {
                    label: i.status,
                    variant: "neutral" as const,
                  };
                  return (
                    <tr
                      key={i.id}
                      className={`border-b border-border ${idx % 2 === 1 ? "bg-background" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium">{i.memberName}</td>
                      <td className="px-4 py-3">{TYPE_LABELS[i.type] ?? i.type}</td>
                      <td className="px-4 py-3">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {i.leaderName ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {new Date(i.createdAt).toLocaleDateString("cs-CZ")}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {i.submittedAt
                          ? new Date(i.submittedAt).toLocaleDateString("cs-CZ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/interviews/${i.id}`}>
                          <Button variant="secondary" size="sm">
                            Detail
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <EmptyState
              title="Zatim zadne pohovory"
              description="Zalozte prvni pohovor pomoci formulare vyse."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
