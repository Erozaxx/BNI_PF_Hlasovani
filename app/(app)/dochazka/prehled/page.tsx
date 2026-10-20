export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { pragueToday } from "@/lib/members/activity";
import { ABSENCE_LIMIT, absenceWindowStart, formatWeekdayFull } from "@/lib/attendance/rules";
import { OVERVIEW_TEXTS } from "@/lib/attendance/sheet";
import { listClosedDays, listOverviewMembers } from "@/lib/db/queries/attendance";
import { Card } from "@/components/ui/Card";
import { AttendanceTabs } from "@/components/attendance/AttendanceTabs";

/**
 * iter-038 (T-003b, arch 12.4, gate Z4): přehled docházky pro držitele
 * `attendance.view_all`. Aktivní členové s počtem absencí (oranžově od 3) a
 * náhradníků za posledních 6 měsíců, odkaz na detail člena a poslední uzavřené
 * dny s odkazem na zápis. Počítají se jen uzavřené dny.
 */
export default async function AttendanceOverviewPage() {
  await requirePageSession({ permission: "attendance.view_all", denyTo: "/dochazka" });

  const today = pragueToday();
  const from = absenceWindowStart(today);
  const [members, days] = await Promise.all([
    listOverviewMembers(from, today),
    listClosedDays(20),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <AttendanceTabs active="overview" canViewAll />
      <h1 className="text-2xl font-bold text-text-main">{OVERVIEW_TEXTS.title}</h1>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text-main">{OVERVIEW_TEXTS.membersTitle}</h2>
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const warn = m.absences >= ABSENCE_LIMIT;
            return (
              <li key={m.memberId}>
                <Link
                  href={`/dochazka/prehled/${m.memberId}`}
                  className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus"
                >
                  <span className="font-medium">{m.name}</span>
                  <span className="shrink-0 text-text-muted">
                    <span className={warn ? "rounded bg-warning-light px-1.5 text-warning" : ""}>
                      {OVERVIEW_TEXTS.absencesLabel} <strong>{m.absences}</strong>
                    </span>
                    {" · "}
                    {OVERVIEW_TEXTS.substitutesLabel} {m.substitutes}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text-main">{OVERVIEW_TEXTS.daysTitle}</h2>
        {days.length === 0 ? (
          <p className="text-sm text-text-muted">{OVERVIEW_TEXTS.daysEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {days.map((d) => (
              <li key={d.date}>
                <Link
                  href={`/dochazka/zapis?d=${d.date}`}
                  className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus"
                >
                  <span className="font-medium">{formatWeekdayFull(d.date)}</span>
                  <span className="shrink-0 text-text-muted">
                    {d.dayMode === "unrecorded"
                      ? "nezapsáno"
                      : `přítomno ${d.present + d.substitutes} · náhradníci ${d.substitutes} · chybí ${d.absent}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
