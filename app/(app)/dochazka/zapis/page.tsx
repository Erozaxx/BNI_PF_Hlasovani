export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { addDaysToDateString, pragueToday } from "@/lib/members/activity";
import { MAX_ADVANCE_DAYS } from "@/lib/attendance/rules";
import { SHEET_TEXTS, parseSheetDate, sheetTitle } from "@/lib/attendance/sheet";
import { loadDayPayload } from "@/lib/attendance/day-view";
import { AttendanceSheet } from "@/components/attendance/AttendanceSheet";
import { AttendanceTabs } from "@/components/attendance/AttendanceTabs";

/**
 * iter-038 (T-003b, arch 8, gate Z2, Z4): zápis docházky dne pro správce.
 * Stránku vidí držitel `attendance.view_all`; zápis a opravy podle práv
 * `attendance.record` a `attendance.edit_history` rozhoduje server u každého
 * zápisu (režim `normal`, `history`, `denied`). Datum v `?d=YYYY-MM-DD`,
 * výchozí je dnešek. Žádný `loading.tsx` v segmentu a žádný `router.refresh()`
 * (LL-017).
 */
export default async function AttendanceSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await requirePageSession({
    permission: "attendance.view_all",
    denyTo: "/dochazka",
  });
  const params = await searchParams;

  const today = pragueToday();
  const max = addDaysToDateString(today, MAX_ADVANCE_DAYS);
  const requested = parseSheetDate(params?.d);
  const date = requested && requested <= max ? requested : today;

  const payload = await loadDayPayload(date, session);
  const prev = addDaysToDateString(date, -1);
  const next = addDaysToDateString(date, 1);

  const linkClass =
    "inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-3 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus";

  return (
    <div className="max-w-3xl space-y-4">
      <AttendanceTabs active="sheet" canViewAll />
      <h1 className="text-xl font-bold text-text-main">{sheetTitle(date)}</h1>

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/dochazka/zapis?d=${prev}`} className={linkClass}>
          {SHEET_TEXTS.prevDay}
        </Link>
        <form method="get" action="/dochazka/zapis" className="flex items-center gap-2">
          <label className="sr-only" htmlFor="sheet-date">
            {SHEET_TEXTS.dateLabel}
          </label>
          <input
            id="sheet-date"
            type="date"
            name="d"
            defaultValue={date}
            max={max}
            className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-base text-text-main focus:outline-none focus:shadow-focus"
          />
          <button type="submit" className={linkClass}>
            {SHEET_TEXTS.showDay}
          </button>
        </form>
        {next <= max && (
          <Link href={`/dochazka/zapis?d=${next}`} className={linkClass}>
            {SHEET_TEXTS.nextDay}
          </Link>
        )}
      </div>

      <AttendanceSheet key={date} endpoint={`/api/attendance/${date}`} initial={payload} />
    </div>
  );
}
