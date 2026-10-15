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
      {/* iter-032 (arch 7.6): jak se přihlásit */}
      <div className="mb-6 rounded-lg border border-border p-4 text-sm space-y-2">
        <h2 className="font-semibold">Jak se přihlásit</h2>
        <p>
          Na přihlašovací stránce zadej svůj e-mail a dej <strong>Pokračovat</strong>.
          Člen dostane do e-mailu odkaz. Platí 15 minut a jde použít jednou,
          přihlášení pak vydrží 12 hodin. Když mail nedorazí, mrkni do spamu.
          Osobní odkaz od admina funguje dál.
        </p>
        <p>
          Vedení (moderátor, admin) s nastaveným heslem se po zadání e-mailu
          zeptáme na heslo. Heslo si nastavíš odkazem, který ti přijde mailem,
          když ti admin dá roli. Místo hesla si můžeš nechat poslat i odkaz.
        </p>
      </div>
      <HelpTabs tabs={tabs} />
    </div>
  );
}
