"use client";

/**
 * Sticky vizuál, který se mění podle kroku v zorném poli (arch 6.1).
 *
 * Jeden `IntersectionObserver` nad prvky s `data-step`, spouštěcí pásmo
 * ve 40 až 45 % výšky okna. Aktivní je poslední protínající krok v pořadí
 * dokumentu. Když je pásmo nad prvním krokem (čtenář je v úvodu), vrátí
 * se výchozí stav úvodu. V mezeře mezi kroky zůstává poslední stav
 * (`pickActiveStep`, T-010r2).
 *
 * Viditelnost řídí jen CSS (`app/pravidla/pravidla.css`): bez JS, s
 * `prefers-reduced-motion: reduce` a v tisku je sticky skrytý a platí mini
 * osy u kroků. Sticky je duplikát, proto `aria-hidden`.
 */
import { useEffect, useState } from "react";
import { pickActiveStep, SCROLLY_BAND_BOTTOM, SCROLLY_ROOT_MARGIN } from "@/lib/info-pages/scrolly";
import type { VisualKind, VisualStateMap } from "@/lib/info-pages/types";
import { renderVisual } from "./visuals/registry";

export interface ScrollyStageProps<K extends VisualKind> {
  kind: K;
  initial: VisualStateMap[K];
  /** Stavy v pořadí dokumentu. */
  states: { id: string; state: VisualStateMap[K] }[];
}

export function ScrollyStage<K extends VisualKind>({ kind, initial, states }: ScrollyStageProps<K>) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const order = states.map((s) => s.id);
    const visible = new Set<string>();
    const elements = order
      .map((id) => document.querySelector(`[data-step="${id}"]`))
      .filter((el): el is Element => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.step;
          if (!id) continue;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const first = elements[0];
        const firstStepBelow =
          first !== undefined &&
          first.getBoundingClientRect().top >= window.innerHeight * SCROLLY_BAND_BOTTOM;
        setActiveId((previous) => pickActiveStep(order, visible, previous, firstStepBelow));
      },
      { rootMargin: SCROLLY_ROOT_MARGIN }
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [states]);

  const state = states.find((s) => s.id === activeId)?.state ?? initial;

  return (
    <div className="info-sticky" aria-hidden="true">
      <div className="info-sticky-inner max-h-[104px] overflow-hidden border-b border-border bg-surface py-2 lg:max-h-none lg:rounded-card lg:border lg:p-5 lg:shadow-card">
        {renderVisual(kind, state, "sticky")}
      </div>
    </div>
  );
}
