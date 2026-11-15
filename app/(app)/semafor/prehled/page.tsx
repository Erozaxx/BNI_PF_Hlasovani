export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import {
  getLatestMonth,
  listBonusEvents,
  listMonths,
  listOverviewRows,
  listPendingForOverview,
} from "@/lib/db/queries/semafor";
import {
  BONUS_CATEGORIES,
  CATEGORY_SOURCE,
  bonusSources,
  bonusWindow,
  hasBonusSource,
  type BonusSources,
} from "@/lib/semafor/bonus";
import {
  filterPending,
  parsePendingFilter,
  pendingMembers,
  pendingRange,
  sortPending,
  type PendingRange,
  type PendingRow,
} from "@/lib/semafor/pending";
import { pragueToday } from "@/lib/members/activity";
import { parseMonthParam, monthParam } from "@/lib/semafor/months";
import { buildOverview, parseSort } from "@/lib/semafor/overview";
import {
  POINT_TEXTS,
  SEMAFOR_TEXTS,
  categoryName,
  monthLabel,
  overviewLegendText,
  pendingCountText,
  pendingIntroText,
} from "@/lib/semafor/texts";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { featureOff } from "@/lib/chapter/feature-guard";
import { FeatureOff } from "@/components/chapter/FeatureOff";
import { Card } from "@/components/ui/Card";
import { SemaforTabs } from "@/components/semafor/SemaforTabs";
import { OverviewTable } from "@/components/semafor/OverviewTable";
import { PendingList } from "@/components/semafor/PendingList";

const PENDING_ANCHOR = "cekajici";

type Param = string | string[] | undefined;

const selectClass = "h-11 rounded-lg border border-border bg-white px-3 text-base";
const buttonClass =
  "min-h-[44px] rounded-lg border border-border bg-white px-4 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus";

/** Věta gate 4.2 se slovem „Body“ jako odkazem na záložku Body. */
function TextsHint() {
  const text = SEMAFOR_TEXTS.pendingTextsHint;
  const word = POINT_TEXTS.tabPoints;
  const at = text.lastIndexOf(word);
  return (
    <p className="mt-3 text-sm text-text-muted">
      {text.slice(0, at)}
      <Link href="/semafor/body" className="rounded text-navy underline underline-offset-2 focus:outline-none focus:shadow-focus">
        {word}
      </Link>
      {text.slice(at + word.length)}
    </p>
  );
}

/**
 * iter-045 (arch 3.3, gate 4): „Čeká na započtení“ pod tabulkou. Filtr Komu a
 * Kategorie přes GET bez JS, hodnoty z URL projdou jen `parsePendingFilter`
 * (do SQL nejdou). Měsíc a řazení tabulky nahoře se drží ve skrytých polích.
 */
function PendingSection({
  range,
  rows,
  pointsMissing,
  raw,
  sources,
  month,
  sort,
  canPoints,
}: {
  range: PendingRange | null;
  rows: PendingRow[];
  pointsMissing: boolean;
  raw: { c?: Param; k?: Param };
  sources: BonusSources;
  month: string;
  sort: string;
  canPoints: boolean;
}) {
  const filter = parsePendingFilter(raw, rows, sources);
  const shown = sortPending(filterPending(rows, filter));
  const filtered = filter.memberId !== undefined || filter.category !== undefined;
  const members = pendingMembers(rows);
  const categories = BONUS_CATEGORIES.filter((c) => sources[CATEGORY_SOURCE[c]]);
  const resetHref = `/semafor/prehled?m=${monthParam(month)}&s=${sort}#${PENDING_ANCHOR}`;
  return (
    <section id={PENDING_ANCHOR} aria-labelledby={`${PENDING_ANCHOR}-title`}>
      <h2 id={`${PENDING_ANCHOR}-title`} className="text-lg font-semibold text-text-main">
        {SEMAFOR_TEXTS.pendingTitle}
      </h2>
      {range && <p className="mt-1 text-sm text-text-muted">{pendingIntroText(range.after, range.nextMonth)}</p>}
      {pointsMissing && <p className="mt-2 text-sm text-text-muted">{SEMAFOR_TEXTS.pendingNoTable}</p>}

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">{SEMAFOR_TEXTS.pendingEmpty}</p>
      ) : (
        <>
          <form method="get" action={`/semafor/prehled#${PENDING_ANCHOR}`} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="m" value={monthParam(month)} />
            <input type="hidden" name="s" value={sort} />
            <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
              {SEMAFOR_TEXTS.pendingFilterMember}
              <select name="c" defaultValue={filter.memberId ?? ""} className={selectClass}>
                <option value="">{SEMAFOR_TEXTS.pendingFilterAllMembers}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.active ? m.name : `${m.name} ${SEMAFOR_TEXTS.overviewInactive}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
              {SEMAFOR_TEXTS.pendingFilterCategory}
              <select name="k" defaultValue={filter.category ?? ""} className={selectClass}>
                <option value="">{SEMAFOR_TEXTS.pendingFilterAllCategories}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryName(c)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonClass}>
              {SEMAFOR_TEXTS.overviewShow}
            </button>
          </form>

          {shown.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              {SEMAFOR_TEXTS.pendingEmptyFiltered}{" "}
              <Link href={resetHref} className="rounded text-navy underline underline-offset-2 focus:outline-none focus:shadow-focus">
                {SEMAFOR_TEXTS.pendingReset}
              </Link>
            </p>
          ) : (
            <div className="mt-3">
              <PendingList rows={shown} />
              <p className="mt-2 text-sm text-text-muted">
                {pendingCountText(shown.length)}
                {filtered && (
                  <>
                    {" · "}
                    <Link href={resetHref} className="rounded text-navy underline underline-offset-2 focus:outline-none focus:shadow-focus">
                      {SEMAFOR_TEXTS.pendingReset}
                    </Link>
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}
      {canPoints && <TextsHint />}
    </section>
  );
}

/**
 * iter-041 (arch 6.2, gate Z5, Z7, Z8): přehled semaforu se jmény. Jen
 * `semafor.view_all` (admin, Prezident, Viceprezident, Člen výboru, jen při
 * přihlášení heslem). `?m=YYYY-MM` se validuje, jinak se bere poslední nahraný
 * měsíc. Řazení `?s=score|name`.
 *
 * iter-042: vypnutý semafor ukáže `FeatureOff` (Z10), legenda pod nadpisem
 * (#16), prázdný stav podle práva importu, bonus jen ze zapnutých částí.
 *
 * iter-045: pod tabulkou „Čeká na započtení“ (všechno po konci POSLEDNÍHO
 * nahraného měsíce do dneška, ne podle `?m=`). Bez nahraného měsíce se sekce
 * nevykreslí (gate Q4). Data se jmény čte jen tahle stránka.
 */
export default async function SemaforOverviewPage({
  searchParams,
}: {
  searchParams?: { m?: Param; s?: Param; c?: Param; k?: Param };
}) {
  const session = await requirePageSession({ permission: "semafor.view_all", denyTo: "/dashboard" });
  if (await featureOff("semafor")) return <FeatureOff canManageSettings={can(session, "chapter.settings")} />;
  const sources = bonusSources(await getChapterSettings());
  const canImport = can(session, "semafor.import");
  const canPoints = can(session, "semafor.points");

  const [months, latest] = await Promise.all([listMonths(), getLatestMonth()]);
  const requested = parseMonthParam(searchParams?.m);
  const month = requested && months.some((m) => m.month === requested) ? requested : latest;
  const sort = parseSort(searchParams?.s);

  // iter-045: hranice okna je poslední nahraný měsíc, nikdy vybraný `?m=`.
  const range = latest ? pendingRange(latest, pragueToday()) : null;
  const pendingPromise = range
    ? listPendingForOverview(range, sources)
    : Promise.resolve({ rows: [] as Awaited<ReturnType<typeof listPendingForOverview>>["rows"], pointsMissing: false });

  let content: React.ReactNode;
  let pending: Awaited<typeof pendingPromise> = { rows: [], pointsMissing: false };
  if (!month) {
    content = (
      <Card>
        <p className="text-sm text-text-muted">
          {canImport ? SEMAFOR_TEXTS.myNoneImport : SEMAFOR_TEXTS.myNone}
        </p>
      </Card>
    );
  } else {
    const w = bonusWindow(month);
    const [rows, events, pendingLoaded] = await Promise.all([
      listOverviewRows(month),
      listBonusEvents({ after: w.after, to: w.to, sources }),
      pendingPromise,
    ]);
    pending = pendingLoaded;
    const items = buildOverview(month, rows, events, sort);
    content = (
      <Card>
        <OverviewTable
          month={month}
          items={items}
          canDelete={canImport}
          showBonus={hasBonusSource(sources)}
          sources={sources}
        />
      </Card>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <SemaforTabs active="overview" canViewAll canImport={canImport} canPoints={canPoints} />
      <div>
        <h1 className="text-2xl font-bold text-text-main">{SEMAFOR_TEXTS.overviewTitle}</h1>
        <p className="mt-2 text-sm text-text-muted">{overviewLegendText(sources)}</p>
      </div>

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

      {latest && month && (
        <Card>
          <PendingSection
            range={range}
            rows={pending.rows}
            pointsMissing={pending.pointsMissing}
            raw={{ c: searchParams?.c, k: searchParams?.k }}
            sources={sources}
            month={month}
            sort={sort}
            canPoints={canPoints}
          />
        </Card>
      )}
    </div>
  );
}
