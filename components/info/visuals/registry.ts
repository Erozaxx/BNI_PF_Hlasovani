/**
 * Registr vizuálů info stránek (arch_iter-029_T-001 sekce 5.4).
 *
 * Nový vizuál = klíč ve `VisualStateMap` (lib/info-pages/types.ts)
 * + komponenta v tomhle adresáři + řádek níž. Komponenty jsou čisté (bez
 * hooků), takže je použije server (mini osa) i klient (sticky prvek).
 *
 * iter-031 (T-007s): `process-track` (clenstvi, stiznosti) a `meeting-agenda`
 * (schuzka). Prop `intro` říká, že inline stav je úvod stránky.
 */
import { createElement, type ReactElement } from "react";
import type { VisualKind, VisualStateMap } from "@/lib/info-pages/types";
import { AbsenceTimeline, AbsenceTimelineLegend, type VisualSize } from "./AbsenceTimeline";
import { LeadershipChart, LeadershipChartLegend } from "./LeadershipChart";
import { MeetingAgenda } from "./MeetingAgenda";
import { ProcessTrack } from "./ProcessTrack";

export type { VisualSize };

type VisualComponent<K extends VisualKind> = (props: {
  state: VisualStateMap[K];
  size: VisualSize;
  /** Inline vizuál v úvodu stránky (ne u kroku). */
  intro?: boolean;
}) => ReactElement | null;

interface VisualEntry<K extends VisualKind> {
  component: VisualComponent<K> | null;
  /** Legenda značek do shrnutí a úvodu, `null` = vizuál legendu nemá. */
  legend: ((headingLevel: 2 | 3) => ReactElement) | null;
  /**
   * Úvodní stav zůstane vidět i se sticky režimem pod 1024 px (sticky tam
   * ukazuje jen pruh, celé schéma je jednou v úvodu, arch_iter-030 7.1).
   */
  keepIntro: boolean;
}

export const VISUALS: { [K in VisualKind]: VisualEntry<K> } = {
  "absence-timeline": {
    component: AbsenceTimeline,
    legend: (headingLevel) => createElement(AbsenceTimelineLegend, { headingLevel }),
    keepIntro: false,
  },
  "leadership-chart": {
    component: LeadershipChart,
    legend: (headingLevel) => createElement(LeadershipChartLegend, { headingLevel }),
    keepIntro: true,
  },
  "process-track": { component: ProcessTrack, legend: null, keepIntro: false },
  "meeting-agenda": { component: MeetingAgenda, legend: null, keepIntro: true },
  none: { component: null, legend: null, keepIntro: false },
};

export function hasVisual(kind: VisualKind): boolean {
  return VISUALS[kind].component !== null;
}

export function keepsIntro(kind: VisualKind): boolean {
  return VISUALS[kind].keepIntro;
}

export function renderVisual<K extends VisualKind>(
  kind: K,
  state: VisualStateMap[K],
  size: VisualSize,
  intro = false
): ReactElement | null {
  const component = VISUALS[kind].component as VisualComponent<K> | null;
  if (!component) return null;
  return createElement(component, intro ? { state, size, intro } : { state, size });
}

/** Úroveň nadpisu podle místa: úvod 2 (pod H1), shrnutí 3 (pod H2). */
export function renderLegend(kind: VisualKind, headingLevel: 2 | 3): ReactElement | null {
  const legend = VISUALS[kind].legend;
  return legend ? legend(headingLevel) : null;
}
