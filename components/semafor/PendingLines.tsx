import type { PendingSummaryLine } from "@/lib/semafor/pending";
import { SEMAFOR_TEXTS, bonusLineText, pendingMineNoteText } from "@/lib/semafor/texts";

/**
 * iter-045 (arch 4.2, gate Q5 A, Q6 A): podsekce „Čeká na započtení“ v „Bonus
 * za 6 měsíců“. Rozpis vlastních čekajících bonusů po kategoriích, bez
 * podstropů a bez odhadu. Data jen přihlášeného člena (rodič čte
 * `session.memberId`). Server komponenta.
 */
export function PendingLines({
  lines,
  afterDate,
  nextMonth,
}: {
  lines: PendingSummaryLine[];
  afterDate: string;
  nextMonth: string;
}) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-text-main">{SEMAFOR_TEXTS.pendingTitle}</h3>
      <ul className="mt-1 space-y-1 text-sm text-text-main">
        {lines.map((l) => (
          <li key={l.category}>{bonusLineText(l.category, l.count, l.each ?? l.points)}</li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-text-muted">{pendingMineNoteText(afterDate, nextMonth)}</p>
    </div>
  );
}
