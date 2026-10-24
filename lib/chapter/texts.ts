/**
 * iter-042 (gate sekce 6, Z8, Z10): texty stránky Nastavení chapteru a vypnuté
 * části. Čistý modul. UI za loginem tyká, bez dlouhé pomlčky.
 */
import {
  type ChapterSettings,
  type FeatureKey,
  weekdayAccusative,
} from "@/lib/chapter/settings";

export const CHAPTER_SETTINGS_TEXTS = {
  title: "Nastavení chapteru",
  featuresHeading: "Části aplikace",
  featuresHint: "Vypnutá část zmizí z menu, dashboardu i nápovědy. Data zůstanou, po zapnutí se vrátí.",
  meetingHeading: "Pravidelná schůzka",
  weekdayLabel: "Den",
  timeLabel: "Začátek",
  meetingHint:
    "Den a začátek řídí kalendář docházky, termíny Master mindu, uzávěrku omluv a ranní spuštění hlasování. Ranní maily odcházejí mezi 6:00 a 7:00, proto jde začátek nastavit jen od 7:00 do 11:00.",
  save: "Uložit",
  saving: "Ukládám...",
  saved: "Nastavení je uložené.",
  saveFailed: "Nastavení se nepodařilo uložit. Zkus to znovu.",
} as const;

/** Názvy částí v 1. pádu (přepínače) a ve 4. pádu (potvrzení „Vypnout …?“). */
export const FEATURE_LABELS: Record<FeatureKey, { nominative: string; accusative: string }> = {
  mastermind: { nominative: "Master mind", accusative: "Master mind" },
  burza: { nominative: "Burza pomoci", accusative: "Burzu pomoci" },
  semafor: { nominative: "Interní semafor", accusative: "Interní semafor" },
};

export const FEATURE_OFF_PAGE_TEXT = "Tahle část je vypnutá. Zapnout ji může vedení v Nastavení chapteru.";
export const FEATURE_OFF_ACTION_TEXT = "Tahle část je vypnutá.";
export const SETTINGS_LINK_LABEL = "Nastavení chapteru";

/** Potvrzení vypnutí části (Z8). Bonus zmiňuje jen při zapnutém semaforu. */
export function disableConfirmText(key: FeatureKey, semaforStaysOn: boolean): string {
  if (key === "semafor") {
    return "Vypnout Interní semafor? Zmizí z menu i nápovědy, bonusy se přestanou ukazovat. Data zůstanou.";
  }
  const name = FEATURE_LABELS[key].accusative;
  // Burza je ženského rodu („za ni“), Master mind mužského („za něj“).
  const pronoun = key === "burza" ? "ni" : "něj";
  if (semaforStaysOn) {
    return `Vypnout ${name}? Zmizí z menu, dashboardu i nápovědy a bonus za ${pronoun} přestane platit v interním semaforu. Části členů se tím může změnit barva. Data zůstanou.`;
  }
  return `Vypnout ${name}? Zmizí z menu, dashboardu i nápovědy. Data zůstanou.`;
}

/** Potvrzení změny dne (Z8). */
export function weekdayChangeConfirmText(weekday: number): string {
  return `Změnit den pravidelné schůzky na ${weekdayAccusative(weekday)}? Změní se kalendář docházky, termíny Master mindu a ranní spuštění hlasování. Už založené schůzky, omluvy a zařazené případy zůstanou na svých dnech.`;
}

/**
 * Potvrzení, která se před uložením ukážou, v pořadí den, Master mind, Burza,
 * semafor. Zapnutí části ani změna začátku potvrzení nemají. Prázdné pole =
 * ukládá se bez dotazu.
 */
export function settingsConfirmTexts(before: ChapterSettings, after: ChapterSettings): string[] {
  const out: string[] = [];
  if (before.meetingWeekday !== after.meetingWeekday) {
    out.push(weekdayChangeConfirmText(after.meetingWeekday));
  }
  if (before.mastermindEnabled && !after.mastermindEnabled) {
    out.push(disableConfirmText("mastermind", after.semaforEnabled));
  }
  if (before.burzaEnabled && !after.burzaEnabled) {
    out.push(disableConfirmText("burza", after.semaforEnabled));
  }
  if (before.semaforEnabled && !after.semaforEnabled) {
    out.push(disableConfirmText("semafor", false));
  }
  return out;
}
