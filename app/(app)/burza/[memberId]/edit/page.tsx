import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-guard";
import { getOfferForEdit } from "@/lib/db/queries/burza";
import { canEditOffer, isUuid } from "@/lib/burza/rules";
import { OfferForm } from "@/components/burza/OfferForm";

export default async function EditOfferPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  // Pořadí kontrol je závazné (arch 6.1): session, UUID, právo, teprve pak data.
  const session = await requirePageSession();
  const { memberId } = await params;

  // Neplatné UUID by Postgres odmítl chybou 22P02 a stránka by spadla na 500.
  if (!isUuid(memberId)) notFound();

  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  // Bez práva (cizí řádek, člen bez role) přesměrování: z rozdílu 404 a
  // přesměrování se nepozná, jestli UUID patří členovi, a nic se nenačte.
  if (!canEditOffer({ memberId: session.memberId, isManagement }, memberId)) {
    redirect("/burza");
  }

  const found = await getOfferForEdit(memberId);
  if (!found) notFound();

  const own = found.memberId === session.memberId;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/burza" className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline">
          Zpět na Burzu pomoci
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text-main">
          {own ? "Tvůj řádek v burze" : `Řádek v burze: ${found.name}`}
        </h1>
      </div>
      <OfferForm
        memberId={found.memberId}
        isNew={!found.hasOffer}
        initial={{ offer: found.offer, contact: found.contact, note: found.note }}
        canRemove={isManagement && found.hasOffer}
        own={own}
      />
    </div>
  );
}
