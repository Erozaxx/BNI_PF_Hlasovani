import { getMembers } from "@/lib/db/queries/members";
import { getMemberFunctionMap } from "@/lib/db/queries/member-functions";
import { deactivationLabel, isMemberActive, pragueToday } from "@/lib/members/activity";
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
  const session = await requirePageSession({ permission: "members.manage" });
  const [members, interviewCounts, dueList, functionMap] = await Promise.all([
    getMembers(),
    getInterviewCountsByMember(),
    getInterviewDueList(),
    getMemberFunctionMap(),
  ]);
  const today = pragueToday();
  const inactiveCount = members.filter((m) => !isMemberActive(m, today)).length;

  // memberId -> { due5, due10 } (arch iter-023 T-001 §3.1), getInterviewDueList()
  // itself is unchanged, this only maps its output for the sortable list.
  const dueByMember = new Map(dueList.map((d) => [d.memberId, d]));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Správa členů</h1>

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
          {inactiveCount > 0
            ? `Členové (${members.length}, z toho neaktivní: ${inactiveCount})`
            : `Členové (${members.length})`}
        </h2>
        {members.length > 0 ? (
          <SortableMemberList
            members={members.map((m) => ({
              id: m.id,
              name: m.name,
              email: m.email ?? null,
              company: m.company ?? null,
              obor: m.obor ?? null,
              managementRole: m.managementRole ?? null,
              functionName: functionMap.get(m.id)?.name ?? null,
              inactiveLabel: deactivationLabel(m, today, { withDate: true }),
              attendanceManager: m.attendanceManagerSince != null,
              interviewCount: interviewCounts.get(m.id) ?? 0,
              due5: dueByMember.get(m.id)?.due5 ?? false,
              due10: dueByMember.get(m.id)?.due10 ?? false,
            }))}
          />
        ) : (
          <Card>
            <EmptyState
              title="Zatím žádní členové"
              description="Přidej prvního člena ve formuláři výše."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
