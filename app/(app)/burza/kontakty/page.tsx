import { requirePageSession } from "@/lib/auth/page-guard";
import { featureOff } from "@/lib/chapter/feature-guard";
import { FeatureOff } from "@/components/chapter/FeatureOff";
import { can } from "@/lib/auth/permissions";
import { getContactItemsForOverview, getMyContactState } from "@/lib/db/queries/burza";
import { TEXTS, sortContactItems } from "@/lib/burza/rules";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { bonusSources } from "@/lib/semafor/bonus";
import { BurzaTabs } from "@/components/burza/BurzaTabs";
import { ContactList } from "@/components/burza/ContactList";
import { MyContactsBox } from "@/components/burza/MyContactsBox";

/**
 * Burza pomoci, záložka Kontakty (iter-035 doplnění, gate T-012). Vše za
 * přihlášením. Úvod, box „Tvoje kontakty“, hledání a karty cizích položek
 * abecedně podle nabízejícího. Bez bloku „Pro vedení“ (Z8): vedení se k
 * položkám dostane odkazem „Upravit“ na kartě.
 */
export default async function BurzaContactsPage() {
  const session = await requirePageSession();
  if (await featureOff("burza")) return <FeatureOff canManageSettings={can(session, "chapter.settings")} />;
  const isManagement = can(session, "burza.manage");
  const bonusOn = bonusSources(await getChapterSettings()).burza;

  const [items, state] = await Promise.all([
    getContactItemsForOverview(),
    getMyContactState(session.memberId, todayInPrague()),
  ]);

  const sorted = sortContactItems(items);
  const mineCount = sorted.filter((i) => i.memberId === session.memberId).length;
  const others = sorted.filter((i) => i.memberId !== session.memberId);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Burza pomoci</h1>
      </div>

      <BurzaTabs active="contacts" />

      <p className="text-sm text-text-muted">{TEXTS.contactsIntro}</p>

      <MyContactsBox
        memberId={session.memberId}
        itemCount={mineCount}
        usedCount={state.usedCount}
      />

      <ContactList
        items={others}
        viewerId={session.memberId}
        viewerIsManagement={isManagement}
        usedContactIds={state.usedContactIds}
        bonusOn={bonusOn}
      />
    </div>
  );
}
