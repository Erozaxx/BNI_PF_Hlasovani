import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getDashboardBurza } from "@/lib/db/queries/burza";
import { TEXTS, summarizeDashboardBurza } from "@/lib/burza/rules";
import { todayInPrague } from "@/lib/meetings/voting-window";

/**
 * Řádek Burzy pomoci na dashboardu (Z4, K9): jen výzva vlastníkovi, jehož
 * řádek je starší než 3 měsíce. Jinak nic (žádná prázdná karta), vedení nic
 * navíc. Selhání dotazu (třeba chybějící tabulka) dashboard nesrazí.
 */
export async function DashboardBurza({ memberId }: { memberId: string }) {
  let summary;
  try {
    const data = await getDashboardBurza(memberId);
    summary = summarizeDashboardBurza(data, todayInPrague());
  } catch (err) {
    console.error(`[dashboard] burza row failed: ${err instanceof Error ? err.name : typeof err}`);
    return null;
  }
  if (!summary) return null;

  return (
    <Card>
      <p className="text-sm text-text-main">
        <Link
          href="/burza"
          className="inline-flex min-h-[44px] items-center font-medium text-navy hover:underline"
        >
          {TEXTS.staleOwn}
        </Link>
      </p>
    </Card>
  );
}
