// Texty docházky pro volbu „Chyběl(a) bez omluvy“ (iter-041, gate sekce 5).
// Žijí v lib/attendance, aby docházka a její API routy nezávisely na lib/semafor.

/** Docházka: „Chyběl(a) bez omluvy“ (gate sekce 5). */
export const UNEXCUSED_TEXTS = {
  option: "Chyběl(a) bez omluvy",
  audit: "Chyběl(a) bez omluvy",
  aria: "absence bez omluvy",
  tooEarlyHint: "Od 7:30. Do té doby se člen může omluvit.",
  tooEarly: "Chyběl(a) bez omluvy jde zapsat od 7:30. Do té doby se člen může omluvit.",
  excusedConflict: "Člen má na ten den omluvu. Nejdřív zruš omluvu.",
  unexcusedConflict: "Člen je zapsaný jako Chyběl(a) bez omluvy. Nejdřív změň zápis.",
  /** Náhradník z PALMS (K7). */
  substitutePlaceholder: "neuvedeno",
} as const;
