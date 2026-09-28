/**
 * Výběr aktivního kroku pro sticky osu (iter-029, T-010r2). Čistá funkce
 * bez DOM, volá ji `components/info/ScrollyStage.tsx`, testuje
 * `scripts/test-info-pages.ts`.
 */

/** Spouštěcí pásmo ve 40 až 45 % výšky okna (rootMargin v ScrollyStage). */
export const SCROLLY_ROOT_MARGIN = "-40% 0px -55% 0px";
export const SCROLLY_BAND_BOTTOM = 0.45;

/**
 * @param order          id kroků v pořadí dokumentu
 * @param visible        id kroků, které právě protínají pásmo
 * @param previous       dosavadní aktivní id (null = výchozí stav úvodu)
 * @param firstStepBelow první krok je celý pod pásmem (čtenář je v úvodu)
 * @returns aktivní id, nebo null pro výchozí stav úvodu
 *
 * Pásmo protíná krok: poslední protínající v pořadí dokumentu.
 * Pásmo je nad prvním krokem: výchozí stav úvodu.
 * Pásmo je v mezeře mezi kroky: drží se předchozí stav, aby osa neblikala.
 */
export function pickActiveStep(
  order: string[],
  visible: ReadonlySet<string>,
  previous: string | null,
  firstStepBelow: boolean
): string | null {
  let current: string | null = null;
  for (const id of order) if (visible.has(id)) current = id;
  if (current) return current;
  if (firstStepBelow) return null;
  return previous;
}
