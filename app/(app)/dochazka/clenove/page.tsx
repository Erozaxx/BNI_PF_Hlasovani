export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { formatWeekdayFull } from "@/lib/attendance/rules";
import { MEMBERS_VIEW_TEXTS as T } from "@/lib/attendance/texts";
import { loadMembersView } from "@/lib/attendance/members-view";
import { Card } from "@/components/ui/Card";
import { AttendanceTabs } from "@/components/attendance/AttendanceTabs";

/**
 * iter-046 (arch 9, P2 a P3): docházka všech členů pro každého přihlášeného
 * (odkazem i heslem, bez práva). Počty absencí za 6 měsíců a pohled na den.
 * Serverová komponenta bez klientského JS, žádný `loading.tsx` v segmentu
 * (LL-017). Do HTML jde jen jméno, štítek stavu, jméno náhradníka a počet
 * absencí (`loadMembersView` vrací jen tyto tvary), žádné id člena, důvod
 * omluvy ani medical.
 */
export default async function AttendanceMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const session = await requirePageSession();
  const params = await searchParams;
  const view = await loadMembersView(params?.d);

  const linkClass =
    "inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-3 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus";

  return (
    <div className="max-w-3xl space-y-6">
      <AttendanceTabs active="members" canViewAll={can(session, "attendance.view_all")} />
      <h1 className="text-2xl font-bold text-text-main">{T.title}</h1>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text-main">{T.countsTitle}</h2>
        <ul className="divide-y divide-border">
          {view.counts.map((c, i) => (
            <li key={i} className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm text-text-main">
              <span className="font-medium">{c.name}</span>
              <strong className="shrink-0">{c.absences}</strong>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text-main">{T.dayTitle}</h2>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {view.prev ? (
            <Link href={`/dochazka/clenove?d=${view.prev}`} className={linkClass}>
              {T.prev}
            </Link>
          ) : null}
          {view.next ? (
            <Link href={`/dochazka/clenove?d=${view.next}`} className={linkClass}>
              {T.next}
            </Link>
          ) : null}
          <form method="get" className="flex flex-wrap items-center gap-2">
            <label htmlFor="d" className="sr-only">
              {T.dateLabel}
            </label>
            <input
              id="d"
              type="date"
              name="d"
              defaultValue={view.date}
              min={view.min}
              max={view.max}
              required
              className="min-h-[44px] rounded-lg border border-border bg-surface px-3 text-sm text-text-main focus:outline-none focus:shadow-focus"
            />
            <button type="submit" className={linkClass}>
              {T.show}
            </button>
          </form>
        </div>

        <p className="mb-2 text-sm font-medium text-text-main">{formatWeekdayFull(view.date)}</p>
        {view.day.rows.length === 0 ? (
          <p className="text-sm text-text-muted">{T.nobody}</p>
        ) : (
          <ul className="divide-y divide-border">
            {view.day.rows.map((r, i) => (
              <li
                key={i}
                className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm text-text-main"
              >
                <span className="font-medium">{r.name}</span>
                <span className="shrink-0 text-text-muted">{r.label}</span>
              </li>
            ))}
          </ul>
        )}
        {view.day.footnote && <p className="mt-3 text-sm text-text-muted">{view.day.footnote}</p>}
      </Card>
    </div>
  );
}
