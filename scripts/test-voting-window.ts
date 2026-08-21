/**
 * Testy pro lib/meetings/voting-window.ts (iter-026, T-005).
 *
 * Bez DATABASE_URL, bez sítě, bez CI — vzor je scripts/test-dedup-guests.ts
 * (iter-025). Spuštění: npm run test:voting-window
 *
 * Pokrývá všech 8 případů ze sekce 10.1 architektury (arch_iter-026_T-001.md).
 * Případ 7 je regrese přímo na chybu, kvůli které iterace vznikla —
 * `openVotingAction` počítal `setUTCHours(22,59,59)` na UTC dni místo na
 * pražském dni, což ve verzi pro léto dávalo čtvrtek 00:59:59 Prague místo
 * středy 23:59:59. Assert je proto na řetězec v Praze (přes
 * toLocaleString("sv-SE", {timeZone:"Europe/Prague"})), ne na UTC — LL-006
 * bod 2: test musí ověřovat přesně ten tvar, na kterém to spadlo.
 */
import assert from "node:assert/strict";
import {
  nextWednesday2359InPrague,
  votingLinkExpiry,
} from "../lib/meetings/voting-window";

type TestCase = {
  name: string;
  run: () => void;
};

const cases: TestCase[] = [
  {
    name: "1. letni cas (CEST): ct 27.8.2026 05:00Z -> st 2.9.2026 23:59:59 Prague",
    run: () => {
      const now = new Date("2026-08-27T05:00:00Z");
      const result = nextWednesday2359InPrague(now);
      assert.equal(result.toISOString(), "2026-09-02T21:59:59.000Z");
    },
  },
  {
    name: "2. zimni cas (CET): ct 15.1.2026 05:00Z -> st 21.1.2026 23:59:59 Prague",
    run: () => {
      const now = new Date("2026-01-15T05:00:00Z");
      const result = nextWednesday2359InPrague(now);
      assert.equal(result.toISOString(), "2026-01-21T22:59:59.000Z");
    },
  },
  {
    name: "3. prechod CEST->CET (25.10.) mezi spustenim a uzaverkou",
    run: () => {
      const now = new Date("2026-10-22T05:00:00Z");
      const result = nextWednesday2359InPrague(now);
      assert.equal(result.toISOString(), "2026-10-28T22:59:59.000Z");
    },
  },
  {
    name: "4. prechod CET->CEST (29.3.) opacnym smerem",
    run: () => {
      const now = new Date("2026-03-26T05:00:00Z");
      const result = nextWednesday2359InPrague(now);
      assert.equal(result.toISOString(), "2026-04-01T21:59:59.000Z");
    },
  },
  {
    name: "5. volani ve stredu vraci stredu za tyden, nikdy dnesek",
    run: () => {
      const now = new Date("2026-09-02T10:00:00Z");
      const result = nextWednesday2359InPrague(now);
      assert.equal(result.toISOString(), "2026-09-09T21:59:59.000Z");
    },
  },
  {
    name: "6. 30s pred uzaverkou stale vraci uzaverku za tyden, ne okamzik v minulosti",
    run: () => {
      const now = new Date("2026-09-02T21:59:58Z");
      const result = nextWednesday2359InPrague(now);
      assert.equal(result.toISOString(), "2026-09-09T21:59:59.000Z");
    },
  },
  {
    name: "7. REGRESE: vysledek pripadu 1 je v Praze 23:59:59, ne UTC 22:59:59 posunute o hodinu/den",
    run: () => {
      const now = new Date("2026-08-27T05:00:00Z");
      const result = nextWednesday2359InPrague(now);
      const inPrague = result.toLocaleString("sv-SE", {
        timeZone: "Europe/Prague",
      });
      assert.equal(inPrague, "2026-09-02 23:59:59");
    },
  },
  {
    name: "8. votingLinkExpiry: +24h za uzaverkou, ne za now",
    run: () => {
      const closesAt = new Date("2026-09-02T21:59:59Z");
      const result = votingLinkExpiry(closesAt);
      assert.equal(result.toISOString(), "2026-09-03T21:59:59.000Z");
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
