import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getExpiredVotingMeetings } from "@/lib/db/queries/votes";
import { getMeetingByDate, updateMeetingStatus } from "@/lib/db/queries/meetings";
import { sendReport, sendMagicLinkEmail, sendVotingWarningEmail } from "@/lib/email/resend";
import { getMembers } from "@/lib/db/queries/members";
import { generateMagicToken } from "@/lib/auth/magic";
import { weekdayInPrague, todayInPrague } from "@/lib/meetings/voting-window";
import { runVotingDispatch, type VotingDispatchResult } from "@/lib/meetings/voting-dispatch";
import { decideThursdayWarning, type WarningInput } from "@/lib/meetings/warning-plan";
import { cleanupStaleThrottleRows } from "@/lib/auth/throttle";
import { logOpsEvent } from "@/lib/ops/event-log";
import { retentionCutoff } from "@/lib/ops/retention";
import { purgeOldOpsEvents } from "@/lib/db/queries/ops-events";

// Fáze 2 (dispatch) je při 27 členech ~15s (regenerate + Resend + 250ms pauza
// na člena, arch iter-026 9.2). Vercel Hobby default limit funkce (10s) by to
// oříznul. maxDuration = 60 je strop Hobby plánu.
export const maxDuration = 60;

/**
 * Fáze 2: ve čtvrtek (Europe/Prague) spustí runVotingDispatch pro schůzku
 * naplánovanou na dnešek, v libovolném stavu draft/active/voting (E1, arch
 * 15.1) — cron sám aktivuje i schůzku, kterou nikdo nepřipravil.
 *
 * getMeetingByDate nefiltruje na stav — filtr je až uvnitř
 * runVotingDispatch. Schůzku ve stavu closed fáze 2 pozná a odmítne guardem
 * "meeting-closed", ne tím, že by ji nenašla — "nenašel jsem nic" (žádná
 * schůzka na dnešek) a "našel jsem a nesmím" (guard padl) jsou dvě různé
 * věci a musí zůstat rozeznatelné pro fázi 3 (varování, T-006).
 *
 * Návratová hodnota se NEZAHAZUJE — `result` (ok:true i ok:false) je přesně
 * to, co T-006 potřebuje předat do decideThursdayWarning jako
 * dispatchFailure / failedRecipients / membersWithoutEmail (arch 2.6.1, 3.4,
 * 9.1). Tenhle návratový typ je ten hook point.
 */
export interface ThursdayDispatchOutcome {
  weekday: string;
  ranDispatch: boolean;
  meetingId: string | null;
  result: VotingDispatchResult | null;
  /**
   * Vyplněno JEN když `runThursdayDispatch()` samotná vyhodila výjimku —
   * skutečná infra chyba mimo pět guard kódů (voting-dispatch.ts hlavička,
   * odchylka 5 handoffu T-005), zachycená a syntetizovaná na úrovni cronu
   * (`handler()`, review MAJOR-1, T-006r). `result` v tom případě zůstává
   * `null` — nejde o žádný z pěti guardů, `runVotingDispatch` nevrátila nic.
   */
  infraError?: { code: "infra-error"; message: string };
}

async function runThursdayDispatch(
  today: string,
  runId: string
): Promise<ThursdayDispatchOutcome> {
  const weekday = weekdayInPrague();
  if (weekday !== "Thursday") {
    return { weekday, ranDispatch: false, meetingId: null, result: null };
  }

  const mtg = await getMeetingByDate(today);
  if (!mtg) {
    return { weekday, ranDispatch: false, meetingId: null, result: null };
  }

  // iter-027 (T-005, arch 6.1): cron předává svoje runId, aby fáze 2 nebyla
  // samostatný běh — všechny události dispatche sdílejí runId s cron.started.
  const result = await runVotingDispatch(mtg.id, { mode: "start", actor: "cron", runId });

  if (result.ok) {
    console.log(
      `thursday-dispatch: meeting=${mtg.id} statusBefore=${result.statusBefore} ` +
        `statusAfter=${result.statusAfter} sent=${result.counts.sent} ` +
        `skipped=${result.counts.skipped} errors=${result.counts.error}`
    );
  } else {
    console.error(`thursday-dispatch: meeting=${mtg.id} guard failed code=${result.code}: ${result.error}`);
  }

  return { weekday, ranDispatch: true, meetingId: mtg.id, result };
}

/**
 * Sestaví `WarningInput` (arch iter-026 3.4) z `ThursdayDispatchOutcome`
 * fáze 2 (iter-026, T-006). Nesahá na `runVotingDispatch` ani na
 * `voting-dispatch.ts` — jen z návratové hodnoty fáze 2 (včetně
 * `infraError`, T-006r, MAJOR-1) odvozuje, co `decideThursdayWarning`
 * potřebuje.
 *
 * `dispatch.infraError` má přednost před `dispatch.result` — obojí najednou
 * nikdy nenastane (buď `runThursdayDispatch()` vrátila `result`, nebo
 * vyhodila výjimku a handler() ji nahradil `infraError`), ale `??` dává
 * najevo, že jde o dvě alternativní cesty ke stejnému poli, ne o prioritu.
 */
async function buildWarningInput(
  dispatch: ThursdayDispatchOutcome,
  today: string
): Promise<WarningInput> {
  const meeting = await resolveWarningMeeting(dispatch, today);
  const { failedRecipients, membersWithoutEmail } = deriveWarningSignals(dispatch.result);

  return {
    weekdayPrague: dispatch.weekday,
    todayIso: today,
    meeting,
    dispatchFailure:
      dispatch.infraError ??
      (dispatch.result && !dispatch.result.ok
        ? { code: dispatch.result.code, message: dispatch.result.error }
        : null),
    failedRecipients,
    membersWithoutEmail,
  };
}

/**
 * Stav schůzky PO fázi 2 pro WarningInput.meeting.
 *
 * Když `dispatch.result.ok === true`, stav je přímo v něm (meetingId,
 * meetingDate, statusAfter) — žádný extra dotaz.
 *
 * Když guard padl (`ok:false`), `VotingDispatchResult` nese jen `code` a
 * `error`, ne datum/stav schůzky (guard padl PŘED jakýmkoli zápisem, takže
 * stav je nezměněný, ale tahle informace se nikam nepropsala). Nejjednodušší
 * a nejspolehlivější je stav čerstvě dotáhnout přes `getMeetingByDate` — ta
 * samá funkce, kterou už fáze 2 volala, nulté rozšiřování
 * `ThursdayDispatchOutcome` (T-005, nesahat). `date` vychází vždy na
 * `today`, protože `getMeetingByDate(today)` ve fázi 2 vrátila právě tuhle
 * schůzku.
 *
 * `dispatch.infraError` (T-006r, MAJOR-1) je stejný případ jako `ok:false`
 * — nezná datum/stav — ale navíc nemusí znát ani `meetingId` (výjimka mohla
 * padnout uvnitř `runThursdayDispatch()` ještě dřív, než se `mtg` stihla
 * dosadit). Proto se `getMeetingByDate` zkouší i bez `meetingId`, dokud je
 * `infraError` nastaven — je to ta samá idempotentní funkce, žádné nové
 * riziko, jen druhý pokus o dotaz, který mohl (transientně) selhat poprvé.
 */
async function resolveWarningMeeting(
  dispatch: ThursdayDispatchOutcome,
  today: string
): Promise<{ id: string; date: string; status: string } | null> {
  if (!dispatch.ranDispatch) return null; // není čtvrtek, nebo žádná schůzka na dnešek

  if (dispatch.result && dispatch.result.ok) {
    return {
      id: dispatch.result.meetingId,
      date: dispatch.result.meetingDate,
      status: dispatch.result.statusAfter,
    };
  }

  if (!dispatch.meetingId && !dispatch.infraError) return null;
  const row = await getMeetingByDate(today);
  return row ? { id: row.id, date: row.date, status: row.status } : null;
}

/**
 * `failedRecipients` a `membersWithoutEmail` z `dispatch.result.recipients`
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
 *   Summer (CEST, UTC+2): 05:00 UTC = 07:00 local — the intended Thursday 7:00 run.
 *   Winter (CET, UTC+1):  05:00 UTC = 06:00 local — DST drift, accepted (no comments in vercel.json).
 *
 * Pořadí fází (arch iter-026 9.1) — POŘADÍ JE ZÁVAZNÉ:
 * Fáze 1  Zavřít vypršená hlasování.        MUSÍ BÝT PRVNÍ — uvolní guard
 *                                            "max jedna aktivní schůzka"
 *                                            (arch 2.5) dřív, než se cokoli
 *                                            aktivuje. Bez tohoto pořadí by
 *                                            27.8. hlasování ze 13.8. pořád
 *                                            blokovalo spuštění nové schůzky.
 * Fáze 2  Spuštění hlasování na dnešek.      Jen ve čtvrtek, deleguje na
 *                                            runVotingDispatch (jádro sdílené
 *                                            s tlačítkem StartVotingPanel).
 * Fáze 3  Varování management týmu.          T-006 (nesahat, mimo scope T-005).
 * Fáze 4  Reporty za schůzky zavřené ve fázi 1.  Schválně až za fází 2 (a
 *                                            budoucí fází 3) — není časově
 *                                            kritické.
 * Fáze 5  Obnova expirujících členských tokenů (beze změny).
 * Fáze 6  Úklid auth_throttle (beze změny).
 * Fáze 7  Retence ops_event (nová, iter-027 T-005, arch 10). Vlastní
 *                                            try/catch — stejný vzor jako
 *                                            fáze 6, pád retence nesmí
 *                                            shodit zbytek cronu.
 *
 * iter-027 (T-005, arch 6.4): `runId = randomUUID()` sdílí jeden běh napříč
 * všemi fázemi (fáze 2 dostává stejné runId, viz runThursdayDispatch).
 * Zápisy do ops_event jsou samostatné řádky vedle existujícího `console.*` —
 * žádná podmínka, žádný `return`, žádné pořadí fází se nemění (logOpsEvent
 * nikdy nevyhazuje, D2).
 *
 * Protected by CRON_SECRET — Vercel sends this header automatically for cron jobs.
 */
async function handler(request: NextRequest) {
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

    // ── Fáze 2: Spuštění hlasování na dnešek (jen čtvrtek), deleguje na jádro ──
    // Vlastní try/catch (review MAJOR-1, T-006r): `runVotingDispatch` uvnitř
    // `runThursdayDispatch` záměrně propouští skutečnou infra chybu (DB
    // nedostupná mimo pět guard kódů, viz voting-dispatch.ts hlavička) jako
    // výjimku. Bez tohodle try/catch by taková výjimka spadla až do
    // vnějšího catch celého handleru (dole) a fáze 3-6 by ten den
    // neproběhly vůbec — přesně ta třída selhání ("cron tiše neudělá nic"),
    // kvůli které iterace vznikla. Nesahá na voting-dispatch.ts (2.2/2.3) —
    // jen zachycuje výjimku na úrovni cronu a syntetizuje náhradní stav, se
    // kterým dál pracuje fáze 3 (decideThursdayWarning, pravidlo
    // dispatch-failed).
    let dispatch: ThursdayDispatchOutcome;
    try {
      dispatch = await runThursdayDispatch(today, runId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("close-voting cron: thursday dispatch threw (infra error):", msg);
      dispatch = {
        weekday: weekdayInPrague(),
        ranDispatch: true,
        meetingId: null,
        result: null,
        infraError: { code: "infra-error", message: msg },
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

    const anyPhaseError =
      closeErrors.length > 0 ||
      !!dispatch.infraError ||
      (dispatch.result !== null && !dispatch.result.ok) ||
      !!warningResult.error ||
      reportResults.some((r) => !!r.error) ||
      !!(tokenRenewalResult.errors && tokenRenewalResult.errors.length > 0) ||
      !!retentionResult.error;

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
        dispatchRan: dispatch.ranDispatch,
        warningSent: warningResult.sent ?? 0,
        reportsSent: reportResults.length,
        retentionPurged: retentionResult.purged,
      },
    });

    return NextResponse.json({
      closed: closedIds.length,
      closedIds: closedIds.length > 0 ? closedIds : undefined,
      dispatch: {
        weekday: dispatch.weekday,
        ranDispatch: dispatch.ranDispatch,
        meetingId: dispatch.meetingId,
        result: dispatch.result,
        infraError: dispatch.infraError,
      },
      warning: warningResult,
      reports: reportResults.length > 0 ? reportResults : undefined,
      tokenRenewal: tokenRenewalResult,
      retention: retentionResult,
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
