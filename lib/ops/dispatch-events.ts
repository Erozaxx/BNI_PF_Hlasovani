/**
 * iter-027 (T-005) — čisté stavitelky OpsEventInput pro dispatch hlasovacích
 * odkazů (arch iter-027 T-001, sekce 6.3c, 6.2, 12). Volá je
 * lib/meetings/voting-dispatch.ts, samy nikdy nezapisují do DB.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/server ani resend.
 * `import type` z lib/meetings/voting-dispatch je typový odkaz, esbuild/tsc
 * ho při isolatedModules zcela odstraní — netahá runtime drizzle závislost
 * do tohohle souboru. Bezpečné pro scripts/test-ops-events.ts (tsx bez
 * DATABASE_URL).
 */
import type {
  DispatchRecipient,
  VotingDispatchResult,
} from "@/lib/meetings/voting-dispatch";
import type { OpsEventInput, OpsEventSeverity, OpsEventSource } from "./types";

export interface DispatchEventContext {
  runId: string;
  seq: number;
  actor: string;
  source: OpsEventSource;
  meetingId: string;
  meetingDate: string;
}

/**
 * Vstup pro `email.sent` / `email.skipped` / `email.failed` — jeden řádek za
 * příjemce, volaný ve smyčce kroku 8 (6.3c), hned po `recipients.push(...)`.
 */
export function recipientEvent(
  recipient: DispatchRecipient,
  ctx: DispatchEventContext
): OpsEventInput {
  const base = {
    runId: ctx.runId,
    seq: ctx.seq,
    source: ctx.source,
    actor: ctx.actor,
    meetingId: ctx.meetingId,
    meetingDate: ctx.meetingDate,
    memberId: recipient.memberId,
    memberName: recipient.memberName,
    email: recipient.memberEmail,
  };

  const outcome = recipient.outcome;

  if (outcome.status === "sent") {
    return {
      ...base,
      kind: "email.sent",
      severity: "info",
      message: `Hlasovaci odkaz odeslan: ${recipient.memberName}.`,
      resendEmailId: outcome.resendId ?? null,
    };
  }

  if (outcome.status === "skipped") {
    return {
      ...base,
      kind: "email.skipped",
      severity: "info",
      code: outcome.reason,
      message: skippedMessage(outcome.reason, recipient.memberName),
    };
  }

  return {
    ...base,
    kind: "email.failed",
    severity: "error",
    message: `Odeslani selhalo: ${recipient.memberName} - ${outcome.reason}`,
  };
}

function skippedMessage(
  reason: "no-email" | "revoked" | "already-sent",
  memberName: string
): string {
  switch (reason) {
    case "no-email":
      return `${memberName} nema e-mailovou adresu, preskoceno.`;
    case "revoked":
      return `${memberName} ma zruseny odkaz, preskoceno.`;
    case "already-sent":
      return `${memberName} uz odkaz dostal, preskoceno.`;
  }
}

/**
 * Vstup pro `dispatch.finished` / `dispatch.guard-failed` — terminální
 * záznam dispatche (6.2). Nese MAJOR-1 opravu (review T-002): `meetingId` se
 * do výsledku dostane JEN když `result.ok || result.code !== "not-found"` —
 * neověřené id jinak jde do `detail.requestedMeetingId`, protože sloupec má
 * cizí klíč a řádek, který v `meeting` není, by INSERT rozbil.
 */
export function dispatchOutcomeEvent(
  result: VotingDispatchResult,
  ctx: Omit<DispatchEventContext, "meetingId" | "meetingDate"> & {
    requestedMeetingId: string;
  }
): OpsEventInput {
  const base = {
    runId: ctx.runId,
    seq: ctx.seq,
    source: ctx.source,
    actor: ctx.actor,
  };

  if (result.ok) {
    const { sent, skipped, error } = result.counts;
    const total = result.totalMembers;
    const severity: OpsEventSeverity = error > 0 ? "warn" : "info";
    const message =
      error > 0
        ? `Hlasovaci odkazy rozeslany: ${sent} z ${total} clenu, ${error} chyb, ${skipped} preskoceno.`
        : `Hlasovaci odkazy rozeslany vsem ${total} clenum.`;

    return {
      ...base,
      kind: "dispatch.finished",
      severity,
      meetingId: result.meetingId,
      meetingDate: result.meetingDate,
      message,
      detail: { sent, skipped, error, totalMembers: total },
    };
  }

  const meetingExists = result.code !== "not-found";

  return {
    ...base,
    kind: "dispatch.guard-failed",
    severity: "error",
    meetingId: meetingExists ? ctx.requestedMeetingId : undefined,
    code: result.code,
    message: result.error,
    detail: meetingExists ? null : { requestedMeetingId: ctx.requestedMeetingId },
  };
}

/**
 * Bezpečný obal nad `dispatchOutcomeEvent` (review T-007, MAJOR-1 / T-005r).
 *
 * `dispatchOutcomeEvent(...)` je čistá funkce bez I/O, ale volala se ve
 * `voting-dispatch.ts` jako argument `logOpsEvent(...)` — JS ji vyhodnotí
 * PŘED voláním `logOpsEvent`, tedy mimo její vlastní `try/catch` (D2) i mimo
 * `try` kolem `runVotingDispatchInner`, který už v tu chvíli doběhl. Kdyby
 * tahle funkce (např. po budoucím refaktoru, co přidá pole nebo předpoklad,
 * který typový systém nezachytí za běhu) vyhodila výjimku, nic by ji
 * nechytilo — propadla by až k volajícímu (`start-voting` route, cron), a to
 * i po fakticky úspěšném dispatchi.
 *
 * `safeDispatchOutcomeEvent` tenhle případ pohlcuje: vrátí `null` místo
 * vyhození, se `console.error` záznamem stejného tvaru jako `logOpsEvent`'s
 * vlastní catch (`event-log.ts`). Volající pak `logOpsEvent` zavolá jen když
 * dostane skutečný `OpsEventInput` — výsledek dispatche samotný (`result`,
 * `return result` ve wrapperu) tím není nijak dotčen.
 */
export function safeDispatchOutcomeEvent(
  result: VotingDispatchResult,
  ctx: Omit<DispatchEventContext, "meetingId" | "meetingDate"> & {
    requestedMeetingId: string;
  }
): OpsEventInput | null {
  try {
    return dispatchOutcomeEvent(result, ctx);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[dispatch-events] failed to build dispatch outcome event runId=${ctx.runId}: ${msg}`
    );
    return null;
  }
}
