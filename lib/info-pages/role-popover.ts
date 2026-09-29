/**
 * Bublina u odkazu na roli (iter-030, T-010r4). Čisté funkce bez DOM:
 * shrnutí rolí z dat karet (jeden zdroj pravdy) a umístění bubliny.
 * Klientská komponenta `components/info/RolePopover.tsx`.
 */
import { ROLE_PAGE_SLUG } from "./glossary";
import type { InfoPage, RoleId } from "./types";

export interface RoleSummary {
  /** Název karty nebo pod-kotvy. */
  title: string;
  /** Popis karty (`RoleCard.lead`), u pod-kotvy první fakt (pod-kotva popis nemá). */
  text: string;
}

export type RoleSummaries = Partial<Record<RoleId, RoleSummary>>;

/** Shrnutí všech rolí s kartou nebo pod-kotvou na stránce `role`. */
export function roleSummaries(pages: Pick<InfoPage, "slug" | "reference">[]): RoleSummaries {
  const out: RoleSummaries = {};
  const cards = pages.find((p) => p.slug === ROLE_PAGE_SLUG)?.reference?.roles ?? [];
  for (const card of cards) {
    out[card.id] = { title: card.title, text: card.lead };
    for (const sub of card.subAnchors ?? []) {
      const first = sub.facts[0];
      if (first) out[sub.id] = { title: sub.title, text: first.text };
    }
  }
  return out;
}

export interface PopoverRect {
  left: number;
  top: number;
  width: number;
}

/**
 * Bublina pod slovem, v dokumentových souřadnicích. Šířka nejvýš `maxWidth`
 * a nejvýš šířka okna bez 2 × 8 px, vodorovně vždy celá v okně (bez scrollu).
 */
export function popoverPosition(
  trigger: { left: number; bottom: number },
  viewport: { width: number; scrollX: number; scrollY: number },
  maxWidth = 300,
  gap = 6,
  margin = 8
): PopoverRect {
  const width = Math.max(0, Math.min(maxWidth, viewport.width - 2 * margin));
  const minLeft = viewport.scrollX + margin;
  const maxLeft = viewport.scrollX + viewport.width - margin - width;
  const left = Math.min(Math.max(trigger.left + viewport.scrollX, minLeft), maxLeft);
  return { left, top: trigger.bottom + viewport.scrollY + gap, width };
}
