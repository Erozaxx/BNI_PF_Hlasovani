/**
 * Testy iter-039 (kalendář plánovaných omluv pro správce docházky). Bez
 * DATABASE_URL, bez sítě. Statické kontroly čtou zdrojáky z disku.
 *
 * Případy 1 až 7: čisté funkce `lib/attendance/plan.ts`. Případy 8 až 15:
 * statika stránky, guardu, SQL, UI, záložek, čistoty modulu, textů a nápovědy.
 *
 * Spuštění: npm run test:iter-039 (tento soubor + test:iter-038)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  PLAN_TEXTS,
  groupPlan,
  pickInitialDay,
  planCanOpenSheet,
  planCountText,
  planDayAria,
  planEntryLine,
  planEntryMeta,
  planRange,
  planSummary,
  type PlanEntry,
} from "../lib/attendance/plan";
import { nextThursday } from "../lib/attendance/rules";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const rel = join(dir, name);
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}

function entry(date: string, name: string, sub: string | null, announcedOn = "2026-10-15", id?: string): PlanEntry {
  return { date, memberId: id ?? `id-${name}`, name, substituteName: sub, announcedOn };
}

const tests: TestCase[] = [
  {
    name: "1. groupPlan: seskupení podle data, řazení česky, stejné jméno ve dvou dnech",
    run: () => {
      const g = groupPlan([
        entry("2026-10-22", "Žák", null),
        entry("2026-10-22", "Šťastný", null),
        entry("2026-10-22", "Čermák", null),
        entry("2026-10-22", "Sýkora", null),
        entry("2026-10-22", "Cibulka", null),
        entry("2026-10-29", "Čermák", "Host"),
      ]);
      assert.deepEqual(Object.keys(g).sort(), ["2026-10-22", "2026-10-29"]);
      assert.deepEqual(
        g["2026-10-22"].map((e) => e.name),
        ["Cibulka", "Čermák", "Sýkora", "Šťastný", "Žák"]
      );
      assert.equal(g["2026-10-29"].length, 1);
      assert.equal(g["2026-10-29"][0].substituteName, "Host");
      assert.deepEqual(groupPlan([]), {});
    },
  },
  {
    name: "2. planCountText: 0, 1, 2, 4, 5, 21",
    run: () => {
      assert.equal(planCountText(0), "0 omluvených");
      assert.equal(planCountText(1), "1 omluvený");
      assert.equal(planCountText(2), "2 omluvení");
      assert.equal(planCountText(4), "4 omluvení");
      assert.equal(planCountText(5), "5 omluvených");
      assert.equal(planCountText(21), "21 omluvených");
    },
  },
  {
    name: "3. planEntryLine a planEntryMeta: s náhradníkem a bez, ohlášeno přesně, nikdy „zapsal“ (K2)",
    run: () => {
      assert.equal(planEntryLine({ substituteName: "Jan Novák" }), "s náhradníkem: Jan Novák");
      assert.equal(planEntryLine({ substituteName: null }), "bez náhradníka");
      assert.equal(planEntryMeta({ announcedOn: "2026-10-15" }, "2026-10-20"), "omluveno 15. 10.");
      assert.equal(planEntryMeta({ announcedOn: "2026-01-05" }, "2026-10-20"), "omluveno 5. 1.");
      assert.equal(planEntryMeta({ announcedOn: "2025-12-30" }, "2026-01-08"), "omluveno 30. 12. 2025");
      for (const t of [
        planEntryLine({ substituteName: "X Y" }),
        planEntryLine({ substituteName: null }),
        planEntryMeta({ announcedOn: "2026-10-15" }, "2026-10-20"),
        ...Object.values(PLAN_TEXTS),
      ]) {
        assert.ok(!/zapsal/i.test(t), `text obsahuje „zapsal“: ${t}`);
      }
    },
  },
  {
    name: "4. souhrn dne: 3 omluvení z toho 1 s náhradníkem; prázdný den bez souhrnu a se „–“",
    run: () => {
      const day = [entry("2026-10-22", "A", "N"), entry("2026-10-22", "B", null), entry("2026-10-22", "C", null)];
      assert.equal(planSummary(day), "Omluvení: 3 (s náhradníkem 1, bez náhradníka 2)");
      assert.equal(planSummary([entry("2026-10-22", "A", null)]), "Omluvení: 1");
      assert.equal(planSummary([]), null);
      assert.equal(PLAN_TEXTS.empty, "–");
      const comp = read("components/attendance/AbsencePlanCalendar.tsx");
      assert.ok(comp.includes("PLAN_TEXTS.empty") && comp.includes("planSummary(entries)"));
    },
  },
  {
    name: "5. pickInitialDay: ?d= v rozsahu vyhraje, mimo rozsah a nesmysl se ignoruje, dnes před zítřkem, bez omluvy čtvrtek, minulost se ignoruje",
    run: () => {
      const today = "2026-10-20";
      const r = planRange(today);
      const base = { today, from: r.from, to: r.to };
      assert.equal(pickInitialDay({ ...base, requested: "2026-11-05", datesWithAbsences: ["2026-10-22"] }), "2026-11-05");
      assert.equal(pickInitialDay({ ...base, requested: "2025-01-01", datesWithAbsences: ["2026-10-22"] }), "2026-10-22");
      assert.equal(pickInitialDay({ ...base, requested: "2030-01-01", datesWithAbsences: ["2026-10-22"] }), "2026-10-22");
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: ["2026-10-22"] }), "2026-10-22");
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: ["2026-10-21", "2026-10-20"] }), "2026-10-20");
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: ["2026-10-29", "2026-10-22"] }), "2026-10-22");
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: [] }), nextThursday(today));
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: [] }), "2026-10-22");
      // iter-042 (B4): bez omluvy nejbližší pravidelný den z nastavení (úterý 2026-10-20 je dnes, pátek 23.)
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: [], settings: { meetingWeekday: 2 } }), "2026-10-20");
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: [], settings: { meetingWeekday: 5 } }), "2026-10-23");
      assert.equal(pickInitialDay({ ...base, requested: null, datesWithAbsences: ["2026-10-01", "2026-09-17"] }), "2026-10-22");
    },
  },
  {
    name: "6. planRange: 20. 10. 2026 dá duben 2026 až říjen 2027, konec února v přestupném roce",
    run: () => {
      const r = planRange("2026-10-20");
      assert.deepEqual(r.minMonth, { year: 2026, month: 4 });
      assert.deepEqual(r.maxMonth, { year: 2027, month: 10 });
      assert.equal(r.from, "2026-04-01");
      assert.equal(r.to, "2027-10-31");
      // dnes + 365 dní padne na únor přestupného roku 2028, konec měsíce má 29 dní
      const leap = planRange("2027-02-25");
      assert.deepEqual(leap.maxMonth, { year: 2028, month: 2 });
      assert.equal(leap.to, "2028-02-29");
      assert.equal(planRange("2026-02-10").from, "2025-08-01");
    },
  },
  {
    name: "7. planDayAria: čtvrtek se schůzkou a 3 omluvenými, den bez omluv",
    run: () => {
      assert.equal(planDayAria("2026-10-22", 3, true), "čtvrtek 22. října, 3 omluvení, schůzka s hosty");
      assert.equal(planDayAria("2026-10-23", 0, false), "pátek 23. října");
      // iter-042 (B3, Z4): barva dne má i slovní popisek
      assert.equal(planDayAria("2026-10-22", 0, false, true), "čtvrtek 22. října, interní schůzka");
      assert.equal(planDayAria("2026-10-22", 2, false, false, true), "čtvrtek 22. října, 2 omluvení, pravidelná schůzka");
      assert.equal(planDayAria("2026-10-22", 0, true, true, true), "čtvrtek 22. října, schůzka s hosty", "schůzka s hosty přebíjí ostatní");
      assert.equal(planDayAria("2026-10-29", 1, false), "čtvrtek 29. října, 1 omluvený");
    },
  },
  {
    name: "7b. planCanOpenSheet: odkaz na Zápis dne jen do dnes + 365 dní, stejně jako zapis/page.tsx",
    run: () => {
      assert.equal(planCanOpenSheet("2027-10-20", "2026-10-20"), true);
      assert.equal(planCanOpenSheet("2027-10-21", "2026-10-20"), false);
      assert.equal(planCanOpenSheet("2027-10-31", "2026-10-20"), false);
      assert.equal(planCanOpenSheet("2026-04-01", "2026-10-20"), true);
      const ui = stripComments(read("components/attendance/AbsencePlanCalendar.tsx"));
      assert.ok(/planCanOpenSheet\(selected, today\) && \(/.test(ui));
      const sheet = read("app/(app)/dochazka/zapis/page.tsx");
      assert.ok(sheet.includes("addDaysToDateString(today, MAX_ADVANCE_DAYS)") && sheet.includes("requested <= max"));
      assert.ok(read("lib/attendance/plan-view.ts").includes("NO_PERMISSION_MESSAGE"));
    },
  },
  {
    name: "8. statika stránky: guard attendance.view_all, force-dynamic, bez loading.tsx",
    run: () => {
      const page = read("app/(app)/dochazka/omluvy/page.tsx");
      assert.ok(page.includes('requirePageSession({\n    permission: "attendance.view_all",\n    denyTo: "/dochazka",\n  })'));
      assert.ok(page.includes('export const dynamic = "force-dynamic"'));
      assert.ok(page.includes("loadAbsencePlan(session, today)"));
      assert.ok(page.includes('<AttendanceTabs active="plan" canViewAll />'));
      assert.ok(!existsSync(join(ROOT, "app/(app)/dochazka/omluvy/loading.tsx")), "loading.tsx v segmentu (LL-017)");
      assert.ok(!existsSync(join(ROOT, "app/(app)/dochazka/loading.tsx")));
      const code = stripComments(page);
      assert.ok(!/router\.refresh|useRouter/.test(code));
    },
  },
  {
    name: "9. statika guardu dotazu: loader ověří právo před dotazem, dotaz se jinde neimportuje",
    run: () => {
      const view = stripComments(read("lib/attendance/plan-view.ts"));
      const guard = view.indexOf('can(session, "attendance.view_all")');
      const call = view.indexOf("listPlannedAbsences(");
      assert.ok(guard > 0 && call > 0 && guard < call, "can() před listPlannedAbsences");
      assert.ok(/if \(!can\(session, "attendance\.view_all"\)\) \{\s*throw new Error/.test(view), "fail closed");
      const users: string[] = [];
      for (const dir of ["app", "components", "actions", "lib"]) {
        for (const f of walk(dir)) {
          if (f === join("lib", "db", "queries", "attendance.ts")) continue;
          if (stripComments(read(f)).includes("listPlannedAbsences")) users.push(f);
        }
      }
      assert.deepEqual(users, [join("lib", "attendance", "plan-view.ts")]);
    },
  },
  {
    name: "10. statika SQL: memberActiveSql, jen čtení, bez created_by a updated_by",
    run: () => {
      const src = read("lib/db/queries/attendance.ts");
      const start = src.indexOf("export async function listPlannedAbsences");
      assert.ok(start > 0);
      const next = src.indexOf("\nexport ", start + 10);
      const body = stripComments(src.slice(start, next > 0 ? next : undefined));
      assert.ok(body.includes('memberActiveSql("m")'));
      assert.ok(body.includes("SELECT") && body.includes("JOIN member m ON m.id = a.member_id"));
      assert.ok(body.includes("AT TIME ZONE 'Europe/Prague'"));
      assert.ok(!/\b(INSERT|UPDATE|DELETE)\b/i.test(body), "zápis");
      assert.ok(!/transaction/i.test(body), "transakce");
      assert.ok(!/created_by|updated_by/i.test(body), "zapisující (K2)");
      assert.ok(body.includes("${from}::date") && body.includes("${to}::date"), "bind parametry");
    },
  },
  {
    name: "11. statika UI: bez router.refresh a useRouter, 44 px, mřížka, čtvrtek, replaceState, bez @/lib/db",
    run: () => {
      const raw = read("components/attendance/AbsencePlanCalendar.tsx");
      const ui = stripComments(raw);
      assert.ok(raw.startsWith('"use client"'));
      assert.ok(!/router\.refresh|useRouter/.test(ui));
      assert.ok(ui.includes("min-h-[44px]") && ui.includes("grid-cols-7") && ui.includes("isRegularDay(date, { meetingWeekday: regularWeekday })") && !ui.includes("isThursday("));
      assert.ok(ui.includes("replaceState") && !ui.includes("pushState"));
      assert.ok(!/from "@\/lib\/db/.test(ui));
      assert.ok(!/logOpsEvent|console\./.test(ui));
      // odkaz na zápis dne a šipky mají cíl 44 px
      assert.ok(/href=\{`\/dochazka\/zapis\?d=\$\{selected\}`\}[\s\S]*?min-h-\[44px\]/.test(ui));
      assert.equal((ui.match(/min-h-\[44px\] min-w-\[44px\]/g) ?? []).length, 2);
      // kalendář člena se nezměnil o odkaz na plán (A18 z iter-038 stojí na jeho zdrojáku)
      assert.ok(!read("components/attendance/AbsenceCalendar.tsx").includes("AbsencePlanCalendar"));
    },
  },
  {
    name: "12. záložky: odkaz /dochazka/omluvy, OVERVIEW_TEXTS.tabPlan, pořadí Moje, Zápis, Omluvy, Přehled, kompaktní px-3 a nezalamování",
    run: () => {
      const tabs = read("components/attendance/AttendanceTabs.tsx");
      assert.ok(tabs.includes('"/dochazka/omluvy"') && tabs.includes("OVERVIEW_TEXTS.tabPlan"));
      const order = ["tabMine", "tabSheet", "tabPlan", "tabOverview"].map((k) => tabs.indexOf(`OVERVIEW_TEXTS.${k}`));
      assert.ok(order.every((i) => i > 0));
      assert.deepEqual([...order].sort((a, b) => a - b), order, "pořadí záložek");
      assert.ok(tabs.includes('"mine" | "sheet" | "plan" | "overview"'));
      assert.ok(tabs.includes("px-3") && tabs.includes("sm:px-4") && tabs.includes("whitespace-nowrap"));
      assert.ok(!tabs.includes("overflow-x-auto"), "overflow ořezává fokusový rámeček");
      assert.ok(tabs.includes("min-h-[44px]") && tabs.includes("whitespace-nowrap"));
      assert.ok(tabs.includes("if (!canViewAll) return null"));
      assert.match(read("lib/attendance/sheet.ts"), /tabPlan: "Omluvy"/);
    },
  },
  {
    name: "13. plan.ts je čistý: bez drizzle-orm, @/lib/db, next/ a resend",
    run: () => {
      const src = stripComments(read("lib/attendance/plan.ts"));
      assert.ok(!/drizzle-orm|@\/lib\/db|from "next\/|resend/.test(src));
    },
  },
  {
    name: "14. nové a upravené soubory bez em dashe, e-mailu a telefonu; v nových souborech žádné logOpsEvent",
    run: () => {
      const created = [
        "lib/attendance/plan.ts",
        "lib/attendance/plan-view.ts",
        "components/attendance/AbsencePlanCalendar.tsx",
        "app/(app)/dochazka/omluvy/page.tsx",
        "scripts/test-iter-039-omluvy.ts",
      ];
      const changed = [
        "components/attendance/AttendanceTabs.tsx",
        "lib/attendance/sheet.ts",
        "lib/db/queries/attendance.ts",
        "components/help/sections/ModeratorHelp.tsx",
      ];
      for (const f of [...created, ...changed]) {
        const src = read(f);
        assert.ok(!src.includes(EM_DASH), `${f}: em dash`);
        assert.ok(!/@[a-z0-9-]+\.(cz|com|eu)\b/i.test(src), `${f}: e-mail`);
        assert.ok(!/\+?420 ?\d{3} ?\d{3} ?\d{3}/.test(src), `${f}: telefon`);
      }
      for (const f of created.filter((c) => !c.startsWith("scripts/"))) {
        assert.ok(!/logOpsEvent/.test(stripComments(read(f))), `${f}: logOpsEvent`);
      }
    },
  },
  {
    name: "15. nápověda: ModeratorHelp má „záložka Omluvy“ a vyká",
    run: () => {
      const help = read("components/help/sections/ModeratorHelp.tsx");
      assert.ok(help.includes("Kdo se na schůzku omluvil?"));
      assert.ok(help.includes("záložka Omluvy") && help.includes("Klepněte na den"));
      assert.ok(help.includes("uvidíte, kdo se omluvil"));
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
