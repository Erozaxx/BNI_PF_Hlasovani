export const dynamic = "force-dynamic";

import { requirePageSession } from "@/lib/auth/page-guard";
import { pragueToday } from "@/lib/members/activity";
import { parseSheetDate } from "@/lib/attendance/sheet";
import { can } from "@/lib/auth/permissions";
import { PLAN_TEXTS, pickInitialDay, publicPlanCalendarProps } from "@/lib/attendance/plan";
import { loadAbsencePlan, loadAbsencePlanPublic } from "@/lib/attendance/plan-view";
import { AttendanceTabs } from "@/components/attendance/AttendanceTabs";
import { AbsencePlanCalendar } from "@/components/attendance/AbsencePlanCalendar";

/**
 * iter-039 (T-003, arch 3, 4, 7): kalendář plánovaných omluv pro správce
 * docházky. iter-047: stránku vidí každý přihlášený. Tvar dat se rozhoduje tady
 * na serveru podle `attendance.view_all`: vedení dostane celé řádky, ostatní jen
 * veřejné (datum, jméno, náhradník) přes `publicPlanCalendarProps`. Oba loadery
 * si právo ověřují znovu. Jen čtení: jeden dotaz na celý rozsah, přepínání měsíců a dnů řeší
 * klient. Datum v `?d=YYYY-MM-DD` je výchozí vybraný den. Žádný `loading.tsx`
 * v segmentu a žádný `router.refresh()` (LL-017).
 */
export default async function AbsencePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;

  const now = new Date();
  const today = pragueToday(now);
  const requested = parseSheetDate(params?.d);
  const canViewAll = can(session, "attendance.view_all");

  if (!canViewAll) {
    const publicPlan = await loadAbsencePlanPublic(session, today);
    const props = publicPlanCalendarProps({
      plan: publicPlan,
      today,
      serverNow: now.toISOString(),
      requested,
      canManageInternal: can(session, "attendance.internal_manage"),
    });
    return (
      <div className="max-w-3xl space-y-4">
        <AttendanceTabs active="plan" canViewAll={canViewAll} />
        <h1 className="text-xl font-bold text-text-main">{PLAN_TEXTS.title}</h1>
        <p className="text-sm text-text-muted">{PLAN_TEXTS.readOnlyNote}</p>
        <AbsencePlanCalendar {...props} />
      </div>
    );
  }

  const plan = await loadAbsencePlan(session, today);
  const initialSelected = pickInitialDay({
    today,
    requested,
    datesWithAbsences: plan.rows.map((r) => r.date),
    from: plan.from,
    to: plan.to,
    settings: { meetingWeekday: plan.regularWeekday },
  });

  return (
    <div className="max-w-3xl space-y-4">
      <AttendanceTabs active="plan" canViewAll={canViewAll} />
      <h1 className="text-xl font-bold text-text-main">{PLAN_TEXTS.title}</h1>
      <AbsencePlanCalendar
        readOnly={false}
        today={today}
        serverNow={now.toISOString()}
        minMonth={plan.minMonth}
        maxMonth={plan.maxMonth}
        meetingDates={plan.meetingDates}
        internalDates={plan.internalDates}
        canManageInternal={plan.canManageInternal}
        rows={plan.rows}
        initialSelected={initialSelected}
        regularWeekday={plan.regularWeekday}
      />
    </div>
  );
}
