/**
 * Fáze 8 cronu — připomínky (iter-028, T-006, arch iter-028 T-001, sekce
 * 4.4). NENÍ čistý modul — smí a musí importovat DB vrstvu, e-mail a ops
 * log; rozhodovací logika (kdy, komu) žije v `lib/meetings/reminder-plan.ts`
 * a `lib/email/reminder-template.ts`, tenhle soubor je jen DB + maily podle
 * jejich rozhodnutí, v přesném pořadí zápisů z 4.4.
 *
 * Volá ho jen `app/api/cron/close-voting/route.ts` (fáze 8, poslední,
 * vlastní try/catch, arch 5.3, 13.2 bod 9).
 */
import { randomUUID } from "crypto";
import {
  getVotingMeetingForReminders,
  getVotableGuestCount,
  getVotedMemberIds,
  getClaimedRounds,
  claimReminder,
  markReminderSent,
} from "@/lib/db/queries/meeting-member-reminders";
import { getMembers } from "@/lib/db/queries/members";
import { getMeetingLinkRows } from "@/lib/db/queries/meeting-member-links";
import { hashMeetingToken, buildMeetingMagicUrl } from "@/lib/auth/meeting-magic";
import {
  planReminders,
  reminderRoundFor,
  shouldStopForBudget,
  type ReminderRound,
} from "@/lib/meetings/reminder-plan";
import { buildReminderEmail } from "@/lib/email/reminder-template";
import { sendVotingReminderEmail } from "@/lib/email/resend";
import { logOpsEvent } from "@/lib/ops/event-log";
import { safeReminderEvent, safeReminderRoundEvent } from "@/lib/ops/reminder-events";

export interface ReminderRunResult {
  ran: boolean;
  round?: ReminderRound;
  eligible: number;
  sent: number;
  failed: number;
  claimRejected: number;
  budgetStopped: number;
  skipped: Record<string, number>;
}

const EMPTY_RESULT: ReminderRunResult = {
  ran: false,
  eligible: 0,
  sent: 0,
  failed: 0,
  claimRejected: 0,
  budgetStopped: 0,
  skipped: {},
};

/**
 * Provede fázi 8 pro jedno spuštění cronu (4.4, kroky 1–6). `runId`/`nextSeq`
 * sdílí volající (route.ts) se zbytkem běhu (arch 5.3, 13.2 bod 9 — fáze 8
 * je poslední). `cronStartedAt` je `t0` HANDLERU, ne začátek téhle funkce —
 * brzda rozpočtu (arch 5.4) počítá od začátku celého běhu cronu.
 */
export async function runReminders(
  runId: string,
  nextSeq: () => number,
  cronStartedAt: Date,
  now: Date = new Date()
): Promise<ReminderRunResult> {
  // Krok 1: schůzka 'voting' s vyplněnou uzávěrkou. Žádná -> konec, bez
  // zápisu. Když tabulka meeting_member_reminder chybí (merge před migrací),
  // TENHLE krok ještě nesahá na ni — padne až krok 3 níže (6.5).
  const meeting = await getVotingMeetingForReminders();
  if (!meeting) {
    return EMPTY_RESULT;
  }

  // Krok 2: den kola? Mimo dny kol stojí fáze jeden SELECT (krok 1 výše).
  // `planReminders` (krok 4) round počítá znovu ze stejných vstupů — jedno
  // místo pravdy (reminder-plan.ts) — tenhle krok je jen levný pre-check,
  // aby se kroky 3–4 vůbec nevolaly mimo dny kol.
  if (reminderRoundFor(meeting.votingClosesAt, now) === null) {
    return EMPTY_RESULT;
  }

  // Krok 3: čtení — počet hlasovatelných hostů, členové, odkazy, hlasy,
  // zabraná kola. Chybějící tabulka meeting_member_reminder padne tady na
  // 42P01, DŘÍV, než cokoli pošle mail (6.5) — volající (route.ts) to
  // zachytí vlastním try/catch fáze 8.
  const [votableGuestCount, members, links, votedMemberIds, claimed] = await Promise.all([
    getVotableGuestCount(meeting.id),
    getMembers(),
    getMeetingLinkRows(meeting.id),
    getVotedMemberIds(meeting.id),
    getClaimedRounds(meeting.id),
  ]);

  // Krok 4: čistý plán (planReminders odvodí round znovu ze stejného
  // votingClosesAt/now — jedno místo pravdy, viz reminder-plan.ts).
  const plan = planReminders({
    now,
    meeting: {
      id: meeting.id,
      date: meeting.date,
      status: meeting.status,
      votingClosesAt: meeting.votingClosesAt,
      votableGuestCount,
    },
    members: members.map((m) => ({
      memberId: m.id,
      memberName: m.name,
      memberEmail: m.email ?? null,
    })),
    links: links.map((l) => ({
      memberId: l.memberId,
      revokedAt: l.revokedAt,
      linkEmailSentAt: l.linkEmailSentAt,
    })),
    votedMemberIds: Array.from(votedMemberIds),
    claimed,
  });

  if (!plan.run) {
    return EMPTY_RESULT;
  }

  const skipped: Record<string, number> = {
    "no-email": plan.counts.skippedNoEmail,
    "no-link": plan.counts.skippedNoLink,
    revoked: plan.counts.skippedRevoked,
    "link-not-sent": plan.counts.skippedLinkNotSent,
    "link-sent-today": plan.counts.skippedLinkSentToday,
    voted: plan.counts.skippedVoted,
    "already-reminded": plan.counts.skippedAlreadyReminded,
  };

  let sent = 0;
  let failed = 0;
  let claimRejected = 0;
  let budgetStopped = 0;

  // Krok 5: sekvenčně, jeden po druhém — bez db.transaction() (LL-003).
  for (const row of plan.toSend) {
    // a) brzda rozpočtu — zbytek do souhrnu budgetStopped, bez dalšího pokusu.
    if (shouldStopForBudget(cronStartedAt, new Date())) {
      budgetStopped++;
      continue;
    }

    // b) nový token/odkaz — D4 C, vlastní alias, meeting_member_link se
    // nemění vůbec.
    const rawToken = randomUUID();
    const tokenHash = hashMeetingToken(rawToken);
    const magicUrl = buildMeetingMagicUrl(rawToken);

    // c) zabrání (4.3, vrstva 2) — žádný řádek znamená nic neposílat.
    const claimedId = await claimReminder(meeting.id, row.memberId, plan.round, tokenHash);
    if (!claimedId) {
      claimRejected++;
      continue;
    }

    // d) sestavit a odeslat mail. `row.memberEmail` je tu vždy vyplněné
    // (planReminders garantuje e-mail pro "send", pravidlo 1) — přesto beze
    // non-null assertion, stejný vzor jako krok 8 ve voting-dispatch.ts.
    const { subject, html } = buildReminderEmail({
      meetingDate: meeting.date,
      votingClosesAt: meeting.votingClosesAt,
      now,
      magicUrl,
      originalSubjectDate: meeting.date,
    });

    const emailResult = row.memberEmail
      ? await sendVotingReminderEmail(row.memberEmail, subject, html)
      : { success: false as const, error: "member has no email" };

    const eventCtx = {
      runId,
      seq: nextSeq(),
      actor: "cron",
      meetingId: meeting.id,
      meetingDate: meeting.date,
      memberId: row.memberId,
      memberName: row.memberName,
      email: row.memberEmail,
      round: plan.round,
    };

    if (!emailResult.success) {
      failed++;
      const ev = safeReminderEvent(eventCtx, {
        status: "failed",
        reason: emailResult.error ?? "Unknown error",
      });
      if (ev) await logOpsEvent(ev);
      continue;
    }

    // f) sent_at AŽ PO úspěšném odeslání (D4 C: meeting_member_link se
    // vůbec nemění, na rozdíl od varianty A).
    await markReminderSent(claimedId, new Date());
    sent++;

    // g) reminder.sent + pauza 250 ms, stejný Resend limit jako dispatch.
    const ev = safeReminderEvent(eventCtx, {
      status: "sent",
      resendEmailId: emailResult.resendId ?? null,
    });
    if (ev) await logOpsEvent(ev);

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  // Krok 6: souhrn kola.
  const roundEvent = safeReminderRoundEvent({
    runId,
    seq: nextSeq(),
    actor: "cron",
    meetingId: meeting.id,
    meetingDate: meeting.date,
    round: plan.round,
    eligible: plan.toSend.length,
    sent,
    failed,
    claimRejected,
    budgetStopped,
    skipped,
  });
  if (roundEvent) await logOpsEvent(roundEvent);

  return {
    ran: true,
    round: plan.round,
    eligible: plan.toSend.length,
    sent,
    failed,
    claimRejected,
    budgetStopped,
    skipped,
  };
}
