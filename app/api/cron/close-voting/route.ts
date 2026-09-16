import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getExpiredVotingMeetings } from "@/lib/db/queries/votes";
import {
  getMeetingByDate,
  getMorningDispatchCandidates,
  updateMeetingStatus,
} from "@/lib/db/queries/meetings";
import { sendReport, sendMagicLinkEmail, sendVotingWarningEmail } from "@/lib/email/resend";
import { getMembers } from "@/lib/db/queries/members";
import { getMeetingLinkRows } from "@/lib/db/queries/meeting-member-links";
import { generateMagicToken } from "@/lib/auth/magic";
import { todayInPrague, weekdayInPrague } from "@/lib/meetings/voting-window";
import { runVotingDispatch, type VotingDispatchResult } from "@/lib/meetings/voting-dispatch";
import { planVotingDispatch, type DispatchPlan } from "@/lib/meetings/voting-plan";
import {
  planMorningDispatch,
  isFirstDispatch,
  type MorningReason,
} from "@/lib/meetings/morning-dispatch";
import { decideThursdayWarning, type WarningInput } from "@/lib/meetings/warning-plan";
import { cleanupStaleThrottleRows } from "@/lib/auth/throttle";
import { runReminders, type ReminderRunResult } from "@/lib/meetings/reminder-run";
import { logOpsEvent } from "@/lib/ops/event-log";
import { retentionCutoff } from "@/lib/ops/retention";
import { purgeOldOpsEvents } from "@/lib/db/queries/ops-events";

// Fáze 2 (dispatch) je při 27 členech ~15s (regenerate + Resend + 250ms pauza
// na člena, arch iter-026 9.2). Vercel Hobby default limit funkce (10s) by to
// oříznul. maxDuration = 60 je strop Hobby plánu.
export const maxDuration = 60;

/**
 * Fáze 2 (iter-028, T-005, arch 3.4): ranní rozeslání hlasovacích odkazů.
 * Nahrazuje dřívější "jen ve čtvrtek, jen schůzka s dnešním datem" dvěma
 * nezávislými cíli, které `planMorningDispatch` (čistá funkce,
 * lib/meetings/morning-dispatch.ts) rozhodne z kandidátů
 * (`getMorningDispatchCandidates`):
 *
 * - `thursday-autostart` — schůzka s dnešním datem, JEN ve čtvrtek, v
 *   libovolném stavu draft/active/voting (E1, beze změny) — cron sám
 *   aktivuje i schůzku, kterou nikdo nepřipravil. Vždy se spustí, fáze 3
 *   potřebuje výsledek i při selhání.
 * - `deferred-send` — běžící hlasování (status 'voting'), jehož schůzka má
 *   datum dnes nebo dřív a uzávěrka ještě neprošla. Levný pre-check
 *   (`planVotingDispatch`) napřed zjistí, jestli je vůbec komu poslat —
 *   `willSend === 0` (všichni mají značku odeslání) se přeskočí BEZ zápisu
 *   do ops_event, ušetří to 29 záznamů denně po celou dobu hlasování.
 *
 * Oba cíle volají `runVotingDispatch` s `deliver:"now"` — ranní cron je
 * jediné místo, které smí odeslat mail (arch 3.1); `deliver:"defer"` patří
 * jen ručnímu tlačítku "Spustit hlasovani" (start-voting/route.ts).
 *
 * Každý cíl má VLASTNÍ try/catch (arch 3.4) — pád jednoho (skutečná infra
 * chyba mimo pět guard kódů) nesmí zastavit zpracování dalšího cíle ani
 * zbytek cronu. Zachycená výjimka se zapíše jako `infraError`, stejně jako
 * dřív u jediného čtvrtečního cíle (review MAJOR-1, T-006r).
 */
export interface MorningDispatchTargetOutcome {
  meetingId: string;
  meetingDate: string;
  reason: MorningReason;
  /** "nothing-to-send" = deferred-send přeskočen před voláním jádra (willSend 0), bez zápisu do ops_event. */
  action: "dispatched" | "nothing-to-send";
  result: VotingDispatchResult | null;
  infraError?: { code: "infra-error"; message: string };
}

export interface MorningDispatchOutcome {
  weekdayPrague: string;
  todayPrague: string;
  targets: MorningDispatchTargetOutcome[];
}

async function runMorningDispatch(
  today: string,
  now: Date,
  runId: string
): Promise<MorningDispatchOutcome> {
  const candidates = await getMorningDispatchCandidates(today);
  const plan = planMorningDispatch({ now, meetings: candidates });

  const targets: MorningDispatchTargetOutcome[] = [];

  for (const target of plan.targets) {
    if (target.reason === "deferred-send") {
      // iter-028 (T-007r, review T-007 N1 MAJOR): pre-check `deferred-send`
      // cíle (levné zjištění "je vůbec komu poslat") má VLASTNÍ try/catch,
      // izolovaný od zbytku smyčky. Bez něj by přechodná chyba DB tady
      // shodila CELÉ `runMorningDispatch` — a protože cíle jsou seřazené
      // vzestupně podle data, `thursday-autostart` (vždy nejvyšší datum) by
      // se ten den vůbec nezpracoval. Chyba se zapíše jako `infraError`
      // JEN pro tenhle cíl, stejným tvarem jako výjimka z `runVotingDispatch`
      // níže, a smyčka pokračuje dalším cílem.
      let willSendPlan: DispatchPlan;
      try {
        const [members, links] = await Promise.all([
          getMembers(),
          getMeetingLinkRows(target.meetingId),
        ]);
        willSendPlan = planVotingDispatch({
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
          mode: "start",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(
          `morning-dispatch: meeting=${target.meetingId} reason=${target.reason} pre-check threw (infra error):`,
          msg
        );
        targets.push({
          meetingId: target.meetingId,
          meetingDate: target.meetingDate,
          reason: target.reason,
          action: "dispatched",
          result: null,
          infraError: { code: "infra-error", message: msg },
        });
        continue;
      }

      if (willSendPlan.counts.willSend === 0) {
        targets.push({
          meetingId: target.meetingId,
          meetingDate: target.meetingDate,
          reason: target.reason,
          action: "nothing-to-send",
          result: null,
        });
        continue;
      }
    }

    try {
      // iter-027 (T-005, arch 6.1): cron předává svoje runId, aby fáze 2
      // nebyla samostatný běh — všechny události dispatche sdílejí runId
      // s cron.started.
      const result = await runVotingDispatch(target.meetingId, {
        mode: "start",
        deliver: "now",
        actor: "cron",
        now,
        runId,
      });

      if (result.ok) {
        console.log(
          `morning-dispatch: meeting=${target.meetingId} reason=${target.reason} ` +
            `statusBefore=${result.statusBefore} statusAfter=${result.statusAfter} ` +
            `sent=${result.counts.sent} skipped=${result.counts.skipped} errors=${result.counts.error}`
        );
      } else {
        console.error(
          `morning-dispatch: meeting=${target.meetingId} reason=${target.reason} guard failed code=${result.code}: ${result.error}`
        );
      }

      targets.push({
        meetingId: target.meetingId,
        meetingDate: target.meetingDate,
        reason: target.reason,
        action: "dispatched",
        result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(
        `morning-dispatch: meeting=${target.meetingId} reason=${target.reason} threw (infra error):`,
        msg
      );
      targets.push({
        meetingId: target.meetingId,
        meetingDate: target.meetingDate,
        reason: target.reason,
        action: "dispatched",
        result: null,
        infraError: { code: "infra-error", message: msg },
      });
    }
  }

  return { weekdayPrague: plan.weekdayPrague, todayPrague: plan.todayPrague, targets };
}

/**
 * Sestaví `WarningInput` (arch 3.4, 3.7) z `MorningDispatchOutcome` fáze 2.
 * Nesahá na `runVotingDispatch` ani na `voting-dispatch.ts` — jen z
 * návratové hodnoty fáze 2 (včetně `infraError`, T-006r MAJOR-1) odvozuje,
 * co `decideThursdayWarning` potřebuje. `meeting`/`dispatchFailure`/
 * `failedRecipients` jdou VÝHRADNĚ z cíle `thursday-autostart` (beze změny
 * proti iter-026/027 — tenhle cíl existuje jen ve čtvrtek). `deferredFirstDispatch`
 * (D8, iter-028) jde z cíle `deferred-send`, pokud v tomhle běhu existoval.
 */
async function buildWarningInput(
  dispatch: MorningDispatchOutcome,
  today: string
): Promise<WarningInput> {
  const thursdayTarget =
    dispatch.targets.find((t) => t.reason === "thursday-autostart") ?? null;
  const deferredTarget =
    dispatch.targets.find((t) => t.reason === "deferred-send") ?? null;

  const meeting = await resolveWarningMeeting(thursdayTarget, today);
  const { failedRecipients, membersWithoutEmail } = deriveWarningSignals(
    thursdayTarget?.result ?? null
  );
  const deferredFirstDispatch = await buildDeferredFirstDispatch(deferredTarget);

  return {
    weekdayPrague: dispatch.weekdayPrague,
    todayIso: today,
    meeting,
    dispatchFailure:
      thursdayTarget?.infraError ??
      (thursdayTarget?.result && !thursdayTarget.result.ok
        ? { code: thursdayTarget.result.code, message: thursdayTarget.result.error }
        : null),
    failedRecipients,
    membersWithoutEmail,
    deferredFirstDispatch,
  };
}

/**
 * Stav schůzky PO cíli `thursday-autostart` pro WarningInput.meeting.
 *
 * Když `target.result.ok === true`, stav je přímo v něm (meetingId,
 * meetingDate, statusAfter) — žádný extra dotaz.
 *
 * Když guard padl (`ok:false`) nebo přišel `infraError`, `VotingDispatchResult`
 * nese jen `code`/`error` nebo nic — guard/výjimka padly PŘED jakýmkoli
 * zápisem, takže stav schůzky je nezměněný, jen se to nikam nepropsalo.
 * Nejjednodušší je stav čerstvě dotáhnout přes `getMeetingByDate` — ta samá
 * funkce, jejíž výsledek `planMorningDispatch` dostal jako kandidáta.
 */
async function resolveWarningMeeting(
  thursdayTarget: MorningDispatchTargetOutcome | null,
  today: string
): Promise<{ id: string; date: string; status: string } | null> {
  if (!thursdayTarget) return null; // není čtvrtek, nebo žádná schůzka na dnešek

  if (thursdayTarget.result && thursdayTarget.result.ok) {
    return {
      id: thursdayTarget.result.meetingId,
      date: thursdayTarget.result.meetingDate,
      status: thursdayTarget.result.statusAfter,
    };
  }

  const row = await getMeetingByDate(today);
  return row ? { id: row.id, date: row.date, status: row.status } : null;
}

/**
 * D8 (arch 3.7, R10): sestaví `deferredFirstDispatch` pro `decideThursdayWarning`,
 * ale JEN když je tenhle běh prvním dnem, kdy cíl `deferred-send` aspoň
 * něco poslal nebo se o to pokusil (`isFirstDispatch`) — rutinní každodenní
 * dosílání zbytku (nebo `action:"nothing-to-send"`, kdy se nic ani
 * nezkoušelo) se sem nikdy nedostane, aby varování nespamovalo, dokud se
 * poslední člen nedošle.
 */
async function buildDeferredFirstDispatch(
  target: MorningDispatchTargetOutcome | null
): Promise<WarningInput["deferredFirstDispatch"]> {
  if (!target || target.action === "nothing-to-send") return null;
  if (target.result && !isFirstDispatch(target.result)) return null;

  if (target.result && target.result.ok) {
    const { failedRecipients } = deriveWarningSignals(target.result);
    return {
      meeting: {
        id: target.result.meetingId,
        date: target.result.meetingDate,
        status: target.result.statusAfter,
      },
      dispatchFailure: null,
      failedRecipients,
    };
  }

  // ok:false (guard) nebo infraError (výjimka) — stav schůzky se nezměnil,
  // dotáhnout ho stejně jako u resolveWarningMeeting pro čtvrteční cíl.
  const row = await getMeetingByDate(target.meetingDate);
  const meeting = row
    ? { id: row.id, date: row.date, status: row.status }
    : { id: target.meetingId, date: target.meetingDate, status: "voting" };

  const dispatchFailure =
    target.infraError ??
    (target.result && !target.result.ok
      ? { code: target.result.code, message: target.result.error }
      : null);

  return { meeting, dispatchFailure, failedRecipients: [] };
}

/**
 * `failedRecipients` a `membersWithoutEmail` z `result.recipients`
 * (arch 9.1) — jen když `ok:true`; při `ok:false` se nic neposílalo, takže
 * obojí je prázdné (rule 3 v decideThursdayWarning stejně převezme dřív).
 */
function deriveWarningSignals(result: VotingDispatchResult | null): {
  failedRecipients: { memberName: string; reason: string }[];
  membersWithoutEmail: { memberName: string }[];
} {
  if (!result || !result.ok) {
    return { failedRecipients: [], membersWithoutEmail: [] };
  }

  const failedRecipients = result.recipients
    .filter((r) => r.outcome.status === "error")
    .map((r) => ({
      memberName: r.memberName,
      reason: r.outcome.status === "error" ? r.outcome.reason : "",
    }));

  const membersWithoutEmail = result.recipients
    .filter((r) => r.outcome.status === "skipped" && r.outcome.reason === "no-email")
    .map((r) => ({ memberName: r.memberName }));

  return { failedRecipients, membersWithoutEmail };
}

/**
 * Internal handler for /api/cron/close-voting
 *
 * Vercel Hobby: 1 cron job, runs once daily at 05:00 UTC.
 *   Summer (CEST, UTC+2): 05:00 UTC = 07:00 local — the intended 7:00 run.
 *   Winter (CET, UTC+1):  05:00 UTC = 06:00 local — DST drift, accepted (D6, vercel.json beze změny).
 *
 * Pořadí fází (arch iter-026 9.1, rozšířeno iter-028 arch 5.3) — POŘADÍ JE ZÁVAZNÉ:
 * Fáze 1  Zavřít vypršená hlasování.        MUSÍ BÝT PRVNÍ — uvolní guard
 *                                            "max jedna aktivní schůzka"
 *                                            (arch 2.5) dřív, než se cokoli
 *                                            aktivuje. Bez tohoto pořadí by
 *                                            27.8. hlasování ze 13.8. pořád
 *                                            blokovalo spuštění nové schůzky.
 * Fáze 2  Ranní rozeslání hlasovacích odkazů.  ZMĚNA iter-028 (T-005, arch
 *                                            3.4) — `thursday-autostart`
 *                                            (jen ve čtvrtek, jako dřív) i
 *                                            `deferred-send` (kterýkoli den,
 *                                            doslání běžícímu hlasování),
 *                                            oba `deliver:"now"`, deleguje
 *                                            na runVotingDispatch (jádro
 *                                            sdílené s tlačítkem
 *                                            StartVotingPanel).
 * Fáze 3  Varování management týmu.          ZMĚNA iter-028 (T-005, texty,
 *                                            D8) — i mimo čtvrtek při
 *                                            prvním rozeslání.
 * Fáze 4  Reporty za schůzky zavřené ve fázi 1.  Schválně až za fází 2 a 3
 *                                            — není časově kritické.
 * Fáze 5  Obnova expirujících členských tokenů (beze změny).
 * Fáze 6  Úklid auth_throttle (beze změny).
 * Fáze 7  Retence ops_event (iter-027 T-005, arch 10). Vlastní try/catch —
 *                                            stejný vzor jako fáze 6, pád
 *                                            retence nesmí shodit zbytek
 *                                            cronu.
 * Fáze 8  Připomínky (iter-028, T-006, arch 4.4, 5.3). NOVÁ, POSLEDNÍ,
 *                                            vlastní try/catch (F3 review
 *                                            T-002) — pád nesmí shodit nic
 *                                            před ní. Brzda rozpočtu (arch
 *                                            5.4, `shouldStopForBudget`)
 *                                            počítá od `t0` handleru, ne od
 *                                            začátku téhle fáze.
 *
 * iter-027 (T-005, arch 6.4): `runId = randomUUID()` sdílí jeden běh napříč
 * všemi fázemi (fáze 2 dostává stejné runId, viz runMorningDispatch).
 * Zápisy do ops_event jsou samostatné řádky vedle existujícího `console.*` —
 * žádná podmínka, žádný `return`, žádné pořadí fází se nemění (logOpsEvent
 * nikdy nevyhazuje, D2).
 *
 * Protected by CRON_SECRET — Vercel sends this header automatically for cron jobs.
 */
async function handler(request: NextRequest) {
  // iter-028 (T-006, arch 5.3, 5.4): t0 handleru — brzda rozpočtu fáze 8
  // (shouldStopForBudget) počítá od TOHOHLE okamžiku, ne od začátku fáze 8,
  // aby zaseklé volání dřív v běhu (Resend, DB) opravdu ubralo fázi 8 čas.
  const t0 = new Date();

  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // iter-027 (T-005, arch 6.1, 6.4): jeden běh = jedno spuštění cronu; runId
  // se předává i do fáze 2 (dispatch), aby nebyla samostatný běh.
  const runId = randomUUID();
  let seq = 0;
  const nextSeq = () => seq++;

  const today = todayInPrague();

  console.log(`close-voting cron: today=${today}`);

  await logOpsEvent({
    runId,
    seq: nextSeq(),
    source: "cron",
    kind: "cron.started",
    severity: "info",
    actor: "cron",
    message: `Cron close-voting spusten (today=${today}).`,
  });

  try {
    // ── Fáze 1: Zavřít vypršená hlasování — MUSÍ BÝT PRVNÍ ──
    const expiredMeetings = await getExpiredVotingMeetings();

    const closedIds: string[] = [];
    const closeErrors: string[] = [];

    for (const mtg of expiredMeetings) {
      try {
        await updateMeetingStatus(mtg.id, { status: "closed" });
        closedIds.push(mtg.id);
        await logOpsEvent({
          runId,
          seq: nextSeq(),
          source: "cron",
          kind: "meeting.closed",
          severity: "info",
          actor: "cron",
          meetingId: mtg.id,
          meetingDate: mtg.date,
          message: `Schuzka ${mtg.date} uzavrena (vyprsele hlasovani).`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to close meeting ${mtg.id}:`, msg);
        closeErrors.push(`close ${mtg.id}: ${msg}`);
        await logOpsEvent({
          runId,
          seq: nextSeq(),
          source: "cron",
          kind: "cron.phase-failed",
          severity: "error",
          actor: "cron",
          meetingId: mtg.id,
          meetingDate: mtg.date,
          code: "phase-1-close",
          message: msg,
        });
      }
    }

    if (closedIds.length > 0) {
      console.log(
        `close-voting cron: closed ${closedIds.length}/${expiredMeetings.length} meetings`
      );
    }

    // ── Fáze 2: Ranní rozeslání hlasovacích odkazů (iter-028, arch 3.4) ──
    // `runMorningDispatch` obaluje KAŽDÝ cíl vlastním try/catch (review
    // MAJOR-1, T-006r vzor) — tenhle vnější try/catch je jen pojistka pro
    // výjimku PŘED smyčkou (getMorningDispatchCandidates,
    // planMorningDispatch). Bez ní by taková chyba spadla až do vnějšího
    // catch celého handleru (dole) a fáze 3-7 by ten den neproběhly vůbec —
    // přesně ta třída selhání ("cron tiše neudělá nic"), kvůli které
    // iterace vznikla.
    let dispatch: MorningDispatchOutcome;
    try {
      dispatch = await runMorningDispatch(today, new Date(), runId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("close-voting cron: morning dispatch threw (infra error):", msg);
      const weekdayPrague = weekdayInPrague();
      dispatch = {
        weekdayPrague,
        todayPrague: today,
        // Chyba nastala PŘED zjištěním cílů — synteticky doplníme jen
        // čtvrteční cíl (stejně jako dřív, T-006r MAJOR-1), aby fáze 3
        // nehlásila zavádějící "no-meeting". Mimo čtvrtek zůstává tenhle pád
        // bez varování (D8 potřebuje konkrétní cíl, který tu chybí) —
        // zdokumentováno v handoffu jako známé omezení.
        targets:
          weekdayPrague === "Thursday"
            ? [
                {
                  meetingId: "",
                  meetingDate: today,
                  reason: "thursday-autostart",
                  action: "dispatched",
                  result: null,
                  infraError: { code: "infra-error", message: msg },
                },
              ]
            : [],
      };
    }

    // ── Fáze 3: Varování management týmu (arch 3.4, 7, 9.1) ──
    // Vlastní try/catch: pád odesílání varování nesmí shodit zbytek cronu
    // (arch 7.5), přesně jako u fáze 6 (throttle cleanup) níže.
    let warningResult: { sent?: number; skipped?: string; error?: string };
    try {
      const decision = decideThursdayWarning(await buildWarningInput(dispatch, today));
      if (decision.warn) {
        const sendResult = await sendVotingWarningEmail(decision.subject, decision.lines);
        warningResult = { sent: sendResult.sent, error: sendResult.error };
        await logOpsEvent({
          runId,
          seq: nextSeq(),
          source: "cron",
          kind: sendResult.error ? "warning.failed" : "warning.sent",
          severity: sendResult.error ? "error" : "info",
          actor: "cron",
          message: sendResult.error
            ? `Varovny mail selhal: ${sendResult.error}`
            : `Varovny mail odeslan (${sendResult.sent} prijemcu).`,
          detail: { sent: sendResult.sent, recipients: sendResult.recipients.length },
        });
      } else {
        warningResult = { sent: 0, skipped: decision.reason };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("close-voting cron: thursday warning failed:", msg);
      warningResult = { sent: 0, error: msg };
      await logOpsEvent({
        runId,
        seq: nextSeq(),
        source: "cron",
        kind: "warning.failed",
        severity: "error",
        actor: "cron",
        message: msg,
      });
    }

    // ── Fáze 4: Report pro každou nově zavřenou schůzku (z fáze 1) ──
    const reportResults: { meetingId: string; sent: number; error?: string }[] = [];

    for (const meetingId of closedIds) {
      try {
        const result = await sendReport(meetingId);
        reportResults.push({
          meetingId,
          sent: result.sent,
          error: result.error,
        });
        if (result.error) {
          console.error(`Report for meeting ${meetingId} failed:`, result.error);
        }
        await logOpsEvent({
          runId,
          seq: nextSeq(),
          source: "cron",
          kind: result.error ? "report.failed" : "report.sent",
          severity: result.error ? "error" : "info",
          actor: "cron",
          meetingId,
          message: result.error
            ? `Report selhal: ${result.error}`
            : `Report odeslan (${result.sent} prijemcu).`,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Report for meeting ${meetingId} error:`, msg);
        reportResults.push({ meetingId, sent: 0, error: msg });
        await logOpsEvent({
          runId,
          seq: nextSeq(),
          source: "cron",
          kind: "report.failed",
          severity: "error",
          actor: "cron",
          meetingId,
          message: msg,
        });
      }
    }

    // Token expiry for meeting_member_link is enforced at verification time — no active cleanup needed.

    // ── Fáze 5: Renew expiring tokens ──
    const tokenRenewalResult = await renewExpiringTokens();

    // ── Fáze 6: stale auth_throttle row cleanup ──
    // Best-effort, sequential DELETE (no db.transaction() — LL-003). Own
    // try/catch so a failure here never fails the cron's main logic above.
    try {
      await cleanupStaleThrottleRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("close-voting cron: throttle cleanup failed:", msg);
    }

    // ── Fáze 7 (nová, iter-027 T-005, arch 10): retence ops_event ──
    // Vlastní try/catch, stejný vzor jako fáze 6 — pád úklidu nesmí shodit
    // zbytek cronu. Nula smazaných se nezapisuje (10.2), ať stránka
    // nezarůstá šumem.
    let retentionResult: { purged: number; error?: string } = { purged: 0 };
    try {
      const purged = await purgeOldOpsEvents(retentionCutoff(new Date()));
      retentionResult = { purged };
      if (purged > 0) {
        await logOpsEvent({
          runId,
          seq: nextSeq(),
          source: "cron",
          kind: "retention.purged",
          severity: "info",
          actor: "cron",
          message: `Retence: smazano ${purged} starych zaznamu z ops_event.`,
          detail: { purged },
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("close-voting cron: ops_event retention failed:", msg);
      retentionResult = { purged: 0, error: msg };
    }

    // ── Fáze 8 (nová, iter-028 T-006, arch 4.4, 5.3): připomínky ──
    // POSLEDNÍ fáze cronu, vlastní try/catch (F3 review T-002, 13.2 bod 9)
    // — pád nesmí shodit žádnou fázi před ní (uzavření, odkazy, varování,
    // reporty jsou hotové dřív). Brzda rozpočtu uvnitř `runReminders` počítá
    // od `t0` handleru, ne od začátku týhle fáze (arch 5.4). Chyba jde do
    // `remindersError`, a tím i do `anyPhaseError` (F3) — `cron.finished`
    // dostane `severity: warn`. Jednotlivá selhání odeslání
    // (`reminder.failed`) tam NEpatří, stejně jako u dispatche — ta řeší
    // `partial` v run-status.ts (arch 7).
    let remindersResult: ReminderRunResult | null = null;
    let remindersError: string | undefined;
    try {
      remindersResult = await runReminders(runId, nextSeq, t0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("close-voting cron: reminders phase failed:", msg);
      remindersError = msg;
      await logOpsEvent({
        runId,
        seq: nextSeq(),
        source: "cron",
        kind: "cron.phase-failed",
        severity: "error",
        actor: "cron",
        code: "phase-8-reminders",
        message: msg,
      });
    }

    const anyPhaseError =
      closeErrors.length > 0 ||
      dispatch.targets.some((t) => !!t.infraError || (t.result !== null && !t.result.ok)) ||
      !!warningResult.error ||
      reportResults.some((r) => !!r.error) ||
      !!(tokenRenewalResult.errors && tokenRenewalResult.errors.length > 0) ||
      !!retentionResult.error ||
      !!remindersError;

    await logOpsEvent({
      runId,
      seq: nextSeq(),
      source: "cron",
      kind: "cron.finished",
      severity: anyPhaseError ? "warn" : "info",
      actor: "cron",
      message: "Cron close-voting dokoncen.",
      detail: {
        closed: closedIds.length,
        // iter-028 (T-005, arch 7): pole cílů ranního rozeslání — i "žádný
        // cíl dnes" (prázdné pole) je platný, dohledatelný výsledek.
        dispatch: dispatch.targets.map((t) => ({
          meetingDate: t.meetingDate,
          reason: t.reason,
          action: t.action,
        })),
        warningSent: warningResult.sent ?? 0,
        reportsSent: reportResults.length,
        retentionPurged: retentionResult.purged,
        // iter-028 (T-006, arch 12): nested pod vlastním klíčem, ne na první
        // úrovni — `sent`/`error`/`totalMembers` na první úrovni by si
        // `isDispatchFinishedDetail` (lib/ops/run-status.ts) spletlo
        // s dispatchem (13.2 bod 13).
        reminders: remindersResult
          ? {
              ran: remindersResult.ran,
              round: remindersResult.round ?? null,
              eligible: remindersResult.eligible,
              sent: remindersResult.sent,
              failed: remindersResult.failed,
              claimRejected: remindersResult.claimRejected,
              budgetStopped: remindersResult.budgetStopped,
            }
          : null,
      },
    });

    return NextResponse.json({
      closed: closedIds.length,
      closedIds: closedIds.length > 0 ? closedIds : undefined,
      dispatch: {
        weekday: dispatch.weekdayPrague,
        targets: dispatch.targets.map((t) => ({
          meetingId: t.meetingId,
          meetingDate: t.meetingDate,
          reason: t.reason,
          action: t.action,
          result: t.result,
          infraError: t.infraError,
        })),
      },
      warning: warningResult,
      reports: reportResults.length > 0 ? reportResults : undefined,
      tokenRenewal: tokenRenewalResult,
      retention: retentionResult,
      reminders: remindersResult ?? undefined,
      remindersError,
      errors: closeErrors.length > 0 ? closeErrors : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("close-voting cron error:", error);
    await logOpsEvent({
      runId,
      seq: nextSeq(),
      source: "cron",
      kind: "cron.failed",
      severity: "error",
      actor: "cron",
      message: msg,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Renew magic tokens expiring within the next 24 hours.
 * Integrated into close-voting because Vercel Hobby has a 1 cron job limit.
 */
async function renewExpiringTokens(): Promise<{
  renewed: number;
  errors?: string[];
}> {
  try {
    const members = await getMembers();
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 3600 * 1000);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const expiringMembers = members.filter((m) => {
      if (m.managementRole) return false;
      if (!m.tokenExpiresAt) return false;
      if (m.tokenUsed) return false;
      return m.tokenExpiresAt < oneDayFromNow && m.tokenExpiresAt > now;
    });

    if (expiringMembers.length === 0) {
      return { renewed: 0 };
    }

    const renewed: string[] = [];
    const errors: string[] = [];

    for (const m of expiringMembers) {
      try {
        const newRawToken = await generateMagicToken(m.id);
        const magicLink = `${appUrl}/api/auth/magic?token=${newRawToken}`;

        if (m.email) {
          const emailResult = await sendMagicLinkEmail(
            m.email,
            magicLink,
            m.name
          );
          if (!emailResult.success) {
            errors.push(`${m.id}: email failed - ${emailResult.error}`);
            continue;
          }
        }

        renewed.push(m.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${m.id}: ${msg}`);
      }
    }

    if (renewed.length > 0) {
      console.log(
        `token renewal: renewed ${renewed.length}/${expiringMembers.length}`
      );
    }

    return {
      renewed: renewed.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Token renewal error:", msg);
    return { renewed: 0, errors: [msg] };
  }
}

/** Vercel cron sends GET requests. */
export async function GET(request: NextRequest) {
  return handler(request);
}

/** Keep POST for manual/programmatic invocation. */
export async function POST(request: NextRequest) {
  return handler(request);
}
