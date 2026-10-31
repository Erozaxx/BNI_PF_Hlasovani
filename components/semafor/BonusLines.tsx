import { CATEGORY_SOURCE, type BonusResult, type BonusSources } from "@/lib/semafor/bonus";
import { SEMAFOR_TEXTS, bonusLineText, categoryCapText } from "@/lib/semafor/texts";

/**
 * iter-044 (arch 7.1, 7.3): rozpis bonusu po kategoriích. Vypíše jen kategorie
 * s nenulovým počtem ze zapnutých částí, u oříznuté kategorie větu o podstropu,
 * u přesaženého stropu větu `bonusCap`. Čisté zobrazení, bez dat jiných členů.
 */
export function BonusLines({ bonus, sources }: { bonus: BonusResult; sources: BonusSources }) {
  const lines = bonus.lines.filter((l) => l.count > 0 && sources[CATEGORY_SOURCE[l.category]]);
  return (
    <ul className="mt-1 space-y-1 text-sm text-text-main">
      {lines.map((l) => (
        <li key={l.category}>
          {bonusLineText(l.category, l.count, l.category === "work" ? l.points : (l.each ?? 0))}
          {l.capped && <span className="text-text-muted">{` ${categoryCapText(l.category)}`}</span>}
        </li>
      ))}
      {bonus.capped && <li className="text-text-muted">{SEMAFOR_TEXTS.bonusCap}</li>}
    </ul>
  );
}
