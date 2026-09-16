/**
 * Kdy a komu poslat připomínku (iter-028, T-006, arch iter-028 T-001, sekce
 * 4.1, 4.2, 8.1). Dvě věci: `reminderRoundFor` řekne, jestli je dnešek den
 * kola (2., 4. nebo 6. den od spuštění, počítáno od uzávěrky — 4.1);
 * `planReminders` z toho a ze stavu schůzky/členů/odkazů/hlasů rozhodne,
 * komu se dnes pošle a komu ne.
 *
 * Čistý modul bez DB: žádný import drizzle-orm, @/lib/db/*, next/server,
 * next/cache ani resend. Jde spustit v holém Node (tsx) bez DATABASE_URL —
 * viz scripts/test-reminder-plan.ts. `./voting-window` je taky čistý modul.
 */
import { todayInPrague } from "./voting-window";

export type ReminderRound = 1 | 2 | 3;

function isoToUtcMidnight(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Počet dní od `fromIso` do `toIso` (kladné, pokud `toIso` je pozdější). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToUtcMidnight(toIso) - isoToUtcMidnight(fromIso)) / 86_400_000);
}

/**
 * Den kola připomínek (4.1, D3 A): kolo 1 den uzávěrky−4, kolo 2 den
 * uzávěrky−2, kolo 3 den uzávěrky (sobota/pondělí/středa při čtvrtečním
 * startu). `null`, když už je po uzávěrce nebo dnešek není den žádného kola.
 * Počítá se od `votingClosesAt`, ne od okamžiku skutečného rozeslání — ta
 * hodnota se u běžícího hlasování nikdy nemění (iter-026 2.3), takže žádný
 * den kola nemůže padnout za uzávěrku.
 */
export function reminderRoundFor(votingClosesAt: Date, now: Date): ReminderRound | null {
  if (now.getTime() >= votingClosesAt.getTime()) return null;

  const today = todayInPrague(now);
  const closesDay = todayInPrague(votingClosesAt);
  const diff = daysBetween(today, closesDay);

  if (diff === 4) return 1;
  if (diff === 2) return 2;
  if (diff === 0) return 3;
  return null;
}

export interface ReminderMeetingInput {
  id: string;
  date: string; // "YYYY-MM-DD"
  status: string;
  votingClosesAt: Date | null;
  votableGuestCount: number;
}

export interface ReminderMemberInput {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
}

export interface ReminderLinkInput {
  memberId: string;
  revokedAt: Date | null;
  linkEmailSentAt: Date | null; // = meeting_member_link.morning_email_sent_at
}

export interface ReminderClaimedInput {
  memberId: string;
  round: number;
}

export interface ReminderInput {
  now: Date;
  meeting: ReminderMeetingInput;
  members: ReminderMemberInput[]; // VŠICHNI členové, i management (D7 A) a bez e-mailu
  links: ReminderLinkInput[];
  votedMemberIds: string[];
  claimed: ReminderClaimedInput[];
}

export type ReminderSkipReason =
  | "no-email"
  | "no-link"
  | "revoked"
  | "link-not-sent"
  | "link-sent-today"
  | "voted"
  | "already-reminded";

export type ReminderRowAction = { kind: "skip"; reason: ReminderSkipReason } | { kind: "send" };

export interface ReminderRow {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  action: ReminderRowAction;
}

export interface ReminderCounts {
  total: number;
  toSend: number;
  skippedNoEmail: number;
  skippedNoLink: number;
  skippedRevoked: number;
  skippedLinkNotSent: number;
  skippedLinkSentToday: number;
  skippedVoted: number;
  skippedAlreadyReminded: number;
}

export type ReminderPlan =
  | { run: false; reason: "not-voting" | "no-votable-guests" | "no-round-today" }
  | {
      run: true;
      round: ReminderRound;
      rows: ReminderRow[]; // vždy VŠICHNI členové, seřazeno
      toSend: ReminderRow[]; // podmnožina rows s action.kind === "send"
      counts: ReminderCounts;
    };

/**
 * Rozhodne akci pro jednoho člena. Pravidla, v tomto pořadí (4.2), první
 * platné rozhodne:
 * 1. bez e-mailu -> skip no-email
 * 2. bez odkazu na tuto schůzku -> skip no-link
 * 3. odkaz revokovaný -> skip revoked
 * 4. značka odeslání NULL (odkaz ještě neodešel) -> skip link-not-sent
 * 5. značka odeslání je dnes (Praha) -> skip link-sent-today (pozdní start
 *    ve stejném běhu jako odkaz, RP9)
 * 6. má v `vote` pro tuto schůzku aspoň 1 řádek -> skip voted
 * 7. pro toto kolo už existuje zabraný řádek -> skip already-reminded
 * 8. jinak -> send
 */
function reminderAction(
  member: ReminderMemberInput,
  link: ReminderLinkInput | undefined,
  hasVoted: boolean,
  alreadyClaimedThisRound: boolean,
  now: Date
): ReminderRowAction {
  if (!member.memberEmail) {
    return { kind: "skip", reason: "no-email" };
  }
  if (!link) {
    return { kind: "skip", reason: "no-link" };
  }
  if (link.revokedAt !== null) {
    return { kind: "skip", reason: "revoked" };
  }
  if (link.linkEmailSentAt === null) {
    return { kind: "skip", reason: "link-not-sent" };
  }
  if (todayInPrague(link.linkEmailSentAt) === todayInPrague(now)) {
    return { kind: "skip", reason: "link-sent-today" };
  }
  if (hasVoted) {
    return { kind: "skip", reason: "voted" };
  }
  if (alreadyClaimedThisRound) {
    return { kind: "skip", reason: "already-reminded" };
  }
  return { kind: "send" };
}

export function planReminders(i: ReminderInput): ReminderPlan {
  const { now, meeting, members, links, votedMemberIds, claimed } = i;

  if (meeting.status !== "voting") {
    return { run: false, reason: "not-voting" };
  }
  if (meeting.votableGuestCount < 1) {
    return { run: false, reason: "no-votable-guests" };
  }
  if (meeting.votingClosesAt === null) {
    return { run: false, reason: "no-round-today" };
  }

  const round = reminderRoundFor(meeting.votingClosesAt, now);
  if (round === null) {
    return { run: false, reason: "no-round-today" };
  }

  const linkByMember = new Map(links.map((l) => [l.memberId, l]));
  const votedSet = new Set(votedMemberIds);
  const claimedThisRound = new Set(
    claimed.filter((c) => c.round === round).map((c) => c.memberId)
  );

  const rows: ReminderRow[] = members.map((member) => ({
    memberId: member.memberId,
    memberName: member.memberName,
    memberEmail: member.memberEmail,
    action: reminderAction(
      member,
      linkByMember.get(member.memberId),
      votedSet.has(member.memberId),
      claimedThisRound.has(member.memberId),
      now
    ),
  }));

  // Řazení podle jména (cs), druhotný klíč memberId — stejný vzor jako
  // planVotingDispatch (lib/meetings/voting-plan.ts), aby dva stejnojmenní
  // členové neměnili pořadí mezi běhy (RP10).
  rows.sort((a, b) => {
    const byName = a.memberName.localeCompare(b.memberName, "cs");
    if (byName !== 0) return byName;
    return a.memberId.localeCompare(b.memberId);
  });

  const toSend = rows.filter((r) => r.action.kind === "send");
  const countReason = (reason: ReminderSkipReason) =>
    rows.filter((r) => r.action.kind === "skip" && r.action.reason === reason).length;

  return {
    run: true,
    round,
    rows,
    toSend,
    counts: {
      total: rows.length,
      toSend: toSend.length,
      skippedNoEmail: countReason("no-email"),
      skippedNoLink: countReason("no-link"),
      skippedRevoked: countReason("revoked"),
      skippedLinkNotSent: countReason("link-not-sent"),
      skippedLinkSentToday: countReason("link-sent-today"),
      skippedVoted: countReason("voted"),
      skippedAlreadyReminded: countReason("already-reminded"),
    },
  };
}

/**
 * Rozpočtová brzda fáze 8 (4.4 krok 5a, 5.4): `false` dokud neuplyne
 * `limitMs` od začátku CELÉHO běhu cronu (`cronStartedAt` = `t0` handleru,
 * ne začátek fáze 8) — sdílí stejnou logiku jako iter-026 rozpočet, jen jiná
 * výchozí mez (40 000 ms, arch 5.3/5.4).
 */
export function shouldStopForBudget(
  cronStartedAt: Date,
  now: Date,
  limitMs = 40_000
): boolean {
  return now.getTime() - cronStartedAt.getTime() >= limitMs;
}
