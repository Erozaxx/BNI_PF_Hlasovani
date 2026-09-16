/**
 * Testy pro lib/meetings/morning-dispatch.ts (iter-028, T-005, arch 8.1 a
 * 8.2, případy M1 až M10).
 *
 * Bez DATABASE_URL, bez sítě, bez CI — vzor je scripts/test-voting-window.ts.
 * Spuštění: npm run test:morning-dispatch
 *
 * `planMorningDispatch` rozhoduje, kterou schůzku má ranní cron dnes
 * zpracovat (thursday-autostart / deferred-send / nic) — M1 až M8 pokrývají
 * rozhodovací tabulku z arch 3.4 vč. dvou hraničních případů (M2: schůzka
 * splňuje obě podmínky zároveň -> jen jeden cíl; M6: uzávěrka běžícího
 * hlasování už prošla, protože fáze 1 ten den selhala -> žádný cíl, ne
 * dvojí zavření). `deliveryHint` (M9) je čistě prezentační "kdy" pro panel,
 * `isFirstDispatch` (M10) rozhoduje, jestli varování (D8) smí ten den
 * promluvit, nebo jde o rutinní dosílání (R10).
 */
import assert from "node:assert/strict";
import {
  planMorningDispatch,
  deliveryHint,
  isFirstDispatch,
  type MorningMeeting,
} from "../lib/meetings/morning-dispatch";
import type {
  DispatchRecipient,
  VotingDispatchResult,
} from "../lib/meetings/voting-dispatch";

function mtg(overrides: Partial<MorningMeeting> = {}): MorningMeeting {
  return {
    id: "meeting-1",
    date: "2026-09-24",
    status: "voting",
    votingClosesAt: null,
    ...overrides,
  };
}

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

function okResult(
  recipients: DispatchRecipient[],
  counts: { sent: number; skipped: number; error: number; scheduled: number }
): VotingDispatchResult {
  return {
    ok: true,
    meetingId: "meeting-1",
    meetingDate: "2026-09-24",
    mode: "start",
    deliver: "now",
    statusBefore: "voting",
    statusAfter: "voting",
    transitioned: false,
    votingClosesAt: new Date().toISOString(),
    linkExpiresAt: new Date().toISOString(),
    totalMembers: counts.sent + counts.skipped + counts.error,
    linksCreated: 0,
    counts,
    recipients,
    errors: [],
  };
}

type TestCase = {
  name: string;
  run: () => void;
};

const cases: TestCase[] = [
  {
    name: "M1. ct 2026-09-24T05:30Z, schuzka 24.9 draft -> 1 cil thursday-autostart",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-09-24T05:30:00Z"),
        meetings: [mtg({ status: "draft" })],
      });
      assert.equal(plan.targets.length, 1);
      assert.equal(plan.targets[0].reason, "thursday-autostart");
      assert.equal(plan.targets[0].meetingId, "meeting-1");
    },
  },
  {
    name: "M2. totez, schuzka voting -> prave 1 cil, thursday-autostart (ne dvoji dispatch)",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-09-24T05:30:00Z"),
        meetings: [
          mtg({
            status: "voting",
            votingClosesAt: new Date("2026-09-30T21:59:59Z"),
          }),
        ],
      });
      assert.equal(plan.targets.length, 1);
      assert.equal(plan.targets[0].reason, "thursday-autostart");
    },
  },
  {
    name: "M3. pa 2026-09-25T05:30Z, 24.9 voting, closes 30.9 -> deferred-send",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-09-25T05:30:00Z"),
        meetings: [mtg({ votingClosesAt: new Date("2026-09-30T21:59:59Z") })],
      });
      assert.equal(plan.targets.length, 1);
      assert.equal(plan.targets[0].reason, "deferred-send");
    },
  },
  {
    name: "M4. st 2026-09-23T05:30Z, 24.9 voting -> zadny cil (rozeslani den predem)",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-09-23T05:30:00Z"),
        meetings: [mtg({ votingClosesAt: new Date("2026-09-30T21:59:59Z") })],
      });
      assert.equal(plan.targets.length, 0);
    },
  },
  {
    name: "M5. pa, 24.9 draft -> zadny cil (autostart mimo ctvrtek)",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-09-25T05:30:00Z"),
        meetings: [mtg({ status: "draft" })],
      });
      assert.equal(plan.targets.length, 0);
    },
  },
  {
    name: "M6. ct 2026-10-01T05:30Z, 24.9 voting, closes 2026-09-30T21:59:59Z -> zadny cil (uzaverka jiz prosla)",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-10-01T05:30:00Z"),
        meetings: [mtg({ votingClosesAt: new Date("2026-09-30T21:59:59Z") })],
      });
      assert.equal(plan.targets.length, 0);
    },
  },
  {
    name: "M7. pa, 24.9 voting, closes null -> deferred-send (rozbity stav 13.8.)",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-09-25T05:30:00Z"),
        meetings: [mtg({ votingClosesAt: null })],
      });
      assert.equal(plan.targets.length, 1);
      assert.equal(plan.targets[0].reason, "deferred-send");
    },
  },
  {
    name: "M8. ct, schuzka dnes closed -> thursday-autostart (ztratu varovani meeting-closed)",
    run: () => {
      const plan = planMorningDispatch({
        now: new Date("2026-09-24T05:30:00Z"),
        meetings: [mtg({ status: "closed" })],
      });
      assert.equal(plan.targets.length, 1);
      assert.equal(plan.targets[0].reason, "thursday-autostart");
    },
  },
  {
    name: "M9. deliveryHint: hranice 6:00 v Praze, i po zmene casu",
    run: () => {
      const future = deliveryHint("2026-09-24", new Date("2026-09-22T18:00:00Z"));
      assert.deepEqual(future, { kind: "on-date", date: "2026-09-24" });

      const before6 = deliveryHint("2026-09-24", new Date("2026-09-24T03:30:00Z")); // 5:30 CEST
      assert.deepEqual(before6, { kind: "today-morning" });

      const after6 = deliveryHint("2026-09-24", new Date("2026-09-24T04:30:00Z")); // 6:30 CEST
      assert.deepEqual(after6, { kind: "tomorrow-morning" });

      const winterBefore6 = deliveryHint("2026-10-26", new Date("2026-10-26T04:30:00Z")); // 5:30 CET
      assert.deepEqual(winterBefore6, { kind: "today-morning" });
    },
  },
  {
    name: "M10. isFirstDispatch: 27x sent / 26x already-sent+1 error / ok:false",
    run: () => {
      const allSent = okResult(
        Array.from({ length: 27 }, (_, i) =>
          recipient({ status: "sent" }, { memberId: `m${i}` })
        ),
        { sent: 27, skipped: 0, error: 0, scheduled: 0 }
      );
      assert.equal(isFirstDispatch(allSent), true);

      const catchUp = okResult(
        [
          ...Array.from({ length: 26 }, (_, i) =>
            recipient(
              { status: "skipped", reason: "already-sent" },
              { memberId: `m${i}` }
            )
          ),
          recipient({ status: "error", reason: "email send failed" }, { memberId: "m26" }),
        ],
        { sent: 0, skipped: 26, error: 1, scheduled: 0 }
      );
      assert.equal(isFirstDispatch(catchUp), false);

      const guardFailed: VotingDispatchResult = {
        ok: false,
        code: "not-due",
        error: "Odkazy nelze poslat hned, den schuzky jeste nenastal.",
      };
      assert.equal(isFirstDispatch(guardFailed), true);
    },
  },
];

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  try {
    testCase.run();
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
