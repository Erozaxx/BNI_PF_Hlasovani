import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getMembers } from "@/lib/db/queries/members";
import { sortMembersByName } from "@/lib/interviews/list-filters";
import { CaseForm } from "@/components/mastermind/CaseForm";

export default async function NewMastermindCasePage() {
  const session = await requirePageSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";

  // Výběr přednášejícího vidí jen vedení (zápis za člena, který se přihlásil ústně).
  const members = isManagement
    ? sortMembersByName((await getMembers()).map((m) => ({ id: m.id, name: m.name })))
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/mastermind" className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline">
          Zpět na 5 minut
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text-main">Přihlásit případ</h1>
      </div>
      <CaseForm mode="create" members={members} viewerId={session.memberId} />
    </div>
  );
}
