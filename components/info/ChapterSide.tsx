/**
 * Fakta kroku: co v tu chvíli dělá chapter. Pole `obligation` zůstává
 * v datech, ale nevykresluje se (T-010r4, rozhodnutí uživatele: závazné
 * a doporučené nerozlišovat).
 */
import type { Fact } from "@/lib/info-pages/types";

export function ChapterSide({ facts }: { facts: Fact[] }) {
  if (facts.length === 0) return null;
  return (
    <ul className="info-facts mt-6 space-y-3 border-l-2 border-border-strong pl-4">
      {facts.map((fact, i) => (
        <li key={i} className="text-base leading-relaxed text-text-main">
          {fact.text}
        </li>
      ))}
    </ul>
  );
}
