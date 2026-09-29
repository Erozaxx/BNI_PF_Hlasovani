/**
 * Schéma vedení chapteru pro vizuál `leadership-chart` (iter-030, T-007a,
 * arch_iter-030_T-001 sekce 6.3 a 7.1).
 *
 * HTML mřížka (ne SVG), aby text šel zvětšit a zalamovat. Rozvržení podle
 * org. schématu manuálu str. 34, region ve vlastním pásu „mimo chapter".
 * Vztah role ke kroku nese text štítku a tvar okraje, barva je jen navíc.
 * Červená se nepoužívá.
 *
 * Čistá komponenta bez hooků (server i sticky prvek na klientu):
 *   - `sticky`: pod 1024 px jen kompaktní pruh „Rozhoduje: …" (max 3 řádky),
 *     od 1024 px celé schéma. Obě varianty jsou v DOM, přepíná CSS.
 *   - `inline` s prázdným `roles` (úvod): celé schéma na všech šířkách.
 *   - `inline` u kroku: pruh, celé schéma jen od 1024 px a v tisku.
 */
import { Fragment } from "react";
import { ROLE_NAMES, roleBarName } from "@/content/pravidla/role-glosar";
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { joinCs } from "@/lib/info-pages/format";
import { ROLE_RELATIONS } from "@/lib/info-pages/types";
import type { LeadershipChartState, RoleId, RoleRelation } from "@/lib/info-pages/types";
import type { VisualSize } from "./AbsenceTimeline";

const T = TEMPLATE_TEXTS.leadership;

/** `plain` = schéma bez zvýraznění (úvod), `idle` = role v kroku nehraje. */
type NodeState = RoleRelation | "plain" | "idle";

const NODE_CLASS: Record<NodeState, string> = {
  plain: "border border-border-strong bg-surface text-text-main",
  // #666 na bílé = 5,7:1 (WCAG AA), bez průhlednosti (review T-008, S-2).
  idle: "border border-border bg-surface text-[#666]",
  decides: "border-2 border-navy bg-navy text-white",
  approves: "border-[3px] border-text-main bg-surface text-text-main",
  advises: "border-2 border-dashed border-text-main bg-surface text-text-main",
  acts: "border border-text-main bg-surface text-text-main",
  informed: "border border-border-strong bg-surface text-text-main",
};

/** Maximální počet řádků pruhu (sticky na mobilu má 104 px). */
export const BAR_MAX_ROWS = 3;

function isRelation(state: NodeState): state is RoleRelation {
  return state !== "plain" && state !== "idle";
}

function nodeState(state: LeadershipChartState, role: RoleId): NodeState {
  if (state.roles.length === 0) return "plain";
  return state.roles.find((r) => r.role === role)?.relation ?? "idle";
}

/** Řádky pruhu v pořadí rozhoduje > musí souhlasit > radí > provádí > dozví se. */
export function barRows(state: LeadershipChartState): { relation: RoleRelation; names: string[] }[] {
  return ROLE_RELATIONS.map((relation) => ({
    relation,
    names: state.roles.filter((r) => r.relation === relation).map((r) => r.label ?? roleBarName(r.role)),
  }))
    .filter((row) => row.names.length > 0)
    .slice(0, BAR_MAX_ROWS);
}

/** Zalomení za lomítkem („sekretář/pokladník" se jinak do sloupce nevejde). */
function BreakableName({ name }: { name: string }) {
  const parts = name.split("/");
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <>
              /<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </>
  );
}

/** Tvar vztahu: zámek u „musí souhlasit", tečka u „dozví se". */
function RelationIcon({ relation }: { relation: RoleRelation }) {
  if (relation === "approves") {
    return (
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false" className="shrink-0">
        <rect x="2" y="5.5" width="8" height="5.5" rx="1" fill="currentColor" />
        <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    );
  }
  if (relation === "informed") {
    return <span aria-hidden="true" className="inline-block h-2 w-2 shrink-0 rounded-full bg-current" />;
  }
  return null;
}

function RelationTag({ relation }: { relation: RoleRelation }) {
  return (
    <span className="info-lc-tag mt-0.5 flex items-center gap-1 text-[11px] font-semibold leading-tight">
      <RelationIcon relation={relation} />
      {T.relations[relation]}
    </span>
  );
}

function Node({
  role,
  state,
  note,
  className = "",
}: {
  role: RoleId;
  state: LeadershipChartState;
  note?: string;
  className?: string;
}) {
  const s = nodeState(state, role);
  return (
    <div
      data-role={role}
      className={`info-lc-node info-lc-node--${s} min-w-0 rounded-md px-1.5 py-1 text-xs leading-tight ${NODE_CLASS[s]} ${className}`}
    >
      <span className="block font-medium">
        <BreakableName name={ROLE_NAMES[role]} />
      </span>
      {note && <span className="block text-[11px]">{note}</span>}
      {isRelation(s) && <RelationTag relation={s} />}
    </div>
  );
}

const COMMITTEE_SPECS: RoleId[] = ["vybor-rust", "vybor-prihlasky", "vybor-zapojeni", "vybor-vztahy"];

/** Blok výboru: nečinný výbor jen šedým textem, aktivní specializace uvnitř zůstává plně vidět. */
function Committee({ state, className }: { state: LeadershipChartState; className: string }) {
  const s = nodeState(state, "clensky-vybor");
  const box = NODE_CLASS[s];
  return (
    <div
      data-role="clensky-vybor"
      className={`info-lc-node info-lc-node--${s} info-lc-committee min-w-0 rounded-md p-1.5 ${box} ${className}`}
    >
      <div>
        <span className="block text-xs font-medium leading-tight">{ROLE_NAMES["clensky-vybor"]}</span>
        {isRelation(s) && <RelationTag relation={s} />}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        {COMMITTEE_SPECS.map((role) => (
          <Node key={role} role={role} state={state} />
        ))}
      </div>
    </div>
  );
}

function Band({ title, dashed, children }: { title: string; dashed?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`info-lc-band mt-2 rounded-lg p-2 ${
        dashed ? "border border-dashed border-text-main" : "border border-border-strong"
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-main">{title}</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5">{children}</div>
    </div>
  );
}

export function LeadershipChartDiagram({ state }: { state: LeadershipChartState }) {
  return (
    <div className="info-lc-chart max-w-[420px] text-text-main">
      <div className="grid grid-cols-3">
        <Node role="clen" state={state} />
      </div>
      <Band title={T.chapterBand}>
        <Node role="prezident" state={state} className="col-start-2" />
        <Node role="viceprezident" state={state} className="col-start-1" />
        <Node role="vzdelavaci-koordinator" state={state} />
        <Node role="sekretar-pokladnik" state={state} />
        <Committee state={state} className="col-span-2" />
        <Node role="hostitele" state={state} className="self-start" />
        <Node role="koordinator-mentoru" state={state} note={T.notInCommittee} className="col-start-1" />
      </Band>
      <Band title={T.regionBand} dashed>
        <Node role="konzultant-regionu" state={state} />
        <Node role="reditel-regionu" state={state} />
        <Node role="region" state={state} />
      </Band>
    </div>
  );
}

export function LeadershipChartBar({ state }: { state: LeadershipChartState }) {
  const rows = barRows(state);
  if (rows.length === 0) {
    return <p className="info-lc-bar text-sm font-semibold leading-snug text-text-main">{T.barIdle}</p>;
  }
  return (
    <ul className="info-lc-bar space-y-0.5 text-sm leading-snug text-text-main">
      {rows.map((row) => (
        <li key={row.relation} className="flex items-center gap-1.5">
          <RelationIcon relation={row.relation} />
          <span>
            <span className="font-semibold">{T.barLabels[row.relation]}:</span> {joinCs(row.names)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Legenda vztahů (úvod a shrnutí): stejný tvar jako ve schématu. */
export function LeadershipChartLegend({ headingLevel = 3 }: { headingLevel?: 2 | 3 | 4 }) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <div className="info-legend">
      <Heading className="text-base font-semibold text-text-main">{T.legendTitle}</Heading>
      <ul className="mt-2 space-y-1.5 text-sm text-text-main">
        {ROLE_RELATIONS.map((relation) => (
          <li key={relation} className="flex items-start gap-2">
            <span
              className={`info-lc-node info-lc-node--${relation} inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${NODE_CLASS[relation]}`}
            >
              <RelationIcon relation={relation} />
              {T.relations[relation]}
            </span>
            <span>{T.legend[relation]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LeadershipChart({ state, size }: { state: LeadershipChartState; size: VisualSize }) {
  if (size === "sticky") {
    return (
      <div className="info-lc info-lc--sticky">
        <div className="lg:hidden">
          <LeadershipChartBar state={state} />
        </div>
        <div className="hidden lg:block">
          <LeadershipChartDiagram state={state} />
        </div>
      </div>
    );
  }
  if (state.roles.length === 0) {
    return (
      <div className="info-lc info-lc--inline">
        <LeadershipChartDiagram state={state} />
      </div>
    );
  }
  return (
    <div className="info-lc info-lc--inline">
      <LeadershipChartBar state={state} />
      <div className="mt-3 hidden lg:block print:block">
        <LeadershipChartDiagram state={state} />
      </div>
    </div>
  );
}
