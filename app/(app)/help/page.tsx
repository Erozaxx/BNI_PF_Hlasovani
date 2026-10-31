import { requirePageSession } from "@/lib/auth/page-guard";
import { can, hasPasswordSession } from "@/lib/auth/permissions";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { holdsCommitteeFunction } from "@/lib/db/queries/semafor-points";
import { HelpPage } from "@/components/help/HelpPage";

export default async function HelpPageRoute() {
  const session = await requirePageSession();
  const settings = await getChapterSettings();
  const showPoints = can(session, "semafor.points");
  // Funkci Člen výboru čte jen dotaz na funkce, `memberId` ze session.
  const showCommittee = showPoints ? await holdsCommitteeFunction(session.memberId) : false;
  return (
    <HelpPage
      showLeadershipHelp={hasPasswordSession(session)}
      showAdminHelp={can(session, "members.manage")}
      canManageAccess={can(session, "access.manage")}
      canResetPassword={can(session, "access.password_reset")}
      showAttendanceHelp={can(session, "attendance.view_all")}
      showAttendanceHistoryHelp={can(session, "attendance.edit_history")}
      showInternalMeetingHelp={can(session, "attendance.internal_manage")}
      showSemaforHelp={can(session, "semafor.view_all")}
      showSemaforImportHelp={can(session, "semafor.import")}
      showSemaforPointsHelp={showPoints}
      showSemaforCommitteeHelp={showCommittee}
      settings={settings}
      canManageSettings={can(session, "chapter.settings")}
    />
  );
}
