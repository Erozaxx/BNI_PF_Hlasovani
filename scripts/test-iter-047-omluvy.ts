/**
 * Testy iter-047 (kalendář Omluvy pro každého přihlášeného, jen ke čtení). Bez
 * DATABASE_URL, bez sítě. Čisté funkce `lib/attendance/plan.ts` a statika zdrojů.
 * Jména jsou smyšlená.
 *
 * Spuštění: npm run test:iter-047
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAN_TEXTS,
  expandMedicalPeriods,
  groupPlan,
  isPlanMembersDay,
  publicPlanCalendarProps,
  publicPlanLabel,
  planRange,
  toPublicPlanEntries,
  type PlanEntry,
} from "../lib/attendance/plan";
import { MAX_ADVANCE_DAYS, absenceWindowStart } from "../lib/attendance/rules";
import { addDaysToDateString } from "../lib/members/activity";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ID_A = "3f2b8c1e-5d4a-4e7b-9a60-1c2d3e4f5a6b";
const ID_B = "7a9d0e2f-1b3c-4d5e-8f60-aa11bb22cc33";
const TODAY = "2026-11-19";
const MEDICAL_FROM = "2026-12-03";
const ANNOUNCED = "2026-11-02";

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function leadership(): PlanEntry[] {
  const stored: PlanEntry[] = [
    { date: "2026-11-26", memberId: ID_A, name: "Eva Test", substituteName: "Karel Vzor", announcedOn: ANNOUNCED },
    { date: "2026-11-26", memberId: ID_B, name: "Adam Test", substituteName: "  ", announcedOn: ANNOUNCED },
  ];
  const derived = expandMedicalPeriods(
    [{ memberId: "c1d2e3f4-0000-4000-8000-000000000001", name: "Čeněk Test", medicalFrom: MEDICAL_FROM, medicalUntil: "2026-12-31" }],
    ["2026-12-10", "2026-12-17"],
    TODAY,
    "2027-05-31",
    stored
  );
  return [...stored, ...derived];
}

function planShape(rows: ReturnType<typeof toPublicPlanEntries>) {
  const range = planRange(TODAY);
  return { ...range, rows, meetingDates: ["2026-12-02"], internalDates: [], regularWeekday: 4 };
}

const tests: TestCase[] = [
  {
    name: "1. toPublicPlanEntries: klíče přesně date, name, substituteName",
    run: () => {
      const dirty = [
        { ...leadership()[0], reason: "tajne", email: "eva@example.test" },
      ] as unknown as PlanEntry[];
      for (const r of toPublicPlanEntries(dirty)) {
        assert.deepEqual(Object.keys(r).sort(), ["date", "name", "substituteName"]);
      }
    },
  },
  {
    name: "2. odvozený medical řádek: bez medical, announcedOn a data začátku období",
    run: () => {
      const rows = leadership();
      assert.ok(rows.some((r) => r.medical === true), "fixture má odvozený medical řádek");
      const pub = toPublicPlanEntries(rows);
      const json = JSON.stringify(pub);
      assert.ok(!json.includes("medical"));
      assert.ok(!json.includes("announcedOn"));
      assert.ok(!json.includes(MEDICAL_FROM), "datum medical_from");
      assert.ok(json.includes("Čeněk Test"), "jako omluva zůstává");
    },
  },
  {
    name: "3. serializované props: bez UUID, memberId, medical, announcedOn, data ohlášení; klíče přesně",
    run: () => {
      const props = publicPlanCalendarProps({
        plan: planShape(toPublicPlanEntries(leadership())),
        today: TODAY,
        serverNow: "2026-11-19T08:00:00.000Z",
        requested: null,
        canManageInternal: false,
      });
      const json = JSON.stringify(props);
      assert.ok(!UUID.test(json), "UUID");
      for (const bad of ["memberId", "medical", "announcedOn", ANNOUNCED, MEDICAL_FROM]) {
        assert.ok(!json.includes(bad), `v props je ${bad}`);
      }
      assert.deepEqual(Object.keys(props).sort(), [
        "canManageInternal",
        "initialSelected",
        "internalDates",
        "maxMonth",
        "meetingDates",
        "minMonth",
        "readOnly",
        "regularWeekday",
        "rows",
        "serverNow",
        "today",
      ]);
      assert.equal(props.readOnly, true);
      assert.equal(props.initialSelected, "2026-11-26");
    },
  },
  {
    name: "4. canManageInternal se jen přenáší",
    run: () => {
      const base = { plan: planShape([]), today: TODAY, serverNow: "x", requested: null };
      const off = publicPlanCalendarProps({ ...base, canManageInternal: false });
      const on = publicPlanCalendarProps({ ...base, canManageInternal: true });
      assert.equal(off.canManageInternal, false);
      assert.equal(on.canManageInternal, true);
      assert.deepEqual({ ...on, canManageInternal: false }, off);
    },
  },
  {
    name: "5. štítky: prázdný náhradník je Omluven(a), jinak s náhradníkem",
    run: () => {
      assert.equal(publicPlanLabel({ substituteName: null }), "Omluven(a)");
      assert.equal(publicPlanLabel({ substituteName: "  " }), "Omluven(a)");
      assert.equal(publicPlanLabel({ substituteName: "Eva Test" }), "Omluven(a), náhradník Eva Test");
      const pub = toPublicPlanEntries([{ date: "2026-11-26", name: "X Test", substituteName: "  " }]);
      assert.equal(pub[0].substituteName, null);
    },
  },
  {
    name: "6. groupPlan: veřejné řádky česky, řádky vedení podle memberId při shodě jmen",
    run: () => {
      const pub = groupPlan([
        { date: "d", name: "Ch Test", substituteName: null },
        { date: "d", name: "H Test", substituteName: null },
        { date: "d", name: "Č Test", substituteName: null },
        { date: "d", name: "C Test", substituteName: null },
      ]);
      assert.deepEqual(pub.d.map((r) => r.name), ["C Test", "Č Test", "H Test", "Ch Test"]);
      const lead = groupPlan([
        { date: "d", memberId: "b", name: "Eva Test", substituteName: null, announcedOn: "x" },
        { date: "d", memberId: "a", name: "Eva Test", substituteName: null, announcedOn: "x" },
      ]);
      assert.deepEqual(lead.d.map((r) => r.memberId), ["a", "b"]);
    },
  },
  {
    name: "7. isPlanMembersDay: schůzkové dny v rozsahu ano, jinak ne",
    run: () => {
      const cfg = { meetingDates: ["2026-12-02"], internalDates: ["2026-12-09"], regularWeekday: 4 };
      assert.equal(isPlanMembersDay("2026-11-26", TODAY, cfg), true, "pravidelný čtvrtek");
      assert.equal(isPlanMembersDay("2026-12-02", TODAY, cfg), true, "schůzka");
      assert.equal(isPlanMembersDay("2026-12-09", TODAY, cfg), true, "interní");
      assert.equal(isPlanMembersDay("2026-11-25", TODAY, cfg), false, "středa");
      const before = addDaysToDateString(absenceWindowStart(TODAY), -1);
      assert.equal(isPlanMembersDay(before, TODAY, { ...cfg, meetingDates: [before] }), false, "před oknem");
      const after = addDaysToDateString(TODAY, MAX_ADVANCE_DAYS + 1);
      assert.equal(isPlanMembersDay(after, TODAY, { ...cfg, meetingDates: [after] }), false, "po okně");
    },
  },
  {
    name: "8. statika stránky: guard bez práva, větvení na serveru, veřejná větev jen přes helper",
    run: () => {
      const page = stripComments(read("app/(app)/dochazka/omluvy/page.tsx"));
      assert.ok(page.includes("requirePageSession()"));
      assert.ok(!/permission:|anyOf:/.test(page));
      const canIdx = page.indexOf('can(session, "attendance.view_all")');
      const adminIdx = page.indexOf("loadAbsencePlan(");
      assert.ok(canIdx > 0 && adminIdx > canIdx, "can() před loadAbsencePlan(");
      assert.ok(page.includes("loadAbsencePlanPublic(") && page.includes("publicPlanCalendarProps("));
      assert.ok(page.includes("<AbsencePlanCalendar {...props} />"));
      assert.equal((page.match(/rows=\{plan\.rows\}/g) ?? []).length, 1, "rows vedení jen jednou");
      assert.ok(!/\{\.\.\.plan\}/.test(page));
      assert.ok(read("app/(app)/dochazka/omluvy/page.tsx").includes('export const dynamic = "force-dynamic"'));
      assert.ok(!existsSync(join(ROOT, "app/(app)/dochazka/omluvy/loading.tsx")));
      assert.ok(!existsSync(join(ROOT, "app/(app)/dochazka/loading.tsx")));
      assert.ok(page.includes("PLAN_TEXTS.readOnlyNote"));
    },
  },
  {
    name: "9. statika loaderu: guardy, loadPlanRows neexportovaná, veřejný loader ořezává",
    run: () => {
      const view = stripComments(read("lib/attendance/plan-view.ts"));
      assert.ok(!/export (async )?function loadPlanRows/.test(view));
      const adm = view.slice(view.indexOf("export async function loadAbsencePlan("));
      assert.ok(/^export async function loadAbsencePlan\([^)]*\)[^{]*\{\s*if \(!can\(session, "attendance\.view_all"\)\) \{\s*throw new Error\(NO_PERMISSION_MESSAGE\)/.test(adm));
      const pubStart = view.indexOf("export async function loadAbsencePlanPublic(");
      const pub = view.slice(pubStart, view.indexOf("async function loadPlanRows"));
      assert.ok(/\{\s*if \(!session\?\.memberId\) \{\s*throw new Error\(NO_PERMISSION_MESSAGE\)/.test(pub.slice(pub.indexOf("Promise<PublicAbsencePlanData> {") - 5)));
      assert.ok(pub.includes("toPublicPlanEntries("));
      assert.ok(!pub.includes("canManageInternal") && !/\.\.\.base/.test(pub));
      assert.ok(view.includes('can(session, "attendance.internal_manage")'));
    },
  },
  {
    name: "10. statika komponenty: režim čtení bez planEntryMeta a zápisu",
    run: () => {
      const ui = stripComments(read("components/attendance/AbsencePlanCalendar.tsx"));
      assert.equal((ui.match(/planEntryMeta\(/g) ?? []).length, 1, "planEntryMeta jen ve větvi vedení");
      assert.ok(/\) : \(\s*<li key=\{\(e as PlanEntry\)\.memberId\}[\s\S]*?planEntryMeta\(/.test(ui), "ve větvi !readOnly");
      assert.ok(ui.includes("!readOnly && planCanOpenSheet(selected, today)"));
      assert.ok(ui.includes("readOnly && isPlanMembersDay("));
      assert.ok(ui.includes("canManageInternal && ("));
      assert.ok(!/router\.refresh|useRouter/.test(ui));
      assert.ok(!/@\/lib\/db/.test(ui));
    },
  },
  {
    name: "11. záložky: Omluvy mimo podmínku, Zápis a Přehled uvnitř, pořadí",
    run: () => {
      const tabs = stripComments(read("components/attendance/AttendanceTabs.tsx"));
      const i = (k: string) => tabs.indexOf(`OVERVIEW_TEXTS.${k}`);
      assert.ok(i("tabMine") < i("tabMembers") && i("tabMembers") < i("tabSheet") && i("tabSheet") < i("tabPlan") && i("tabPlan") < i("tabOverview"));
      assert.ok(/canViewAll\s*\?\s*\[\{ id: "sheet" as const[^\]]*tabSheet \}\]/.test(tabs));
      assert.ok(/canViewAll\s*\?\s*\[\{ id: "overview" as const[^\]]*tabOverview \}\]/.test(tabs));
      assert.ok(/\{ id: "plan", href: "\/dochazka\/omluvy"/.test(tabs), "Omluvy bez podmínky");
    },
  },
  {
    name: "12. texty: readOnlyNote přesně, nápověda a FAQ",
    run: () => {
      assert.equal(PLAN_TEXTS.readOnlyNote, "Svou omluvu zapíšeš v záložce Moje.");
      assert.equal(PLAN_TEXTS.membersLink, "Celý den v záložce Členové");
      const help = read("components/help/help-texts.ts");
      assert.ok(help.includes("V záložce Omluvy vidíte, kdo je na který den omluvený a jestli posílá náhradníka. Číslo pod dnem je počet omluvených, klepnutím na den uvidíte jména. Svou omluvu zapíšete v záložce Moje."));
      const member = read("components/help/sections/MemberHelp.tsx").replace(/\s+/g, " ");
      assert.ok(!member.includes("Zápis, Omluvy a Přehled"));
      assert.ok(member.includes("Proč nemám záložky Zápis a Přehled?"));
      assert.ok(member.includes("Vy máte Moje, Členové a Omluvy."));
      assert.ok(member.includes("Co je záložka Omluvy?") && member.includes("HELP_ATTENDANCE_PLAN"));
      assert.ok(member.indexOf("Co je záložka Členové?") < member.indexOf("Co je záložka Omluvy?"));
      assert.ok(member.includes("Zápis a přehled vidí správci docházky, Prezident, Viceprezident a admin. Ostatní členové vidí u každé schůzky, jestli jste omluvený(á) a koho posíláte jako náhradníka, po schůzce i chybění bez omluvy. Vidí taky počet vašich absencí. Medical nevidí, ukáže se jim jako omluva."));
    },
  },
  {
    name: "13. nové a upravené soubory: bez em dash, e-mailu, telefonu; plan.ts čistý",
    run: () => {
      const files = [
        "app/(app)/dochazka/omluvy/page.tsx",
        "lib/attendance/plan.ts",
        "lib/attendance/plan-view.ts",
        "components/attendance/AbsencePlanCalendar.tsx",
        "components/attendance/AttendanceTabs.tsx",
        "components/help/help-texts.ts",
        "components/help/sections/MemberHelp.tsx",
        "scripts/test-iter-047-omluvy.ts",
      ];
      for (const f of files) {
        const src = read(f);
        assert.ok(!src.includes(EM_DASH), `${f}: em dash`);
        if (f !== "scripts/test-iter-047-omluvy.ts") {
          assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(src), `${f}: e-mail`);
          assert.ok(!/\+420\s?\d{3}/.test(src), `${f}: telefon`);
        }
      }
      const plan = stripComments(read("lib/attendance/plan.ts"));
      assert.ok(!/drizzle-orm|@\/lib\/db|next\/|resend/.test(plan));
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
