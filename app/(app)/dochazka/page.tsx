export const dynamic = "force-dynamic";

import { requirePageSession } from "@/lib/auth/page-guard";
import { addDaysToDateString, pragueToday } from "@/lib/members/activity";
import {
  MAX_ADVANCE_DAYS,
  MEMBER_TEXTS,
  ABSENCE_LIMIT,
  absenceCountText,
  absenceDayLine,
  absenceWindowStart,
  monthEnd,
  monthOf,
  monthStart,
  nextThursday,
} from "@/lib/attendance/rules";
import {
  listMeetingDates,
  listMyAbsenceDays,
  listMyAbsences,
  listMyPastDays,
  listSubstituteNames,
} from "@/lib/db/queries/attendance";
import { listInternalDays } from "@/lib/db/queries/attendance-internal";
import { can } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { AttendanceTabs } from "@/components/attendance/AttendanceTabs";
import { AbsenceCalendar } from "@/components/attendance/AbsenceCalendar";

/**
 * iter-038 (T-003a, arch 7.1): Docházka člena. Kalendář nepřítomnosti na
 * kterýkoli den až rok dopředu, čtvrtky zvýrazněné, paměť jmen náhradníků a
 * seznam vlastních absencí (`#absence`). Vidí jen svoje data. Žádný
 * `loading.tsx` v segmentu a žádný `router.refresh()` (LL-017).
 */
export default async function AttendancePage() {
  const session = await requirePageSession();
  const memberId = session.memberId;

  const now = new Date();
  const today = pragueToday(now);
  const windowStart = absenceWindowStart(today);
  const minMonth = monthOf(windowStart);
  const maxMonth = monthOf(addDaysToDateString(today, MAX_ADVANCE_DAYS));
  const from = monthStart(minMonth.year, minMonth.month);
  const to = monthEnd(maxMonth.year, maxMonth.month);

  const [absences, meetingDates, internalDates, pastDays, names, absenceDays] = await Promise.all([
    listMyAbsences(memberId, from, to),
    listMeetingDates(from, to),
    listInternalDays(from, to),
    listMyPastDays(memberId, from, today),
    listSubstituteNames(memberId),
    listMyAbsenceDays(memberId, windowStart, today),
  ]);

  const count = absenceDays.length;
  const warn = count >= ABSENCE_LIMIT;

  return (
    <div className="max-w-3xl space-y-6">
      <AttendanceTabs active="mine" canViewAll={can(session, "attendance.view_all")} />
      <div>
        <h1 className="text-2xl font-bold text-text-main">{MEMBER_TEXTS.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{MEMBER_TEXTS.intro}</p>
      </div>

      <div
        className={`rounded-card border px-4 py-3 text-sm ${
          warn
            ? "border-warning bg-warning-light text-text-main"
            : "border-border bg-surface text-text-main"
        }`}
      >
        {absenceCountText(count)}
      </div>

      <AbsenceCalendar
        today={today}
        serverNow={now.toISOString()}
        minMonth={minMonth}
        maxMonth={maxMonth}
        meetingDates={meetingDates}
        internalDates={internalDates}
        canManageInternal={can(session, "attendance.internal_manage")}
        initialAbsences={absences}
        results={pastDays.map((p) => ({ date: p.date, status: p.status }))}
        initialNames={names}
        initialSelected={nextThursday(today)}
      />

      <Card>
        <h2 id="absence" className="mb-3 text-base font-semibold text-text-main">
          {MEMBER_TEXTS.absenceListTitle}
        </h2>
        {absenceDays.length === 0 ? (
          <p className="text-sm text-text-muted">{MEMBER_TEXTS.listEmpty}</p>
        ) : (
          <ul className="space-y-1 text-sm text-text-main">
            {absenceDays.map((a) => (
              <li key={a.date}>{absenceDayLine(a.date, a.excused)}</li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
