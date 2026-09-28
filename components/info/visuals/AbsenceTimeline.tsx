/**
 * Osa 26 týdenních schůzek (6 měsíců) pro vizuál `absence-timeline`
 * (iter-029, T-007, arch sekce 5.4, 6.2, 6.3, 6.6, 10).
 *
 * Čistá komponenta bez hooků: server ji použije pro mini osu u kroku,
 * klient (`ScrollyStage`) pro sticky prvek. Značky se liší tvarem, ne jen
 * barvou. Červená jen u stavu „Výbor jedná" (T-010r4), ne u značek absencí.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { fillTemplate, formatCounter } from "@/lib/info-pages/format";
import type { AbsenceTimelineState, TimelineStatus, WeekMark } from "@/lib/info-pages/types";

export type VisualSize = "sticky" | "inline";

const T = TEMPLATE_TEXTS.timeline;

const WEEKS = 26;
const CELL = 10;
const GAP = 3;
const MONTH_GAP = 6;
const HEIGHT = 16;
/** První týden každého měsíce (26 týdnů / 6 měsíců = 4, 4, 5, 4, 4, 5). */
const MONTH_STARTS = [1, 5, 9, 14, 18, 22];
const WEEKS_PER_MONTH = MONTH_STARTS.map((start, i) => (MONTH_STARTS[i + 1] ?? WEEKS + 1) - start);
const WIDTH = WEEKS * CELL + (WEEKS - 1) * GAP + (MONTH_STARTS.length - 1) * MONTH_GAP;

const STATUS_DOT: Record<TimelineStatus, string | null> = {
  ok: "bg-success",
  watch: "bg-warning",
  // Červená stejná jako akcentový pruh info stránek (#cf2031, T-010r4), jen lokálně.
  committee: "bg-[#cf2031]",
  leave: "bg-gold",
  probation: "bg-warning",
  open: "bg-border-strong",
  left: "bg-border-strong",
  none: null,
};

function monthIndex(week: number): number {
  let index = 0;
  MONTH_STARTS.forEach((start, i) => {
    if (week >= start) index = i;
  });
  return index;
}

function weekCenterX(week: number): number {
  return (week - 1) * (CELL + GAP) + monthIndex(week) * MONTH_GAP + CELL / 2;
}

function Mark({ mark, cx }: { mark: WeekMark | undefined; cx: number }) {
  const cy = HEIGHT / 2;
  switch (mark) {
    case "S":
      return (
        <circle className="info-mark fill-surface stroke-navy" cx={cx} cy={cy} r={3.6} strokeWidth={1.6} />
      );
    case "A":
      return <circle className="info-mark fill-text-main" cx={cx} cy={cy} r={4.6} />;
    case "M":
      return (
        <rect className="info-mark fill-gold" x={cx - 4} y={cy - 5.5} width={8} height={11} rx={1.5} />
      );
    case "A-expired":
      return (
        <g className="info-mark stroke-text-muted" strokeWidth={1.4} fill="none">
          <circle cx={cx} cy={cy} r={3.6} />
          <line x1={cx - 4.2} y1={cy + 4.2} x2={cx + 4.2} y2={cy - 4.2} />
        </g>
      );
    default:
      return <circle className="info-mark fill-border-strong" cx={cx} cy={cy} r={2} />;
  }
}

/** Jedna značka v legendě (stejný tvar jako na ose). */
function LegendMark({ mark }: { mark: WeekMark | undefined }) {
  return (
    <svg
      viewBox={`0 0 ${CELL} ${HEIGHT}`}
      width={CELL + 2}
      height={HEIGHT}
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <Mark mark={mark} cx={CELL / 2} />
    </svg>
  );
}

function Axis({ state }: { state: AbsenceTimelineState }) {
  const byWeek = new Map(state.marks.map((m) => [m.week, m.mark]));
  const weeks = Array.from({ length: WEEKS }, (_, i) => i + 1);
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block h-auto w-full"
      preserveAspectRatio="xMinYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {weeks.map((week) => (
        <Mark key={week} mark={byWeek.get(week)} cx={weekCenterX(week)} />
      ))}
    </svg>
  );
}

function MonthLabels() {
  return (
    <div
      className="mt-1 hidden text-xs text-text-main lg:grid"
      style={{ gridTemplateColumns: WEEKS_PER_MONTH.map((n) => `${n}fr`).join(" ") }}
      aria-hidden="true"
    >
      {MONTH_STARTS.map((_, i) => (
        <span key={i}>{fillTemplate(T.month, { n: i + 1 })}</span>
      ))}
    </div>
  );
}

/** Legenda všech značek osy (shrnutí, úvod, sticky na desktopu). */
export function AbsenceTimelineLegend({ headingLevel = 3 }: { headingLevel?: 2 | 3 | 4 }) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const items: { mark: WeekMark | undefined; name: string; text: string }[] = [
    { mark: undefined, name: T.presentName, text: T.present },
    { mark: "S", name: T.substituteName, text: T.substitute },
    { mark: "A", name: T.absenceName, text: T.absence },
    { mark: "M", name: T.leaveName, text: T.leave },
    { mark: "A-expired", name: T.expiredName, text: T.expired },
  ];
  return (
    <div className="info-legend">
      <Heading className="text-base font-semibold text-text-main">{T.title}</Heading>
      <ul className="mt-2 space-y-1.5 text-sm text-text-main">
        {items.map((item) => (
          <li key={item.name} className="flex items-start gap-2">
            <span className="mt-0.5">
              <LegendMark mark={item.mark} />
            </span>
            <span>
              <span className="font-medium">{item.name}</span>: {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AbsenceTimeline({ state, size }: { state: AbsenceTimelineState; size: VisualSize }) {
  const dot = STATUS_DOT[state.status];
  return (
    <div className={`info-timeline info-timeline--${size}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-text-main lg:text-base">
          {dot && <span aria-hidden="true" className={`info-status-dot h-2.5 w-2.5 rounded-full ${dot}`} />}
          {state.statusLabel}
        </span>
        {state.counters && (
          <span className="inline-flex flex-wrap gap-x-3 text-xs text-text-main lg:text-sm">
            <span>
              {formatCounter(state.counters.absences, {
                within: T.absences,
                overByOne: T.absencesOverByOne,
                over: T.absencesOver,
              })}
            </span>
            <span>
              {formatCounter(state.counters.substitutes, {
                within: T.substitutes,
                overByOne: T.substitutesOverByOne,
                over: T.substitutesOver,
              })}
            </span>
          </span>
        )}
      </div>
      <div className={size === "sticky" ? "mt-2 max-w-[420px]" : "mt-2 max-w-[365px]"}>
        <Axis state={state} />
        <MonthLabels />
      </div>
      {size === "sticky" && (
        <div className="mt-5 hidden border-t border-border pt-4 lg:block">
          <AbsenceTimelineLegend headingLevel={4} />
        </div>
      )}
    </div>
  );
}
