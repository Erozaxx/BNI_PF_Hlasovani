/**
 * iter-046 (arch 9, D10): loader stránky `/dochazka/clenove` pro každého
 * přihlášeného. Čte DB, ale ven vrací jen tvary z `members-day.ts`
 * (`{ name, absences }`, `{ name, label }`). `memberId`, důvody, medical ani
 * e-mail z loaderu neodejdou, test 34 hlídá klíče.
 */
import { addDaysToDateString, pragueToday } from "@/lib/members/activity";
import { MAX_ADVANCE_DAYS, absenceWindowStart } from "@/lib/attendance/rules";
import { isRegularDay, nextRegularDay } from "@/lib/chapter/settings";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import {
  getDayMeta,
  listDayPlannedPublic,
  listDayResultsPublic,
  listMeetingDates,
  listOverviewMembers,
} from "@/lib/db/queries/attendance";
import { listInternalDays } from "@/lib/db/queries/attendance-internal";
import {
  buildPublicCounts,
  buildPublicDay,
  neighbourMeetingDays,
  pickMembersViewDate,
  type PublicCountRow,
  type PublicDay,
} from "@/lib/attendance/members-day";

export interface MembersView {
  /** Zobrazený den (`YYYY-MM-DD`). */
  date: string;
  /** Nejmenší a největší povolené datum formuláře. */
  min: string;
  max: string;
  prev: string | null;
  next: string | null;
  counts: PublicCountRow[];
  day: PublicDay;
}

/** Schůzkové dny v `[from, to]`: pravidelný den, den schůzky, interní den. */
async function listMeetingDays(from: string, to: string): Promise<string[]> {
  const settings = await getChapterSettings();
  const [meetings, internal] = await Promise.all([listMeetingDates(from, to), listInternalDays(from, to)]);
  const days = new Set<string>([...meetings, ...internal]);
  for (let d = from; d <= to; d = addDaysToDateString(d, 1)) {
    if (isRegularDay(d, settings)) days.add(d);
  }
  return [...days].sort();
}

export async function loadMembersView(requested: unknown): Promise<MembersView> {
  const today = pragueToday();
  const min = absenceWindowStart(today);
  const max = addDaysToDateString(today, MAX_ADVANCE_DAYS);
  const settings = await getChapterSettings();
  const meetingDays = await listMeetingDays(min, max);

  // Výchozí den: nejbližší schůzkový den od dneška, jinak nejbližší pravidelný.
  const fallback = meetingDays.find((d) => d >= today) ?? nextRegularDay(today, settings);
  // iter-046 (M-2): jen schůzkový den, jiný den = výchozí.
  const date = pickMembersViewDate(requested, meetingDays, min, max, fallback);

  const [overview, meta] = await Promise.all([listOverviewMembers(min, today), getDayMeta(date)]);

  const day = meta.finalized
    ? buildPublicDay({
        state: "closed",
        dayMode: meta.dayMode,
        rows: (await listDayResultsPublic(date)).map((r) => ({
          name: r.name,
          status: r.status,
          substituteName: r.substitute_name,
          excused: r.excused,
        })),
      })
    : buildPublicDay({
        state: "open",
        rows: (await listDayPlannedPublic(date)).map((r) => ({
          name: r.name,
          substituteName: r.substitute_name,
        })),
      });

  return {
    date,
    min,
    max,
    ...neighbourMeetingDays(meetingDays, date),
    counts: buildPublicCounts(overview.map((m) => ({ name: m.name, absences: m.absences }))),
    day,
  };
}
