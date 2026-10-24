import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { featureOff } from "@/lib/chapter/feature-guard";
import { FeatureOff } from "@/components/chapter/FeatureOff";
import { can } from "@/lib/auth/permissions";
import {
  getMembersWithoutOffer,
  getMyHelpState,
  getOffersForOverview,
} from "@/lib/db/queries/burza";
import { TEXTS, sortOffers } from "@/lib/burza/rules";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { bonusSources } from "@/lib/semafor/bonus";
import { MyOfferBox } from "@/components/burza/MyOfferBox";
import { BurzaTabs } from "@/components/burza/BurzaTabs";
import { OfferList } from "@/components/burza/OfferList";

/**
 * Burza pomoci, záložka Pomoc (iter-035). Vše za přihlášením. Nahoře záložky, hranice, box s vlastním
 * řádkem, hledání a karty abecedně. Vedení navíc vidí pracovní seznam „Bez
 * řádku“ a odkaz na záznamy pomoci (Z4: žádné „K potvrzení“).
 */
export default async function BurzaPage() {
  const session = await requirePageSession();
  if (await featureOff("burza")) return <FeatureOff canManageSettings={can(session, "chapter.settings")} />;
  const isManagement = can(session, "burza.manage");
  const bonusOn = bonusSources(await getChapterSettings()).burza;
  const today = todayInPrague();

  const [offers, helpState, withoutOffer] = await Promise.all([
    getOffersForOverview(),
    getMyHelpState(session.memberId, today),
    isManagement ? getMembersWithoutOffer() : Promise.resolve([]),
  ]);

  const sorted = sortOffers(offers);
  const mine = sorted.find((o) => o.memberId === session.memberId) ?? null;
  const others = sorted.filter((o) => o.memberId !== session.memberId);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Burza pomoci</h1>
      </div>

      <BurzaTabs active="help" />

      <p className="text-sm text-text-muted">{TEXTS.boundary}</p>

      <MyOfferBox
        memberId={session.memberId}
        offer={mine}
        helpedCount={helpState.helpedCount}
        today={today}
      />

      <OfferList
        offers={others}
        burzaEmpty={sorted.length === 0}
        viewerId={session.memberId}
        viewerIsManagement={isManagement}
        recordedByHelper={helpState.recordedByHelper}
        bonusOn={bonusOn}
      />

      {isManagement && (
        <section aria-labelledby="burza-management" className="space-y-3">
          <h2 id="burza-management" className="text-lg font-semibold text-text-main">
            Pro vedení
          </h2>
          <details>
            <summary className="flex min-h-[44px] cursor-pointer select-none items-center rounded text-sm font-medium text-navy focus:outline-none focus:shadow-focus">
              Bez řádku ({withoutOffer.length})
            </summary>
            {withoutOffer.length === 0 ? (
              <p className="text-sm text-text-muted">Řádek má každý člen.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {withoutOffer.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-text-main break-words">{m.name}</span>
                    <Link
                      href={`/burza/${m.id}/edit`}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border bg-white px-4 py-2 text-sm text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus"
                    >
                      Zapsat
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <Link
            href="/burza/pomoc"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-navy hover:underline"
          >
            Záznamy pomoci
          </Link>
        </section>
      )}
    </div>
  );
}
