import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import {
  getHelpRecordsForManagement,
  getMemberNames,
  getOfferHolderNames,
} from "@/lib/db/queries/burza";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { HelpRecordsTable } from "@/components/burza/HelpRecordsTable";
import { RecordHelpForm } from "@/components/burza/RecordHelpForm";

/** Záznamy pomoci pro vedení (Z5): formulář zápisu podle hlášení a seznam za 12 měsíců. */
export default async function BurzaHelpPage() {
  await requirePageSession({ role: "management", denyTo: "/burza" });

  const [records, helpers, members] = await Promise.all([
    getHelpRecordsForManagement(todayInPrague()),
    getOfferHolderNames(),
    getMemberNames(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/burza" className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline">
          Zpět na Burzu pomoci
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-text-main">Záznamy pomoci</h1>
      </div>

      <section aria-labelledby="help-record" className="space-y-3">
        <h2 id="help-record" className="text-lg font-semibold text-text-main">
          Zapsat pomoc podle hlášení
        </h2>
        <RecordHelpForm helpers={helpers} members={members} />
      </section>

      <section aria-labelledby="help-list" className="space-y-3">
        <h2 id="help-list" className="text-lg font-semibold text-text-main">
          Posledních 12 měsíců
        </h2>
        <HelpRecordsTable records={records} />
      </section>
    </div>
  );
}
