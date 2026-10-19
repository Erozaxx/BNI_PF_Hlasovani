import { requirePageSession } from "@/lib/auth/page-guard";
import { can, hasPasswordSession } from "@/lib/auth/permissions";
import { HelpPage } from "@/components/help/HelpPage";

export default async function HelpPageRoute() {
  const session = await requirePageSession();
  return (
    <HelpPage
      showLeadershipHelp={hasPasswordSession(session)}
      showAdminHelp={can(session, "members.manage")}
      canManageAccess={can(session, "access.manage")}
    />
  );
}
