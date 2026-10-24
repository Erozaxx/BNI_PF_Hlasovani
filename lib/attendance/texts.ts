// Texty docházky pro volbu „Chyběl(a) bez omluvy“ (iter-041, gate sekce 5).
// Žijí v lib/attendance, aby docházka a její API routy nezávisely na lib/semafor.

import { DEFAULT_CHAPTER_SETTINGS } from "@/lib/chapter/settings";

/** „07:30“ → „7:30“ (čas ve větě). Čistá funkce, bez importu z rules.ts. */
export function meetingTimeLabel(time: string): string {
  return time.replace(/^0(\d)/, "$1");
}

/** iter-042 (Z5): text pod volbou „Chyběl(a) bez omluvy“ s časem z nastavení. */
export function unexcusedTooEarlyHintText(time: string): string {
  return `Od ${meetingTimeLabel(time)}. Do té doby se člen může omluvit.`;
}

/** iter-042 (Z5): hláška serveru, když je „Chyběl(a) bez omluvy“ před začátkem schůzky. */
export function unexcusedTooEarlyText(time: string): string {
  return `Chyběl(a) bez omluvy jde zapsat od ${meetingTimeLabel(time)}. Do té doby se člen může omluvit.`;
}

/** Docházka: „Chyběl(a) bez omluvy“ (gate sekce 5). Texty s časem platí pro výchozí začátek schůzky. */
export const UNEXCUSED_TEXTS = {
  option: "Chyběl(a) bez omluvy",
  audit: "Chyběl(a) bez omluvy",
  aria: "absence bez omluvy",
  tooEarlyHint: unexcusedTooEarlyHintText(DEFAULT_CHAPTER_SETTINGS.meetingTime),
  tooEarly: unexcusedTooEarlyText(DEFAULT_CHAPTER_SETTINGS.meetingTime),
  excusedConflict: "Člen má na ten den omluvu. Nejdřív zruš omluvu.",
  unexcusedConflict: "Člen je zapsaný jako Chyběl(a) bez omluvy. Nejdřív změň zápis.",
  /** Náhradník z PALMS (K7). */
  substitutePlaceholder: "neuvedeno",
} as const;
