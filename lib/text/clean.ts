/**
 * iter-044 (security L-3): úprava volného textu před kontrolou délky a uložením.
 * Odstraní znaky nulové šířky, řídicí znaky směru a ostatní řídicí znaky
 * (kromě nového řádku), potom `trim`. Bez toho by text ze tří U+200B prošel
 * jako "3 znaky" a U+202E by otočil zobrazení části řádku. Čistý modul.
 */

// U+00AD měkký spojovník, U+061C, U+180E, U+200B až U+200F (nulová šířka, značky směru),
// U+202A až U+202E (vložení a přepsání směru), U+2060 až U+2064 (word joiner, neviditelné operátory),
// U+2066 až U+2069 (izolace směru), U+FEFF (BOM).
const INVISIBLE = /[­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Řídicí znaky C0 a C1 kromě \n (a \r, \t se níže převedou na mezeru, resp. odstraní).
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

export function cleanText(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(INVISIBLE, "")
    .replace(CONTROL, "")
    .trim();
}
