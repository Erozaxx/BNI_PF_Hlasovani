import { requirePageSession } from "@/lib/auth/page-guard";
import { can, hasPasswordSession } from "@/lib/auth/permissions";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { HelpPage } from "@/components/help/HelpPage";

export default async function HelpPageRoute() {
  const session = await requirePageSession();
  const settings = await getChapterSettings();
  return (
    <HelpPage
      showLeadershipHelp={hasPasswordSession(session)}
      showAdminHelp={can(session, "members.manage")}
      canManageAccess={can(session, "access.manage")}
      showAttendanceHelp={can(session, "attendance.view_all")}
      showAttendanceHistoryHelp={can(session, "attendance.edit_history")}
      showInternalMeetingHelp={can(session, "attendance.internal_manage")}
      showSemaforHelp={can(session, "semafor.view_all")}
      showSemaforImportHelp={can(session, "semafor.import")}
      settings={settings}
      canManageSettings={can(session, "chapter.settings")}
    />
  );
}
