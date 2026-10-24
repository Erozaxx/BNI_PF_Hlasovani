import type { AreaKey, AreaView } from "@/lib/semafor/mine";
import { SEMAFOR_TEXTS, fmtMoney, fmtNum, fmtPercent, fmtRate, rateWeekText } from "@/lib/semafor/texts";

const NAME_INDEX: Record<AreaKey, number> = {
  attendance: 0,
  ceu: 1,
  oneToOne: 2,
  referrals: 3,
  tyfcb: 4,
  visitors: 5,
  sponsors: 6,
};

/** Hodnota oblasti: docházka v procentech, TYFCB v Kč, ostatní za týden. */
export function areaValueText(a: AreaView): string | null {
  if (a.value === null) return null;
  switch (a.key) {
    case "attendance":
      return fmtPercent(a.value);
    case "tyfcb":
      return fmtMoney(a.value);
    case "visitors":
    case "sponsors":
      return fmtRate(a.value);
    default:
      return rateWeekText(fmtRate(a.value));
  }
}

/**
 * iter-041 (arch 6.2): oblasti skóre (docházka, CEU, 1-2-1, doporučení, TYFCB,
 * hosté, sponzoři), u každé skóre a hodnota. Prázdná hodnota je pomlčka.
 */
export function AreaList({ areas }: { areas: AreaView[] }) {
  return (
    <ul className="divide-y divide-border text-sm">
      {areas.map((a) => (
        <li key={a.key} className="flex min-h-[44px] items-center justify-between gap-3 py-2">
          <span className="font-medium text-text-main">{SEMAFOR_TEXTS.areaNames[NAME_INDEX[a.key]]}</span>
          <span className="shrink-0 text-right text-text-muted">
            <strong className="text-text-main">{a.score === null ? SEMAFOR_TEXTS.overviewNoValue : fmtNum(a.score)}</strong>
            {areaValueText(a) ? ` · ${areaValueText(a)}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}
