"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { InternalDayCard } from "@/components/attendance/InternalDayCard";
import {
  GRID_WEEKDAYS,
  isThursday,
  monthGrid,
  monthOf,
  monthTitle,
  shiftMonth,
} from "@/lib/attendance/rules";
import {
  PLAN_TEXTS,
  groupPlan,
  planDayAria,
  planCanOpenSheet,
  planDayTitle,
  planEntryLine,
  planEntryMeta,
  planSummary,
  type PlanEntry,
} from "@/lib/attendance/plan";
import { dayCellClass, dayNumberClass, dayTone } from "@/lib/attendance/internal";

/**
 * iter-039 (T-003, arch 6, 7, 8): kalendář plánovaných omluv pro správce.
 * Mřížka 7 sloupců po 44 px jako u kalendáře člena (`AbsenceCalendar`, ten se
 * nemění), v buňce počet omluvených, po klepnutí na den seznam pod ním. Jen
 * čtení, stav výběru drží komponenta a zrcadlí ho do `?d=` přes
 * `history.replaceState` (žádný dotaz na server, žádný `router.refresh()`,
 * LL-017). Neimportuje nic z `@/lib/db`.
 *
 * iter-040: interní dny jsou zeleně, správce s právem `attendance.internal_manage`
 * má pod seznamem dne kartu pro založení a zrušení. Po zrušení (Z2) se dni
 * lokálně srovná počet i seznam omluvených, bez `router.refresh()`.
 */

export interface AbsencePlanCalendarProps {
  /** Dnešek v Praze, `YYYY-MM-DD`. */
  today: string;
  minMonth: { year: number; month: number };
  maxMonth: { year: number; month: number };
  /** Čas serveru při vykreslení (ISO), ať se hydratace shoduje. */
  serverNow: string;
  meetingDates: string[];
  /** iter-040: dny s interní schůzkou (zeleně). */
  internalDates: string[];
  canManageInternal: boolean;
  rows: PlanEntry[];
  /** Vybraný den při otevření. */
  initialSelected: string;
}

export function AbsencePlanCalendar({
  today,
  minMonth,
  maxMonth,
  serverNow,
  meetingDates,
  internalDates,
  canManageInternal,
  rows,
  initialSelected,
}: AbsencePlanCalendarProps) {
  const [now, setNow] = useState(() => new Date(serverNow));
  const [internals, setInternals] = useState<Set<string>>(() => new Set(internalDates));
  /** Z2: dny, kterým zrušení interní schůzky smazalo omluvy (lokální stav). */
  const [clearedDates, setClearedDates] = useState<Set<string>>(() => new Set());

  // Hranice 17:00 se může přehoupnout, zatímco je stránka otevřená.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [selected, setSelected] = useState(initialSelected);
  const [view, setView] = useState(() => monthOf(initialSelected));

  const meetings = useMemo(() => new Set(meetingDates), [meetingDates]);
  const byDate = useMemo(
    () => groupPlan(rows.filter((r) => !clearedDates.has(r.date))),
    [rows, clearedDates]
  );

  function onInternalChanged(
    date: string,
    state: "internal" | "none" | "meeting",
    absencesDeleted: boolean
  ) {
    setInternals((prev) => {
      const next = new Set(prev);
      if (state === "internal") next.add(date);
      else next.delete(date);
      return next;
    });
    if (absencesDeleted) setClearedDates((prev) => new Set(prev).add(date));
  }

  const viewIndex = view.year * 12 + view.month;
  const canPrev = viewIndex > minMonth.year * 12 + minMonth.month;
  const canNext = viewIndex < maxMonth.year * 12 + maxMonth.month;
  const weeks = monthGrid(view.year, view.month);

  function go(delta: number) {
    setView((v) => shiftMonth(v.year, v.month, delta));
  }

  function selectDay(date: string) {
    setSelected(date);
    try {
      window.history.replaceState(null, "", `?d=${date}`);
    } catch {
      // adresa je jen pohodlí, funkci stránky to neovlivní
    }
  }

  const entries = byDate[selected] ?? [];
  const summary = planSummary(entries);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-[44px] min-w-[44px]"
            disabled={!canPrev}
            onClick={() => go(-1)}
            aria-label={PLAN_TEXTS.prevMonth}
          >
            ‹
          </Button>
          <h2 className="text-base font-semibold capitalize text-text-main" aria-live="polite">
            {monthTitle(view.year, view.month)}
          </h2>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-[44px] min-w-[44px]"
            disabled={!canNext}
            onClick={() => go(1)}
            aria-label={PLAN_TEXTS.nextMonth}
          >
            ›
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-text-muted">
          {GRID_WEEKDAYS.map((w) => (
            <div key={w} className={w === "Čt" ? "text-navy" : ""}>
              {w}
            </div>
          ))}
        </div>

        <div className="mt-1 space-y-1">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((date, di) => {
                if (!date) return <div key={di} className="min-h-[44px]" />;
                const count = byDate[date]?.length ?? 0;
                const past = date < today;
                const thursday = isThursday(date);
                const tone = dayTone({ hasMeeting: meetings.has(date), hasInternal: internals.has(date) });
                const isSelected = date === selected;
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => selectDay(date)}
                    aria-label={planDayAria(date, count, tone === "meeting", tone === "internal")}
                    aria-pressed={isSelected}
                    className={dayCellClass(tone, thursday, past, isSelected)}
                  >
                    <span className={dayNumberClass(tone)}>
                      {Number(date.slice(8))}
                    </span>
                    <span className="h-4 text-xs font-semibold" aria-hidden="true">
                      {count > 0 ? count : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-text-muted">{PLAN_TEXTS.legend}</p>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-text-main" aria-live="polite">
          {planDayTitle(selected)}
        </h2>
        {summary && <p className="mt-1 text-sm text-text-muted">{summary}</p>}
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">{PLAN_TEXTS.empty}</p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {entries.map((e) => (
              <li key={e.memberId} className="py-2">
                <p className="text-sm text-text-main">
                  <span className="font-medium">{e.name}</span> · {planEntryLine(e)}
                </p>
                <p className="text-xs text-text-muted">{planEntryMeta(e, today)}</p>
              </li>
            ))}
          </ul>
        )}
        {planCanOpenSheet(selected, today) && (
          <Link
            href={`/dochazka/zapis?d=${selected}`}
            className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-3 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus"
          >
            {PLAN_TEXTS.link}
          </Link>
        )}
      </Card>

      {canManageInternal && (
        <InternalDayCard
          key={selected}
          date={selected}
          now={now}
          hasMeeting={meetings.has(selected)}
          hasInternal={internals.has(selected)}
          onChanged={onInternalChanged}
        />
      )}
    </div>
  );
}
