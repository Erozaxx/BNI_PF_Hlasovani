import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { getContactItemsForEdit } from "@/lib/db/queries/burza";
import { CONTACT_ITEMS_LIMIT, TEXTS, canEditContacts, isUuid } from "@/lib/burza/rules";
import { ContactItemForm } from "@/components/burza/ContactItemForm";
import { ContactItemsEditor } from "@/components/burza/ContactItemsEditor";

/** Správa položek kontaktů člena: vlastník, nebo vedení za kteréhokoli člena. */
export default async function ManageContactsPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  // Pořadí kontrol je závazné (jako edit řádku): session, UUID, právo, teprve pak data.
  const session = await requirePageSession();
  const { memberId } = await params;

  if (!isUuid(memberId)) notFound();

  const isManagement = can(session, "burza.manage");
  if (!canEditContacts({ memberId: session.memberId, isManagement }, memberId)) {
    redirect("/burza/kontakty");
  }

  const found = await getContactItemsForEdit(memberId);
  if (!found) notFound();

  const own = found.memberId === session.memberId;
  const full = found.items.length >= CONTACT_ITEMS_LIMIT;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/burza/kontakty"
          className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline"
        >
          {TEXTS.backToContacts}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text-main">
          {own ? TEXTS.manageOwnTitle : TEXTS.manageOtherTitle(found.name)}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-text-muted">{TEXTS.contactHint}</p>
      </div>

      {found.items.length > 0 && <ContactItemsEditor memberId={found.memberId} items={found.items} />}

      {full ? (
        <p className="max-w-3xl text-sm text-text-muted">{TEXTS.contactLimitFull}</p>
      ) : (
        <ContactItemForm memberId={found.memberId} />
      )}
    </div>
  );
}
