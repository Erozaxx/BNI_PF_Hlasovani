export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { getLatestMonth, listBonusEvents, listMonths, listOverviewRows } from "@/lib/db/queries/semafor";
import { bonusWindow } from "@/lib/semafor/bonus";
import { parseMonthParam, monthParam } from "@/lib/semafor/months";
import { buildOverview, parseSort } from "@/lib/semafor/overview";
import { SEMAFOR_TEXTS, monthLabel } from "@/lib/semafor/texts";
import { Card } from "@/components/ui/Card";
import { SemaforTabs } from "@/components/semafor/SemaforTabs";
import { OverviewTable } from "@/components/semafor/OverviewTable";

/**
 * iter-041 (arch 6.2, gate Z5, Z7, Z8): přehled semaforu se jmény. Jen
 * `semafor.view_all` (admin, Prezident, Viceprezident, Člen výboru, jen při
 * přihlášení heslem). `?m=YYYY-MM` se validuje, jinak se bere poslední nahraný
 * měsíc. Řazení `?s=score|name`.
 */
export default async function SemaforOverviewPage({
  searchParams,
}: {
  searchParams?: { m?: string | string[]; s?: string | string[] };
}) {
  const session = await requirePageSession({ permission: "semafor.view_all", denyTo: "/dashboard" });
  const canImport = can(session, "semafor.import");

  const [months, latest] = await Promise.all([listMonths(), getLatestMonth()]);
  const requested = parseMonthParam(searchParams?.m);
  const month = requested && months.some((m) => m.month === requested) ? requested : latest;
  const sort = parseSort(searchParams?.s);

  let content: React.ReactNode;
  if (!month) {
    content = (
      <Card>
        <p className="text-sm text-text-muted">{SEMAFOR_TEXTS.myNone}</p>
      </Card>
    );
  } else {
    const w = bonusWindow(month);
    const [rows, events] = await Promise.all([listOverviewRows(month), listBonusEvents({ after: w.after, to: w.to })]);
    const items = buildOverview(month, rows, events, sort);
    content = (
      <Card>
        <OverviewTable month={month} items={items} canDelete={canImport} />
      </Card>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <SemaforTabs active="overview" canViewAll canImport={canImport} />
      <h1 className="text-2xl font-bold text-text-main">{SEMAFOR_TEXTS.overviewTitle}</h1>

      {month && (
        <div className="flex flex-wrap items-end gap-3">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
              {SEMAFOR_TEXTS.importMonth}
              <select
                name="m"
                defaultValue={monthParam(month)}
                className="h-11 rounded-lg border border-border bg-white px-3 text-base"
              >
                {months.map((m) => (
                  <option key={m.month} value={monthParam(m.month)}>
                    {monthLabel(m.month)}
                  </option>
                ))}
              </select>
            </label>
            <input type="hidden" name="s" value={sort} />
            <button
              type="submit"
              className="min-h-[44px] rounded-lg border border-border bg-white px-4 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus"
            >
              {SEMAFOR_TEXTS.overviewShow}
            </button>
          </form>
          <div className="flex gap-1" role="group" aria-label={SEMAFOR_TEXTS.overviewTitle}>
            {(["score", "name"] as const).map((s) => (
              <Link
                key={s}
                href={`/semafor/prehled?m=${monthParam(month)}&s=${s}`}
                aria-current={sort === s ? "true" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-lg border px-3 text-sm focus:outline-none focus:shadow-focus ${
                  sort === s ? "border-primary bg-primary-light text-primary" : "border-border bg-white text-text-main hover:bg-background"
                }`}
              >
                {s === "score" ? SEMAFOR_TEXTS.overviewSortTotal : SEMAFOR_TEXTS.overviewSortName}
              </Link>
            ))}
          </div>
        </div>
      )}

      {content}
    </div>
  );
}
