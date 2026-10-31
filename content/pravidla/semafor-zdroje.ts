/**
 * Rejstřík ověřených citací stránky „Semafor (/pravidla/semafor)", iter-044.
 *
 * Podle arch_iter-044_T-001 sekce 9.5 (po review T-002 a gate T-004). Každá
 * `quoteEn` je ověřená skriptem proti textu PDF `bni-chapter-operations-manual-
 * 2022-2023.pdf`, strana = index PDF (stejně jako u H80 v `clenstvi-zdroje.ts`).
 * Citace H80 se znovu nezakládá, stránka ji bere ze sdíleného rejstříku série.
 *
 * Prefix TM (manuál). Vyřazené citace (chapterový report str. 32 a úkol role
 * Member Engagement Specialist str. 52) sem nepatří, protože nepodporují
 * tvrzení o členském semaforu u nás.
 *
 * Stránka cituje přes `fact()` z `content/pravidla/fakta.ts`.
 */
import type { SourceRef } from "@/lib/info-pages/types";

export const SEMAFOR_SOURCES: Record<string, SourceRef> = {
  TM1: {
    doc: "ops-manual-2022",
    page: 40,
    quoteEn: "Not entering PALMS in a timely manner can negatively affect your Chapter Traffic Lights Report and Power of One Report.",
  },
  TM2: {
    doc: "ops-manual-2022",
    page: 32,
    quoteEn: "Look at the distribution of green, yellow, red and gray. The goal is to have as many people as possible in the green.",
  },
  TM3: {
    doc: "ops-manual-2022",
    page: 32,
    quoteEn: "What can be done to move people from yellow to green, red to yellow, and gray to red?",
  },
  TM4: {
    doc: "ops-manual-2022",
    page: 33,
    quoteEn: "There is a misconception that new Members can be in the gray without alarm.",
  },
  TM5: {
    doc: "ops-manual-2022",
    page: 33,
    quoteEn: "If the new Members are actively involved in the Passport to Success Program, they will be in the yellow (completing Member Success Program for CEUs, completing one to two One-to-Ones per week and attending meetings regularly achieves 60 points).",
  },
};
