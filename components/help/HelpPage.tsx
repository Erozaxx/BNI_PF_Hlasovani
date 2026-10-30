import { HelpTabs } from "@/components/help/HelpTabs";
import { MemberHelp } from "@/components/help/sections/MemberHelp";
import { ModeratorHelp } from "@/components/help/sections/ModeratorHelp";
import { AdminHelp } from "@/components/help/sections/AdminHelp";
import { DEFAULT_CHAPTER_SETTINGS, type ChapterSettings } from "@/lib/chapter/settings";

interface HelpPageProps {
  /** Záložka pro vedení (člen s rolí a heslem). iter-037: počítá stránka. */
  showLeadershipHelp: boolean;
  /** Záložka pro správu členů (právo `members.manage`: admin, Prezident, Viceprezident). */
  showAdminHelp: boolean;
  /** Čtenář smí přidělovat admina a funkce (`access.manage`, jen admin). */
  canManageAccess?: boolean;
  /** iter-043: právo `access.password_reset` (nová otázka o zapomenutém hesle vedení v nápovědě pro vedení). */
  canResetPassword?: boolean;
  /** iter-038: právo `attendance.view_all` (správce docházky, i přihlášený odkazem). */
  showAttendanceHelp?: boolean;
  /** iter-038: právo `attendance.edit_history` (zpětné opravy). */
  showAttendanceHistoryHelp?: boolean;
  /** iter-040: právo `attendance.internal_manage` (zakládání interních schůzek). */
  showInternalMeetingHelp?: boolean;
  /** iter-041: právo `semafor.view_all` (přehled semaforu se jmény). */
  showSemaforHelp?: boolean;
  /** iter-041: právo `semafor.import` (nahrávání souboru, první tři body nápovědy). */
  showSemaforImportHelp?: boolean;
  /**
   * iter-042: nastavení chapteru. Vypnutý Master mind, Burza a Semafor v nápovědě
   * zmizí (sekce i věty o nich), den a začátek schůzky se berou odsud.
   */
  settings?: ChapterSettings;
  /** iter-042: právo `chapter.settings` (sekce Nastavení chapteru v nápovědě admina). */
  canManageSettings?: boolean;
}

export function HelpPage({
  showLeadershipHelp,
  showAdminHelp,
  canManageAccess = false,
  canResetPassword = false,
  showAttendanceHelp = false,
  showAttendanceHistoryHelp = false,
  showInternalMeetingHelp = false,
  showSemaforHelp = false,
  showSemaforImportHelp = false,
  settings = DEFAULT_CHAPTER_SETTINGS,
  canManageSettings = false,
}: HelpPageProps) {
  const semaforHelp = showSemaforHelp && settings.semaforEnabled;
  const tabs = [
    {
      id: "member",
      label: "Pro člena",
      content: <MemberHelp settings={settings} />,
    },
    ...(showLeadershipHelp || showAttendanceHelp || showInternalMeetingHelp || semaforHelp
      ? [
          {
            id: "moderator",
            label: "Pro vedení",
            content: (
              <ModeratorHelp
                showLeadership={showLeadershipHelp}
                passwordReset={canResetPassword}
                attendance={showAttendanceHelp}
                attendanceHistory={showAttendanceHistoryHelp}
                internalMeetings={showInternalMeetingHelp}
                semafor={showSemaforHelp}
                semaforImport={showSemaforImportHelp}
                settings={settings}
              />
            ),
          },
        ]
      : []),
    ...(showAdminHelp
      ? [
          {
            id: "admin",
            label: "Pro admina",
            content: (
              <AdminHelp
                canManageAccess={canManageAccess}
                canManageSettings={canManageSettings}
                settings={settings}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Nápověda</h1>
      <HelpTabs tabs={tabs} />
    </div>
  );
}
