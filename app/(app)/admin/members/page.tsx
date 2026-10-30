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
import { can, hasRealPassword } from "@/lib/auth/permissions";
import { listPendingSetPasswordMemberIds } from "@/lib/db/queries/login-links";
import { roleLabel } from "@/lib/members/labels";
import { LeadershipPasswordList } from "./LeadershipPasswordList";

export default async function AdminMembersPage() {
  // iter-043 (K16 A): s `members.manage` dnešní stránka, jen s `access.password_reset`
  // (moderátor, Člen výboru) zúžený seznam „Hesla vedení“.
  const session = await requirePageSession({
    anyOf: ["members.manage", "access.password_reset"],
  });

  if (!can(session, "members.manage")) {
    const [allMembers, functions, pendingIds] = await Promise.all([
      getMembers(),
      getMemberFunctionMap(),
      listPendingSetPasswordMemberIds(),
    ]);
    const todayPrague = pragueToday();
    const pending = new Set(pendingIds);
    const rows = allMembers
      .filter((m) => m.managementRole !== null || functions.has(m.id))
      .map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email ?? null,
        functionName: functions.get(m.id)?.name ?? null,
        roleLabel: roleLabel(m.managementRole),
        isAdmin: m.managementRole === "admin",
        hasPassword: hasRealPassword({
          hasHash: Boolean(m.passwordHash),
          pendingSetPasswordLink: pending.has(m.id),
        }),
        isInactive: !isMemberActive(m, todayPrague),
        isSelf: m.id === session.memberId,
      }));
    return <LeadershipPasswordList rows={rows} />;
  }

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
