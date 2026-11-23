import { addMonths, differenceInCalendarDays, isAfter, parseISO } from "date-fns";

/** Okno (ve dnech) pro příznak „Blíží se“. */
export const UPCOMING_WINDOW_DAYS = 14;

export type DueRow = {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  joinedAt: string;
  joinedAtUnverified: boolean;
  hasMonth5Interview: boolean;
  hasMonth10Interview: boolean;
};

export type DueComputed = DueRow & {
  due5: boolean;
  due10: boolean;
  /** Days since due5 turned on (i.e. since entering month 5), not days overdue. */
  due5SinceDays: number | null;
  /** Days since due10 turned on (i.e. since entering month 10), not days overdue. */
  due10SinceDays: number | null;
  upcoming5: boolean;
  upcoming10: boolean;
};

/**
 * Čistý výpočet termínů 5/10 měsíců pro jednoho člena (iter-048: přesunuto z
 * `getInterviewDueList` beze změny logiky). O medical ani deaktivaci neví,
 * termín se tedy nikdy neposouvá.
 */
export function computeDueEntry(row: DueRow, today: Date): DueComputed {
  const joined = parseISO(row.joinedAt);
  // due5Date/due10Date are the dates the member ENTERS the relevant month
  // (4 / 9 completed months), not the dates that month elapses, iter-024.
  const due5Date = addMonths(joined, 4);
  const due10Date = addMonths(joined, 9);

  const due5 = !row.hasMonth5Interview && !isAfter(due5Date, today);
  const due10 = !row.hasMonth10Interview && !isAfter(due10Date, today);

  const upcoming5 =
    !row.hasMonth5Interview &&
    !due5 &&
    differenceInCalendarDays(due5Date, today) <= UPCOMING_WINDOW_DAYS;
  const upcoming10 =
    !row.hasMonth10Interview &&
    !due10 &&
    differenceInCalendarDays(due10Date, today) <= UPCOMING_WINDOW_DAYS;

  return {
    memberId: row.memberId,
    memberName: row.memberName,
    memberEmail: row.memberEmail,
    joinedAt: row.joinedAt,
    joinedAtUnverified: row.joinedAtUnverified,
    hasMonth5Interview: row.hasMonth5Interview,
    hasMonth10Interview: row.hasMonth10Interview,
    due5,
    due10,
    due5SinceDays: due5 ? differenceInCalendarDays(today, due5Date) : null,
    due10SinceDays: due10 ? differenceInCalendarDays(today, due10Date) : null,
    upcoming5,
    upcoming10,
  };
}
