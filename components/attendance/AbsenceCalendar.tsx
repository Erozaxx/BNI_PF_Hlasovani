"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DayPanel } from "@/components/attendance/DayPanel";
import {
  setMyAbsenceAction,
  forgetSubstituteNameAction,
} from "@/actions/attendance";
import {
  GRID_WEEKDAYS,
  MEMBER_TEXTS,
  absenceLine,
  absenceMark,
  dayAriaLabel,
  decideMemberAbsenceEdit,
  isThursday,
  monthGrid,
  monthOf,
  monthTitle,
  pastResultGlyph,
  shiftMonth,
  type PastResult,
} from "@/lib/attendance/rules";

/**
 * iter-038 (T-003a, arch 7.1, 7.2): kalendář nepřítomnosti člena. Čtvrtky jsou
 * zvýrazněné, den se založenou schůzkou podtržený, ● nepřijdu, ◐ pošlu
 * náhradníka, v minulosti ✓ N A z uzavřené docházky. Mřížka 7 sloupců po 44 px
 * se vejde na 390 px. Stav drží komponenta lokálně: akce nevolají
 * `revalidatePath("/dochazka")` a žádné `router.refresh()` (LL-017).
 */

export interface AbsenceCalendarProps {
  /** Dnešek v Praze, `YYYY-MM-DD`. */
  today: string;
  /** Čas serveru při vykreslení (ISO), ať se hydratace shoduje. */
  serverNow: string;
  /** Nejdřívější a nejpozdější zobrazitelný měsíc (rok, měsíc 1 až 12). */
  minMonth: { year: number; month: number };
  maxMonth: { year: number; month: number };
  meetingDates: string[];
  initialAbsences: { date: string; substituteName: string | null }[];
  results: { date: string; status: PastResult }[];
  initialNames: { id: string; name: string }[];
  /** Vybraný den při otevření (nejbližší čtvrtek). */
  initialSelected: string;
}

type AbsenceMap = Record<string, string | null>;

function toMap(rows: { date: string; substituteName: string | null }[]): AbsenceMap {
  const out: AbsenceMap = {};
  for (const r of rows) out[r.date] = r.substituteName;
  return out;
}

export function AbsenceCalendar({
  today,
  serverNow,
  minMonth,
  maxMonth,
  meetingDates,
  initialAbsences,
  results,
  initialNames,
  initialSelected,
}: AbsenceCalendarProps) {
  const { showToast } = useToast();
  const [now, setNow] = useState(() => new Date(serverNow));
  const [absences, setAbsences] = useState<AbsenceMap>(() => toMap(initialAbsences));
  const [names, setNames] = useState(initialNames);
  const [selected, setSelected] = useState(initialSelected);
  const [view, setView] = useState(() => monthOf(initialSelected));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Uzávěrka 7:30 se může přehoupnout, zatímco je stránka otevřená.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const meetings = useMemo(() => new Set(meetingDates), [meetingDates]);
  const resultByDate = useMemo(() => {
    const m: Record<string, PastResult> = {};
    for (const r of results) m[r.date] = r.status;
    return m;
  }, [results]);

  const viewIndex = view.year * 12 + view.month;
  const canPrev = viewIndex > minMonth.year * 12 + minMonth.month;
  const canNext = viewIndex < maxMonth.year * 12 + maxMonth.month;
  const weeks = monthGrid(view.year, view.month);

  function go(delta: number) {
    setView((v) => shiftMonth(v.year, v.month, delta));
  }

  function selectDay(date: string) {
    setSelected(date);
    setError(null);
    setView(monthOf(date));
  }

  async function save(
    date: string,
    kind: "none" | "absence" | "substitute",
    name: string | null,
    toast: string
  ) {
    setPending(true);
    setError(null);
    try {
      const result = await setMyAbsenceAction(date, kind, name);
      if (!result.success) {
        setError(result.error);
        return;
      }
      const data = result.data;
      setAbsences((prev) => {
        const next = { ...prev };
        if (kind === "none") delete next[date];
        else next[date] = data?.substituteName ?? null;
        return next;
      });
      if (data?.names) setNames(data.names);
      showToast("success", toast);
    } catch {
      setError("Neuložilo se. Zkus to znovu.");
    } finally {
      setPending(false);
    }
  }

  async function forget(id: string) {
    try {
      const result = await forgetSubstituteNameAction(id);
      if (!result.success) {
        showToast("error", result.error);
        return;
      }
      setNames((prev) => prev.filter((n) => n.id !== id));
      showToast("success", MEMBER_TEXTS.toastNameForgotten);
    } catch {
      showToast("error", "Neuložilo se. Zkus to znovu.");
    }
  }

  const decision = decideMemberAbsenceEdit(now, selected);
  const hasAbsence = Object.prototype.hasOwnProperty.call(absences, selected);
  const upcoming = Object.keys(absences)
    .filter((d) => d >= today)
    .sort();

  return (
    <div className="space-y-6">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-h-[44px] min-w-[44px]"
            disabled={!canPrev}
            onClick={() => go(-1)}
            aria-label="Předchozí měsíc"
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
            aria-label="Další měsíc"
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
                const past = date < today;
                const result = resultByDate[date] ?? null;
                const has = Object.prototype.hasOwnProperty.call(absences, date);
                const mark = absenceMark(absences[date], has);
                const thursday = isThursday(date);
                const hasMeeting = meetings.has(date);
                const isSelected = date === selected;
                const glyph = result
                  ? pastResultGlyph(result)
                  : mark === "absent"
                    ? "●"
                    : mark === "substitute"
                      ? "◐"
                      : "";
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => selectDay(date)}
                    aria-label={dayAriaLabel(date, { mark, result, hasMeeting })}
                    aria-pressed={isSelected}
                    className={[
                      "flex min-h-[44px] flex-col items-center justify-center rounded-lg text-sm leading-tight",
                      "focus:outline-none focus:shadow-focus",
                      thursday ? "bg-navy-light font-semibold text-navy" : "text-text-main hover:bg-background",
                      past && !thursday ? "text-text-muted" : "",
                      isSelected ? "ring-2 ring-primary" : "",
                    ].join(" ")}
                  >
                    <span className={hasMeeting ? "underline decoration-2 underline-offset-2" : ""}>
                      {Number(date.slice(8))}
                    </span>
                    <span className="h-4 text-xs" aria-hidden="true">
                      {glyph}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <p className="mt-3 text-xs text-text-muted">{MEMBER_TEXTS.legend}</p>
        <p className="text-xs text-text-muted">{MEMBER_TEXTS.legendPast}</p>
      </Card>

      <Card>
        <DayPanel
          key={`${selected}:${hasAbsence ? (absences[selected] ?? "-") : "+"}`}
          date={selected}
          saved={{ absent: hasAbsence, substituteName: absences[selected] ?? null }}
          editable={decision.ok}
          blockedMessage={decision.ok || selected < today ? null : decision.message}
          result={resultByDate[selected] ?? null}
          recentNames={names.map((n) => n.name)}
          pending={pending}
          error={error}
          onSave={(kind, name) =>
            save(
              selected,
              kind,
              name,
              kind === "none" && hasAbsence ? MEMBER_TEXTS.toastCancelled : MEMBER_TEXTS.toastSaved
            )
          }
        />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold text-text-main">{MEMBER_TEXTS.listTitle}</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">{MEMBER_TEXTS.listEmpty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map((d) => {
              const editable = decideMemberAbsenceEdit(now, d).ok;
              return (
                <li key={d} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-sm text-text-main">{absenceLine(d, absences[d])}</span>
                  {editable && (
                    <span className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="min-h-[44px]"
                        onClick={() => selectDay(d)}
                      >
                        {MEMBER_TEXTS.change}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="min-h-[44px]"
                        disabled={pending}
                        onClick={() => save(d, "none", null, MEMBER_TEXTS.toastCancelled)}
                      >
                        {MEMBER_TEXTS.cancel}
                      </Button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {names.length > 0 && (
        <Card>
          <details>
            <summary className="flex min-h-[44px] cursor-pointer items-center text-base font-semibold text-text-main">
              {MEMBER_TEXTS.savedNamesTitle}
            </summary>
            <ul className="mt-2 flex flex-wrap gap-2">
              {names.map((n) => (
                <li
                  key={n.id}
                  className="flex items-center gap-1 rounded-full border border-border bg-background pl-3 text-sm text-text-main"
                >
                  {n.name}
                  <button
                    type="button"
                    onClick={() => forget(n.id)}
                    aria-label={`Smazat jméno ${n.name}`}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-text-muted hover:text-danger focus:outline-none focus:shadow-focus"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </div>
  );
}
