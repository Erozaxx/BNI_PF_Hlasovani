/**
 * Testy pro lib/meetings/voting-window.ts (iter-026, T-005; rozšířeno
 * iter-028, T-005).
 *
 * Bez DATABASE_URL, bez sítě, bez CI - vzor je scripts/test-dedup-guests.ts
 * (iter-025). Spuštění: npm run test:voting-window
 *
 * Pokrývá všech 8 případů ze sekce 10.1 architektury (arch_iter-026_T-001.md).
 * Případ 7 je regrese přímo na chybu, kvůli které iterace vznikla -
 * `openVotingAction` počítal `setUTCHours(22,59,59)` na UTC dni místo na
 * pražském dni, což ve verzi pro léto dávalo čtvrtek 00:59:59 Prague místo
 * středy 23:59:59. Assert je proto na řetězec v Praze (přes
 * toLocaleString("sv-SE", {timeZone:"Europe/Prague"})), ne na UTC - LL-006
 * bod 2: test musí ověřovat přesně ten tvar, na kterém to spadlo.
 *
 * Případy 9 až 13 jsou nové (iter-028, T-005, arch 8.2 W9-W13):
 * `votingClosesAtFor` (uzávěrka od data schůzky, D2 - oprava chyby, kvůli
 * které by spuštění hlasování předem s odloženým rozesláním nedoručilo
 * odkaz nikomu) a `isDeliveryDue`.
 */
import assert from "node:assert/strict";
import {
  nextWednesday2359InPrague,
  votingLinkExpiry,
  votingClosesAtFor,
  votingCloseBeforeRegularDay,
  weekdayIndexFromName,
  isDeliveryDue,
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
  {
    name: "9. votingClosesAtFor: spusteni predem (ut vecer) i cronem v den schuzky (ct rano) davaji stejnou uzaverku",
    run: () => {
      const early = votingClosesAtFor("2026-09-24", new Date("2026-09-22T18:00:00Z"));
      assert.equal(early.toISOString(), "2026-09-30T21:59:59.000Z");
      const onDay = votingClosesAtFor("2026-09-24", new Date("2026-09-24T05:30:00Z"));
      assert.equal(onDay.toISOString(), "2026-09-30T21:59:59.000Z");
    },
  },
  {
    name: "10. votingClosesAtFor: schuzka v minulosti -> referenci je now, ne datum schuzky",
    run: () => {
      const result = votingClosesAtFor("2026-09-10", new Date("2026-09-16T18:00:00Z"));
      assert.equal(result.toISOString(), "2026-09-23T21:59:59.000Z");
    },
  },
  {
    name: "11. votingClosesAtFor: posun casu (CEST->CET) mezi spustenim predem a dnem schuzky",
    run: () => {
      const result = votingClosesAtFor("2026-10-22", new Date("2026-10-20T18:00:00Z"));
      assert.equal(result.toISOString(), "2026-10-28T22:59:59.000Z");
    },
  },
  {
    name: "12. votingClosesAtFor: schuzka sama ve stredu -> uzaverka o tyden pozdeji, ne tentyz den",
    run: () => {
      const result = votingClosesAtFor("2026-09-23", new Date("2026-09-21T08:00:00Z"));
      assert.equal(result.toISOString(), "2026-09-30T21:59:59.000Z");
    },
  },
  {
    name: "13. isDeliveryDue: hranice pulnoci v Praze, ne v UTC",
    run: () => {
      assert.equal(isDeliveryDue("2026-09-24", new Date("2026-09-23T21:59:59Z")), false);
      assert.equal(isDeliveryDue("2026-09-24", new Date("2026-09-23T22:00:00Z")), true);
    },
  },
  {
    name: "14. iter-042 BK3: votingCloseBeforeRegularDay(now, 4) == nextWednesday2359InPrague pro 60 dat vc. prechodu casu",
    run: () => {
      let compared = 0;
      for (const start of ["2026-03-10", "2026-10-15", "2026-12-20"]) {
        for (let i = 0; i < 20; i++) {
          for (const hour of [0, 5, 12, 21, 23]) {
            const now = new Date(`${start}T${String(hour).padStart(2, "0")}:30:00Z`);
            now.setUTCDate(now.getUTCDate() + i);
            assert.equal(
              votingCloseBeforeRegularDay(now, 4).toISOString(),
              nextWednesday2359InPrague(now).toISOString(),
              now.toISOString()
            );
            assert.equal(
              votingClosesAtFor("2026-09-24", now).toISOString(),
              votingClosesAtFor("2026-09-24", now, 4).toISOString()
            );
            compared++;
          }
        }
      }
      assert.equal(compared, 300);
    },
  },
  {
    name: "15. iter-042 BK3: utery -> uzaverka v pondeli 23:59:59 Prague (letni i zimni cas)",
    run: () => {
      // ut 2026-09-22 spusteni, dalsi utery 29.9. -> po 28.9. 23:59:59 CEST
      assert.equal(
        votingCloseBeforeRegularDay(new Date("2026-09-22T05:00:00Z"), 2).toISOString(),
        "2026-09-28T21:59:59.000Z"
      );
      // zima: ut 2026-01-13 -> po 19.1. 23:59:59 CET = 22:59:59Z
      assert.equal(
        votingCloseBeforeRegularDay(new Date("2026-01-13T05:00:00Z"), 2).toISOString(),
        "2026-01-19T22:59:59.000Z"
      );
      // schuzka predem: ut 29.9., spusteno v pondeli 21.9. -> referenci je den schuzky,
      // uzaverka je pondeli PO ni (5.10.), stejne jako u ctvrtku (test 12)
      assert.equal(
        votingClosesAtFor("2026-09-29", new Date("2026-09-21T10:00:00Z"), 2).toISOString(),
        "2026-10-05T21:59:59.000Z"
      );
    },
  },
  {
    name: "16. iter-042 BK3: pondeli (den 1) -> uzaverka v nedeli 23:59:59; nedele (den 0) -> v sobotu",
    run: () => {
      assert.equal(
        votingCloseBeforeRegularDay(new Date("2026-09-22T05:00:00Z"), 1).toISOString(),
        "2026-09-27T21:59:59.000Z"
      );
      assert.equal(
        votingCloseBeforeRegularDay(new Date("2026-09-22T05:00:00Z"), 0).toISOString(),
        "2026-09-26T21:59:59.000Z"
      );
    },
  },
  {
    name: "17. weekdayIndexFromName: Sunday 0 az Saturday 6, neznamy -1",
    run: () => {
      const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      names.forEach((n, i) => assert.equal(weekdayIndexFromName(n), i));
      assert.equal(weekdayIndexFromName("Ctvrtek"), -1);
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
