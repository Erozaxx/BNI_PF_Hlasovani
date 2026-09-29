/**
 * Fakta kroku: co v tu chvíli dělá chapter. Pole `obligation` zůstává
 * v datech, ale nevykresluje se (T-010r4, rozhodnutí uživatele: závazné
 * a doporučené nerozlišovat).
 */
import type { Segment } from "@/lib/info-pages/glossary";
import type { Fact } from "@/lib/info-pages/types";
import { RichText } from "./RichText";

export function ChapterSide({
  facts,
  texts,
}: {
  facts: Fact[];
  /** Texty faktů s odkazy na role (stejné pořadí jako `facts`). */
  texts?: Segment[][];
}) {
  if (facts.length === 0) return null;
  return (
    <ul className="info-facts mt-6 space-y-3 border-l-2 border-border-strong pl-4">
      {facts.map((fact, i) => (
        <li key={i} className="text-base leading-relaxed text-text-main">
          {texts?.[i] ? <RichText segments={texts[i]} /> : fact.text}
        </li>
      ))}
    </ul>
  );
}
