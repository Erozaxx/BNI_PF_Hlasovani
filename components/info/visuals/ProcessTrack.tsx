/**
 * Postup v etapách pro vizuál `process-track` (iter-031, T-007s,
 * arch_iter-031_T-003s 1.1, stránky clenstvi a stiznosti).
 *
 * Čistá komponenta bez hooků (server i sticky prvek na klientu), vzor
 * `LeadershipChart`:
 *   - `sticky`: pod 1024 px řádek pozice (nejvýš dva řádky) a segmentový
 *     pruh s tolika dílky, kolik je etap. Od 1024 px svislý číslovaný seznam
 *     (hotové s fajfkou, aktuální navy, budoucí šedé). Obě varianty v DOM,
 *     přepíná CSS.
 *   - `inline` (bez JS, reduced motion, tisk): řádek pozice, pruh (v tisku
 *     skrytý) a `srText`.
 * `ended`: etapy za aktuální jsou přerušované, ne budoucí. Stav nese tvar
 * a text, barva je jen navíc. Červená se nepoužívá.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { fillTemplate } from "@/lib/info-pages/format";
import type { ProcessTrackState } from "@/lib/info-pages/types";
import type { VisualSize } from "./AbsenceTimeline";

const T = TEMPLATE_TEXTS.processTrack;

export type StageState = "done" | "current" | "future" | "ended";

/** Stav etapy `index` vůči `current` (úvod -1: všechny budoucí). */
export function stageState(state: ProcessTrackState, index: number): StageState {
  if (state.current >= 0 && index < state.current) return "done";
  if (index === state.current) return "current";
  return state.ended ? "ended" : "future";
}

/** Řádek pozice: „Etapa 2 ze 7: Přihláška", v úvodu „Celkem 7 etap". */
export function processTrackPosition(state: ProcessTrackState): string {
  const total = state.stages.length;
  if (state.current < 0) return fillTemplate(T.overview, { total });
  const label = state.outcome ?? state.stages[state.current] ?? "";
  return fillTemplate(T.position, { n: state.current + 1, total, label });
}

/** Popisek etapy v seznamu: u aktuální `outcome`, když ho stav má. */
function stageLabel(state: ProcessTrackState, index: number): string {
  return index === state.current && state.outcome ? state.outcome : state.stages[index];
}

const SEGMENT_CLASS: Record<StageState, string> = {
  done: "bg-navy",
  current: "bg-navy ring-2 ring-navy ring-offset-1",
  future: "bg-border-strong",
  ended: "border border-dashed border-[#666] bg-surface",
};

export function ProcessTrackBar({ state }: { state: ProcessTrackState }) {
  return (
    <div className="info-pt-bar mt-1.5 flex gap-1" role="presentation">
      {state.stages.map((_, i) => {
        const s = stageState(state, i);
        return <span key={i} data-stage={s} className={`info-pt-seg h-2 min-w-0 flex-1 rounded-sm ${SEGMENT_CLASS[s]}`} />;
      })}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M2.5 6.5l2.2 2.2 4.8-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ITEM_CLASS: Record<StageState, string> = {
  done: "border border-border-strong bg-surface text-text-main",
  current: "border-2 border-navy bg-navy font-semibold text-white",
  // #666 na bílé = 5,7:1 (stejně jako neaktivní role ve schématu vedení).
  future: "border border-border bg-surface text-[#666]",
  ended: "border border-dashed border-[#666] bg-surface text-[#666]",
};

export function ProcessTrackList({ state }: { state: ProcessTrackState }) {
  return (
    <ol className="info-pt-list space-y-1.5 text-sm leading-snug" aria-label={T.ariaLabel}>
      {state.stages.map((_, i) => {
        const s = stageState(state, i);
        return (
          <li key={i} data-stage={s} className={`info-pt-item flex items-center gap-2 rounded-md px-2 py-1.5 ${ITEM_CLASS[s]}`}>
            <span className="info-pt-num flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs">
              {s === "done" ? <CheckIcon /> : i + 1}
            </span>
            <span className="min-w-0">{stageLabel(state, i)}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Position({ state }: { state: ProcessTrackState }) {
  return <p className="info-pt-position text-sm font-semibold leading-snug text-text-main">{processTrackPosition(state)}</p>;
}

export function ProcessTrack({ state, size }: { state: ProcessTrackState; size: VisualSize }) {
  if (size === "sticky") {
    return (
      <div className="info-pt info-pt--sticky">
        <div className="lg:hidden">
          <Position state={state} />
          <ProcessTrackBar state={state} />
        </div>
        <div className="hidden lg:block">
          <Position state={state} />
          <div className="mt-3">
            <ProcessTrackList state={state} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="info-pt info-pt--inline">
      <Position state={state} />
      <div className="print:hidden">
        <ProcessTrackBar state={state} />
      </div>
      <p className="mt-1.5 text-sm leading-snug text-text-main">{state.srText}</p>
    </div>
  );
}
