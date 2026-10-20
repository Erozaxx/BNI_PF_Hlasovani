/**
 * iter-038 (T-003c, arch 11.2, gate Z1): kdy co dělá cron docházky. Vercel Hobby
 * spustí cron kdykoli během hodiny (N6), proto handler o rozvrh nedbá a
 * rozhoduje podle pražského času v okamžiku běhu.
 *
 * - ráno: 06:00 až 11:59 pražského času, ranní odkazy pro dnešek a záchrana
 *   včerejška (gate Z1: okno začíná v 6:00, mail má přijít před 7:00)
 * - večer: 17:00 až 23:59, uzavření dneška a report
 * - jinak nic
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * Bezpečné pro scripts/test-iter-038-attendance.ts.
 */

import { addDaysToDateString, pragueToday } from "@/lib/members/activity";

/** Rozvrhy `/api/cron/attendance` ve `vercel.json` (UTC), gate Z1. Test hlídá shodu. */
export const ATTENDANCE_CRON_SCHEDULES = [
  "0 4 * * *",
  "0 5 * * *",
  "0 6 * * *",
  "0 7 * * *",
  "0 15 * * *",
  "0 16 * * *",
  "0 17 * * *",
] as const;

/** Ranní okno: od 6:00 (včetně) do 12:00 (bez), v minutách od půlnoci pražského času. */
export const MORNING_FROM_MINUTES = 6 * 60;
export const MORNING_TO_MINUTES = 12 * 60;
/** Večerní okno: od 17:00 (včetně) do půlnoci. */
export const EVENING_FROM_MINUTES = 17 * 60;

/** Platnost ranního odkazu od odeslání. */
export const ATTENDANCE_LINK_VALID_HOURS = 12;

/** Claim ranního odkazu starší než tohle smí převzít další běh (pád mezi claimem a odesláním). */
export const CLAIM_STALE_MINUTES = 5;

/**
 * Report se po uzavření dne dosílá jen pár hodin (dokončení po pádu uprostřed
 * rozesílky). Později se nový příjemce, třeba čerstvě jmenovaný správce, neposílá.
 */
export const REPORT_RESUME_HOURS = 3;

/** Funkce, jejíž držitelé dostávají report (arch 10.3, K8). Porovnává se `lower(name)`. */
export const ATTENDANCE_REPORT_FUNCTIONS = ["prezident", "viceprezident"] as const;

export type CronPhase = "morning" | "evening" | "none";

export interface CronPlan {
  phase: CronPhase;
  /** Dnešek v Praze. */
  today: string;
  /** Včerejšek v Praze (záchrana v ranním okně). */
  yesterday: string;
}

const CLOCK_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
});

/** Minuty od půlnoci v Praze (0 až 1439) v daném okamžiku. */
export function pragueMinutesOfDay(now: Date): number {
  let hour = 0;
  let minute = 0;
  for (const p of CLOCK_PARTS.formatToParts(now)) {
    if (p.type === "hour") hour = Number(p.value);
    if (p.type === "minute") minute = Number(p.value);
  }
  return hour * 60 + minute;
}

export function planAttendanceCron(now: Date): CronPlan {
  const minutes = pragueMinutesOfDay(now);
  const today = pragueToday(now);
  const yesterday = addDaysToDateString(today, -1);
  let phase: CronPhase = "none";
  if (minutes >= MORNING_FROM_MINUTES && minutes < MORNING_TO_MINUTES) phase = "morning";
  else if (minutes >= EVENING_FROM_MINUTES) phase = "evening";
  return { phase, today, yesterday };
}

/** Konec platnosti ranního odkazu. */
export function linkExpiresAt(from: Date): Date {
  return new Date(from.getTime() + ATTENDANCE_LINK_VALID_HOURS * 3600 * 1000);
}
