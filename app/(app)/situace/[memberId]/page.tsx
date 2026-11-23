import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { getSituationMember, getSituationsForMember } from "@/lib/db/queries/client-situations";
import { UI_TEXTS, canEditSituations, isUuid, readOriginal, type Slot } from "@/lib/situations/rules";
import { SituationEditor } from "@/components/situations/SituationEditor";

export const dynamic = "force-dynamic";

/**
 * Klientské situace člena, tři obrazovky (iter-049). Čtení pro každého
 * přihlášeného, úprava u vlastního profilu a u vedení s `situations.manage`.
 * Autorita zápisu je v akcích a SQL, `canEdit` jen skrývá pole. Žádný
 * `loading.tsx` v tomhle segmentu (LL-017).
 */
export default async function SituationDetailPage({
  params,
  searchParams,
}: {
  params: { memberId: string };
  searchParams: { s?: string };
}) {
  const session = await requirePageSession();
  if (!isUuid(params.memberId)) notFound();
  const member = await getSituationMember(params.memberId);
  if (!member) notFound();

  const views = await getSituationsForMember(member.id);
  const isOwn = member.id === session.memberId;
  const canEdit =
    member.active &&
    canEditSituations(
      { memberId: session.memberId, canManage: can(session, "situations.manage") },
      member.id
    );
  const requested = Number(searchParams.s);
  const initialSlot: Slot = requested === 2 || requested === 3 ? requested : 1;

  const situations = views.map((v) => ({
    slot: v.slot,
    client: v.client,
    title: v.title,
    description: v.description,
    original: readOriginal(v.original),
    items: v.items,
  }));

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link
          href="/situace"
          className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline focus:outline-none focus:shadow-focus"
        >
          {UI_TEXTS.backToOverview}
        </Link>
        <h1 className="text-2xl font-bold text-text-main">{UI_TEXTS.pageTitle}</h1>
        <p className="text-sm text-text-muted">{member.name}</p>
      </div>

      {canEdit && !isOwn && (
        <p className="rounded-lg border border-border bg-gold-light px-3 py-2 text-sm text-text-main">
          {UI_TEXTS.fillingFor(member.name)}
        </p>
      )}
      {!member.active && (
        <p className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-muted">
          {UI_TEXTS.readOnlyInactive}
        </p>
      )}

      <SituationEditor
        memberId={member.id}
        situations={situations}
        canEdit={canEdit}
        isOwn={isOwn}
        initialSlot={initialSlot}
      />
    </div>
  );
}
