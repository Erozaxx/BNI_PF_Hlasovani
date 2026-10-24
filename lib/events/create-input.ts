/**
 * Kontrola vstupů `createEventAction` (iter-042 T-005c). Akci jde zavolat
 * napřímo, mimo formulář, takže typy z TypeScriptu za běhu nic nezaručují.
 * Čistá funkce bez DB, hlášky jsou interní (tykání).
 */
const VOTING_TYPES = ["pick_one", "multiple", "max_x"];
const WHO = ["members_only", "anyone_with_link"];
const OPTION_TYPES = ["text", "date", "datetime"];

export function validateCreateEventInput(
  title: unknown,
  config: unknown,
  description: unknown
): string | null {
  if (typeof title !== "string" || !title.trim()) {
    return "Název akce je povinný.";
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    return "Popis akce musí být text.";
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return "Nastavení akce chybí nebo je ve špatném tvaru.";
  }
  const c = config as Record<string, unknown>;
  if (c.votingType !== undefined && !VOTING_TYPES.includes(c.votingType as string)) {
    return "Neznámý způsob hlasování.";
  }
  if (c.whoCanVote !== undefined && !WHO.includes(c.whoCanVote as string)) {
    return "Neznámé nastavení toho, kdo může hlasovat.";
  }
  if (c.whoCanAddOptions !== undefined && !WHO.includes(c.whoCanAddOptions as string)) {
    return "Neznámé nastavení toho, kdo může přidávat možnosti.";
  }
  if (c.optionType !== undefined && !OPTION_TYPES.includes(c.optionType as string)) {
    return "Neznámý typ možností.";
  }
  if (c.customOptionsAllowed !== undefined && typeof c.customOptionsAllowed !== "boolean") {
    return "Nastavení vlastních možností musí být ano nebo ne.";
  }
  if (
    c.votingMaxX !== undefined &&
    (typeof c.votingMaxX !== "number" || !Number.isInteger(c.votingMaxX))
  ) {
    return "Limit hlasů musí být celé číslo.";
  }
  if (
    c.expiresAt !== undefined &&
    (!(c.expiresAt instanceof Date) || Number.isNaN(c.expiresAt.getTime()))
  ) {
    return "Konec hlasování není platné datum.";
  }
  return null;
}
