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

export interface AbsencePlanData extends PlanRange {
  rows: PlanEntry[];
  meetingDates: string[];
}

export async function loadAbsencePlan(
  session: PermissionHolder | null | undefined,
  today: string
): Promise<AbsencePlanData> {
  if (!can(session, "attendance.view_all")) {
    throw new Error(NO_PERMISSION_MESSAGE);
  }
  const range = planRange(today);
  const [rows, meetingDates] = await Promise.all([
    listPlannedAbsences(range.from, range.to),
    listMeetingDates(range.from, range.to),
  ]);
  return { ...range, rows, meetingDates };
}
