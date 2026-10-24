/**
 * iter-041 (arch 6.4, K4, Z8): barva semaforu z čísla. Jediné místo, kde se
 * z čísla stává barva, a jediná funkce, která ji dělá. Bere jedno číslo:
 * oficiální barva BNI dostane `totalScore`, interní barva `internalScore`
 * (skóre BNI plus bonus, `lib/semafor/bonus.ts`). Nic jiného do ní nevstupuje.
 *
 * Prahy podle BNI: 70 a víc zelená, 50 až 69,99 žlutá, 30 až 49,99 červená
 * (K4 B, v souborech se jmenuje Pink), pod 30 šedá. Název je v `texts.ts`.
 */

export type SemaforColor = "green" | "yellow" | "red" | "grey";

export const COLOR_THRESHOLDS = { green: 70, yellow: 50, red: 30 } as const;

export function colorFromTotal(t: number): SemaforColor {
  if (t >= 70) return "green";
  if (t >= 50) return "yellow";
  if (t >= 30) return "red";
  return "grey";
}

export const COLOR_ORDER: readonly SemaforColor[] = ["green", "yellow", "red", "grey"];
