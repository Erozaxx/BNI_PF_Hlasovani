import { getMembers } from "@/lib/db/queries/members";
import {
  getInterviewCountsByMember,
  getInterviewDueList,
} from "@/lib/db/queries/interviews";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateMemberForm } from "./CreateMemberForm";
import { ImportMembersForm } from "./ImportMembersForm";
import { SortableMemberList } from "./SortableMemberList";
import { requirePageSession } from "@/lib/auth/page-guard";

export default async function AdminMembersPage() {
  const session = await requirePageSession({ role: "admin" });
  const [members, interviewCounts, dueList] = await Promise.all([
    getMembers(),
    getInterviewCountsByMember(),
    getInterviewDueList(),
  ]);

  // memberId -> { due5, due10 } (arch iter-023 T-001 §3.1) — getInterviewDueList()
  // itself is unchanged, this only maps its output for the sortable list.
  const dueByMember = new Map(dueList.map((d) => [d.memberId, d]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Sprava clenu</h1>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Nový člen
        </h2>
        <CreateMemberForm />
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Import členů z XLSX
        </h2>
        <ImportMembersForm />
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Členové ({members.length})
        </h2>
        {members.length > 0 ? (
          <SortableMemberList
            currentMemberId={session.memberId}
            members={members.map((m) => ({
              id: m.id,
              name: m.name,
              email: m.email ?? null,
              company: m.company ?? null,
              obor: m.obor ?? null,
              managementRole: m.managementRole ?? null,
              hasPassword: Boolean(m.passwordHash),
              magicTokenHash: m.magicTokenHash ?? null,
              tokenUsed: m.tokenUsed,
              joinedAt: m.joinedAt,
              interviewCount: interviewCounts.get(m.id) ?? 0,
              due5: dueByMember.get(m.id)?.due5 ?? false,
              due10: dueByMember.get(m.id)?.due10 ?? false,
            }))}
          />
        ) : (
          <Card>
            <EmptyState
              title="Zatim zadni clenove"
              description="Pridejte prvniho clena pomoci formulare vyse."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
