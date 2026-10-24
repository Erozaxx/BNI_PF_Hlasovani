import { Card } from "@/components/ui/Card";
import { SEMAFOR_TEXTS, chapterCountsText } from "@/lib/semafor/texts";

/**
 * iter-041 (gate Z4): souhrn chapteru jsou čtyři počty členů v interních
 * barvách za poslední nahraný měsíc. Do klienta (i do HTML) jde jen měsíc a
 * čtyři čísla, nikdy řádky členů. Nula se ukazuje.
 */
export function ChapterSummaryCard({
  month,
  counts,
}: {
  month: string;
  counts: { green: number; yellow: number; red: number; grey: number };
}) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-main">{SEMAFOR_TEXTS.chapterTitle}</h2>
      <p className="mt-1 text-sm text-text-main">{chapterCountsText(month, counts)}</p>
    </Card>
  );
}
