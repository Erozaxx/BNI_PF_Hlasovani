import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getCaseById } from "@/lib/db/queries/mastermind";
import { canEdit, caseDescription, isUuid } from "@/lib/mastermind/rules";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { CaseForm } from "@/components/mastermind/CaseForm";

export default async function EditMastermindCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePageSession();
  const { id } = await params;

  // Neplatné UUID by Postgres odmítl chybou 22P02 a stránka by spadla na 500.
  if (!isUuid(id)) notFound();

  const found = await getCaseById(id);
  if (!found) notFound();

  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  const allowed = canEdit(
    { memberId: session.memberId, isManagement },
    { memberId: found.memberId, status: found.status, internalDate: found.internalDate },
    todayInPrague()
  );
  if (!allowed) redirect("/mastermind");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/mastermind" className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline">
          Zpět na Master mind
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text-main">Upravit případ</h1>
        <p className="mt-1 text-sm text-text-muted">Téma přináší: {found.presenterName}</p>
      </div>
      <CaseForm
        mode="edit"
        caseId={found.id}
        viewerId={session.memberId}
        initial={{
          title: found.title,
          description: caseDescription(found),
        }}
      />
    </div>
  );
}
