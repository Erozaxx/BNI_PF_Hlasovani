/**
 * Upozornění na neaktivovanou schůzku — dnes nebo zítra, hlasování neběží
 * (arch iter-026 T-001, sekce 3.3 a 8).
 *
 * Čistý modul bez DB: žádný import drizzle-orm, @/lib/db/*, next/server,
 * next/cache ani resend. Jde spustit v holém Node (tsx) bez DATABASE_URL —
 * viz scripts/test-draft-warning.ts.
 */

export type DraftWarningLevel = "today" | "tomorrow";

export interface WarnableMeeting {
  id: string;
  date: string; // "YYYY-MM-DD"
  status: string;
}

export interface DraftWarning {
  meetingId: string;
  date: string;
  status: string;
  level: DraftWarningLevel;
}

/**
 * Posun ISO data ("YYYY-MM-DD") o N dní. Čistě řetězcová aritmetika přes
 * Date.UTC, bez timezone — vstup i výstup jsou kalendářní data, ne instanty.
 */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Najde schůzky, které jsou dnes nebo zítra (Europe/Prague) a hlasování u
 * nich neběží. Podmínka: `date === todayPrague` nebo
 * `date === addDaysIso(todayPrague, 1)` **a** `status` není `voting` ani
 * `closed` (arch 3.3) — schválně se netestuje `status === "draft"`, protože
 * legacy řádek ve stavu `active` je stejně nefunkční jako `draft` a musí
 * svítit taky.
 *
 * Výsledek je seřazený: `today` před `tomorrow`, uvnitř podle data. Prázdné
 * pole je platný výsledek, ne chyba.
 */
export function findDraftWarnings(
  meetings: WarnableMeeting[],
  todayPrague: string
): DraftWarning[] {
  const tomorrowPrague = addDaysIso(todayPrague, 1);

  const warnings: DraftWarning[] = [];
  for (const m of meetings) {
    if (m.status === "voting" || m.status === "closed") continue;

    if (m.date === todayPrague) {
      warnings.push({ meetingId: m.id, date: m.date, status: m.status, level: "today" });
    } else if (m.date === tomorrowPrague) {
      warnings.push({ meetingId: m.id, date: m.date, status: m.status, level: "tomorrow" });
    }
  }

  warnings.sort((a, b) => {
    if (a.level !== b.level) return a.level === "today" ? -1 : 1;
    return a.date.localeCompare(b.date);
  });

  return warnings;
}
