import { HelpTabs } from "@/components/help/HelpTabs";
import { MemberHelp } from "@/components/help/sections/MemberHelp";
import { ModeratorHelp } from "@/components/help/sections/ModeratorHelp";
import { AdminHelp } from "@/components/help/sections/AdminHelp";

interface HelpPageProps {
  /** Záložka pro vedení (člen s rolí a heslem). iter-037: počítá stránka. */
  showLeadershipHelp: boolean;
  /** Záložka pro správu členů (právo `members.manage`: admin, Prezident, Viceprezident). */
  showAdminHelp: boolean;
  /** Čtenář smí přidělovat admina, funkce a hesla (`access.manage`, jen admin). */
  canManageAccess?: boolean;
  /** iter-038: právo `attendance.view_all` (správce docházky, i přihlášený odkazem). */
  showAttendanceHelp?: boolean;
  /** iter-038: právo `attendance.edit_history` (zpětné opravy). */
  showAttendanceHistoryHelp?: boolean;
}

export function HelpPage({
  showLeadershipHelp,
  showAdminHelp,
  canManageAccess = false,
  showAttendanceHelp = false,
  showAttendanceHistoryHelp = false,
}: HelpPageProps) {
  const tabs = [
    {
      id: "member",
      label: "Pro člena",
      content: <MemberHelp />,
    },
    ...(showLeadershipHelp || showAttendanceHelp
      ? [
          {
            id: "moderator",
            label: "Pro vedení",
            content: (
              <ModeratorHelp
                showLeadership={showLeadershipHelp}
                attendance={showAttendanceHelp}
                attendanceHistory={showAttendanceHistoryHelp}
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
            content: <AdminHelp canManageAccess={canManageAccess} />,
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
