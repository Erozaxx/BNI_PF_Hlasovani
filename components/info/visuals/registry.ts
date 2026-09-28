/**
 * Registr vizuálů info stránek (arch_iter-029_T-001 sekce 5.4).
 *
 * Nový vizuál = klíč ve `VisualStateMap` (lib/info-pages/types.ts)
 * + komponenta v tomhle adresáři + řádek níž. Komponenty jsou čisté (bez
 * hooků), takže je použije server (mini osa) i klient (sticky prvek).
 */
import { createElement, type ReactElement } from "react";
import type { VisualKind, VisualStateMap } from "@/lib/info-pages/types";
import { AbsenceTimeline, AbsenceTimelineLegend, type VisualSize } from "./AbsenceTimeline";

export type { VisualSize };

type VisualComponent<K extends VisualKind> = (props: {
  state: VisualStateMap[K];
  size: VisualSize;
}) => ReactElement | null;

interface VisualEntry<K extends VisualKind> {
  component: VisualComponent<K> | null;
  /** Legenda značek do shrnutí a úvodu, `null` = vizuál legendu nemá. */
  legend: ((headingLevel: 2 | 3) => ReactElement) | null;
}

export const VISUALS: { [K in VisualKind]: VisualEntry<K> } = {
  "absence-timeline": {
    component: AbsenceTimeline,
    legend: (headingLevel) => createElement(AbsenceTimelineLegend, { headingLevel }),
  },
  none: { component: null, legend: null },
};

export function hasVisual(kind: VisualKind): boolean {
  return VISUALS[kind].component !== null;
}

export function renderVisual<K extends VisualKind>(
  kind: K,
  state: VisualStateMap[K],
  size: VisualSize
): ReactElement | null {
  const component = VISUALS[kind].component as VisualComponent<K> | null;
  if (!component) return null;
  return createElement(component, { state, size });
}

/** Úroveň nadpisu podle místa: úvod 2 (pod H1), shrnutí 3 (pod H2). */
export function renderLegend(kind: VisualKind, headingLevel: 2 | 3): ReactElement | null {
  const legend = VISUALS[kind].legend;
  return legend ? legend(headingLevel) : null;
}
