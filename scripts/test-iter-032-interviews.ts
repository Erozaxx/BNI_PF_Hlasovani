/**
 * Testy iter-032 linka b (T-005b): rozhovory po 5 a 10 měsících
 * (arch iter-032 T-001b, sekce 10.1 body 1 až 11; gate T-004b U1 až U4).
 *
 * Bez DATABASE_URL, bez sítě. lib/interviews/list-filters.ts je čistý modul
 * (žádný import drizzle-orm, next ani DB). Statické kontroly čtou zdrojáky.
 * Spuštění: npm run test:iter-032-interviews (součást npm run test:iter-032)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  buildFilterSearch,
  buildInterviewListRows,
  clearFilterSearch,
  compareMemberNames,
  deriveLinkState,
  dueChipState,
  dueFilterOptions,
  filterDueEntries,
  filterInterviewList,
  formatPragueDate,
  formatPragueDayMonth,
  interviewListFilterOptions,
  isDueRelevant,
  isLeaderChangeNoop,
  leaderChangeNeedsConfirm,
  parseDueFilters,
  parseInterviewListFilters,
  sortDueEntries,
  sortMembersByName,
  type DueFilterEntry,
  type InterviewFilterRow,
  type InterviewListFilters,
  type LinkStateInput,
} from "../lib/interviews/list-filters";

const ROOT = join(__dirname, "..");
const NOW = new Date("2026-10-15T10:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

type TestCase = { name: string; run: () => void };

const JOSEF = "id-josef";
const PETR = "id-petr";

function link(overrides: Partial<LinkStateInput> = {}): LinkStateInput {
  return {
    status: "open",
    linkLastSentAt: null,
    linkRevokedAt: null,
    linkExpiresAt: null,
    ...overrides,
  };
}

function row(id: string, overrides: Partial<InterviewFilterRow> = {}): InterviewFilterRow & { id: string } {
  return {
    id,
    memberId: `m-${id}`,
    memberName: `Člen ${id}`,
    type: "month_5",
    status: "open",
    leaderId: JOSEF,
    leaderName: "Josef Machalíček",
    linkState: "neodeslan",
    ...overrides,
  };
}

const NO_FILTERS: InterviewListFilters = {
  clen: null,
  typ: null,
  stav: null,
  vedouci: null,
  odkaz: null,
};

function due(id: string, name: string, overrides: Partial<DueFilterEntry> = {}): DueFilterEntry {
  return {
    memberId: id,
    memberName: name,
    due5: false,
    due10: false,
    upcoming5: false,
    upcoming10: false,
    ...overrides,
  };
}

const LIST_ROWS = [
  row("1", { memberId: "m-a", memberName: "Adam Novák", leaderId: JOSEF, status: "open", linkState: "neodeslan" }),
  row("2", { memberId: "m-b", memberName: "Čestmír Král", leaderId: JOSEF, status: "submitted", linkState: "na", type: "month_10" }),
  row("3", { memberId: "m-c", memberName: "Hana Malá", leaderId: PETR, leaderName: "Petr Dvořák", status: "open", linkState: "odeslan" }),
  row("4", { memberId: "m-a", memberName: "Adam Novák", leaderId: JOSEF, status: "open", linkState: "neplatny", type: "month_10" }),
  row("5", { memberId: "m-d", memberName: "Žaneta Bílá", leaderId: null, leaderName: null, status: "open", linkState: "odeslan" }),
];

const cases: TestCase[] = [
  {
    name: "1. Intl.Collator('cs') je k dispozici (plné ICU)",
    run: () => {
      assert.equal(new Intl.Collator("cs").resolvedOptions().locale, "cs");
    },
  },
  {
    name: "2a. sortMembersByName: pořadí z návrhu 5.1",
    run: () => {
      const names = [
        "Žaneta",
        "Zdeněk",
        "Šárka",
        "Sára",
        "Chrudoš",
        "Hana",
        "David",
        "Čestmír",
        "Cyril",
        "Adam Nový",
        "Adam Novák",
      ];
      const sorted = sortMembersByName(names.map((name, i) => ({ id: `id${i}`, name })));
      assert.deepEqual(
        sorted.map((m) => m.name),
        ["Adam Novák", "Adam Nový", "Cyril", "Čestmír", "David", "Hana", "Chrudoš", "Sára", "Šárka", "Zdeněk", "Žaneta"]
      );
    },
  },
  {
    name: "2b. sortMembersByName: Ch za H, Sára před Šárka, shodné křestní řadí příjmení",
    run: () => {
      const s = sortMembersByName([
        { id: "1", name: "Chrudoš" },
        { id: "2", name: "Hana" },
        { id: "3", name: "Šárka" },
        { id: "4", name: "Sára" },
        { id: "5", name: "Jan Žák" },
        { id: "6", name: "Jan Černý" },
      ]).map((m) => m.name);
      assert.ok(s.indexOf("Hana") < s.indexOf("Chrudoš"));
      assert.ok(s.indexOf("Sára") < s.indexOf("Šárka"));
      assert.ok(s.indexOf("Jan Černý") < s.indexOf("Jan Žák"));
    },
  },
  {
    name: "2c. sortMembersByName: shodné jméno řadí id, vstup se nemění, prázdné pole",
    run: () => {
      const input = [
        { id: "b", name: "Jan Novák" },
        { id: "a", name: "Jan Novák" },
      ];
      const copy = JSON.parse(JSON.stringify(input));
      const out = sortMembersByName(input);
      assert.deepEqual(out.map((m) => m.id), ["a", "b"]);
      assert.deepEqual(input, copy);
      assert.notEqual(out, input);
      assert.deepEqual(sortMembersByName([]), []);
      assert.ok(compareMemberNames("Čestmír", "Cyril") > 0);
    },
  },
  {
    name: "3. deriveLinkState: všechny řádky tabulky 4.2",
    run: () => {
      const future = new Date(NOW.getTime() + DAY);
      const past = new Date(NOW.getTime() - DAY);
      assert.equal(deriveLinkState(link({ status: "submitted", linkLastSentAt: past, linkExpiresAt: future }), NOW), "na");
      assert.equal(deriveLinkState(link({ status: "cancelled" }), NOW), "na");
      assert.equal(deriveLinkState(link(), NOW), "neodeslan");
      assert.equal(deriveLinkState(link({ linkExpiresAt: future }), NOW), "neodeslan");
      assert.equal(deriveLinkState(link({ linkExpiresAt: future, linkLastSentAt: past }), NOW), "odeslan");
      assert.equal(
        deriveLinkState(link({ linkExpiresAt: future, linkLastSentAt: past, linkRevokedAt: past }), NOW),
        "neplatny"
      );
      assert.equal(deriveLinkState(link({ linkExpiresAt: past, linkLastSentAt: past }), NOW), "neplatny");
      // expires_at přesně rovno now se bere jako platný
      assert.equal(
        deriveLinkState(link({ linkExpiresAt: new Date(NOW.getTime()), linkLastSentAt: past }), NOW),
        "odeslan"
      );
    },
  },
  {
    name: "3b. U1: datumy v Europe/Prague (kolem půlnoci UTC jiný den), řádky bez Date",
    run: () => {
      const lateUtc = new Date("2026-10-14T22:30:00Z"); // Praha už 15. 10. 00:30
      assert.equal(formatPragueDate(lateUtc), "15. 10. 2026");
      assert.equal(formatPragueDayMonth(lateUtc), "15. 10.");
      const [r] = buildInterviewListRows(
        [
          {
            id: "i1",
            memberId: "m1",
            memberName: "Adam",
            type: "month_5",
            status: "open",
            leaderId: JOSEF,
            leaderName: "Josef",
            createdAt: lateUtc,
            submittedAt: null,
            linkLastSentAt: lateUtc,
            linkRevokedAt: null,
            linkExpiresAt: new Date(NOW.getTime() + DAY),
          },
        ],
        NOW
      );
      assert.equal(r.linkState, "odeslan");
      assert.equal(r.createdLabel, "15. 10. 2026");
      assert.equal(r.submittedLabel, null);
      assert.equal(r.linkSentLabel, "15. 10.");
      for (const v of Object.values(r)) assert.ok(!(v instanceof Date));
    },
  },
  {
    name: "4. parseInterviewListFilters: platné, neznámé, id mimo možnosti, nikdo, opakovaný parametr",
    run: () => {
      const options = interviewListFilterOptions(LIST_ROWS);
      const p = (q: string) => parseInterviewListFilters(new URLSearchParams(q), options);
      assert.deepEqual(p(`s_stav=otevreny&s_vedouci=${JOSEF}&s_typ=10&s_clen=m-a&s_odkaz=chybi`), {
        clen: "m-a",
        typ: "10",
        stav: "otevreny",
        vedouci: JOSEF,
        odkaz: "chybi",
      });
      assert.deepEqual(p("s_stav=xyz&s_vedouci=123&s_typ=7&s_clen=nekdo&s_odkaz=neodeslan"), NO_FILTERS);
      assert.equal(p("s_odkaz=neplatny").odkaz, null);
      assert.equal(p("s_stav=zruseny").stav, null); // zrušený jen když existuje
      assert.equal(p("s_vedouci=nikdo").vedouci, "nikdo");
      assert.equal(p("s_typ=5&s_typ=10").typ, "5");
      assert.deepEqual(p(""), NO_FILTERS);
    },
  },
  {
    name: "5a. filterInterviewList: otevřené a Josef vrátí jen Josefovy otevřené",
    run: () => {
      const out = filterInterviewList(LIST_ROWS, { ...NO_FILTERS, stav: "otevreny", vedouci: JOSEF });
      assert.deepEqual(out.map((r) => r.id), ["1", "4"]);
    },
  },
  {
    name: "5b. filterInterviewList: nikdo, Odkaz Chybí/Odeslán, kombinace tří, prázdno, bez filtru",
    run: () => {
      assert.deepEqual(filterInterviewList(LIST_ROWS, { ...NO_FILTERS, vedouci: "nikdo" }).map((r) => r.id), ["5"]);
      assert.deepEqual(filterInterviewList(LIST_ROWS, { ...NO_FILTERS, odkaz: "chybi" }).map((r) => r.id), ["1", "4"]);
      assert.deepEqual(filterInterviewList(LIST_ROWS, { ...NO_FILTERS, odkaz: "odeslan" }).map((r) => r.id), ["3", "5"]);
      assert.deepEqual(
        filterInterviewList(LIST_ROWS, { ...NO_FILTERS, vedouci: JOSEF, typ: "10", odkaz: "chybi" }).map((r) => r.id),
        ["4"]
      );
      assert.deepEqual(filterInterviewList(LIST_ROWS, { ...NO_FILTERS, stav: "odeslany", odkaz: "odeslan" }), []);
      assert.deepEqual(filterInterviewList(LIST_ROWS, NO_FILTERS).map((r) => r.id), ["1", "2", "3", "4", "5"]);
      assert.deepEqual(filterInterviewList(LIST_ROWS, { ...NO_FILTERS, clen: "m-a" }).map((r) => r.id), ["1", "4"]);
    },
  },
  {
    name: "6. interviewListFilterOptions: jen z řádků, abecedně, Bez vedoucího jen když existuje",
    run: () => {
      const o = interviewListFilterOptions(LIST_ROWS);
      assert.deepEqual(o.clen.map((x) => x.label), ["Adam Novák", "Čestmír Král", "Hana Malá", "Žaneta Bílá"]);
      assert.deepEqual(o.vedouci.map((x) => x.value), ["nikdo", JOSEF, PETR]);
      assert.equal(o.vedouci[0].label, "Bez vedoucího");
      assert.deepEqual(o.odkaz.map((x) => x.value), ["chybi", "odeslan"]);
      assert.deepEqual(o.stav.map((x) => x.value), ["otevreny", "odeslany"]);
      const noNull = interviewListFilterOptions(LIST_ROWS.filter((r) => r.leaderId !== null));
      assert.ok(!noNull.vedouci.some((x) => x.value === "nikdo"));
      const withCancelled = interviewListFilterOptions([...LIST_ROWS, row("6", { status: "cancelled", linkState: "na" })]);
      assert.ok(withCancelled.stav.some((x) => x.value === "zruseny"));
    },
  },
  {
    name: "7. parseDueFilters a filterDueEntries: sviti, blizi, nic pro oba typy, kombinace se členem",
    run: () => {
      const entries = [
        due("a", "Adam", { due5: true, upcoming10: true }),
        due("b", "Bára", { upcoming5: true }),
        due("c", "Cyril", { due10: true }),
      ];
      const options = dueFilterOptions(entries);
      const f = (q: string) => filterDueEntries(entries, parseDueFilters(new URLSearchParams(q), options)).map((e) => e.memberId);
      assert.deepEqual(f("z_5=sviti"), ["a"]);
      assert.deepEqual(f("z_5=blizi"), ["b"]);
      assert.deepEqual(f("z_5=nic"), ["c"]);
      assert.deepEqual(f("z_10=sviti"), ["c"]);
      assert.deepEqual(f("z_10=blizi"), ["a"]);
      assert.deepEqual(f("z_10=nic"), ["b"]);
      assert.deepEqual(f("z_5=sviti&z_10=blizi"), ["a"]);
      assert.deepEqual(f("z_clen=b&z_5=blizi"), ["b"]);
      assert.deepEqual(f("z_clen=b&z_5=sviti"), []);
      assert.deepEqual(f("z_5=xyz&z_clen=neni"), ["a", "b", "c"]);
      assert.equal(dueChipState(entries[0], "5"), "sviti");
      assert.equal(dueChipState(entries[1], "10"), "nic");
      assert.ok(!isDueRelevant(due("x", "X")));
      assert.ok(isDueRelevant(entries[1]));
    },
  },
  {
    name: "8. sortDueEntries: svítící před blížícími se, uvnitř abecedně",
    run: () => {
      const out = sortDueEntries([
        due("1", "Zdeněk", { upcoming5: true }),
        due("2", "Šárka", { due10: true }),
        due("3", "Chrudoš", { due5: true }),
        due("4", "Hana", { upcoming10: true }),
        due("5", "Čestmír", { due5: true }),
      ]).map((e) => e.memberName);
      assert.deepEqual(out, ["Čestmír", "Chrudoš", "Šárka", "Hana", "Zdeněk"]);
    },
  },
  {
    name: "9. buildFilterSearch a clearFilterSearch",
    run: () => {
      assert.equal(buildFilterSearch("", "s_stav", "otevreny"), "s_stav=otevreny");
      assert.equal(buildFilterSearch("?s_stav=otevreny", "s_vedouci", JOSEF), `s_stav=otevreny&s_vedouci=${JOSEF}`);
      assert.equal(buildFilterSearch("s_stav=otevreny&z_5=sviti", "s_stav", ""), "z_5=sviti");
      assert.equal(buildFilterSearch("memberId=m1&type=month_5&z_5=sviti", "s_typ", "5"), "z_5=sviti&s_typ=5");
      assert.equal(buildFilterSearch("s_clen=&z_clen=", "s_typ", "10"), "s_typ=10");
      assert.equal(buildFilterSearch("s_typ=5", "s_typ", ""), "");
      assert.ok(!buildFilterSearch("?a=1", "s_typ", "5").startsWith("?"));
      assert.equal(clearFilterSearch("?s_stav=otevreny&s_typ=5&z_5=sviti&memberId=x", "s_"), "z_5=sviti");
      assert.equal(clearFilterSearch("s_stav=otevreny&z_5=sviti", "z_"), "s_stav=otevreny");
    },
  },
  {
    name: "10. leaderChangeNeedsConfirm jen pro odeslan; U4 stejný vedoucí a Nepřiřazeno akci nevolají",
    run: () => {
      assert.equal(leaderChangeNeedsConfirm("odeslan"), true);
      assert.equal(leaderChangeNeedsConfirm("neodeslan"), false);
      assert.equal(leaderChangeNeedsConfirm("neplatny"), false);
      assert.equal(leaderChangeNeedsConfirm("na"), false);
      assert.equal(isLeaderChangeNoop(JOSEF, JOSEF), true);
      assert.equal(isLeaderChangeNoop(null, ""), true);
      assert.equal(isLeaderChangeNoop(JOSEF, ""), true);
      assert.equal(isLeaderChangeNoop(JOSEF, PETR), false);
      assert.equal(isLeaderChangeNoop(null, PETR), false);
    },
  },
  {
    name: "11a. řazení D3 až D5: sortMembersByName jde do ChangeLeaderForm, příjemců reportů a compare",
    run: () => {
      const list = readFileSync(join(ROOT, "app/(app)/interviews/page.tsx"), "utf8");
      assert.ok(list.includes("sortMembersByName("));
      const detail = readFileSync(join(ROOT, "app/(app)/interviews/[id]/page.tsx"), "utf8");
      // D3: seřazené pole se mapuje do ChangeLeaderForm
      assert.match(detail, /const\s+members\s*=\s*sortMembersByName\(allMembers\)/);
      // iter-037 (T-003b): do výběru vedoucího jdou jen aktivní (+ současný vedoucí),
      // pořadí zůstává z `members` (sortMembersByName).
      assert.match(detail, /<ChangeLeaderForm[\s\S]*?members=\{members\s*\.filter\([\s\S]*?\.map\(/);
      // D4: příjemci reportu ze seřazeného pole
      assert.match(detail, /const\s+reportRecipients\s*=\s*members\s*\.filter/);
      assert.match(detail, /<SendInterviewReportForm[\s\S]*?recipients=\{reportRecipients\}/);
      // D5: compare
      const compare = readFileSync(join(ROOT, "app/(app)/interviews/compare/[memberId]/page.tsx"), "utf8");
      assert.match(compare, /sortMembersByName\(members\)/);
      assert.match(compare, /<SendCompareReportForm[\s\S]*?recipients=/);
    },
  },
  {
    name: "11b. každá page.tsx pod app/(app)/interviews/ má právě jedno requirePageSession(; page.tsx bez InterviewDueSection",
    run: () => {
      const base = join(ROOT, "app/(app)/interviews");
      const pages: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name === "page.tsx") pages.push(full);
        }
      };
      walk(base);
      assert.ok(pages.length >= 4, `nalezeno ${pages.length} stránek`);
      for (const f of pages) {
        const src = readFileSync(f, "utf8");
        assert.equal(src.split("requirePageSession(").length - 1, 1, f);
      }
      const src = readFileSync(join(base, "page.tsx"), "utf8");
      assert.ok(!src.includes("InterviewDueSection"));
      assert.ok(src.includes('requirePageSession({ permission: "interviews.manage" })'));
    },
  },
  {
    name: "11c. list-filters.ts je čistý; klientské komponenty bez Date; kontrola U4, U3, M1",
    run: () => {
      const src = readFileSync(join(ROOT, "lib/interviews/list-filters.ts"), "utf8");
      assert.ok(!/from\s+["'](@\/lib\/db|next|react|drizzle-orm)/.test(src));
      const table = readFileSync(join(ROOT, "app/(app)/interviews/InterviewListTable.tsx"), "utf8");
      const dueTable = readFileSync(join(ROOT, "app/(app)/interviews/InterviewDueTable.tsx"), "utf8");
      const filter = readFileSync(join(ROOT, "app/(app)/interviews/ColumnFilter.tsx"), "utf8");
      assert.ok(table.includes("isLeaderChangeNoop("));
      for (const [name, code] of [
        ["InterviewListTable", table],
        ["InterviewDueTable", dueTable],
        ["ColumnFilter", filter],
      ] as const) {
        assert.ok(!/new Date\b|Date\.now|toLocale\w*String/.test(code), `${name}: nesmí obsahovat Date`);
      }
      // M1: select čeká na dokončení router.refresh()
      assert.ok(table.includes("useTransition"));
      assert.match(table, /startRefresh\(\(\) => \{\s*router\.refresh\(\)/);
      assert.match(table, /disabled=\{pending \|\| isRefreshing\}/);
      // U3: router.refresh() je ve finally a chyba se nerozpoznává podle textu
      assert.match(dueTable, /finally\s*\{[\s\S]*?router\.refresh\(\)/);
      assert.ok(!dueTable.includes("existuje"));
      assert.ok(!dueTable.includes("includes("));
      assert.ok(filter.includes("window.history.replaceState"));
      assert.ok(!filter.includes("pushState("));
    },
  },
  {
    name: "12. N1: nikdy neodeslaný odkaz po expiraci je neodeslán, odeslaný a revokovaný neplatný",
    run: () => {
      const past = new Date(NOW.getTime() - DAY);
      assert.equal(deriveLinkState(link({ linkExpiresAt: past, linkLastSentAt: null }), NOW), "neodeslan");
      assert.equal(
        deriveLinkState(link({ linkExpiresAt: past, linkLastSentAt: null, linkRevokedAt: past }), NOW),
        "neodeslan"
      );
      assert.equal(deriveLinkState(link({ linkExpiresAt: past, linkLastSentAt: past }), NOW), "neplatny");
    },
  },
  {
    name: "13. T-009r2: min-w-0 v layoutu, mobilní výška 44 px, diakritika hlášek vedoucího",
    run: () => {
      const root = join(__dirname, "..");
      const read = (rel: string) => readFileSync(join(root, rel), "utf8");
      // N-11: flex položka s obsahem nesmí růst na šířku obsahu
      assert.match(read("app/(app)/layout.tsx"), /className="flex flex-col flex-1 min-w-0"/);
      // N-12: Založit pohovor, Zrušit filtry, Detail mají na mobilu aspoň 44 px
      const mobile = "min-h-[44px] sm:min-h-0";
      const dueTable = read("app/(app)/interviews/InterviewDueTable.tsx");
      const listTable = read("app/(app)/interviews/InterviewListTable.tsx");
      const createForm = read("app/(app)/interviews/CreateInterviewForm.tsx");
      assert.match(dueTable, new RegExp(`size="sm"\\s+className="${mobile.replace(/[[\]]/g, "\\$&")}"\\s+onClick=\\{\\(\\) => clearFilters\\("z_"\\)\\}`));
      assert.match(listTable, new RegExp(`size="sm"\\s+className="${mobile.replace(/[[\]]/g, "\\$&")}"\\s+onClick=\\{\\(\\) => clearFilters\\("s_"\\)\\}`));
      assert.ok(listTable.includes(`<Button variant="secondary" size="sm" className="${mobile}">`));
      assert.match(createForm, /loading=\{loading\}\s+className="min-h-\[44px\] sm:min-h-0"/);
      // N-9: hlášky createInterviewAction a updateInterviewLeaderAction s diakritikou
      const actionsSrc = read("actions/interviews.ts");
      const fromCreate = actionsSrc.indexOf("export async function createInterviewAction");
      const fromUpdate = actionsSrc.indexOf("export async function updateInterviewLeaderAction");
      const afterUpdate = actionsSrc.indexOf("\nexport async function ", fromUpdate + 10);
      assert.ok(fromCreate >= 0 && fromUpdate > fromCreate && afterUpdate > fromUpdate);
      const actions = actionsSrc.slice(fromCreate, afterUpdate);
      for (const bad of [
        "Vyberte clena",
        "Neplatny typ pohovoru",
        "Vyberte vedouciho",
        "Clen nebyl nalezen",
        "Vedouci nebyl nalezen",
        "Vedouciho lze zmenit",
        "Nepodarilo se zalozit pohovor",
        "Nepodarilo se zmenit vedouciho",
        "Zalozeni pohovoru se nepovedlo",
        "prestal byt otevreny",
      ]) {
        assert.ok(!actions.includes(bad), bad);
      }
      assert.ok(actions.includes("Vedoucího lze změnit jen u otevřeného pohovoru."));
    },
  },
];

let passed = 0;
let failed = 0;

function main() {
  for (const testCase of cases) {
    try {
      testCase.run();
      console.log(`OK   ${testCase.name}`);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${testCase.name}`);
      console.error(`     ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);
  if (failed > 0) process.exitCode = 1;
}

main();
