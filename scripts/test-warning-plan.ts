/**
 * Testy pro lib/meetings/warning-plan.ts (iter-026, T-006).
 *
 * Bez DATABASE_URL, bez sítě, bez CI — vzor je scripts/test-voting-plan.ts
 * (iter-026, T-005). Spuštění: npm run test:warning-plan
 *
 * Pokrývá všech 12 případů ze sekce 10.4 architektury (arch_iter-026_T-001.md),
 * včetně pravidla `dispatch-failed` (arch 3.4) — případy 10 a 11 jsou přímý
 * důsledek E1 (cron smí aktivovat i schůzku ve stavu draft), případ 12 je
 * jejich protiváha (pravidlo 3 nesmí zabrat, když dispatch prošel, R9).
 *
 * Případ 13 je nový (T-006r, review MAJOR-1) — `dispatchFailure.code` je
 * v `WarningInput` typovaný obecně jako `string`, ne jako uzavřená pětice
 * guard kódů z `VotingDispatchResult`, takže `infra-error` (syntetizovaný
 * cronem při zachycené výjimce z fáze 2, mimo scope tohoto souboru) prochází
 * pravidlem `dispatch-failed` beze změny v `decideThursdayWarning` — jediná
 * změna byla vlastní text v `dispatchFailureAction()`.
 */
import assert from "node:assert/strict";
import {
  decideThursdayWarning,
  type WarningInput,
  type WarningMeeting,
} from "../lib/meetings/warning-plan";

function baseInput(overrides: Partial<WarningInput>): WarningInput {
  return {
    weekdayPrague: "Thursday",
    todayIso: "2026-08-27",
    meeting: null,
    dispatchFailure: null,
    failedRecipients: [],
    membersWithoutEmail: [],
    ...overrides,
  };
}

function meeting(status: string, date = "2026-08-27"): WarningMeeting {
  return { id: "mtg-1", date, status };
}

type TestCase = {
  name: string;
  run: () => void;
};

const cases: TestCase[] = [
  {
    name: "1. pondeli, zadna schuzka -> warn:false, not-thursday",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({ weekdayPrague: "Monday", meeting: null })
      );
      assert.deepEqual(result, { warn: false, reason: "not-thursday" });
    },
  },
  {
    name: "2. ctvrtek, meeting: null -> warn:true, no-meeting",
    run: () => {
      const result = decideThursdayWarning(baseInput({ meeting: null }));
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "no-meeting");
    },
  },
  {
    name: "3. ctvrtek, schuzka draft -> warn:true, not-voting (scenar 13.8.2026)",
    run: () => {
      const result = decideThursdayWarning(baseInput({ meeting: meeting("draft") }));
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "not-voting");
    },
  },
  {
    name: "4. ctvrtek, schuzka active -> warn:true, not-voting (legacy stav)",
    run: () => {
      const result = decideThursdayWarning(baseInput({ meeting: meeting("active") }));
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "not-voting");
    },
  },
  {
    name: "5. ctvrtek, schuzka closed -> warn:true, not-voting",
    run: () => {
      const result = decideThursdayWarning(baseInput({ meeting: meeting("closed") }));
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "not-voting");
    },
  },
  {
    name: "6. ctvrtek, voting, 0 selhani -> warn:false, voting-ok (normalni ctvrtek nesmi spamovat)",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({ meeting: meeting("voting"), failedRecipients: [] })
      );
      assert.deepEqual(result, { warn: false, reason: "voting-ok" });
    },
  },
  {
    name: "7. ctvrtek, voting, 2 selhani -> warn:true, partial-send, obe jmena v lines",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({
          meeting: meeting("voting"),
          failedRecipients: [
            { memberName: "Jan Novak", reason: "email send failed: 422 invalid recipient" },
            { memberName: "Petr Svoboda", reason: "regenerate token failed" },
          ],
        })
      );
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "partial-send");
      const text = (result.warn && result.lines.join("\n")) || "";
      assert.match(text, /Jan Novak/);
      assert.match(text, /Petr Svoboda/);
    },
  },
  {
    name: "8. ctvrtek, voting, 0 selhani, 1 clen bez emailu -> warn:false (clen bez emailu sam o sobe nevaruje)",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({
          meeting: meeting("voting"),
          failedRecipients: [],
          membersWithoutEmail: [{ memberName: "Karel Dvorak" }],
        })
      );
      assert.deepEqual(result, { warn: false, reason: "voting-ok" });
    },
  },
  {
    name: "9. ctvrtek, voting, 2 selhani, 1 bez emailu -> warn:true, clen bez emailu je v lines",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({
          meeting: meeting("voting"),
          failedRecipients: [
            { memberName: "Jan Novak", reason: "email send failed" },
            { memberName: "Petr Svoboda", reason: "regenerate token failed" },
          ],
          membersWithoutEmail: [{ memberName: "Karel Dvorak" }],
        })
      );
      assert.equal(result.warn, true);
      const text = (result.warn && result.lines.join("\n")) || "";
      assert.match(text, /Karel Dvorak/);
    },
  },
  {
    name: "10. ctvrtek, schuzka draft, dispatchFailure no-guests -> warn:true, dispatch-failed (ne not-voting), duvod v lines",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({
          meeting: meeting("draft"),
          dispatchFailure: {
            code: "no-guests",
            message: "Hlasovani nelze spustit, schuzka nema zadneho hosta.",
          },
        })
      );
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "dispatch-failed");
      const text = (result.warn && result.lines.join("\n")) || "";
      assert.match(text, /Hlasovani nelze spustit, schuzka nema zadneho hosta\./);
    },
  },
  {
    name: "11. ctvrtek, schuzka voting, dispatchFailure no-guests, 0 selhani -> warn:true, dispatch-failed (ticha dira bez pravidla 3)",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({
          meeting: meeting("voting"),
          dispatchFailure: { code: "no-guests", message: "Hlasovani nelze spustit." },
          failedRecipients: [],
        })
      );
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "dispatch-failed");
    },
  },
  {
    name: "12. ctvrtek, schuzka voting, dispatchFailure null, 0 selhani -> warn:false, voting-ok (pravidlo 3 nesmi zabrat kdyz dispatch prosel)",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({
          meeting: meeting("voting"),
          dispatchFailure: null,
          failedRecipients: [],
        })
      );
      assert.deepEqual(result, { warn: false, reason: "voting-ok" });
    },
  },
  {
    name: "13. ctvrtek, schuzka draft, dispatchFailure infra-error -> warn:true, dispatch-failed, vlastni text v akci (T-006r, MAJOR-1)",
    run: () => {
      const result = decideThursdayWarning(
        baseInput({
          meeting: meeting("draft"),
          dispatchFailure: {
            code: "infra-error",
            message: "Connection to database failed",
          },
        })
      );
      assert.equal(result.warn, true);
      assert.equal(result.warn && result.kind, "dispatch-failed");
      const text = (result.warn && result.lines.join("\n")) || "";
      assert.match(text, /Connection to database failed/);
      assert.match(text, /výpadek infrastruktury/);
      assert.doesNotMatch(text, /doplňte hosty/);
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
