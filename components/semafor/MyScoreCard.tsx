import { Card } from "@/components/ui/Card";
import type { MonthView } from "@/lib/semafor/mine";
import { hasBonusSource, type BonusSources } from "@/lib/semafor/bonus";
import {
  ALL_BONUS_SOURCES,
  AREAS_LEGEND_TEXT,
  SEMAFOR_TEXTS,
  bonusNoneText,
  bonusBurzaText,
  bonusMastermindText,
  colorBadgeText,
  monthLabel,
  myBniText,
  myBonusLaterText,
  myBonusText,
  myTotalText,
  scoreLegendText,
} from "@/lib/semafor/texts";
import { ColorBadge } from "@/components/semafor/ColorBadge";
import { AreaList } from "@/components/semafor/AreaList";

/**
 * iter-041 (arch 6.2, gate Z8): karta „Můj semafor“. Hlavní štítek je interní
 * barva se skóre („Zelená · 74“), pod ním oficiální barva BNI a bonus. Všechna
 * data jsou jen přihlášeného člena (`memberId` ze session v rodiči).
 *
 * iter-042: legenda pod nadpisem (#7) a pod oblastmi, bonus jen ze zapnutých
 * částí (`sources`, Z3). Bez zdroje bonusu zmizí řádek BNI i sekce Bonus.
 */
export function MyScoreCard({
  view,
  later,
  sources = ALL_BONUS_SOURCES,
}: {
  view: MonthView;
  /** Bonus po konci měsíce snímku se započte s dalším měsícem (`afterDate`, `nextMonth`). */
  later: { afterDate: string; nextMonth: string } | null;
  /** Které části dávají bonus (BK2). */
  sources?: BonusSources;
}) {
  const hasBonus = hasBonusSource(sources);
  const mm = view.bonus.lines.find((l) => l.category === "mastermind");
  const bz = view.bonus.lines.find((l) => l.category === "burza");
  return (
    <Card>
      <p className="text-sm text-text-muted">{monthLabel(view.month)}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <ColorBadge color={view.internalColor} text={colorBadgeText(view.internalColor, view.internal)} size="lg" />
        <span className="text-base font-semibold text-text-main">{myTotalText(view.internal)}</span>
      </div>
      <p className="mt-2 text-sm text-text-muted">{scoreLegendText(sources)}</p>
      {hasBonus && (
        <p className="mt-3 text-sm text-text-muted">
          <span>{myBniText(view.bniColor, view.total)}</span>
          {" · "}
          <span>{myBonusText(view.bonus.bonus)}</span>
        </p>
      )}

      {hasBonus && (
        <>
          <h2 className="mt-5 text-base font-semibold text-text-main">{SEMAFOR_TEXTS.bonusTitle}</h2>
          {view.bonus.raw === 0 ? (
            <p className="mt-1 text-sm text-text-muted">{bonusNoneText(sources)}</p>
          ) : (
            <ul className="mt-1 space-y-1 text-sm text-text-main">
              {sources.mastermind && mm && mm.count > 0 && <li>{bonusMastermindText(mm.count)}</li>}
              {sources.burza && bz && bz.count > 0 && <li>{bonusBurzaText(bz.count)}</li>}
              {view.bonus.capped && <li className="text-text-muted">{SEMAFOR_TEXTS.bonusCap}</li>}
            </ul>
          )}
          {later && (
            <p className="mt-2 text-sm text-text-muted">
              {myBonusLaterText(later.afterDate, later.nextMonth, sources)}
            </p>
          )}
        </>
      )}

      <details className="group mt-5">
        <summary className="flex min-h-[44px] cursor-pointer select-none items-center rounded text-sm font-medium text-navy focus:outline-none focus:shadow-focus">
          {SEMAFOR_TEXTS.areas}
        </summary>
        <div className="mt-2">
          <AreaList areas={view.areas} />
          <p className="mt-2 text-sm text-text-muted">{AREAS_LEGEND_TEXT}</p>
        </div>
      </details>
    </Card>
  );
}
