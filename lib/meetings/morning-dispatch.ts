/**
 * Rozhodnutí, kterou schůzku má ranní cron dnes zpracovat a proč (arch
 * iter-028 T-001, sekce 3.4 a 8.1). Nahrazuje dnešní "jen ve čtvrtek, jen
 * schůzka s dnešním datem" o druhý, nezávislý důvod: doslání odkazů
 * běžícímu hlasování, jehož schůzka má datum dnes nebo dřív.
 *
 * Čistý modul bez DB: žádný import drizzle-orm, @/lib/db/*, next/server,
 * next/cache ani resend. Jde spustit v holém Node (tsx) bez DATABASE_URL —
 * viz scripts/test-morning-dispatch.ts. Kandidáty (`MorningMeeting[]`) načte
 * `getMorningDispatchCandidates` (lib/db/queries/meetings.ts), rozhodnutí
 * samotné je tady.
 */
import { todayInPrague, weekdayInPrague } from "./voting-window";
import type { VotingDispatchResult } from "./voting-dispatch";

export type MorningReason = "thursday-autostart" | "deferred-send";

export interface MorningMeeting {
  id: string;
  date: string; // "YYYY-MM-DD"
  status: string;
  votingClosesAt: Date | null;
}

export interface MorningDispatchTarget {
  meetingId: string;
  meetingDate: string;
  reason: MorningReason;
}

export interface MorningDispatchPlan {
  todayPrague: string;
  weekdayPrague: string;
  targets: MorningDispatchTarget[];
}

/**
 * Rozhodovací tabulka (arch 3.4):
 *
 * | Schůzka                                          | Den     | Cíl                  |
 * |---------------------------------------------------|---------|----------------------|
 * | `date == today`, jakýkoli stav                    | čtvrtek | thursday-autostart   |
 * | `voting`, `date <= today`, `closes > now`/`null`   | kterýkoli | deferred-send      |
 * | obojí zároveň                                      | čtvrtek | jen thursday-autostart (jeden cíl) |
 * | `voting`, `date > today`                           | kterýkoli | nic                |
 * | `draft`/`active`, `date < today`                   | kterýkoli | nic (N-1, beze změny) |
 *
 * Pořadí kontrol dole (nejdřív thursday-autostart, `continue` při shodě)
 * zajišťuje, že schůzka dnešního data ve čtvrtek dostane přesně JEDEN cíl,
 * i když by splňovala obě podmínky zároveň (M2).
 */
export function planMorningDispatch(i: {
  now: Date;
  meetings: MorningMeeting[];
}): MorningDispatchPlan {
  const { now, meetings } = i;
  const todayPrague = todayInPrague(now);
  const weekdayPrague = weekdayInPrague(now);
  const isThursday = weekdayPrague === "Thursday";

  const targets: MorningDispatchTarget[] = [];

  for (const m of meetings) {
    if (isThursday && m.date === todayPrague) {
      targets.push({ meetingId: m.id, meetingDate: m.date, reason: "thursday-autostart" });
      continue;
    }

    const isRunningAndDue =
      m.status === "voting" &&
      m.date <= todayPrague &&
      (m.votingClosesAt === null || m.votingClosesAt.getTime() > now.getTime());
    if (isRunningAndDue) {
      targets.push({ meetingId: m.id, meetingDate: m.date, reason: "deferred-send" });
    }
  }

  targets.sort((a, b) => a.meetingDate.localeCompare(b.meetingDate));

  return { todayPrague, weekdayPrague, targets };
}

/** Hodina (0–23) v Europe/Prague pro `deliveryHint` — hranice je 6:00. */
function hourInPrague(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour")?.value ?? "0";
  return parseInt(hourPart, 10) % 24;
}

export type DeliveryHint =
  | { kind: "on-date"; date: string }
  | { kind: "today-morning" }
  | { kind: "tomorrow-morning" };

/**
 * Kdy odejdou odkazy z pohledu panelu (arch 3.6, `{kdy}`). Schůzka
 * v budoucnu -> "v den schůzky {D. M.} ráno". Schůzka dnes nebo dřív ->
 * podle toho, jestli dnešní ranní běh (hranice 6:00 Europe/Prague, funguje
 * i po přechodu na zimní čas — M9) ještě mohl, nebo už nemohl proběhnout.
 */
export function deliveryHint(meetingDate: string, now: Date): DeliveryHint {
  const todayPrague = todayInPrague(now);
  if (meetingDate > todayPrague) {
    return { kind: "on-date", date: meetingDate };
  }
  return hourInPrague(now) < 6 ? { kind: "today-morning" } : { kind: "tomorrow-morning" };
}

/**
 * Je tenhle dispatch první den, kdy odkazy (aspoň některým) odešly, na
 * rozdíl od každodenního dosílání zbytku (arch 8.1, D8/R10)? Guard selhání
 * (`ok:false`) se počítá jako "první" — dispatch vůbec neproběhl, takže
 * varování nesmí propadnout jen proto, že to není klasický "sent" výsledek.
 * Naopak den, kdy JE aspoň jeden `already-sent`, je vždy dosílání, i kdyby
 * zároveň někomu (nově přidanému) odešel odkaz poprvé — nechceme varovat
 * každé ráno, dokud se poslední člen nedošle (R10).
 */
export function isFirstDispatch(r: VotingDispatchResult): boolean {
  if (!r.ok) return true;

  const hasAlreadySent = r.recipients.some(
    (rec) => rec.outcome.status === "skipped" && rec.outcome.reason === "already-sent"
  );
  if (hasAlreadySent) return false;

  return r.counts.sent + r.counts.error > 0;
}
