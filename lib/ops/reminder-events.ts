/**
 * iter-028 (T-006) — čisté stavitelky OpsEventInput pro připomínky (arch
 * iter-028 T-001, sekce 7). Volá je lib/meetings/reminder-run.ts, samy nikdy
 * nezapisují do DB.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/server ani resend.
 * Bezpečné pro scripts/test-ops-events.ts (tsx bez DATABASE_URL).
 *
 * `safeReminderEvent`/`safeReminderRoundEvent` jsou bezpečné obaly (LL-011,
 * stejný vzor jako `safeDispatchOutcomeEvent` v dispatch-events.ts):
 * stavitelka je čistá, ale volá se s daty (jméno člena, důvod chyby), která
 * mohou v budoucnu nést getter nebo jinou past — obal vrátí `null` místo
 * vyhození, aby volající mohl bezpečně psát
 * `const ev = safeReminderEvent(...); if (ev) await logOpsEvent(ev);`
 * (nikdy `logOpsEvent(reminderEvent(...))` — to by se vyhodnotilo mimo
 * `logOpsEvent`'s vlastní try/catch).
 */
import type { OpsEventInput, OpsEventSeverity } from "./types";

export interface ReminderEventContext {
  runId: string;
  seq: number;
  actor: string;
  meetingId: string;
  meetingDate: string;
  memberId: string;
  memberName: string;
  email: string | null;
  round: 1 | 2 | 3;
}

export type ReminderOutcome =
  | { status: "sent"; resendEmailId: string | null }
  | { status: "failed"; reason: string };

/**
 * Vstup pro `reminder.sent` / `reminder.failed` — jeden řádek za člena,
 * volaný ve fázi 8 hned po pokusu o odeslání (4.4 kroky d/g).
 */
export function reminderEvent(
  ctx: ReminderEventContext,
  outcome: ReminderOutcome
): OpsEventInput {
  const base = {
    runId: ctx.runId,
    seq: ctx.seq,
    source: "cron" as const,
    actor: ctx.actor,
    meetingId: ctx.meetingId,
    meetingDate: ctx.meetingDate,
    memberId: ctx.memberId,
    memberName: ctx.memberName,
    email: ctx.email,
    detail: { round: ctx.round },
  };

  if (outcome.status === "sent") {
    return {
      ...base,
      kind: "reminder.sent",
      severity: "info",
      message: `Pripominka (kolo ${ctx.round}) odeslana: ${ctx.memberName}.`,
      resendEmailId: outcome.resendEmailId,
    };
  }

  return {
    ...base,
    kind: "reminder.failed",
    severity: "error",
    code: "send-failed",
    message: `Pripominka (kolo ${ctx.round}) selhala: ${ctx.memberName} - ${outcome.reason}`,
  };
}

export function safeReminderEvent(
  ctx: ReminderEventContext,
  outcome: ReminderOutcome
): OpsEventInput | null {
  try {
    return reminderEvent(ctx, outcome);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[reminder-events] failed to build reminder event runId=${ctx.runId}: ${msg}`
    );
    return null;
  }
}

export interface ReminderRoundContext {
  runId: string;
  seq: number;
  actor: string;
  meetingId: string;
  meetingDate: string;
  round: 1 | 2 | 3;
  eligible: number;
  sent: number;
  failed: number;
  claimRejected: number;
  budgetStopped: number;
  skipped: Record<string, number>;
}

/**
 * Souhrn kola (7, tabulka "Souhrn kola") — jeden řádek na konci fáze 8, po
 * všech pokusech o odeslání (4.4 krok 6). `severity` je `warn`, když něco
 * selhalo nebo rozpočet useknul zbytek — `info` jinak. NENÍ v
 * `TERMINAL_KINDS` (types.ts) — je to souhrn, ne konec běhu.
 */
export function reminderRoundEvent(ctx: ReminderRoundContext): OpsEventInput {
  const severity: OpsEventSeverity =
    ctx.failed > 0 || ctx.budgetStopped > 0 ? "warn" : "info";

  return {
    runId: ctx.runId,
    seq: ctx.seq,
    source: "cron",
    actor: ctx.actor,
    kind: "reminder.round",
    severity,
    meetingId: ctx.meetingId,
    meetingDate: ctx.meetingDate,
    message: `Kolo pripominek ${ctx.round}: ${ctx.sent} odeslano, ${ctx.failed} chyb, ${ctx.eligible} melo dostat.`,
    detail: {
      round: ctx.round,
      eligible: ctx.eligible,
      sent: ctx.sent,
      failed: ctx.failed,
      claimRejected: ctx.claimRejected,
      budgetStopped: ctx.budgetStopped,
      skipped: ctx.skipped,
    },
  };
}

export function safeReminderRoundEvent(ctx: ReminderRoundContext): OpsEventInput | null {
  try {
    return reminderRoundEvent(ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[reminder-events] failed to build reminder round event runId=${ctx.runId}: ${msg}`
    );
    return null;
  }
}
