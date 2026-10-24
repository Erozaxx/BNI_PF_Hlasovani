/**
 * Uzávěrka hlasování - jedna funkce (arch iter-026 T-001, sekce 3.1 a 5).
 *
 * Čistý modul bez DB: žádný import drizzle-orm, @/lib/db/*, next/server,
 * next/cache ani resend. Jde spustit v holém Node (tsx) bez DATABASE_URL -
 * viz scripts/test-voting-window.ts.
 *
 * votingCloseBeforeRegularDay (iter-042) zobecňuje původní
 * nextWednesday2359InPrague z app/api/cron/close-voting/route.ts (DST-aware,
 * odladěná na produkci 16. 7. a 30. 7. 2026); pro čtvrtek dává stejný výsledek. weekdayInCET
 * a todayInCET se stěhují s ní, přejmenované na *InPrague (dnešní název
 * lhal - funkce vracely správně i pro CEST).
 */

import { DEFAULT_CHAPTER_SETTINGS } from "../chapter/settings";

/** +24 h za uzávěrkou hlasování - odkaz přežije uzávěrku o den. */
export const TOKEN_EXPIRY_EXTRA_MS = 24 * 60 * 60 * 1000;

/**
 * Get the CZ-local weekday name (Europe/Prague) for the current instant.
 * Returns e.g. "Thursday".
 */
export function weekdayInPrague(now: Date = new Date()): string {
  return now.toLocaleDateString("en-US", {
    timeZone: "Europe/Prague",
    weekday: "long",
  });
}

/** Anglický název dne (výstup `weekdayInPrague`) -> index jako `getUTCDay` (0 = neděle). */
const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

/** Index dne (0 = neděle) z názvu, který vrací `weekdayInPrague`. Neznámý název = -1. */
export function weekdayIndexFromName(name: string): number {
  return WEEKDAY_INDEX[name] ?? -1;
}

/**
 * Get today's date string in CET/CEST (Europe/Prague) timezone.
 * Returns "YYYY-MM-DD" using the Swedish locale format (ISO-like).
 */
export function todayInPrague(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

/**
 * iter-042 (BK3): UTC okamžik "23:59:59 Europe/Prague v den před dalším
 * pravidelným dnem schůzky" relativně k `now`. Pro pravidelný čtvrtek (výchozí)
 * je to přesně dosavadní příští středa 23:59:59.
 *
 * Den před pravidelným dnem se počítá z lokálního pražského dne v týdnu `now`:
 * posun 1..7 dní, nikdy 0, takže cíl je vždy v budoucnu (je-li `now` přímo ten
 * den, vychází o týden později).
 *
 * DST-safe: odvodí cílové pražské kalendářní datum a opraví UTC odhad o
 * skutečný offset Europe/Prague v CÍLOVÉM okamžiku (CEST +2 h, CET +1 h), ne
 * v `now`. Na tom záleží, když spuštění a uzávěrka padnou na opačné strany
 * přechodu času (případy 3 a 4 v scripts/test-voting-window.ts).
 */
export function votingCloseBeforeRegularDay(
  now: Date,
  regularWeekday: number = DEFAULT_CHAPTER_SETTINGS.meetingWeekday
): Date {
  const czWeekdayName = now.toLocaleDateString("en-US", {
    timeZone: "Europe/Prague",
    weekday: "long",
  });
  const todayIdx = WEEKDAY_INDEX[czWeekdayName];
  const targetIdx = (regularWeekday + 6) % 7; // den před pravidelným dnem
  // Dnů do příštího cílového dne (1..7), nikdy 0.
  const daysUntilTarget = ((targetIdx - todayIdx + 7) % 7) || 7;

  // Cílové pražské kalendářní datum (YYYY-MM-DD).
  const czTodayStr = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const [y, m, d] = czTodayStr.split("-").map(Number);
  // Poledne UTC, aby nedošlo k přetečení data kolem půlnoci, pak přičíst posun.
  const targetMidUtc = new Date(Date.UTC(y, m - 1, d + daysUntilTarget, 12, 0, 0));
  const targetDateStr = targetMidUtc.toLocaleDateString("sv-SE", {
    timeZone: "Europe/Prague",
  });
  const [ty, tm, td] = targetDateStr.split("-").map(Number);

  // "cílové datum 23:59:59" jako by bylo UTC, pak oprava o pražský offset, aby
  // výsledný okamžik v Europe/Prague ukazoval 23:59:59.
  const guess = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));
  const inPrague = new Date(
    guess.toLocaleString("en-US", { timeZone: "Europe/Prague" })
  );
  const inUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = inPrague.getTime() - inUtc.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Příští středa 23:59:59 Europe/Prague. Zachováno jako pojmenování pro
 * pravidelný čtvrtek (výchozí nastavení), výpočet je v
 * `votingCloseBeforeRegularDay`.
 */
export function nextWednesday2359InPrague(now: Date): Date {
  return votingCloseBeforeRegularDay(now, 4);
}

/**
 * Expirace magic linku odvozená od uzávěrky (ne od `now`).
 */
export function votingLinkExpiry(votingClosesAt: Date): Date {
  return new Date(votingClosesAt.getTime() + TOKEN_EXPIRY_EXTRA_MS);
}

/**
 * Uzávěrka hlasování počítaná od DATA SCHŮZKY, ne od okamžiku kliknutí (arch
 * iter-028 T-001, sekce 3.2, D2). Oprava chyby nalezené architektem: dnešní
 * `votingCloseBeforeRegularDay(now)` u spuštění PŘEDEM (např. úterý pro
 * čtvrteční schůzku) počítala uzávěrku od úterý, tedy o týden dřív, než měla
 * - s odloženým rozesláním by takovou uzávěrku čtvrteční cron zavřel dřív,
 * než by stihl poslat jediný odkaz.
 *
 * Když je `meetingDate` v budoucnu (spuštění předem), referenčním okamžikem
 * pro výpočet "dne před pravidelným dnem" je poledne toho dne v UTC - nejde o skutečný
 * čas, jen o vstup pro `votingCloseBeforeRegularDay`, které potřebuje jen
 * DEN V TÝDNU schůzky, ne její přesný čas. Poledne bezpečně sedí do
 * pražského kalendářního dne bez ohledu na letní/zimní čas. Když
 * `meetingDate` už nastal nebo je dnes (pozdní start), referencí zůstává
 * `now` - beze změny proti dnešnímu chování.
 *
 * Pro BĚŽÍCÍ hlasování (status 'voting') se uzávěrka nikdy nepřepočítává -
 * volající (voting-dispatch.ts krok 3) čte hodnotu z DB, tahle funkce se
 * volá jen při zakládání NOVÉHO hlasování.
 */
export function votingClosesAtFor(
  meetingDate: string,
  now: Date,
  regularWeekday: number = DEFAULT_CHAPTER_SETTINGS.meetingWeekday
): Date {
  const ref =
    meetingDate > todayInPrague(now)
      ? new Date(`${meetingDate}T10:00:00Z`) // poledne v Praze, jen kvuli dni v tydnu
      : now;
  return votingCloseBeforeRegularDay(ref, regularWeekday);
}

/**
 * Je den schůzky dnes, nebo už proběhl (Europe/Prague)? Řídí, jestli
 * `deliver:"now"` smí odeslat maily hned (arch 3.1, 3.3, 3.5) - odkazy smí
 * rozeslat jen ranní cron v den schůzky nebo později, nikdy dřív.
 */
export function isDeliveryDue(meetingDate: string, now: Date): boolean {
  return meetingDate <= todayInPrague(now);
}
