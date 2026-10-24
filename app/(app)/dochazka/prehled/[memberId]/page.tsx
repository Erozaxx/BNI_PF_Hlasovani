export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { addDaysToDateString, pragueToday } from "@/lib/members/activity";
import {
  ABSENCE_LIMIT,
  MAX_ADVANCE_DAYS,
  absenceCountText,
  absenceLine,
  absenceWindowStart,
  formatWeekdayFull,
  isAbsenceStatus,
} from "@/lib/attendance/rules";
import { OVERVIEW_TEXTS } from "@/lib/attendance/sheet";
import {
  listAuditForMember,
  listMemberDays,
  listMyAbsences,
} from "@/lib/db/queries/attendance";
import { getMemberById } from "@/lib/db/queries/members";
import { Card } from "@/components/ui/Card";
import { AuditList } from "@/components/attendance/AuditList";
import { AttendanceTabs } from "@/components/attendance/AttendanceTabs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resultText(status: string, substituteName: string | null, excused: boolean): string {
  if (status === "present") return "přítomen";
  if (status === "substitute") return `náhradník ${substituteName ?? ""}`.trim();
  return excused && status !== "unexcused" ? "absence, omluven(a)" : "absence, bez omluvy";
}

/**
 * iter-038 (T-003b, arch 12.4, 13.3): detail člena v přehledu docházky. Dny
 * za posledních 6 měsíců s výsledkem a omluvou, ohlášené budoucí nepřítomnosti
 * a (jen s `attendance.audit_view`) historie oprav člena.
 */
export default async function AttendanceMemberDetailPage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const session = await requirePageSession({
    permission: "attendance.view_all",
    denyTo: "/dochazka",
  });
  const { memberId } = await params;
  if (!UUID_RE.test(memberId)) notFound();
  const member = await getMemberById(memberId);
  if (!member) notFound();

  const today = pragueToday();
  const from = absenceWindowStart(today);
  const [days, upcoming, audit] = await Promise.all([
    listMemberDays(memberId, from, today),
    listMyAbsences(memberId, today, addDaysToDateString(today, MAX_ADVANCE_DAYS)),
    can(session, "attendance.audit_view") ? listAuditForMember(memberId) : Promise.resolve(null),
  ]);

  const absences = days.filter((d) => isAbsenceStatus(d.status)).length;
  const warn = absences >= ABSENCE_LIMIT;

  return (
    <div className="max-w-3xl space-y-6">
      <AttendanceTabs active="overview" canViewAll />
      <div>
        <Link
          href="/dochazka/prehled"
          className="inline-flex min-h-[44px] items-center text-sm text-navy hover:underline focus:outline-none focus:shadow-focus"
        >
          {OVERVIEW_TEXTS.back}
        </Link>
        <h1 className="text-2xl font-bold text-text-main">{member.name}</h1>
      </div>

      <div
        className={`rounded-card border px-4 py-3 text-sm ${
          warn ? "border-warning bg-warning-light" : "border-border bg-surface"
        } text-text-main`}
      >
        {absenceCountText(absences)}
      </div>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text-main">{OVERVIEW_TEXTS.detailDays}</h2>
        {days.length === 0 ? (
          <p className="text-sm text-text-muted">{OVERVIEW_TEXTS.detailDaysEmpty}</p>
        ) : (
          <ul className="space-y-1 text-sm text-text-main">
            {days.map((d) => (
              <li key={d.date} className="flex flex-wrap items-center">
                <Link
                  href={`/dochazka/zapis?d=${d.date}`}
                  className="inline-flex min-h-[44px] items-center hover:underline focus:outline-none focus:shadow-focus"
                >
                  {formatWeekdayFull(d.date)}
                </Link>
                , {resultText(d.status, d.substituteName, d.excused)}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text-main">{OVERVIEW_TEXTS.detailUpcoming}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">{OVERVIEW_TEXTS.detailDaysEmpty}</p>
        ) : (
          <ul className="space-y-1 text-sm text-text-main">
            {upcoming.map((a) => (
              <li key={a.date}>{absenceLine(a.date, a.substituteName)}</li>
            ))}
          </ul>
        )}
      </Card>

      {audit && (
        <Card>
          <AuditList rows={audit} title={OVERVIEW_TEXTS.detailHistory} />
        </Card>
      )}
    </div>
  );
}
