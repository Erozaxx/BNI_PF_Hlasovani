export const dynamic = "force-dynamic";

import { requirePageSession } from "@/lib/auth/page-guard";
import { pragueToday } from "@/lib/members/activity";
import { parseSheetDate } from "@/lib/attendance/sheet";
import { PLAN_TEXTS, pickInitialDay } from "@/lib/attendance/plan";
import { loadAbsencePlan } from "@/lib/attendance/plan-view";
import { AttendanceTabs } from "@/components/attendance/AttendanceTabs";
import { AbsencePlanCalendar } from "@/components/attendance/AbsencePlanCalendar";

/**
 * iter-039 (T-003, arch 3, 4, 7): kalendář plánovaných omluv pro správce
 * docházky. Stránku vidí držitel `attendance.view_all`, loader to ověřuje
 * znovu. Jen čtení: jeden dotaz na celý rozsah, přepínání měsíců a dnů řeší
 * klient. Datum v `?d=YYYY-MM-DD` je výchozí vybraný den. Žádný `loading.tsx`
 * v segmentu a žádný `router.refresh()` (LL-017).
 */
export default async function AbsencePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await requirePageSession({
    permission: "attendance.view_all",
    denyTo: "/dochazka",
  });
  const params = await searchParams;

  const now = new Date();
  const today = pragueToday(now);
  const plan = await loadAbsencePlan(session, today);
  const initialSelected = pickInitialDay({
    today,
    requested: parseSheetDate(params?.d),
    datesWithAbsences: plan.rows.map((r) => r.date),
    from: plan.from,
    to: plan.to,
  });

  return (
    <div className="max-w-3xl space-y-4">
      <AttendanceTabs active="plan" canViewAll />
      <h1 className="text-xl font-bold text-text-main">{PLAN_TEXTS.title}</h1>
      <AbsencePlanCalendar
        today={today}
        serverNow={now.toISOString()}
        minMonth={plan.minMonth}
        maxMonth={plan.maxMonth}
        meetingDates={plan.meetingDates}
        internalDates={plan.internalDates}
        canManageInternal={plan.canManageInternal}
        rows={plan.rows}
        initialSelected={initialSelected}
      />
    </div>
  );
}
