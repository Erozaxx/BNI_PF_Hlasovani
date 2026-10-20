import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { pragueToday } from "@/lib/members/activity";
import {
  DASHBOARD_TEXTS,
  absenceCountParts,
  absenceWindowStart,
  buildAbsenceCardView,
} from "@/lib/attendance/rules";
import {
  getFirstClosedDay,
  getNextAbsence,
  listMyAbsenceDays,
} from "@/lib/db/queries/attendance";

/**
 * iter-038 (T-003a, arch 12.3, gate sekce 5): karta „Docházka“ na dashboardu
 * každého přihlášeného člena (i vedení, i přihlášeného odkazem). Absence za
 * plovoucích 6 měsíců z UZAVŘENÝCH dní, od 3 oranžově (barva i text, číslo
 * tučně). Člen vidí jen svoje čísla. Selhání dotazu dashboard nesrazí.
 */
export async function DashboardAttendance({ memberId }: { memberId: string }) {
  const today = pragueToday();
  let view;
  try {
    const [days, firstClosed, next] = await Promise.all([
      listMyAbsenceDays(memberId, absenceWindowStart(today), today),
      getFirstClosedDay(),
      getNextAbsence(memberId, today),
    ]);
    view = buildAbsenceCardView({
      count: days.length,
      firstClosedDay: firstClosed,
      today,
      next: next ? { date: next.date, substituteName: next.substituteName } : null,
    });
  } catch (err) {
    console.error(`[dashboard] attendance card failed: ${err instanceof Error ? err.name : typeof err}`);
    return null;
  }

  // Číslo absencí tučně (u nuly ve větě číslo není).
  const parts = absenceCountParts(view.count);

  return (
    <div
      data-attendance-card={view.warn ? "warn" : "ok"}
      className={`rounded-card border p-6 shadow-card ${
        view.warn ? "border-warning bg-warning-light" : "border-border bg-surface"
      }`}
    >
      <div className="space-y-2 text-sm">
        <h2 className="text-base font-semibold text-text-main">{DASHBOARD_TEXTS.title}</h2>
        <p className="text-text-main">
          {parts.before}
          {parts.strong !== null && <strong>{parts.strong}</strong>}
          {parts.after}
        </p>
        {view.sinceText && <p className="text-text-muted">{view.sinceText}</p>}
        {view.nextText && <p className="text-text-main">{view.nextText}</p>}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link href="/dochazka">
            <Button variant="secondary" size="sm" className="min-h-[44px]">
              {DASHBOARD_TEXTS.action}
            </Button>
          </Link>
          <Link
            href="/dochazka#absence"
            className="inline-flex min-h-[44px] items-center text-navy hover:underline"
          >
            {DASHBOARD_TEXTS.showDays}
          </Link>
          <Link
            href="/pravidla/absence#treti-absence"
            className="inline-flex min-h-[44px] items-center text-navy hover:underline"
          >
            {DASHBOARD_TEXTS.rulesLink}
          </Link>
        </div>
      </div>
    </div>
  );
}
