/**
 * iter-033 (T-005, arch 7.3, K9 A): řazení zásobníku. Čistá funkce bez DB.
 * Počet zájemců sestupně, při shodě starší přihláška výš, pak `id`.
 */
export interface SortableCase {
  id: string;
  /** Čas vzniku přihlášky (Date, ISO řetězec nebo ms). */
  createdAt: Date | string | number;
  interestCount: number;
}

function ms(v: Date | string | number): number {
  return v instanceof Date ? v.getTime() : typeof v === "number" ? v : new Date(v).getTime();
}

export function sortCases<T extends SortableCase>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.interestCount !== b.interestCount) return b.interestCount - a.interestCount;
    const byTime = ms(a.createdAt) - ms(b.createdAt);
    if (byTime !== 0) return byTime;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}
