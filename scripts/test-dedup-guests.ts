/**
 * Testy pro lib/import/dedup-guests.ts (iter-025, T-005).
 *
 * Bez DATABASE_URL, bez sítě, bez CI — v repu žádná CI není, tohle je
 * jediná kontrola dedup logiky, dokud si na ni někdo nevzpomene (gate P6).
 *
 * Spuštění: npm run test:dedup
 *
 * Pokrývá všech 15 případů ze sekce 3.6 architecture_iter-025_T-001.md.
 * Případy 14 a 15 vznikly z MAJOR nálezů review T-002 (idempotentní
 * druhý import a "první vyhrává" při kolizi klíčů v DB kandidátech) a
 * nesmí se vynechat.
 */
import assert from "node:assert/strict";
import {
  buildDedupKey,
  normalizeDedupPart,
  planGuestDedup,
  type ExistingGuest,
  type ImportGuestRow,
} from "../lib/import/dedup-guests";

function row(
  rowNumber: number,
  name: string,
  email: string | null = null
): ImportGuestRow {
  return {
    rowNumber,
    name,
    email,
    phone: null,
    company: null,
    description: null,
    categoryName: null,
  };
}

function existingGuest(
  id: string,
  name: string,
  email: string | null = null
): ExistingGuest {
  return { id, name, email };
}

type TestCase = {
  name: string;
  run: () => void;
};

const cases: TestCase[] = [
  {
    name: "1. Karolína: 2 řádky, shodný email, různá jména → 2x create",
    run: () => {
      const rows = [
        row(4, "Zuzana Rysková", "john.b@email.cz"),
        row(5, "Petr Novotný", "john.b@email.cz"),
      ];
      const plan = planGuestDedup(rows, []);
      assert.equal(plan.counts.create, 2);
      assert.equal(plan.decisions[0].kind, "create");
      assert.equal(plan.decisions[1].kind, "create");
    },
  },
  {
    name: "2. 2 řádky, shodný email i jméno → 1x create, 1x duplicate-in-file",
    run: () => {
      const rows = [
        row(2, "Jan Novák", "jan@x.cz"),
        row(3, "Jan Novák", "jan@x.cz"),
      ];
      const plan = planGuestDedup(rows, []);
      assert.equal(plan.decisions[0].kind, "create");
      assert.equal(plan.decisions[1].kind, "duplicate-in-file");
      const second = plan.decisions[1];
      assert.equal(second.kind, "duplicate-in-file");
      if (second.kind === "duplicate-in-file") {
        assert.equal(second.firstRowNumber, 2);
        assert.equal(second.firstName, "Jan Novák");
      }
      assert.equal(plan.counts.create, 1);
      assert.equal(plan.counts.duplicateInFile, 1);
    },
  },
  {
    name: "3. Řádek proti DB kartě, shodný klíč → reuse-existing s korektním guestId",
    run: () => {
      const existing = [existingGuest("guest-1", "Jan Novák", "jan@x.cz")];
      const rows = [row(2, "Jan Novák", "jan@x.cz")];
      const plan = planGuestDedup(rows, existing);
      const decision = plan.decisions[0];
      assert.equal(decision.kind, "reuse-existing");
      if (decision.kind === "reuse-existing") {
        assert.equal(decision.guestId, "guest-1");
      }
    },
  },
  {
    name: "4. DB karta Jan@Firma.cz, řádek jan@firma.cz, shodné jméno → reuse-existing",
    run: () => {
      const existing = [existingGuest("guest-1", "Jan Novák", "Jan@Firma.cz")];
      const rows = [row(2, "Jan Novák", "jan@firma.cz")];
      const plan = planGuestDedup(rows, existing);
      assert.equal(plan.decisions[0].kind, "reuse-existing");
    },
  },
  {
    name: "5. 'Magda  Sýkorová' (DB, dvě mezery) vs 'Magda Sýkorová' (soubor) → reuse-existing",
    run: () => {
      const existing = [
        existingGuest("guest-1", "Magda  Sýkorová", "magda@x.cz"),
      ];
      const rows = [row(2, "Magda Sýkorová", "magda@x.cz")];
      const plan = planGuestDedup(rows, existing);
      assert.equal(plan.decisions[0].kind, "reuse-existing");
    },
  },
  {
    name: "6. NFD vs NFC zápis 'Sýkorová' → reuse-existing",
    run: () => {
      const nfc = "Sýkorová";
      const nfd = nfc.normalize("NFD");
      const existing = [existingGuest("guest-1", nfd, "s@x.cz")];
      const rows = [row(2, nfc, "s@x.cz")];
      // Ověř, že vstupní řetězce jsou skutečně různé bajty (jinak by test nic neověřoval).
      assert.notEqual(nfc, nfd);
      const plan = planGuestDedup(rows, existing);
      assert.equal(plan.decisions[0].kind, "reuse-existing");
    },
  },
  {
    name: "7. Řádek bez emailu vs DB karta téhož jména bez emailu → reuse-existing",
    run: () => {
      const existing = [existingGuest("guest-1", "Petr Svoboda", null)];
      const rows = [row(2, "Petr Svoboda", null)];
      const plan = planGuestDedup(rows, existing);
      assert.equal(plan.decisions[0].kind, "reuse-existing");
    },
  },
  {
    name: "8. Řádek bez emailu vs DB karta téhož jména S emailem → create",
    run: () => {
      const existing = [existingGuest("guest-1", "Petr Svoboda", "petr@x.cz")];
      const rows = [row(2, "Petr Svoboda", null)];
      const plan = planGuestDedup(rows, existing);
      assert.equal(plan.decisions[0].kind, "create");
    },
  },
  {
    name: "9. DB karta s email = '' vs DB karta s email = NULL → týž klíč",
    run: () => {
      const keyEmpty = buildDedupKey("Jan Novák", "");
      const keyNull = buildDedupKey("Jan Novák", null);
      const keyUndefined = buildDedupKey("Jan Novák", undefined);
      assert.equal(keyEmpty, keyNull);
      assert.equal(keyEmpty, keyUndefined);
      assert.equal(normalizeDedupPart(""), normalizeDedupPart(null));
      assert.equal(normalizeDedupPart(null), normalizeDedupPart(undefined));
    },
  },
  {
    name: "10. Řádek s prázdným jménem → skipped-no-name",
    run: () => {
      const rows = [row(2, "", "x@x.cz")];
      const plan = planGuestDedup(rows, []);
      assert.equal(plan.decisions[0].kind, "skipped-no-name");
      assert.equal(plan.counts.skippedNoName, 1);
    },
  },
  {
    name: "11. 'Rysková' vs 'Ryskova' → 2x create (diakritika se nesklápí)",
    run: () => {
      const rows = [
        row(2, "Rysková", "c@x.cz"),
        row(3, "Ryskova", "c@x.cz"),
      ];
      const plan = planGuestDedup(rows, []);
      assert.equal(plan.counts.create, 2);
      assert.equal(plan.decisions[0].kind, "create");
      assert.equal(plan.decisions[1].kind, "create");
    },
  },
  {
    name: "12. Opakované volání nad výstupem prvního běhu → 0x create",
    run: () => {
      const rows = [
        row(4, "Zuzana Rysková", "john.b@email.cz"),
        row(5, "Petr Novotný", "john.b@email.cz"),
      ];
      const firstPlan = planGuestDedup(rows, []);
      const createdInFirstRun = firstPlan.decisions.filter(
        (d) => d.kind === "create"
      );
      assert.equal(createdInFirstRun.length, 2);

      const existingAfterFirstRun: ExistingGuest[] = createdInFirstRun.map(
        (d, i) => ({
          id: `guest-${i}`,
          name: d.row.name,
          email: d.row.email,
        })
      );

      const secondPlan = planGuestDedup(rows, existingAfterFirstRun);
      assert.equal(secondPlan.counts.create, 0);
      assert.equal(secondPlan.counts.reuseExisting, 2);
    },
  },
  {
    name: "13. Invariant součtu (counts + decisions.length === rows.length)",
    run: () => {
      const rows = [
        row(2, "Jan Novák", "jan@x.cz"), // create
        row(3, "Jan Novák", "jan@x.cz"), // duplicate-in-file
        row(4, "Petr Svoboda", "petr@x.cz"), // reuse-existing
        row(5, "", "x@x.cz"), // skipped-no-name
      ];
      const existing = [existingGuest("guest-1", "Petr Svoboda", "petr@x.cz")];
      const plan = planGuestDedup(rows, existing);

      assert.equal(plan.decisions.length, rows.length);
      const sum =
        plan.counts.create +
        plan.counts.reuseExisting +
        plan.counts.duplicateInFile +
        plan.counts.skippedNoName;
      assert.equal(sum, rows.length);
    },
  },
  {
    name: "14. Idempotentní druhý import: všechny řádky trefí DB kartu → counts.create === 0",
    run: () => {
      const rows = [
        row(2, "Jan Novák", "jan@x.cz"),
        row(3, "Petr Svoboda", "petr@x.cz"),
      ];
      const existing = [
        existingGuest("guest-1", "Jan Novák", "jan@x.cz"),
        existingGuest("guest-2", "Petr Svoboda", "petr@x.cz"),
      ];
      const plan = planGuestDedup(rows, existing);
      assert.equal(plan.counts.create, 0);
      const createDecisions = plan.decisions.filter((d) => d.kind === "create");
      assert.equal(createDecisions.length, 0);
      assert.deepEqual(createDecisions, []);
    },
  },
  {
    name: "15. Dva ExistingGuest se shodným klíčem → vyhrává PRVNÍ (id) v poli",
    run: () => {
      const existing = [
        existingGuest("first-id", "Jan Novák", "jan@x.cz"),
        existingGuest("second-id", "Jan Novák", "jan@x.cz"),
      ];
      const rows = [row(2, "Jan Novák", "jan@x.cz")];
      const plan = planGuestDedup(rows, existing);
      const decision = plan.decisions[0];
      assert.equal(decision.kind, "reuse-existing");
      if (decision.kind === "reuse-existing") {
        assert.equal(decision.guestId, "first-id");
      }
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
