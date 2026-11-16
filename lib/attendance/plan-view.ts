/**
 * iter-039 (T-003, arch 4, 5): načtení dat pro kalendář plánovaných omluv.
 * Dotazy v `lib/db/queries` session nedostávají, proto právo `attendance.view_all`
 * hlídá tenhle loader jako první krok (fail closed). `listPlannedAbsences` se
 * smí importovat jen tady.
 *
 * NENÍ čistý modul (čte DB přes lib/db/queries/attendance.ts).
 */
import { can, NO_PERMISSION_MESSAGE, type PermissionHolder } from "@/lib/auth/permissions";
import {
  expandMedicalPeriods,
  planRange,
  scheduleDaysInRange,
  type PlanEntry,
  type PlanRange,
} from "@/lib/attendance/plan";
import { listMedicalPeriods, listMeetingDates, listPlannedAbsences } from "@/lib/db/queries/attendance";
import { listInternalDays } from "@/lib/db/queries/attendance-internal";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";

export interface AbsencePlanData extends PlanRange {
  rows: PlanEntry[];
  meetingDates: string[];
  /** iter-040: dny s interní schůzkou. */
  internalDates: string[];
  /** iter-040: smí zakládat a rušit interní schůzky (karta dne). */
  canManageInternal: boolean;
  /** iter-042 (B3): den pravidelné schůzky z nastavení chapteru (0 = neděle ... 6, čtvrtek 4). */
  regularWeekday: number;
}

export async function loadAbsencePlan(
  session: PermissionHolder | null | undefined,
  today: string
): Promise<AbsencePlanData> {
  if (!can(session, "attendance.view_all")) {
    throw new Error(NO_PERMISSION_MESSAGE);
  }
  const range = planRange(today);
  const [storedRows, meetingDates, internalDates, settings, periods] = await Promise.all([
    listPlannedAbsences(range.from, range.to),
    listMeetingDates(range.from, range.to),
    listInternalDays(range.from, range.to),
    getChapterSettings(),
    listMedicalPeriods(range.from, range.to),
  ]);
  // iter-046 (arch 5.6): období medical se na neuzavřené dny (dnešek a dál) odvozuje
  // při čtení; uzavřené dny mají medical uložený v `member_absence`.
  const from = today > range.from ? today : range.from;
  const derived = expandMedicalPeriods(
    periods,
    scheduleDaysInRange(from, range.to, settings.meetingWeekday, [...meetingDates, ...internalDates]),
    from,
    range.to,
    storedRows
  );
  const rows = [...storedRows, ...derived];
  return {
    ...range,
    rows,
    meetingDates,
    internalDates,
    canManageInternal: can(session, "attendance.internal_manage"),
    regularWeekday: settings.meetingWeekday,
  };
}
