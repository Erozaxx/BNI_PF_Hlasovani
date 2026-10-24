/**
 * iter-042 (B5, gate BK1 až BK4): nastavení chapteru. Čistý modul, žádný import
 * drizzle-orm, @/lib/db/*, next/* ani react. Bezpečný pro scripts/test-iter-042-nastaveni.ts.
 *
 * Nastavení má jediný řádek v tabulce `chapter_settings`. Výchozí hodnoty jsou
 * dnešní chování aplikace: pravidelná schůzka ve čtvrtek v 7:30, všechny tři
 * volitelné části zapnuté. Funkce, které dnes berou konstantu, dostanou
 * parametr s výchozí hodnotou odtud, takže volání bez nastavení fungují dál.
 */

/** Volitelné části aplikace, které jde vypnout. */
export type FeatureKey = "mastermind" | "burza" | "semafor";

export const FEATURE_KEYS: readonly FeatureKey[] = ["mastermind", "burza", "semafor"];

export interface ChapterSettings {
  mastermindEnabled: boolean;
  burzaEnabled: boolean;
  semaforEnabled: boolean;
  /** Den pravidelné schůzky ve stejném číslování jako `getUTCDay`: 0 = neděle, 4 = čtvrtek. */
  meetingWeekday: number;
  /** Začátek schůzky `HH:MM`, jen hodnoty z `MEETING_TIME_OPTIONS`. */
  meetingTime: string;
}

export const DEFAULT_CHAPTER_SETTINGS: ChapterSettings = {
  mastermindEnabled: true,
  burzaEnabled: true,
  semaforEnabled: true,
  meetingWeekday: 4,
  meetingTime: "07:30",
};

/** Začátek schůzky 7:00 až 11:00 po 15 minutách (BK4, 17 hodnot). Crony jsou pevné. */
export const MEETING_TIME_OPTIONS: readonly string[] = (() => {
  const out: string[] = [];
  for (let minutes = 7 * 60; minutes <= 11 * 60; minutes += 15) {
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    out.push(`${h}:${m}`);
  }
  return out;
})();

/** Názvy dnů, index = `getUTCDay` (0 = neděle). */
const WEEKDAY_NOMINATIVE = ["neděle", "pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota"] as const;
/** 4. pád: „Změnit den na {úterý}“. */
const WEEKDAY_ACCUSATIVE = ["neděli", "pondělí", "úterý", "středu", "čtvrtek", "pátek", "sobotu"] as const;
/** 6. pád: „ve čtvrtek“. */
const WEEKDAY_LOCATIVE = ["v neděli", "v pondělí", "v úterý", "ve středu", "ve čtvrtek", "v pátek", "v sobotu"] as const;

/** Pořadí dnů ve výběru: pondělí až neděle. */
export const WEEKDAY_ORDER: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

export function isWeekdayIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

/** „čtvrtek“. Neplatný index = prázdný řetězec. */
export function weekdayName(weekday: number): string {
  return isWeekdayIndex(weekday) ? WEEKDAY_NOMINATIVE[weekday] : "";
}

/** „čtvrtek“, „středu“ (po předložce „na“). */
export function weekdayAccusative(weekday: number): string {
  return isWeekdayIndex(weekday) ? WEEKDAY_ACCUSATIVE[weekday] : "";
}

/** „ve čtvrtek“, „v úterý“. */
export function weekdayLocative(weekday: number): string {
  return isWeekdayIndex(weekday) ? WEEKDAY_LOCATIVE[weekday] : "";
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDate(value: string): { y: number; m: number; d: number } | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return { y, m, d };
}

/** Den v týdnu (0 = neděle) kalendářního dne `YYYY-MM-DD`, bez časových pásem. Neplatné datum = `null`. */
export function weekdayOfDate(date: string): number | null {
  const p = parseDate(date);
  return p ? new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay() : null;
}

/** Den `date` (`YYYY-MM-DD`) je pravidelný den schůzky. Neplatné datum = `false`. */
export function isRegularDay(
  date: string,
  settings: Pick<ChapterSettings, "meetingWeekday"> = DEFAULT_CHAPTER_SETTINGS
): boolean {
  return weekdayOfDate(date) === settings.meetingWeekday;
}

function addDays(date: string, days: number): string {
  const p = parseDate(date);
  if (!p) throw new Error("invalid date");
  return new Date(Date.UTC(p.y, p.m - 1, p.d + days)).toISOString().slice(0, 10);
}

/**
 * Nejbližší pravidelný den od `from` včetně (`YYYY-MM-DD`). Pro čtvrtek přesně
 * dnešní `nextThursday`.
 */
export function nextRegularDay(
  from: string,
  settings: Pick<ChapterSettings, "meetingWeekday"> = DEFAULT_CHAPTER_SETTINGS
): string {
  const current = weekdayOfDate(from);
  if (current === null) throw new Error("invalid date");
  return addDays(from, (settings.meetingWeekday - current + 7) % 7);
}

/** Část nastavení, kterou zadává formulář (bez metadat). */
export type ChapterSettingsInput = ChapterSettings;

export type SettingsValidation =
  | { ok: true; value: ChapterSettingsInput }
  | { ok: false; error: string };

export const SETTINGS_INVALID_TEXT = "Nastavení se nepodařilo uložit. Zkus to znovu.";

/**
 * Validace vstupu z formuláře na serveru: tři pravdivostní hodnoty, den 0 až 6
 * a čas jen z `MEETING_TIME_OPTIONS`. Cokoli jiného, i chybějící pole, je chyba.
 * Do výsledku se kopírují jen známá pole.
 */
export function validateSettingsInput(raw: unknown): SettingsValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: SETTINGS_INVALID_TEXT };
  }
  const r = raw as Record<string, unknown>;
  if (
    typeof r.mastermindEnabled !== "boolean" ||
    typeof r.burzaEnabled !== "boolean" ||
    typeof r.semaforEnabled !== "boolean" ||
    !isWeekdayIndex(r.meetingWeekday) ||
    typeof r.meetingTime !== "string" ||
    !MEETING_TIME_OPTIONS.includes(r.meetingTime)
  ) {
    return { ok: false, error: SETTINGS_INVALID_TEXT };
  }
  return {
    ok: true,
    value: {
      mastermindEnabled: r.mastermindEnabled,
      burzaEnabled: r.burzaEnabled,
      semaforEnabled: r.semaforEnabled,
      meetingWeekday: r.meetingWeekday,
      meetingTime: r.meetingTime,
    },
  };
}

/** Část `key` je zapnutá. */
export function isFeatureEnabled(settings: ChapterSettings, key: FeatureKey): boolean {
  if (key === "mastermind") return settings.mastermindEnabled;
  if (key === "burza") return settings.burzaEnabled;
  return settings.semaforEnabled;
}

/** Sloupce tabulky pro ops detail a porovnání změn (snake_case jako v DB). */
export const SETTINGS_COLUMN: Record<keyof ChapterSettings, string> = {
  mastermindEnabled: "mastermind_enabled",
  burzaEnabled: "burza_enabled",
  semaforEnabled: "semafor_enabled",
  meetingWeekday: "meeting_weekday",
  meetingTime: "meeting_time",
};

/** Klíče (názvy sloupců), které se mezi `before` a `after` liší. */
export function changedSettingKeys(before: ChapterSettings, after: ChapterSettings): string[] {
  return (Object.keys(SETTINGS_COLUMN) as (keyof ChapterSettings)[])
    .filter((k) => before[k] !== after[k])
    .map((k) => SETTINGS_COLUMN[k]);
}

/**
 * Řádek z DB (`meeting_time` jako `HH:MM` nebo `HH:MM:SS`) na `ChapterSettings`.
 * Řádek bez platných přepínačů = `null`. Přepínače se čtou nezávisle na dni a čase
 * (security iter-042 L-1): vadný čas nebo den nahradí jen sám sebe výchozí hodnotou,
 * vypnutá část zůstane vypnutá.
 */
export function settingsFromRow(row: unknown): ChapterSettings | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const time = typeof r.meeting_time === "string" ? r.meeting_time.slice(0, 5) : "";
  const weekday = typeof r.meeting_weekday === "number" ? r.meeting_weekday : Number(r.meeting_weekday);
  if (
    typeof r.mastermind_enabled !== "boolean" ||
    typeof r.burza_enabled !== "boolean" ||
    typeof r.semafor_enabled !== "boolean"
  ) {
    return null;
  }
  return {
    mastermindEnabled: r.mastermind_enabled,
    burzaEnabled: r.burza_enabled,
    semaforEnabled: r.semafor_enabled,
    meetingWeekday: isWeekdayIndex(weekday) ? weekday : DEFAULT_CHAPTER_SETTINGS.meetingWeekday,
    meetingTime: MEETING_TIME_OPTIONS.includes(time) ? time : DEFAULT_CHAPTER_SETTINGS.meetingTime,
  };
}

/**
 * Čtení s pojistkou (B5): chybějící tabulka (42P01, merge před migrací),
 * chybějící nebo vadný řádek vrátí výchozí hodnoty a zaloguje varování.
 * Jiná chyba (síť, oprávnění) se NEPOLYKÁ, ať se nezapne část, kterou vedení
 * vypnulo. `read` vrací řádek tabulky nebo `undefined`.
 */
export async function resolveChapterSettings(
  read: () => Promise<unknown>,
  warn: (message: string) => void = () => {}
): Promise<ChapterSettings> {
  let row: unknown;
  try {
    row = await read();
  } catch (err) {
    const code = (err as { code?: unknown; cause?: { code?: unknown } } | null)?.code
      ?? (err as { cause?: { code?: unknown } } | null)?.cause?.code;
    if (code === "42P01") {
      warn("[chapter-settings] tabulka chapter_settings chybí, platí výchozí hodnoty");
      return { ...DEFAULT_CHAPTER_SETTINGS };
    }
    throw err;
  }
  const parsed = row === undefined || row === null ? null : settingsFromRow(row);
  if (!parsed) {
    warn("[chapter-settings] řádek nastavení chybí nebo je vadný, platí výchozí hodnoty");
    return { ...DEFAULT_CHAPTER_SETTINGS };
  }
  return parsed;
}
