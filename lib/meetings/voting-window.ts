/**
 * Uzávěrka hlasování — jedna funkce (arch iter-026 T-001, sekce 3.1 a 5).
 *
 * Čistý modul bez DB: žádný import drizzle-orm, @/lib/db/*, next/server,
 * next/cache ani resend. Jde spustit v holém Node (tsx) bez DATABASE_URL —
 * viz scripts/test-voting-window.ts.
 *
 * nextWednesday2359InPrague je přenesená BEZE ZMĚNY z
 * app/api/cron/close-voting/route.ts:60-101 (DST-aware, odladěná na
 * produkci 16. 7. a 30. 7. 2026) — nepřepisovat, jen přesunout. weekdayInCET
 * a todayInCET se stěhují s ní, přejmenované na *InPrague (dnešní název
 * lhal — funkce vracely správně i pro CEST).
 */

/** +24 h za uzávěrkou hlasování — odkaz přežije uzávěrku o den. */
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

/**
 * Get today's date string in CET/CEST (Europe/Prague) timezone.
 * Returns "YYYY-MM-DD" using the Swedish locale format (ISO-like).
 */
export function todayInPrague(now: Date = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

/**
 * Compute the UTC instant for "next Wednesday 23:59:59 Europe/Prague" relative to `now`.
 *
 * Phase 2 dispatch typically runs on a Thursday (CZ), so the target is Thursday + 6 days,
 * but the day delta is computed robustly from the CZ-local weekday (target = Wednesday)
 * rather than hard-coding +6. If `now` is already CZ-Wednesday, this returns the
 * Wednesday 7 days out (delta normalized to 1..7 so it's always strictly in the future
 * relative to the start of today).
 *
 * DST-safe: derives the target CZ wall-clock date, then corrects a UTC guess by the
 * actual Europe/Prague offset (CEST UTC+2 in summer, CET UTC+1 in winter). The offset
 * is taken at the TARGET instant, not at `now` — that is the one thing that matters
 * when spuštění and uzávěrka fall on opposite sides of a DST transition (case 3/4 in
 * scripts/test-voting-window.ts).
 */
export function nextWednesday2359InPrague(now: Date): Date {
  // CZ-local weekday index 0..6 (Sun..Sat) for `now`.
  const czWeekdayName = now.toLocaleDateString("en-US", {
    timeZone: "Europe/Prague",
    weekday: "long",
  });
  const weekdayIndex: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const todayIdx = weekdayIndex[czWeekdayName];
  const WEDNESDAY = 3;
  // Days until the NEXT Wednesday (1..7), never 0 — always a future Wednesday.
  const daysUntilWed = ((WEDNESDAY - todayIdx + 7) % 7) || 7;

  // Target CZ calendar date (YYYY-MM-DD) for that Wednesday.
  const czTodayStr = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const [y, m, d] = czTodayStr.split("-").map(Number);
  // Build at UTC noon to avoid date rollover near midnight, then add the day delta.
  const targetMidUtc = new Date(Date.UTC(y, m - 1, d + daysUntilWed, 12, 0, 0));
  const targetDateStr = targetMidUtc.toLocaleDateString("sv-SE", {
    timeZone: "Europe/Prague",
  });
  const [ty, tm, td] = targetDateStr.split("-").map(Number);

  // Treat "targetDate 23:59:59" as if it were UTC, then correct by the Prague offset
  // so the resulting UTC instant renders as 23:59:59 wall-clock in Europe/Prague.
  const guess = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));
  // Prague offset (ms) for this instant: same instant rendered in Prague minus in UTC.
  // CEST (summer) → +2h, CET (winter) → +1h.
  const inPrague = new Date(
    guess.toLocaleString("en-US", { timeZone: "Europe/Prague" })
  );
  const inUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = inPrague.getTime() - inUtc.getTime();
  return new Date(guess.getTime() - offsetMs);
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
 * `nextWednesday2359InPrague(now)` u spuštění PŘEDEM (např. úterý pro
 * čtvrteční schůzku) počítala uzávěrku od úterý, tedy o týden dřív, než měla
 * — s odloženým rozesláním by takovou uzávěrku čtvrteční cron zavřel dřív,
 * než by stihl poslat jediný odkaz.
 *
 * Když je `meetingDate` v budoucnu (spuštění předem), referenčním okamžikem
 * pro výpočet "příští středy" je poledne toho dne v UTC — nejde o skutečný
 * čas, jen o vstup pro `nextWednesday2359InPrague`, které potřebuje jen
 * DEN V TÝDNU schůzky, ne její přesný čas. Poledne bezpečně sedí do
 * pražského kalendářního dne bez ohledu na letní/zimní čas. Když
 * `meetingDate` už nastal nebo je dnes (pozdní start), referencí zůstává
 * `now` — beze změny proti dnešnímu chování.
 *
 * Pro BĚŽÍCÍ hlasování (status 'voting') se uzávěrka nikdy nepřepočítává —
 * volající (voting-dispatch.ts krok 3) čte hodnotu z DB, tahle funkce se
 * volá jen při zakládání NOVÉHO hlasování.
 */
export function votingClosesAtFor(meetingDate: string, now: Date): Date {
  const ref =
    meetingDate > todayInPrague(now)
      ? new Date(`${meetingDate}T10:00:00Z`) // poledne v Praze, jen kvuli dni v tydnu
      : now;
  return nextWednesday2359InPrague(ref);
}

/**
 * Je den schůzky dnes, nebo už proběhl (Europe/Prague)? Řídí, jestli
 * `deliver:"now"` smí odeslat maily hned (arch 3.1, 3.3, 3.5) — odkazy smí
 * rozeslat jen ranní cron v den schůzky nebo později, nikdy dřív.
 */
export function isDeliveryDue(meetingDate: string, now: Date): boolean {
  return meetingDate <= todayInPrague(now);
}
