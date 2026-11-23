import { requirePageSession } from "@/lib/auth/page-guard";
import { can, isLeadershipAccount } from "@/lib/auth/permissions";
import { getOverviewRows, getSelectableMembers } from "@/lib/db/queries/client-situations";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { isDeadlineActive } from "@/lib/situations/rules";
import { SituationsOverview } from "@/components/situations/SituationsOverview";

export const dynamic = "force-dynamic";

/**
 * Klientské situace, přehled (iter-049). Vše za přihlášením, situace všech
 * vidí každý přihlášený. Zápis za jiného jen s `situations.manage`.
 */
export default async function SituacePage() {
  const session = await requirePageSession();
  const canManage = can(session, "situations.manage");
  // Vedení přihlášené odkazem má práva prázdná, věta mu vysvětlí proč.
  const leadershipViaLink =
    !canManage &&
    session.authMethod !== "password" &&
    isLeadershipAccount({
      managementRole: session.managementRole,
      hasFunction: (session.functionNames?.length ?? 0) > 0,
    });

  const [rows, members] = await Promise.all([
    getOverviewRows(),
    canManage ? getSelectableMembers() : Promise.resolve([]),
  ]);

  return (
    <SituationsOverview
      viewerId={session.memberId}
      rows={rows}
      deadlineActive={isDeadlineActive(todayInPrague())}
      canManage={canManage}
      leadershipViaLink={leadershipViaLink}
      members={members}
    />
  );
}
