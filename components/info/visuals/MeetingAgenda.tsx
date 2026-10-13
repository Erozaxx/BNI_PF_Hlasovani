/**
 * Program čtvrteční schůzky pro vizuál `meeting-agenda` (iter-031, T-007s,
 * arch_iter-031_T-001d sekce 4.2, stránka schuzka).
 *
 * Čistá komponenta bez hooků, vzor `LeadershipChart`:
 *   - `sticky`: pod 1024 px pruh s prvním zvýrazněným blokem
 *     („Hlavní prezentace, 5 minut", bez přípony, gate T-012p úprava 22),
 *     bez zvýraznění „Program otevřené schůzky". Od 1024 px seznam devíti
 *     bloků, bez časů (gate T-012w2).
 *     Obě varianty v DOM, přepíná CSS.
 *   - `inline` v úvodu (`intro`): celý seznam na všech šířkách
 *     (`keepIntro: true`).
 *   - `inline` u kroku (bez JS, reduced motion, tisk): pruh a `srText`.
 * Zvýraznění je jen vizuální (tučně, navy levý okraj), sticky je
 * `aria-hidden` a inline `role="img"`, význam nese `srText`. Červená ne.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { AGENDA_BLOCKS } from "@/lib/info-pages/types";
import type { AgendaBlockId, MeetingAgendaState } from "@/lib/info-pages/types";
import type { VisualSize } from "./AbsenceTimeline";

const T = TEMPLATE_TEXTS.agenda;

/** „Představení členů, každý 30 sekund"; s neprázdným časem „čas · název". */
export function agendaLine(id: AgendaBlockId): string {
  const block = T.blocks[id];
  return block.time === "" ? block.name : `${block.time}${T.separator}${block.name}`;
}

/**
 * Text pruhu: první zvýrazněný blok v pořadí programu, bez počtu dalších
 * (gate T-012p úprava 22). Zvýrazněné bloky ukazuje seznam programu.
 */
export function agendaBarText(state: MeetingAgendaState): string {
  const first = AGENDA_BLOCKS.find((id) => state.current.includes(id));
  return first === undefined ? T.idle : agendaLine(first);
}

export function MeetingAgendaBar({ state }: { state: MeetingAgendaState }) {
  return <p className="info-agenda-bar text-sm font-semibold leading-snug text-text-main">{agendaBarText(state)}</p>;
}

export function MeetingAgendaList({ state }: { state: MeetingAgendaState }) {
  return (
    <div className="info-agenda-full">
      <ol className="info-agenda-list space-y-1 text-sm leading-snug">
        {AGENDA_BLOCKS.map((id) => {
          const on = state.current.includes(id);
          const plain = state.current.length === 0;
          return (
            <li
              key={id}
              data-block={id}
              data-active={on ? "true" : undefined}
              className={
                on
                  ? "info-agenda-item info-agenda-item--on border-l-4 border-navy pl-2 font-semibold text-text-main"
                  : plain
                    ? "info-agenda-item border-l-4 border-transparent pl-2 text-text-main"
                    : "info-agenda-item border-l-4 border-transparent pl-2 text-[#666]"
              }
            >
              {agendaLine(id)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function MeetingAgenda({
  state,
  size,
  intro = false,
}: {
  state: MeetingAgendaState;
  size: VisualSize;
  /** Inline v úvodu: celý seznam. U kroku jen pruh, i když nic nesvítí. */
  intro?: boolean;
}) {
  if (size === "sticky") {
    return (
      <div className="info-agenda info-agenda--sticky">
        <div className="lg:hidden">
          <MeetingAgendaBar state={state} />
        </div>
        <div className="hidden lg:block">
          <MeetingAgendaList state={state} />
        </div>
      </div>
    );
  }
  if (intro) {
    return (
      <div className="info-agenda info-agenda--inline">
        <MeetingAgendaList state={state} />
      </div>
    );
  }
  return (
    <div className="info-agenda info-agenda--inline">
      <MeetingAgendaBar state={state} />
      <p className="mt-1.5 text-sm leading-snug text-text-main">{state.srText}</p>
    </div>
  );
}
