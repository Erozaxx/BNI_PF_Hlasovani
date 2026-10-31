/**
 * iter-044 (R-20): české skloňování podle počtu. Čistý modul.
 * `plural(n, 1, 2 až 4, ostatní)`; 0 a 5 a víc dostane třetí tvar.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

/** „1 bod“, „2 body“, „5 bodů“. */
export function pointsText(n: number): string {
  return `${n} ${plural(n, "bod", "body", "bodů")}`;
}

/** „po 1 bodu“, „po 2 bodech“, „po 5 bodech“. */
export function eachPointsText(n: number): string {
  return `po ${n} ${plural(n, "bodu", "bodech", "bodech")}`;
}
