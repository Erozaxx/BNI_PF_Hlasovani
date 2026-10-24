/**
 * iter-039 (T-003, arch 4, 5): načtení dat pro kalendář plánovaných omluv.
 * Dotazy v `lib/db/queries` session nedostávají, proto právo `attendance.view_all`
 * hlídá tenhle loader jako první krok (fail closed). `listPlannedAbsences` se
 * smí importovat jen tady.
 *
 * NENÍ čistý modul (čte DB přes lib/db/queries/attendance.ts).
 */
import { can, NO_PERMISSION_MESSAGE, type PermissionHolder } from "@/lib/auth/permissions";
import { planRange, type PlanEntry, type PlanRange } from "@/lib/attendance/plan";
import { listMeetingDates, listPlannedAbsences } from "@/lib/db/queries/attendance";
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
  const [rows, meetingDates, internalDates, settings] = await Promise.all([
    listPlannedAbsences(range.from, range.to),
    listMeetingDates(range.from, range.to),
    listInternalDays(range.from, range.to),
    getChapterSettings(),
  ]);
  return {
    ...range,
    rows,
    meetingDates,
    internalDates,
    canManageInternal: can(session, "attendance.internal_manage"),
    regularWeekday: settings.meetingWeekday,
  };
}
