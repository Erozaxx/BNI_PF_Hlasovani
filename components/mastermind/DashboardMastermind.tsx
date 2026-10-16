import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getDashboardMastermindRows } from "@/lib/db/queries/mastermind";
import { formatDM, formatWeekdayDM, interestLabels, summarizeDashboard } from "@/lib/mastermind/rules";
import { todayInPrague } from "@/lib/meetings/voting-window";

/**
 * Samostatný řádek 5 minut na dashboardu (8.1, Z5), pod kartou schůzky.
 * Pro všechny: nejbližší zařazený případ, případně „prezentuješ ty“ a
 * „Jsi přihlášený(á)“. Vedení navíc „Čeká na potvrzení: N“, jen když N > 0
 * (počet zásobníku se nezobrazuje). Selhání dotazu dashboard nesrazí.
 */
export async function DashboardMastermind({
  memberId,
  isManagement,
}: {
  memberId: string;
  isManagement: boolean;
}) {
  let summary;
  try {
    const rows = await getDashboardMastermindRows(memberId);
    summary = summarizeDashboard(rows, memberId, todayInPrague());
  } catch (err) {
    console.error(`[dashboard] mastermind row failed: ${err instanceof Error ? err.name : typeof err}`);
    return null;
  }

  const labels = interestLabels("scheduled");

  return (
    <Card>
      <div className="space-y-2 text-sm text-text-main">
        {summary.next ? (
          <p>
            <Link href="/mastermind" className="font-medium text-navy hover:underline">
              Příští 5 minut: {formatWeekdayDM(summary.next.internalDate)}
            </Link>
            , {summary.next.presenterName}, {summary.next.title},{" "}
            {labels.countText(summary.next.listenerCount)}
          </p>
        ) : (
          <p>
            <Link href="/mastermind" className="font-medium text-navy hover:underline">
              5 minut pro ostatní
            </Link>
            : zatím není nic zařazeno.
          </p>
        )}
        {summary.mine && (
          <p className="font-medium">Na interní {formatDM(summary.mine.internalDate)} prezentuješ ty.</p>
        )}
        {summary.listening && (
          <p>
            <Link href="/mastermind" className="text-navy hover:underline">
              Jsi přihlášený(á) na 5 minut {formatDM(summary.listening.internalDate)}
            </Link>
          </p>
        )}
        {isManagement && summary.awaitingConfirm > 0 && (
          <p>
            <Link href="/mastermind" className="font-medium text-primary hover:underline">
              Čeká na potvrzení: {summary.awaitingConfirm}
            </Link>
          </p>
        )}
      </div>
    </Card>
  );
}
