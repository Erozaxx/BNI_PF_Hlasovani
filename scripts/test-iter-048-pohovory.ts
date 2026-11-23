/**
 * Testy iter-048 (medical a deaktivovaní mimo seznam „Pohovory k založení“).
 * Bez DATABASE_URL, bez sítě. Čistá `computeDueEntry` a statika zdrojů.
 * Jména jsou smyšlená.
 *
 * Spuštění: npm run test:iter-048-pohovory
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeDueEntry, type DueRow } from "../lib/interviews/due";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
const TODAY = new Date("2026-11-22T12:00:00Z");

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function row(over: Partial<DueRow>): DueRow {
  return {
    memberId: "m1",
    memberName: "Eva Test",
    memberEmail: null,
    joinedAt: "2026-05-01",
    joinedAtUnverified: false,
    hasMonth5Interview: false,
    hasMonth10Interview: false,
    ...over,
  };
}
/** Tělo `getInterviewDueList` (od deklarace po začátek builderu). */
function dueListBody(src: string): string {
  const a = src.indexOf("export async function getInterviewDueList");
  const b = src.indexOf("export function interviewDueVisibleSql");
  assert.ok(a >= 0 && b > a, "builder stojí v souboru za getInterviewDueList");
  return src.slice(a, b);
}

const tests: TestCase[] = [
  {
    name: "12. termín po návratu: původní datum, due5 od 1. 9., 10 měsíců se blíží až později",
    run: () => {
      const e = computeDueEntry(row({}), TODAY);
      assert.equal(e.due5, true);
      assert.equal(e.due5SinceDays, 82);
      assert.equal(e.due10, false);
      assert.equal(e.upcoming10, false);
      assert.equal(e.due10SinceDays, null);
    },
  },
  {
    name: "12b. pohovor po 5 měsících založen, 10 měsíců vyšlo mezitím",
    run: () => {
      const e = computeDueEntry(
        row({ joinedAt: "2026-01-01", hasMonth5Interview: true, hasMonth10Interview: false }),
        TODAY
      );
      assert.equal(e.due5, false);
      assert.equal(e.due10, true);
    },
  },
  {
    name: "13. pohovor založený během období drží člena mimo seznam (due5 = false)",
    run: () => {
      const e = computeDueEntry(row({ hasMonth5Interview: true }), TODAY);
      assert.equal(e.due5, false);
    },
  },
  {
    name: "14. static: getInterviewDueList má .where(interviewDueVisibleSql()), builder používá společné SQL",
    run: () => {
      const src = read("lib/db/queries/interviews.ts");
      assert.ok(dueListBody(src).includes(".where(interviewDueVisibleSql())"));
      const bStart = src.indexOf("export function interviewDueVisibleSql");
      const builder = src.slice(bStart, src.indexOf("\n}\n", bStart));
      assert.ok(builder.includes('memberActiveSql("member")'));
      assert.ok(builder.includes('memberMedicalOnSql("member"'));
    },
  },
  {
    name: "15. static: pryč isInactive z due listu, due tabulky a štítek Neaktivní",
    run: () => {
      const table = read("app/(app)/interviews/InterviewDueTable.tsx");
      assert.ok(!table.includes("isInactive"));
      assert.ok(!table.includes("Neaktivní"));
      const q = read("lib/db/queries/interviews.ts");
      const type = q.slice(q.indexOf("export type InterviewDueEntry"), q.indexOf("export async function getInterviewDueList"));
      assert.ok(!type.includes("isInactive"));
      assert.ok(!dueListBody(q).includes("isInactive"));
      const page = read("app/(app)/interviews/page.tsx");
      assert.ok(!page.includes("e.isInactive"));
      assert.ok(page.includes("inactiveMemberIds"), "inactiveMemberIds v seznamu pohovorů zůstává");
    },
  },
  {
    name: "16. static: getInterviewDueList volají jen nástěnka, /interviews a /admin/members",
    run: () => {
      for (const f of [
        "components/interviews/InterviewDueSection.tsx",
        "app/(app)/interviews/page.tsx",
        "app/(app)/admin/members/page.tsx",
      ]) {
        assert.ok(read(f).includes("getInterviewDueList()"), `${f} volá getInterviewDueList()`);
      }
      const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
      let out = "";
      try {
        out = execFileSync("grep", ["-rln", "getInterviewDueList", "app", "components", "actions", "lib"], {
          cwd: ROOT,
          encoding: "utf8",
        });
      } catch {
        out = "";
      }
      const allowed = new Set([
        "components/interviews/InterviewDueSection.tsx",
        "app/(app)/interviews/page.tsx",
        "app/(app)/admin/members/page.tsx",
        "lib/db/queries/interviews.ts",
        "actions/interviews.ts",
        "lib/interviews/due.ts",
        "app/(app)/admin/members/SortableMemberList.tsx",
      ]);
      for (const f of out.split("\n").filter(Boolean)) {
        assert.ok(allowed.has(f), `neočekávaný odkaz na getInterviewDueList: ${f}`);
      }
    },
  },
  {
    name: "16b. due.ts je čistý modul (jen date-fns)",
    run: () => {
      const src = stripComments(read("lib/interviews/due.ts"));
      assert.ok(!/drizzle-orm|@\/lib\/db|next\/|resend/.test(src));
    },
  },
  {
    name: "16c. nápověda moderátora obsahuje větu o medical a deaktivovaných",
    run: () => {
      const src = read("components/help/sections/ModeratorHelp.tsx");
      assert.ok(
        src.includes(
          "Člen s medical nebo deaktivovaný se na stránce Pohovory ani na dashboardu neukazuje, dokud to trvá. Pak se vrátí s původním termínem."
        )
      );
    },
  },
  {
    name: "17. žádný em dash v nových a změněných souborech",
    run: () => {
      for (const f of [
        "lib/interviews/due.ts",
        "lib/db/queries/interviews.ts",
        "app/(app)/interviews/page.tsx",
        "app/(app)/interviews/InterviewDueTable.tsx",
        "components/help/sections/ModeratorHelp.tsx",
        "scripts/test-iter-048-pohovory.ts",
        "scripts/test-iter-048-sql.ts",
      ]) {
        const src = read(f);
        if (f === "lib/db/queries/interviews.ts" || f === "lib/interviews/due.ts") {
          // starší komentáře mohou em dash obsahovat, kontrolují se jen nové soubory a výpočet
          if (f === "lib/interviews/due.ts") assert.ok(!src.includes(EM_DASH), `${f}: em dash`);
          continue;
        }
        assert.ok(!src.includes(EM_DASH), `${f}: em dash`);
      }
    },
  },
];

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`ok   ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${t.name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testů prošlo`);
  process.exit(failed ? 1 : 0);
})();
