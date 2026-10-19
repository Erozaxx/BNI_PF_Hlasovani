import { HelpTabs } from "@/components/help/HelpTabs";
import { MemberHelp } from "@/components/help/sections/MemberHelp";
import { ModeratorHelp } from "@/components/help/sections/ModeratorHelp";
import { AdminHelp } from "@/components/help/sections/AdminHelp";

interface HelpPageProps {
  managementRole: "admin" | "moderator" | null;
}

export function HelpPage({ managementRole }: HelpPageProps) {
  const tabs = [
    {
      id: "member",
      label: "Pro člena",
      content: <MemberHelp />,
    },
    ...(managementRole === "moderator" || managementRole === "admin"
      ? [
          {
            id: "moderator",
            label: "Pro moderátora",
            content: <ModeratorHelp />,
          },
        ]
      : []),
    ...(managementRole === "admin"
      ? [
          {
            id: "admin",
            label: "Pro admina",
            content: <AdminHelp />,
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
