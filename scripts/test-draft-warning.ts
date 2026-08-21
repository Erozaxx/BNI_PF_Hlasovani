/**
 * Testy pro lib/meetings/draft-warning.ts (iter-026, T-006).
 *
 * Bez DATABASE_URL, bez sítě, bez CI — vzor je scripts/test-voting-plan.ts
 * (iter-026, T-005). Spuštění: npm run test:draft-warning
 *
 * Pokrývá všech 8 případů ze sekce 10.3 architektury (arch_iter-026_T-001.md).
 */
import assert from "node:assert/strict";
import {
  addDaysIso,
  findDraftWarnings,
  type WarnableMeeting,
} from "../lib/meetings/draft-warning";

function meeting(id: string, date: string, status: string): WarnableMeeting {
  return { id, date, status };
}

type TestCase = {
  name: string;
  run: () => void;
};

const TODAY = "2026-08-27"; // ctvrtek
const TOMORROW = "2026-08-28";
const DAY_AFTER_TOMORROW = "2026-08-29";

const cases: TestCase[] = [
  {
    name: "1. schuzka dnes, draft -> 1 varovani, level today",
    run: () => {
      const result = findDraftWarnings([meeting("m1", TODAY, "draft")], TODAY);
      assert.equal(result.length, 1);
      assert.equal(result[0].level, "today");
      assert.equal(result[0].meetingId, "m1");
    },
  },
  {
    name: "2. schuzka zitra, draft -> 1 varovani, level tomorrow",
    run: () => {
      const result = findDraftWarnings([meeting("m1", TOMORROW, "draft")], TODAY);
      assert.equal(result.length, 1);
      assert.equal(result[0].level, "tomorrow");
    },
  },
  {
    name: "3. schuzka dnes, voting -> prazdne pole",
    run: () => {
      const result = findDraftWarnings([meeting("m1", TODAY, "voting")], TODAY);
      assert.equal(result.length, 0);
    },
  },
  {
    name: "4. schuzka dnes, closed -> prazdne pole",
    run: () => {
      const result = findDraftWarnings([meeting("m1", TODAY, "closed")], TODAY);
      assert.equal(result.length, 0);
    },
  },
  {
    name: "5. schuzka dnes, active (legacy) -> 1 varovani, active je stejne nefunkcni jako draft",
    run: () => {
      const result = findDraftWarnings([meeting("m1", TODAY, "active")], TODAY);
      assert.equal(result.length, 1);
      assert.equal(result[0].level, "today");
    },
  },
  {
    name: "6. schuzka pozitri, draft -> prazdne pole",
    run: () => {
      const result = findDraftWarnings([meeting("m1", DAY_AFTER_TOMORROW, "draft")], TODAY);
      assert.equal(result.length, 0);
    },
  },
  {
    name: "7. schuzka dnes i zitra, obe draft -> 2 varovani, today prvni",
    run: () => {
      const result = findDraftWarnings(
        [meeting("m-tomorrow", TOMORROW, "draft"), meeting("m-today", TODAY, "draft")],
        TODAY
      );
      assert.equal(result.length, 2);
      assert.equal(result[0].level, "today");
      assert.equal(result[0].meetingId, "m-today");
      assert.equal(result[1].level, "tomorrow");
      assert.equal(result[1].meetingId, "m-tomorrow");
    },
  },
  {
    name: "8. addDaysIso na prelomu roku i mesice: 2026-12-31 + 1 -> 2027-01-01",
    run: () => {
      assert.equal(addDaysIso("2026-12-31", 1), "2027-01-01");
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
