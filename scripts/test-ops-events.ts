/**
 * Testy pro lib/ops/* (iter-027, T-005 + T-006 + T-005r) — arch iter-027
 * T-001, sekce 12.
 *
 * Bez DATABASE_URL, bez sítě, bez CI — vzor je scripts/test-warning-plan.ts.
 * Spuštění: npm run test:ops-events
 *
 * Pokrývá VŠECH 24 případů ze sekce 12 (NIT-2, souvislé číslování) plus 2
 * případy 25-26 (T-005r, review T-007 MAJOR-1, `safeDispatchOutcomeEvent`).
 * 1 až 12 a 22 až 24 napsal T-005; 13 až 21 (`deriveRunStatus`,
 * `mapResendStatus`) doplnil T-006, jakmile moduly, na kterých stojí,
 * existovaly; 25-26 doplnil T-005r po code review.
 *
 * Ověření "bez DB": tenhle skript NEVOLÁ `dotenv.config()` a `DATABASE_URL`
 * není v prostředí nastavené (ověřeno při psaní testu) — přesto proběhne
 * zeleně. Testované čisté moduly (lib/ops/redact.ts, event-shape.ts,
 * dispatch-events.ts, retention.ts, run-status.ts, resend-status.ts)
 * neimportují drizzle-orm, next ani resend vůbec — jen
 * `lib/ops/event-log.ts` (case 22) importuje DB vrstvu
 * (lib/db/queries/ops-events.ts), a i tam se v testu použije injektovaný
 * `deps.write`, takže se `insertOpsEvent`/`getSql()` nikdy nezavolá. Import
 * `../lib/auth/meeting-magic` (case 1, 3, 4) taky transitivně importuje
 * drizzle, ale volá se jen jeho čistá `buildMeetingMagicUrl` — žádné DB
 * volání neproběhne, protože se nikdy nezavolá.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildMeetingMagicUrl } from "../lib/auth/meeting-magic";
import { buildOpsEvent } from "../lib/ops/event-shape";
import { logOpsEvent } from "../lib/ops/event-log";
import {
  dispatchOutcomeEvent,
  recipientEvent,
  safeDispatchOutcomeEvent,
} from "../lib/ops/dispatch-events";
import { retentionCutoff, OPS_EVENT_RETENTION_DAYS } from "../lib/ops/retention";
import { deriveRunStatus, type RunStatusEvent } from "../lib/ops/run-status";
import { mapResendStatus } from "../lib/ops/resend-status";
import type {
  DispatchRecipient,
  VotingDispatchResult,
} from "../lib/meetings/voting-dispatch";

function recipient(
  outcome: DispatchRecipient["outcome"],
  overrides: Partial<DispatchRecipient> = {}
): DispatchRecipient {
  return {
    memberId: "member-1",
    memberName: "Jan Novak",
    memberEmail: "jan@example.com",
    linkCreated: false,
    outcome,
    ...overrides,
  };
}

const dispatchCtx = {
  runId: "run-1",
  seq: 1,
  actor: "cron",
  source: "cron" as const,
  meetingId: "meeting-1",
  meetingDate: "2026-08-27",
};

function okResult(
  counts: { sent: number; skipped: number; error: number },
  totalMembers: number
): VotingDispatchResult {
  return {
    ok: true,
    meetingId: "meeting-1",
    meetingDate: "2026-08-27",
    mode: "start",
    statusBefore: "active",
    statusAfter: "voting",
    transitioned: true,
    votingClosesAt: new Date().toISOString(),
    linkExpiresAt: new Date().toISOString(),
    totalMembers,
    linksCreated: 0,
    counts,
    recipients: [],
    errors: [],
  };
}

function failResult(
  code: "not-found" | "meeting-closed" | "conflict" | "no-guests" | "no-recipients",
  error: string
): VotingDispatchResult {
  return { ok: false, code, error };
}

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const cases: TestCase[] = [
  {
    name: "1. message se skutecnou magic URL (buildMeetingMagicUrl) -> bez podretezce tokenu",
    run: () => {
      const rawToken = randomUUID();
      const magicUrl = buildMeetingMagicUrl(rawToken);
      const row = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "dispatch.failed",
        severity: "error",
        message: `email send failed: fetch ${magicUrl} timed out`,
      });
      assert.doesNotMatch(row.message, new RegExp(rawToken));
      assert.match(row.message, /\/m\/\[token\]/);
    },
  },
  {
    name: "2. message s token=... parametrem a s re_ prefixem API klice -> oba tvary redigovany",
    run: () => {
      const rowToken = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "dispatch.failed",
        severity: "error",
        message: "fetch failed: https://api.example.com/verify?token=aB3dEf9012345 timed out",
      });
      assert.doesNotMatch(rowToken.message, /token=aB3dEf9012345/);
      assert.match(rowToken.message, /token=\[redacted\]/);

      const rowKey = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "dispatch.failed",
        severity: "error",
        message: "Resend error: invalid key re_abc1234567890XYZ",
      });
      assert.doesNotMatch(rowKey.message, /re_abc1234567890XYZ/);
      assert.match(rowKey.message, /\[api-key\]/);
    },
  },
  {
    name: "3. detail s tokenem uvnitr -> stale platny JSON, bez tokenu",
    run: () => {
      const rawToken = randomUUID();
      const magicUrl = buildMeetingMagicUrl(rawToken);
      const row = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "dispatch.failed",
        severity: "error",
        message: "chyba",
        detail: { note: `link byl ${magicUrl}`, other: 42 },
      });
      assert.ok(row.detail);
      const serialized = JSON.stringify(row.detail);
      assert.doesNotMatch(serialized, new RegExp(rawToken));
      assert.doesNotThrow(() => JSON.parse(serialized));
      assert.equal((row.detail as Record<string, unknown>).other, 42);
    },
  },
  {
    name: "4. redakce probehne pred zkracenim -> ani sedmiznakovy fragment tokenu neunikne",
    run: () => {
      const rawToken = randomUUID();
      const magicUrl = buildMeetingMagicUrl(rawToken);
      const padding = "a".repeat(480);
      const row = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "dispatch.failed",
        severity: "error",
        message: `${padding} ${magicUrl}`,
      });
      for (let i = 0; i + 7 <= rawToken.length; i += 7) {
        const fragment = rawToken.slice(i, i + 7);
        assert.ok(!row.message.includes(fragment), `fragment "${fragment}" unikl do logu`);
      }
    },
  },
  {
    name: "5. message 10 kB -> 500 znaku bez padu; detail 8 kB -> {truncated:true}, ne useknuty JSON",
    run: () => {
      const rowMessage = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "dispatch.failed",
        severity: "error",
        message: "a".repeat(10000),
      });
      assert.equal(rowMessage.message.length, 500);

      const rowDetail = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "dispatch.failed",
        severity: "error",
        message: "chyba",
        detail: { blob: "x".repeat(8000) },
      });
      assert.ok(rowDetail.detail);
      const detail = rowDetail.detail as Record<string, unknown>;
      assert.equal(detail.truncated, true);
      assert.ok(typeof detail.bytes === "number" && detail.bytes > 4096);
      // musí to být platný JSON, ne useknutý řez
      assert.doesNotThrow(() => JSON.parse(JSON.stringify(rowDetail.detail)));
    },
  },
  {
    name: "6. recipientEvent {status:sent, resendId} -> kind=email.sent, id se prenese",
    run: () => {
      const row = recipientEvent(recipient({ status: "sent", resendId: "re_x" }), dispatchCtx);
      assert.equal(row.kind, "email.sent");
      assert.equal(row.resendEmailId, "re_x");
    },
  },
  {
    name: "7. recipientEvent {status:skipped, reason:no-email} -> kind=email.skipped, code, info, ceska veta se jmenem",
    run: () => {
      const row = recipientEvent(
        recipient({ status: "skipped", reason: "no-email" }),
        dispatchCtx
      );
      assert.equal(row.kind, "email.skipped");
      assert.equal(row.code, "no-email");
      assert.equal(row.severity, "info");
      assert.match(row.message, /Jan Novak/);
    },
  },
  {
    name: "8. recipientEvent {status:error, reason} -> kind=email.failed, severity=error, duvod ve zprave",
    run: () => {
      const row = recipientEvent(
        recipient({ status: "error", reason: "email send failed: 422 invalid recipient" }),
        dispatchCtx
      );
      assert.equal(row.kind, "email.failed");
      assert.equal(row.severity, "error");
      assert.match(row.message, /422 invalid recipient/);
    },
  },
  {
    name: "9. dispatchOutcomeEvent {ok:false, code:no-guests} -> dispatch.guard-failed, ceska hlaska",
    run: () => {
      const row = dispatchOutcomeEvent(
        failResult("no-guests", "Hlasovani nelze spustit, schuzka nema zadneho hosta."),
        { runId: "run-1", seq: 2, actor: "cron", source: "cron", requestedMeetingId: "meeting-1" }
      );
      assert.equal(row.kind, "dispatch.guard-failed");
      assert.match(row.message, /Hlasovani nelze spustit, schuzka nema zadneho hosta\./);
      assert.doesNotMatch(row.message.toLowerCase(), /neco se nepovedlo/);
    },
  },
  {
    name: "10. dispatchOutcomeEvent ok:true 25 sent / 2 error z 27 -> severity=warn, zprava obsahuje 25 z 27",
    run: () => {
      const row = dispatchOutcomeEvent(okResult({ sent: 25, skipped: 0, error: 2 }, 27), {
        runId: "run-1",
        seq: 3,
        actor: "cron",
        source: "cron",
        requestedMeetingId: "meeting-1",
      });
      assert.equal(row.severity, "warn");
      assert.match(row.message, /25 z 27/);
    },
  },
  {
    name: "11. dispatchOutcomeEvent ok:true 27 sent (0 chyb) -> severity=info",
    run: () => {
      const row = dispatchOutcomeEvent(okResult({ sent: 27, skipped: 0, error: 0 }, 27), {
        runId: "run-1",
        seq: 4,
        actor: "cron",
        source: "cron",
        requestedMeetingId: "meeting-1",
      });
      assert.equal(row.severity, "info");
    },
  },
  {
    name: "12. dispatchOutcomeEvent {ok:false, code:not-found} -> meetingId undefined, id v detail.requestedMeetingId (MAJOR-1)",
    run: () => {
      const row = dispatchOutcomeEvent(failResult("not-found", "Schuzka nebyla nalezena."), {
        runId: "run-1",
        seq: 1,
        actor: "cron",
        source: "cron",
        requestedMeetingId: "ghost-id",
      });
      assert.equal(row.meetingId, undefined);
      assert.deepEqual(row.detail, { requestedMeetingId: "ghost-id" });
    },
  },
  {
    name: "13. deriveRunStatus: started + finished -> ok",
    run: () => {
      const start = new Date("2026-08-22T05:00:00Z");
      const events: RunStatusEvent[] = [
        { kind: "dispatch.started", message: "Spusteni hlasovani zahajeno.", detail: null, occurredAt: start },
        {
          kind: "dispatch.finished",
          message: "Hlasovaci odkazy rozeslany vsem 27 clenum.",
          detail: { sent: 27, skipped: 0, error: 0, totalMembers: 27 },
          occurredAt: new Date(start.getTime() + 60_000),
        },
      ];
      const now = new Date(start.getTime() + 120_000);
      const status = deriveRunStatus(events, now);
      assert.equal(status.state, "ok");
    },
  },
  {
    name: "14. deriveRunStatus: jen started, now = start + 30 min -> stalled (detektor 13. 8.)",
    run: () => {
      const start = new Date("2026-08-13T05:00:00Z");
      const events: RunStatusEvent[] = [
        { kind: "dispatch.started", message: "Spusteni hlasovani zahajeno.", detail: null, occurredAt: start },
      ];
      const now = new Date(start.getTime() + 30 * 60_000);
      const status = deriveRunStatus(events, now);
      assert.equal(status.state, "stalled");
    },
  },
  {
    name: "15. deriveRunStatus: started + dispatch.failed, now = start + 30 min -> failed, NENI stalled (MAJOR-2)",
    run: () => {
      const start = new Date("2026-08-20T05:00:00Z");
      const events: RunStatusEvent[] = [
        { kind: "dispatch.started", message: "Spusteni hlasovani zahajeno.", detail: null, occurredAt: start },
        {
          kind: "dispatch.failed",
          message: "connection terminated unexpectedly",
          detail: { requestedMeetingId: "meeting-1" },
          occurredAt: new Date(start.getTime() + 5_000),
        },
      ];
      const now = new Date(start.getTime() + 30 * 60_000);
      const status = deriveRunStatus(events, now);
      assert.equal(status.state, "failed");
      assert.notEqual(status.state, "stalled");
    },
  },
  {
    name: "16. deriveRunStatus: jen started, now = start + 2 min -> running",
    run: () => {
      const start = new Date("2026-08-22T05:00:00Z");
      const events: RunStatusEvent[] = [
        { kind: "cron.started", message: "Cron zahajen.", detail: null, occurredAt: start },
      ];
      const now = new Date(start.getTime() + 2 * 60_000);
      const status = deriveRunStatus(events, now);
      assert.equal(status.state, "running");
    },
  },
  {
    name: "17. deriveRunStatus: started + finished + jeden email.failed -> partial",
    run: () => {
      const start = new Date("2026-08-22T05:00:00Z");
      const events: RunStatusEvent[] = [
        { kind: "dispatch.started", message: "Spusteni hlasovani zahajeno.", detail: null, occurredAt: start },
        {
          kind: "email.failed",
          message: "Odeslani selhalo: Jan Novak - 422 invalid recipient",
          detail: null,
          occurredAt: new Date(start.getTime() + 10_000),
        },
        {
          kind: "dispatch.finished",
          message: "Hlasovaci odkazy rozeslany: 25 z 27 clenu, 2 chyb, 0 preskoceno.",
          detail: { sent: 25, skipped: 0, error: 2, totalMembers: 27 },
          occurredAt: new Date(start.getTime() + 60_000),
        },
      ];
      const now = new Date(start.getTime() + 120_000);
      const status = deriveRunStatus(events, now);
      assert.equal(status.state, "partial");
      assert.match(status.label, /25 z 27/);
    },
  },
  {
    name: "18. deriveRunStatus: prazdne pole -> nespadne, unknown",
    run: () => {
      const status = deriveRunStatus([], new Date());
      assert.equal(status.state, "unknown");
    },
  },
  {
    name: "19. mapResendStatus({last_event:queued}) -> terminal=false",
    run: () => {
      const status = mapResendStatus({ last_event: "queued" });
      assert.equal(status.state, "queued");
      assert.equal(status.terminal, false);
    },
  },
  {
    name: "20. mapResendStatus pro delivered a pro bounced -> terminal=true, cesky, severity",
    run: () => {
      const delivered = mapResendStatus({ last_event: "delivered" });
      assert.equal(delivered.terminal, true);
      assert.equal(delivered.label, "Doruceno");

      const bounced = mapResendStatus({ last_event: "bounced" });
      assert.equal(bounced.terminal, true);
      assert.equal(bounced.severity, "error");
    },
  },
  {
    name: "21. mapResendStatus(null) a mapResendStatus({}) -> unknown, terminal=false, nespadne",
    run: () => {
      assert.doesNotThrow(() => mapResendStatus(null));
      const fromNull = mapResendStatus(null);
      assert.equal(fromNull.state, "unknown");
      assert.equal(fromNull.terminal, false);

      const fromEmpty = mapResendStatus({});
      assert.equal(fromEmpty.state, "unknown");
      assert.equal(fromEmpty.terminal, false);
    },
  },
  {
    name: "22. logOpsEvent s write() co vraci rejected promise -> resolvne false, nevyhodi (D2)",
    run: async () => {
      const ok = await logOpsEvent(
        {
          runId: "run-1",
          seq: 0,
          source: "cron",
          kind: "cron.started",
          severity: "info",
          message: "test",
        },
        { write: () => Promise.reject(new Error("boom")) }
      );
      assert.equal(ok, false);
    },
  },
  {
    name: "23. retentionCutoff(2026-08-22T05:00:00Z) -> presne 180 dni zpet, bez posunu o den",
    run: () => {
      const now = new Date("2026-08-22T05:00:00Z");
      const cutoff = retentionCutoff(now);
      const expected = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      assert.equal(cutoff.getTime(), expected.getTime());
      assert.equal(OPS_EVENT_RETENTION_DAYS, 180);
    },
  },
  {
    name: "24. buildOpsEvent s memberId:null a vyplnenym memberName -> radek smazaneho clena zustane citelny",
    run: () => {
      const row = buildOpsEvent({
        runId: "r",
        seq: 0,
        source: "gui",
        kind: "email.sent",
        severity: "info",
        memberId: null,
        memberName: "Smazany Clen",
        message: "Hlasovaci odkaz odeslan: Smazany Clen.",
      });
      assert.equal(row.memberId, null);
      assert.equal(row.memberName, "Smazany Clen");
    },
  },
  {
    name: "25. safeDispatchOutcomeEvent s platnym vstupem -> stejny radek jako dispatchOutcomeEvent (beze zmeny chovani)",
    run: () => {
      const ctx = {
        runId: "run-1",
        seq: 6,
        actor: "cron",
        source: "cron" as const,
        requestedMeetingId: "meeting-1",
      };
      const result = okResult({ sent: 27, skipped: 0, error: 0 }, 27);
      const direct = dispatchOutcomeEvent(result, ctx);
      const safe = safeDispatchOutcomeEvent(result, ctx);
      assert.deepEqual(safe, direct);
    },
  },
  {
    name: "26. safeDispatchOutcomeEvent s vadnym vstupem (chybejici counts) nevyhodi, vraci null (review T-007 MAJOR-1)",
    run: () => {
      // Simuluje budouci defekt uvnitr ciste funkce (napr. refaktor, ktery
      // pridal pole, jez typovy system nezachyti za behu) — presne scenar
      // z review T-007 MAJOR-1: konec obalu runVotingDispatch nesmi kvuli
      // tomuhle vyhodit vyjimku ven.
      const malformed = { ok: true } as unknown as VotingDispatchResult;
      const ctx = {
        runId: "run-1",
        seq: 7,
        actor: "cron",
        source: "cron" as const,
        requestedMeetingId: "meeting-1",
      };
      assert.throws(() => dispatchOutcomeEvent(malformed, ctx));
      assert.doesNotThrow(() => safeDispatchOutcomeEvent(malformed, ctx));
      assert.equal(safeDispatchOutcomeEvent(malformed, ctx), null);
    },
  },
];

let passed = 0;
let failed = 0;

async function main() {
  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`OK   ${testCase.name}`);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${testCase.name}`);
      if (error instanceof Error) {
        console.error(`     ${error.message}`);
      } else {
        console.error(`     ${String(error)}`);
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main();
