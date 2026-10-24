/**
 * iter-041 (gate Z4): souhrn chapteru jsou prosté počty členů v každé interní
 * barvě za poslední nahraný měsíc. Tom: „3 zelení, 6 červených, 2 šedí“.
 *
 * Čistý modul. Žádné potlačení malých počtů, žádný průměr, minimum, medián ani
 * vývoj mezi měsíci. Nula se ukazuje. Do klienta jdou jen čtyři čísla a měsíc,
 * nikdy řádky členů. Vstup jsou jen aktivní členové s řádkem, deaktivovaný
 * (`active: false`) se nezapočte.
 */
import { colorFromTotal, type SemaforColor } from "@/lib/semafor/color";

export type ChapterCounts = Record<SemaforColor, number>;

export function summarizeChapter(
  rows: readonly { internalScore: number; active?: boolean }[]
): ChapterCounts {
  const counts: ChapterCounts = { green: 0, yellow: 0, red: 0, grey: 0 };
  for (const row of rows) {
    if (row.active === false) continue;
    counts[colorFromTotal(row.internalScore)]++;
  }
  return counts;
}
