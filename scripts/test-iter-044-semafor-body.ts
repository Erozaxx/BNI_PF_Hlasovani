/**
 * Testy iter-044 (vlastní body semaforu), čisté moduly a statické kontroly.
 * Bez DATABASE_URL a bez sítě. Číslování podle arch_iter-044_T-001 sekce 11
 * (SQL testy 12 až 16, 18, 19b, 23 jsou v test-iter-044-semafor-sql.ts,
 * testy 26 a 27 a čísla na stránce v test-info-pages.ts).
 *
 * Spuštění: npm run test:iter-044-body (součást test:iter-044)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  ATTENDANCE_MANAGER_PERMISSIONS,
  COMMITTEE_FUNCTION_AREA,
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  NON_DELEGABLE,
  PERMISSIONS,
  permissionsFor,
  type Permission,
} from "../lib/auth/permissions";
import {
  BONUS_CAP,
  BONUS_CATEGORIES,
  BONUS_POINTS,
  CATEGORY_CAPS,
  CATEGORY_SOURCE,
  WORK_GUIDE,
  WORK_POINTS,
  bonusSources,
  bonusWindow,
  computeBonus,
  filterBonusEvents,
  hasBonusSource,
  inBonusWindow,
  internalScore,
  type BonusCategory,
  type BonusSources,
} from "../lib/semafor/bonus";
import { COLOR_ORDER, COLOR_THRESHOLDS, colorFromTotal } from "../lib/semafor/color";
import { bonusForMonth, eventsAfterSnapshot, type BonusEvent } from "../lib/semafor/mine";
import {
  MANUAL_CATEGORIES,
  POINT_CATEGORIES,
  canDeletePoint,
  dateInPointRange,
  pointDateRange,
  pointWriteOutcome,
  validateActivity,
  validateManual,
  validateThanks,
} from "../lib/semafor/points";
import {
  POINT_TEXTS,
  SEMAFOR_TEXTS,
  bonusAnswerText,
  bonusLineText,
  bonusNoneText,
  categoryCapText,
  categoryName,
  helpSemaforLeadership,
  helpSemaforMember,
  myBonusLaterText,
  myIntroText,
  nextMonthStartText,
  overviewLegendText,
  pointErrorText,
  pointsSavedActivityText,
  scoreLegendText,
  semaforMemberQa,
  workGuideText,
} from "../lib/semafor/texts";
import {
  activityAddedEvent,
  activityDeletedEvent,
  pointsAddedEvent,
  pointsDeletedEvent,
  SEMAFOR_EVENT_KINDS,
} from "../lib/semafor/events";
import { TERMINAL_KINDS } from "../lib/ops/types";
import { actorHasPermissionSql, actorHoldsCommitteeFunctionSql, functionGrantsSql } from "../lib/db/queries/member-active";
import { insertPointSql } from "../lib/db/queries/semafor-points";
import { pgErrorCode } from "../lib/db/pg-error";
import { readPointsTables } from "../lib/db/queries/semafor-points";
import { semaforMemberFaq } from "../components/help/help-texts";
import { plural, pointsText, eachPointsText } from "../lib/text/plural";
import { cleanText } from "../lib/text/clean";
import {
  ACTIVITY_TABLE_DDL,
  ALL_POINTS_DDL,
  POINT_CHECKS,
  POINT_INDEXES_DDL,
  POINT_TABLE_DDL,
  POINT_UNIQUES,
  doBlock,
  smokeDdl,
} from "../lib/semafor/points-ddl";
import { DEFAULT_CHAPTER_SETTINGS } from "../lib/chapter/settings";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
const dialect = new PgDialect();

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}
const renderSql = (q: ReturnType<typeof sql>) => dialect.sqlToQuery(q);

const ALL: BonusSources = { mastermind: true, burza: true, points: true };
const COMBOS: BonusSources[] = [
  { mastermind: true, burza: true, points: true },
  { mastermind: true, burza: false, points: true },
  { mastermind: false, burza: true, points: true },
  { mastermind: false, burza: false, points: true },
];

/** Všechny texty aplikace a nápovědy k semaforu, které se dají vyrobit bez DB. */
function appTexts(): string[] {
  const out: string[] = [
    ...Object.values(POINT_TEXTS).flatMap((v) => (Array.isArray(v) ? [...v] : [String(v)])),
    workGuideText(),
    workGuideText({ ...ALL, mastermind: false }),
    bonusAnswerText(ALL),
    categoryCapText("thanks"),
    categoryCapText("activity"),
    pointErrorText("errThanksDuplicate", "2026-10-31"),
    pointErrorText("errThanksDuplicate", "2026-12-15"),
  ];
  for (const s of COMBOS) {
    out.push(myIntroText(s), bonusNoneText(s), scoreLegendText(s), overviewLegendText(s), myBonusLaterText("2026-09-30", "2026-10-01", s));
    out.push(...semaforMemberQa(s).flatMap((x) => [x.q, x.a]));
    out.push(...helpSemaforLeadership(s).map((h) => h.text));
  }
  for (const c of BONUS_CATEGORIES) out.push(categoryName(c));
  return out;
}

const tests: TestCase[] = [
  {
    name: "1. computeBonus: každá kategorie sama, podstropy poděkování 5 a akce 6, ostatní práce součtem, strop 20, nuly a neplatné počty",
    run: () => {
      assert.equal(computeBonus({}).bonus, 0);
      for (const c of ["mastermind", "burza", "function", "training", "host_member", "activity", "thanks"] as const) {
        assert.equal(computeBonus({ [c]: 1 }).bonus, BONUS_POINTS[c], c);
      }
      assert.equal(computeBonus({ work: 1 }, 3).bonus, 3);
      assert.equal(computeBonus({ thanks: 7 }).bonus, CATEGORY_CAPS.thanks, "7 poděkování = 5");
      assert.equal(computeBonus({ thanks: 7 }).lines.find((l) => l.category === "thanks")?.capped, true);
      assert.equal(computeBonus({ activity: 4 }).bonus, CATEGORY_CAPS.activity, "4 akce = 6");
      assert.equal(computeBonus({ activity: 3 }).capped, false);
      assert.equal(computeBonus({ work: 2 }, 7).bonus, 7, "ostatní práce 3 + 4 = 7");
      const big = computeBonus({ mastermind: 1, host_member: 1, training: 1 });
      assert.equal(big.raw, 7 + 10 + 7);
      assert.equal(big.bonus, BONUS_CAP);
      assert.equal(big.capped, true);
      assert.equal(computeBonus({ function: 3 }).bonus, BONUS_POINTS.function, "funkce se počítá jednou");
      for (const bad of [-3, NaN, Infinity]) {
        const r = computeBonus({ mastermind: bad, thanks: bad, work: bad }, bad);
        assert.ok(r.bonus >= 0 && Number.isFinite(r.bonus), `bonus nikdy záporný (${bad})`);
      }
      // Simulace z návrhu 4.5 s podstropy: aktivní člen jen účastí a poděkováními má 11, ne 17.
      assert.equal(computeBonus({ activity: 6, thanks: 7 }).bonus, 11);
      assert.deepEqual(BONUS_CATEGORIES.length, 8);
    },
  },
  {
    name: "2. funkce: přidělená 2026-09-15 se započte v měsíci 2026-09, ne v 2026-08, a jen jednou",
    run: () => {
      const ev: BonusEvent[] = [{ memberId: "m", category: "function", date: "2026-09-15" }];
      assert.equal(bonusForMonth("2026-09-01", "m", ev).bonus, BONUS_POINTS.function);
      assert.equal(bonusForMonth("2026-08-01", "m", ev).bonus, 0, "před přidělením");
      assert.equal(bonusForMonth("2027-06-01", "m", ev).bonus, BONUS_POINTS.function, "funkce nemá spodní mez okna");
      assert.equal(bonusForMonth("2026-09-01", "m", [...ev, ...ev]).bonus, BONUS_POINTS.function, "jednou");
      assert.equal(bonusForMonth("2026-09-01", "jiny", ev).bonus, 0);
    },
  },
  {
    name: "3. okno ručních bodů: earned_on = after nezapočte, = to započte; únor a přestupný rok",
    run: () => {
      const w = bonusWindow("2026-09-01");
      assert.deepEqual(w, { after: "2026-03-30", to: "2026-09-30" });
      const at = (d: string): BonusEvent => ({ memberId: "m", category: "thanks", date: d });
      assert.equal(bonusForMonth("2026-09-01", "m", [at(w.after)]).bonus, 0);
      assert.equal(bonusForMonth("2026-09-01", "m", [at("2026-03-31")]).bonus, 1);
      assert.equal(bonusForMonth("2026-09-01", "m", [at(w.to)]).bonus, 1);
      assert.equal(bonusForMonth("2026-09-01", "m", [at("2026-10-01")]).bonus, 0);
      assert.deepEqual(bonusWindow("2028-02-01"), { after: "2027-08-29", to: "2028-02-29" }, "přestupný únor");
      assert.ok(inBonusWindow(bonusWindow("2028-02-01"), "2028-02-29"));
      // ostatní práce: body se ořežou na rozsah a sečtou
      const works: BonusEvent[] = [
        { memberId: "m", category: "work", date: "2026-09-02", points: 3 },
        { memberId: "m", category: "work", date: "2026-09-03", points: 4 },
        { memberId: "m", category: "work", date: "2026-09-04", points: 99 },
      ];
      assert.equal(bonusForMonth("2026-09-01", "m", works).bonus, 17, "3 + 4 + 10 (ořez na WORK_POINTS.max)");
    },
  },
  {
    name: "4. posun barvy: interní barva je nejvýš o jednu barvu výš než BNI a nikdy níž",
    run: () => {
      const idx = (c: ReturnType<typeof colorFromTotal>) => COLOR_ORDER.indexOf(c);
      for (let bni = 0; bni <= 100; bni += 0.5) {
        for (let bonus = 0; bonus <= BONUS_CAP; bonus++) {
          const internal = internalScore(bni, bonus);
          const diff = idx(colorFromTotal(bni)) - idx(colorFromTotal(internal));
          assert.ok(diff === 0 || diff === 1, `BNI ${bni}, bonus ${bonus}: posun ${diff}`);
          assert.ok(internal >= bni);
        }
      }
      assert.equal(colorFromTotal(internalScore(49, 20)), "yellow", "49 + 20 = 69 žlutá");
      assert.equal(internalScore(95, 20), 100);
    },
  },
  {
    name: "4b. invariant: BONUS_CAP nejvýš šířka nejužšího pásma, hranice po 0,01 s reálným zaokrouhlením",
    run: () => {
      const t = COLOR_THRESHOLDS;
      const narrowest = Math.min(t.green - t.yellow, t.yellow - t.red);
      assert.ok(BONUS_CAP <= narrowest, `BONUS_CAP ${BONUS_CAP} > šířka pásma ${narrowest}`);
      const idx = (c: ReturnType<typeof colorFromTotal>) => COLOR_ORDER.indexOf(c);
      for (const edge of [t.red, t.yellow, t.green]) {
        for (let k = -10; k <= 0; k++) {
          const bni = Math.round((edge + k / 100) * 100) / 100;
          const diff = idx(colorFromTotal(bni)) - idx(colorFromTotal(internalScore(bni, BONUS_CAP)));
          assert.ok(diff <= 1, `BNI ${bni}: posun o ${diff} barvy`);
        }
      }
    },
  },
  {
    name: "5. bonusSources a filtr: vypnutý Master mind zahodí jen své události, ruční body a funkce zůstanou",
    run: () => {
      const on = { ...DEFAULT_CHAPTER_SETTINGS };
      assert.deepEqual(bonusSources(on), ALL);
      assert.deepEqual(bonusSources({ ...on, semaforEnabled: false }), { mastermind: false, burza: false, points: false });
      const events = BONUS_CATEGORIES.map((category) => ({ category, date: "2026-09-10" }));
      const noMm = filterBonusEvents(events, bonusSources({ ...on, mastermindEnabled: false })).map((e) => e.category);
      assert.ok(!noMm.includes("mastermind") && noMm.includes("function") && noMm.includes("thanks") && noMm.includes("work") && noMm.includes("burza"));
      assert.equal(filterBonusEvents(events, bonusSources({ ...on, semaforEnabled: false })).length, 0);
    },
  },
  {
    name: "6. validace: poděkování 2/3/301 znaků, body 0/11/2,5, datum zítra a hranice okna, kategorie, sám sobě",
    run: () => {
      const today = "2026-10-31";
      const th = (text: string, recipientId = "r") => validateThanks({ actorId: "a", recipientId, text });
      assert.deepEqual(th("  ab "), { ok: false, error: "errThanksText" });
      assert.equal(th("abc").ok, true);
      assert.equal(th("x".repeat(300)).ok, true);
      assert.deepEqual(th("x".repeat(301)), { ok: false, error: "errThanksText" });
      assert.deepEqual(th("Díky", "a"), { ok: false, error: "errThanksSelf" });
      const work = (points: unknown, workedOn: unknown = "2026-10-10", description: unknown = "Popis práce") =>
        validateManual("a", { category: "work", memberId: "r", workedOn, points, description }, today);
      assert.deepEqual(work(0), { ok: false, error: "errPoints" });
      assert.deepEqual(work(11), { ok: false, error: "errPoints" });
      assert.deepEqual(work(2.5), { ok: false, error: "errPoints" });
      assert.deepEqual(work("abc"), { ok: false, error: "errPoints" });
      assert.equal(work(1).ok, true);
      assert.equal(work("10").ok, true, "body z formuláře jsou text");
      assert.deepEqual(work(5, "2026-11-01"), { ok: false, error: "errDate" }, "zítra");
      assert.deepEqual(work(5, pointDateRange(today).after), { ok: false, error: "errDate" }, "hranice okna je mimo");
      assert.equal(work(5, "2026-05-01").ok, true);
      assert.deepEqual(work(5, "2026-02-31"), { ok: false, error: "errDate" }, "neexistující den");
      assert.deepEqual(work(5, "2026-10-10", "ab"), { ok: false, error: "errNote" });
      assert.deepEqual(validateManual("a", { category: "work", memberId: "a", workedOn: "2026-10-10", points: 3, description: "Popis" }, today), { ok: false, error: "errSelf" });
      assert.deepEqual(validateManual("a", { category: "training", memberId: "r", heldOn: "2026-10-10", topic: "x" }, today), { ok: false, error: "errNote" });
      assert.deepEqual(validateManual("a", { category: "host_member", memberId: "r", newMemberId: "r" }, today), { ok: false, error: "errNewMember" }, "stejný člen jako přivedený i host (F-06)");
      assert.deepEqual([...MANUAL_CATEGORIES].filter((c) => !(POINT_CATEGORIES as readonly string[]).includes(c)), []);
      assert.ok(!(MANUAL_CATEGORIES as readonly string[]).includes("thanks"));
      assert.equal(dateInPointRange("2026-10-31", today), true);
      assert.deepEqual(validateActivity("a", { title: "ab", heldOn: "2026-10-10", memberIds: ["x"] }, today), { ok: false, error: "errTitle" });
      assert.deepEqual(validateActivity("a", { title: "Sraz", heldOn: "2026-10-10", memberIds: ["a"] }, today), { ok: false, error: "errNoMembers" }, "aktér mezi účastníky vypadne");
      const act = validateActivity("a", { title: " Sraz ", heldOn: "2026-10-10", memberIds: ["x", "x", "a", "y"] }, today);
      assert.deepEqual(act, { ok: true, value: { title: "Sraz", heldOn: "2026-10-10", memberIds: ["x", "y"] } });
    },
  },
  {
    name: "6c. cleanText (L-3): nulová šířka, řídicí znaky směru a řídicí znaky se odstraní před kontrolou délky",
    run: () => {
      const zw = "\u200B\u200B\u200B";
      assert.equal(cleanText(zw), "");
      assert.deepEqual(validateThanks({ actorId: "a", recipientId: "r", text: zw }), { ok: false, error: "errThanksText" }, "tři U+200B nejsou 3 znaky");
      assert.deepEqual(validateThanks({ actorId: "a", recipientId: "r", text: `\uFEFF\u200Bab\u2060` }), { ok: false, error: "errThanksText" }, "po úpravě 2 znaky");
      assert.deepEqual(validateThanks({ actorId: "a", recipientId: "r", text: "D\u200Bík\u202Ey" }), { ok: true, value: { recipientId: "r", text: "Díky" } });
      assert.equal(cleanText("a\u202Eb\u2066c\u2069"), "abc");
      assert.equal(cleanText("  ahoj\u0000\u0007 svete \u007F"), "ahoj svete");
      assert.equal(cleanText("řádek 1\r\nřádek 2\t"), "řádek 1\nřádek 2");
      assert.equal(cleanText("Žluťoučký kůň ěščřžýáíé"), "Žluťoučký kůň ěščřžýáíé", "diakritika zůstane");
      assert.equal(cleanText(undefined), "");
      const title = validateActivity("a", { title: "\u200B\u200B\u200B", heldOn: "2026-10-10", memberIds: ["x"] }, "2026-10-31");
      assert.deepEqual(title, { ok: false, error: "errTitle" }, "název akce");
      const manual = validateManual("a", { category: "training", memberId: "r", heldOn: "2026-10-10", topic: zw }, "2026-10-31");
      assert.deepEqual(manual, { ok: false, error: "errNote" }, "téma školení");
    },
  },
  {
    name: "6d. texty oprav z review: F-05 (funkce Člen výboru), F-07 (skloňování, bez zavádějících vět), F-08 (odkaz podle pole), F-09 (mrtvé texty)",
    run: () => {
      const all = JSON.stringify([helpSemaforLeadership(ALL), semaforMemberQa(ALL), POINT_TEXTS]);
      assert.ok(!/Prezident, viceprezident ani admin/.test(all), "věta, že admin ostatní práci nezapisuje, zmizela");
      assert.ok(POINT_TEXTS.errNotCommittee.includes("funkce Člen výboru"));
      assert.ok(POINT_TEXTS.workOnlyCommittee.includes("funkce Člen výboru"));
      assert.equal(pointsSavedActivityText(3, 0), "Zapsáno: 3 účastníci.");
      assert.equal(pointsSavedActivityText(3, 1), "Zapsáno: 3 účastníci. Přeskočeno: 1 člen (neaktivní nebo už zapsaní).");
      assert.equal(pointsSavedActivityText(1, 2), "Zapsáno: 1 účastník. Přeskočeno: 2 členové (neaktivní nebo už zapsaní).");
      assert.equal(pointsSavedActivityText(5, 6), "Zapsáno: 5 účastníků. Přeskočeno: 6 členů (neaktivní nebo už zapsaní).");
      assert.ok(bonusAnswerText().includes("počítá se nejvýš 6 bodů"));
      assert.ok(bonusAnswerText().includes("počítá se nejvýš 5 bodů"));
      assert.equal(pointErrorText("errActivityDuplicate"), POINT_TEXTS.errActivityDuplicate);
      assert.equal(pointErrorText("errActivityMissing"), POINT_TEXTS.errActivityMissing);
      assert.notEqual(POINT_TEXTS.readNoTable, POINT_TEXTS.errNoTable, "čtení a zápis mají vlastní věty");
      const qa = semaforMemberQa(ALL);
      assert.deepEqual(qa.filter((x) => x.link).map((x) => x.link), ["pravidla-semafor"]);
      const help = read("components/help/sections/MemberHelp.tsx");
      assert.ok(help.includes('x.link === "pravidla-semafor"') && !help.includes("Kde je celý návod"), "odkaz se řídí polem, ne textem otázky");
      for (const dead of ["deleteConfirmYes", "deleteConfirmNo", "deleted:"]) {
        assert.ok(!read("lib/semafor/texts.ts").includes(`  ${dead}`), `${dead} je odstraněné`);
      }
    },
  },
  {
    name: "6b. pointWriteOutcome: pořadí perm, committee, self, active, duplicita",
    run: () => {
      const base = { perm: true, committee: true, self: false, active: true, inserted: 1 };
      assert.equal(pointWriteOutcome(base), "ok");
      assert.equal(pointWriteOutcome({ ...base, perm: false, committee: false, self: true, active: false, inserted: 0 }), "errNoPermission");
      assert.equal(pointWriteOutcome({ ...base, committee: false, self: true, active: false, inserted: 0 }), "errNotCommittee");
      assert.equal(pointWriteOutcome({ ...base, self: true, active: false, inserted: 0 }), "errSelf");
      assert.equal(pointWriteOutcome({ ...base, active: false, inserted: 0 }), "errInactive");
      assert.equal(pointWriteOutcome({ ...base, inserted: 0 }), "errDuplicate");
      assert.equal(pointWriteOutcome({ ...base, inserted: 0 }, "errWorkDuplicate"), "errWorkDuplicate");
      assert.equal(pointWriteOutcome({ self: false, active: true, inserted: 1 }), "ok", "poděkování nemá perm ani committee");
      assert.equal(pointWriteOutcome({ self: false, active: true, inserted: 0 }, "errThanksDuplicate"), "errThanksDuplicate");
    },
  },
  {
    name: "7. canDeletePoint: autor své poděkování ano, cizí ne; držitel práva cizí ano; člen bez práva cizí ruční záznam ne",
    run: () => {
      const me = { memberId: "me", canPoints: false };
      assert.equal(canDeletePoint(me, { category: "thanks", createdBy: "me" }), true);
      assert.equal(canDeletePoint(me, { category: "thanks", createdBy: "other" }), false);
      assert.equal(canDeletePoint(me, { category: "thanks", createdBy: null }), false);
      assert.equal(canDeletePoint(me, { category: "training", createdBy: "me" }), false, "ruční záznam smaže jen držitel práva");
      assert.equal(canDeletePoint({ memberId: "v", canPoints: true }, { category: "work", createdBy: "x" }), true);
    },
  },
  {
    name: "8. práva: semafor.points ve výchozí sadě funkce, ne v sadě moderátora ani správce docházky; značka a admin ano, odkaz ne",
    run: () => {
      const P: Permission = "semafor.points";
      assert.ok(PERMISSIONS.includes(P));
      assert.ok(!NON_DELEGABLE.includes(P));
      assert.ok(DEFAULT_FUNCTION_PERMISSIONS.includes(P));
      assert.ok(!MODERATOR_ROLE_PERMISSIONS.includes(P));
      assert.ok(!ATTENDANCE_MANAGER_PERMISSIONS.includes(P));
      const perms = (authMethod: "password" | "magic_link", role: "admin" | "moderator" | null, fns: { name: string; permissions: string[] | null }[], mgr = false) =>
        permissionsFor({ authMethod, managementRole: role, functions: fns, attendanceManager: mgr });
      const clen = { name: "Člen výboru", permissions: null };
      const pres = { name: "Prezident", permissions: ["admin-delegable"] };
      assert.ok(!perms("password", "moderator", []).has(P), "moderátor bez funkce");
      assert.ok(perms("password", null, [clen]).has(P));
      assert.ok(perms("password", null, [pres]).has(P));
      assert.ok(perms("password", "admin", []).has(P));
      assert.ok(!perms("password", null, [{ name: "Vlastní", permissions: ["guests.manage"] }]).has(P));
      assert.ok(perms("password", null, [{ name: "Vlastní", permissions: ["guests.manage", P] }]).has(P));
      for (const fns of [[clen], [pres], []]) assert.ok(!perms("magic_link", null, fns, true).has(P), "odkaz nemá semafor.points");
      assert.ok(!perms("magic_link", "admin", []).has(P));
      const fg = renderSql(functionGrantsSql(sql`cf.permissions`, P));
      assert.ok(fg.sql.includes("IS NULL OR"), "functionGrantsSql: výchozí sada");
      const ah = renderSql(actorHasPermissionSql("00000000-0000-4000-8000-000000000001", P));
      assert.ok(!ah.sql.includes("management_role = 'moderator'"), "actorHasPermissionSql nemá větev role moderátor");
      assert.ok(ah.sql.includes("password_hash IS NOT NULL"));
    },
  },
  {
    name: "9. události: nové druhy v TERMINAL_KINDS a v popiscích /status, bez příjemce, textu a názvu akce; poděkování autora událost nemá",
    run: () => {
      const ctx = { runId: "11111111-1111-4111-8111-111111111111", actor: "Vedoucí Test" };
      const events = [
        pointsAddedEvent(ctx, { category: "work", points: 5 }),
        pointsAddedEvent(ctx, { category: "training" }),
        activityAddedEvent(ctx, { participants: 4 }),
        pointsDeletedEvent(ctx, { category: "thanks", warn: true }),
        pointsDeletedEvent(ctx, { category: "training", warn: false }),
        activityDeletedEvent(ctx, { participants: 4 }),
      ];
      for (const e of events) {
        assert.ok(TERMINAL_KINDS.includes(e.kind), `${e.kind} je terminální`);
        assert.ok((SEMAFOR_EVENT_KINDS as readonly string[]).includes(e.kind));
        assert.equal(e.memberId, undefined);
        assert.equal(e.memberName, undefined);
        assert.equal(e.email, undefined);
        assert.equal(e.actor, "Vedoucí Test");
        assert.deepEqual(Object.keys(e.detail ?? {}).filter((k) => !["category", "points", "participants"].includes(k)), []);
        const json = JSON.stringify(e.detail ?? {});
        assert.ok(!/note|text|title|name|recipient/i.test(json), json);
      }
      assert.equal(events[3].severity, "warn");
      assert.equal(events[4].severity, "info");
      const table = read("app/(app)/status/EventTable.tsx");
      for (const k of ["semafor.points-added", "semafor.activity-added", "semafor.points-deleted", "semafor.activity-deleted"]) {
        assert.ok(table.includes(`"${k}"`), `popisek ${k}`);
      }
      // akce poděkování a smazání vlastního poděkování neloguje
      const act = stripComments(read("actions/semafor-points.ts"));
      for (const name of ["thankAction", "deleteOwnThanksAction"]) {
        const body = act.slice(act.indexOf(`export async function ${name}`));
        const chunk = body.slice(0, body.indexOf("export async function", 10) > 0 ? body.indexOf("export async function", 10) : undefined);
        assert.ok(!chunk.includes("safeLog("), `${name} neloguje (Q12)`);
      }
      assert.ok(act.includes("safeLog(() =>"), "log zásahů vedení v chráněném bloku (LL-011)");
    },
  },
  {
    name: "10. texty: bez U+2014, čísla odpovídají konstantám, Master mind bez „prezentace“, žádný „členský výbor“",
    run: () => {
      const texts = appTexts();
      for (const t of texts) assert.ok(!t.includes(EM_DASH), t.slice(0, 50));
      for (const t of texts) assert.ok(!/členský výbor|členského výboru|členskému výboru|členským výborem/i.test(t), `členský výbor: ${t.slice(0, 60)}`);
      for (const t of texts.filter((x) => /Master mind/.test(x))) {
        assert.ok(!/prezent|přednáš/i.test(t), t.slice(0, 80));
        assert.ok(!/odprezent/i.test(t));
      }
      const answer = bonusAnswerText(ALL);
      assert.ok(answer.includes(`Master mind, který proběhl, ${pointsText(BONUS_POINTS.mastermind)}.`));
      assert.ok(answer.includes(`Funkce v chapteru ${pointsText(BONUS_POINTS.function)}.`));
      assert.ok(answer.includes(`Školení, které jste vedli, ${pointsText(BONUS_POINTS.training)}.`));
      assert.ok(answer.includes(`Přivedený host, který se stal členem, ${pointsText(BONUS_POINTS.host_member)}.`));
      assert.ok(answer.includes(`Účast na akci chapteru ${pointsText(BONUS_POINTS.activity)}, počítá se nejvýš ${pointsText(CATEGORY_CAPS.activity)}.`));
      assert.ok(answer.includes(`Poděkování ${pointsText(BONUS_POINTS.thanks)}, počítá se nejvýš ${pointsText(CATEGORY_CAPS.thanks)}.`));
      assert.ok(answer.includes(`Ostatní práce pro chapter ${WORK_POINTS.min} až ${pointsText(WORK_POINTS.max)}.`));
      assert.ok(answer.endsWith(`Za 6 měsíců nejvýš ${pointsText(BONUS_CAP)}.`));
      assert.equal(POINT_TEXTS.errPoints, `Body jsou ${WORK_POINTS.min} až ${WORK_POINTS.max}.`);
      assert.ok(POINT_TEXTS.thanksIntro.includes("jednou za kalendářní měsíc"));
      assert.ok(semaforMemberQa(ALL).find((x) => x.q === "Jak poděkovat?")!.a.includes("jednou za kalendářní měsíc"));
      assert.equal(POINT_TEXTS.thanksReport, "Poděkování, které ti nesedí, smaže vedení. Ozvi se mu.");
      assert.equal(semaforMemberQa(ALL).find((x) => x.q === "Kdo vidí poděkování?")!.a, "Váš text a jméno vidí ten, komu děkujete, a vedení a členové výboru.");
      assert.equal(pointErrorText("errThanksDuplicate", "2026-10-31"), "Tomuhle členovi už jsi tento měsíc poděkoval(a). Další poděkování půjde od 1. listopadu.");
      assert.equal(nextMonthStartText("2026-12-15"), "1. ledna");
      assert.equal(nextMonthStartText("2026-01-31"), "1. února");
      // zdrojové soubory UI a nápovědy bez dlouhé pomlčky a bez „členský výbor“
      const files = [
        ...walk("components/semafor"),
        ...walk("lib/semafor"),
        ...walk("app/(app)/semafor"),
        "actions/semafor-points.ts",
        "lib/db/queries/semafor-points.ts",
        "lib/db/pg-error.ts",
        "lib/text/plural.ts",
        "scripts/migrate-iter-044-vlastni-body.ts",
        "content/pravidla/semafor.ts",
        "content/pravidla/semafor-zdroje.ts",
        "components/help/sections/AdminHelp.tsx",
        "components/help/sections/MemberHelp.tsx",
        "components/help/sections/ModeratorHelp.tsx",
        "components/help/help-texts.ts",
      ];
      for (const f of files) {
        const src = read(f);
        assert.ok(!src.includes(EM_DASH), `${f} bez U+2014`);
        if (f.startsWith("components/semafor") || f.startsWith("app/(app)/semafor")) assert.ok(!/členský výbor/i.test(src), f);
      }
      // vodítko u ostatní práce se skládá z konstant
      assert.equal(
        workGuideText(),
        `1 bod: drobnost na hodinu. 2 až 3: menší úkol. ${WORK_GUIDE.host}: jako přivést hosta. ${WORK_GUIDE.mastermind}: jako Master mind nebo školení. ${WORK_GUIDE.member}: jako přivést nového člena.`
      );
    },
  },
  {
    name: "10b. WORK_GUIDE odpovídá tabulce kategorií a horní mezi ostatní práce",
    run: () => {
      assert.equal(WORK_GUIDE.host, 5, "host 5 je jednotka Z9");
      assert.equal(WORK_GUIDE.mastermind, BONUS_POINTS.mastermind);
      assert.equal(WORK_GUIDE.member, BONUS_POINTS.host_member);
      assert.equal(BONUS_POINTS.training, BONUS_POINTS.mastermind, "školení = Master mind");
      assert.ok(WORK_GUIDE.member <= WORK_POINTS.max);
      assert.ok(WORK_GUIDE.small >= WORK_POINTS.min);
      assert.ok(WORK_GUIDE.task.every((n) => n >= WORK_POINTS.min && n <= WORK_POINTS.max));
      assert.deepEqual({ ...WORK_POINTS }, { min: 1, max: 10 });
      assert.deepEqual({ ...CATEGORY_CAPS }, { thanks: 5, activity: 6 });
      // pokyny z gate: obě pole formuláře mají stejnou větu o akci a hranici školení
      assert.ok(POINT_TEXTS.formActivityNote.startsWith("Akce je společná událost mimo pravidelnou schůzku."));
      assert.ok(POINT_TEXTS.formTrainingNote.includes("Pravidelné vzdělávací okénko na schůzce se nepočítá."));
    },
  },
  {
    name: "11. statický únik: /semafor čte jen session.memberId, /semafor/body má requirePageSession s právem první a funkci výboru jen ze session",
    run: () => {
      const mine = stripComments(read("app/(app)/semafor/page.tsx"));
      assert.ok(/listMyPoints\(session\.memberId/.test(mine) && /listMyWrittenThanks\(session\.memberId/.test(mine));
      assert.ok(!mine.includes("listPointsForManagement"), "/semafor nečte seznam vedení");
      assert.ok(!/searchParams|params/.test(mine), "memberId nikdy z URL");
      const body = stripComments(read("app/(app)/semafor/body/page.tsx"));
      const first = body.slice(body.indexOf("export default async function"));
      const afterBrace = first.slice(first.indexOf("{", first.indexOf(")")) + 1).trim();
      assert.ok(/^const session = await requirePageSession\(\{ permission: "semafor.points"/.test(afterBrace), "requirePageSession s právem první");
      assert.ok(/holdsCommitteeFunction\(session\.memberId\)/.test(body));
      assert.ok(/isPointCategory\(raw\)/.test(body), "filtr kategorie se validuje");
      assert.ok(body.includes("featureOff(\"semafor\")"));
      assert.ok(read("app/(app)/semafor/body/page.tsx").includes('export const dynamic = "force-dynamic"'));
      // nápověda: funkci výboru čte stránka jen ze session
      assert.ok(/holdsCommitteeFunction\(session\.memberId\)/.test(read("app/(app)/help/page.tsx")));
      // RSC nepředává klientovi ničí jiné body: klientské komponenty dostávají jen jména a vlastní poděkování
      const forms = read("components/semafor/PointsForms.tsx");
      assert.ok(forms.startsWith('"use client"'));
      assert.ok(!/listMy|listPoints|semafor-points"/.test(forms.replace(/@\/actions\/semafor-points/g, "")), "klientské formuláře nečtou data");
    },
  },
  {
    name: "17. actorHoldsCommitteeFunctionSql: cf.area a bind vybor (ne literál); insertPointSql pro work má obě podmínky, pro training jen právo",
    run: () => {
      assert.equal(COMMITTEE_FUNCTION_AREA, "vybor");
      const actor = "00000000-0000-4000-8000-000000000001";
      const c = renderSql(actorHoldsCommitteeFunctionSql(actor));
      assert.ok(c.sql.includes("cf.area ="), c.sql);
      assert.ok(!c.sql.includes("'vybor'"), "area jde jako bind parametr");
      assert.ok((c.params as unknown[]).includes("vybor"));
      const base = { actorId: actor, recipientId: "00000000-0000-4000-8000-000000000002", earnedOn: "2026-10-10", note: "Popis práce", today: "2026-10-31" };
      const w = renderSql(insertPointSql({ category: "work", points: 5, ...base }));
      assert.ok(w.sql.includes("password_hash IS NOT NULL"), "právo");
      assert.ok(w.sql.includes("cf.area ="), "funkce Člen výboru");
      assert.ok(w.sql.includes("perm AND committee AND NOT self AND active"));
      const t = renderSql(insertPointSql({ category: "training", ...base }));
      assert.ok(!t.sql.includes("cf.area ="), "školení funkci výboru nevyžaduje");
      assert.ok(t.sql.includes("WHERE perm AND NOT self AND active"));
      for (const q of [w, t]) assert.ok(q.sql.includes("ON CONFLICT DO NOTHING"), "bez cíle konfliktu (R-18)");
    },
  },
  {
    name: "19. statické akce: deleteOwnThanksAction nevolá deletePoint; SQL větev práva jen za requirePermission; addWorkAction volá requirePermission",
    run: () => {
      const act = stripComments(read("actions/semafor-points.ts"));
      const chunks = new Map(
        act
          .split(/export async function /)
          .slice(1)
          .map((c) => [c.slice(0, c.indexOf("(")), c] as const)
      );
      const permissionActions = [
        "addTrainingAction",
        "addHostMemberAction",
        "addWorkAction",
        "addActivityAction",
        "addActivityMembersAction",
        "deletePointAction",
        "deleteActivityAction",
      ];
      assert.deepEqual([...chunks.keys()].sort(), [...permissionActions, "thankAction", "deleteOwnThanksAction"].sort());
      for (const name of permissionActions) {
        const c = chunks.get(name)!;
        const guard = c.indexOf('requirePermission("semafor.points")');
        assert.ok(guard >= 0, `${name}: requirePermission("semafor.points")`);
        assert.ok(c.indexOf("requireAuth") < 0 || c.indexOf("requireAuth") > guard, `${name}: guard první`);
        const feature = c.indexOf('requireFeature("semafor")');
        assert.ok(feature > guard, `${name}: requireFeature za guardem`);
        // před guardem žádná práce s DB
        assert.ok(!/await (insert|delete|add)\w+\(/.test(c.slice(0, guard)), `${name}: DB před guardem`);
      }
      const own = chunks.get("deleteOwnThanksAction")!;
      assert.ok(own.includes("requireAuth()") && own.includes("deleteOwnThanks("));
      assert.ok(!own.includes("deletePoint(") && !own.includes("requirePermission"), "vlastní mazání bez větve práva");
      const thank = chunks.get("thankAction")!;
      assert.ok(thank.includes("requireAuth()") && thank.includes("insertThanks("));
      assert.ok(!/insertPoint|insertActivity|deletePoint/.test(thank));
      assert.ok(chunks.get("addWorkAction")!.includes('requirePermission("semafor.points")'));
      // dotazy: kdo používá actorHasPermissionSql
      const q = stripComments(read("lib/db/queries/semafor-points.ts"));
      const deleteOwn = q.slice(q.indexOf("export function deleteOwnThanksSql"), q.indexOf("export async function deleteOwnThanks("));
      assert.ok(!deleteOwn.includes("actorHasPermissionSql"), "deleteOwnThanksSql bez větve práva");
      const insertThanks = q.slice(q.indexOf("export function insertThanksSql"), q.indexOf("export async function insertThanks("));
      assert.ok(!insertThanks.includes("actorHasPermissionSql"));
      // actions nepoužívají transakce ani session z formuláře
      for (const f of ["actions/semafor-points.ts", "lib/db/queries/semafor-points.ts"]) {
        const src = stripComments(read(f));
        assert.ok(!src.includes("db.transaction") && !src.includes(".transaction("), `${f}: LL-003`);
        assert.ok(!src.includes("dangerouslySetInnerHTML"));
      }
      assert.ok(!/formData\.get\("(actorId|memberId)"\)[\s\S]{0,40}session/.test(act), "aktér je vždy ze session");
      assert.ok(!/actorId:\s*field\(/.test(act) && !/actorId:\s*uuidField\(/.test(act), "actorId nikdy z formuláře");
    },
  },
  {
    name: "19c. Q10 A: změna funkce nepřepisuje assigned_at; migrace a DDL: host guard, bez interpolace v DO, bez transakcí",
    run: () => {
      const mf = stripComments(read("lib/db/queries/member-functions.ts"));
      assert.ok(!/assigned_at\s*=\s*now\(\)/.test(mf), "assigned_at se při změně funkce nepřepisuje");
      assert.ok(read("lib/db/queries/member-functions.ts").includes("iter-044 (Q10 A)"));
      const mig = read("scripts/migrate-iter-044-vlastni-body.ts");
      assert.ok(mig.includes("assertApplyAllowed(true, process.env.EXPECT_DB_HOST"), "host guard povinný");
      assert.ok(mig.includes("smokeDdl()") && mig.includes("doBlock("), "smoke stejného tvaru přes doBlock");
      assert.ok(!/\bsql`/.test(stripComments(mig)), "žádné tagované šablony (bind parametry v DO by rozbily LL-006)");
      assert.ok(!stripComments(mig).includes("db.transaction"));
      assert.ok(!mig.includes("process.env.DATABASE_URL!"), "bez nevalidovaného URL");
      for (const ddl of [ACTIVITY_TABLE_DDL, POINT_TABLE_DDL, POINT_INDEXES_DDL, ALL_POINTS_DDL, smokeDdl()]) {
        assert.ok(!ddl.includes("${") && !ddl.includes("$$"), "DDL bez interpolace");
        assert.ok(!ddl.includes(EM_DASH));
      }
      const block = doBlock(ALL_POINTS_DDL);
      assert.ok(block.startsWith("DO $$ BEGIN\nPERFORM set_config('lock_timeout', '5s', true);"));
      assert.ok(block.endsWith("END $$"));
      assert.ok(!block.slice(5, -6).includes("$"), "uvnitř $$ žádné $");
      assert.throws(() => doBlock("SELECT '$$'"));
      // smoke má stejný tvar: stejný počet CHECK, UNIQUE a FK jako skutečné DDL
      const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
      const smoke = smokeDdl();
      assert.equal(count(smoke, /CONSTRAINT sp_/g), count(ALL_POINTS_DDL, /CONSTRAINT sp_/g));
      assert.equal(count(smoke, /UNIQUE INDEX/g), count(ALL_POINTS_DDL, /UNIQUE INDEX/g));
      assert.equal(count(smoke, /ON DELETE CASCADE/g), count(ALL_POINTS_DDL, /ON DELETE CASCADE/g));
      assert.equal(count(smoke, /ON DELETE SET NULL/g), count(ALL_POINTS_DDL, /ON DELETE SET NULL/g));
      assert.ok(smoke.includes("md5(lower(btrim(note)))"));
      assert.ok(!/semafor_point|semafor_activity/.test(smoke), "smoke nesahá na skutečné tabulky");
      // Drizzle zrcadlí DDL: tabulky, CHECK, UNIQUE
      const schema = read("lib/db/schema.ts");
      assert.ok(schema.includes('"semafor_activity"') && schema.includes('"semafor_point"'));
      for (const name of [...POINT_CHECKS, "sa_title_len", ...Object.keys(POINT_UNIQUES), "idx_sp_member_earned", "idx_sp_earned", "idx_sp_created_by", "idx_sa_held_on"]) {
        assert.ok(schema.includes(`"${name}"`), `schema.ts: ${name}`);
      }
      assert.ok(schema.includes("points IS NOT NULL") || /\$\{table\.points\} IS NOT NULL/.test(schema), "sp_points má IS NOT NULL (R-02)");
      // PROD migrace se z kódu nikde nespouští
      assert.ok(!/migrate-iter-044/.test(read("package.json")), "migrace není v npm skriptech");
    },
  },
  {
    name: "20. pgErrorCode a readPointsTables: 42P01 v err.code i err.cause.code = missing, jiná chyba dál, úspěch vrátí hodnotu",
    run: async () => {
      assert.equal(pgErrorCode({ code: "42P01" }), "42P01");
      assert.equal(pgErrorCode({ cause: { code: "42P01" } }), "42P01");
      assert.equal(pgErrorCode(new Error("x")), undefined);
      assert.equal(pgErrorCode(null), undefined);
      const warn = console.warn;
      console.warn = () => {};
      try {
        assert.deepEqual(await readPointsTables(async () => Promise.reject({ code: "42P01" })), { missing: true });
        assert.deepEqual(await readPointsTables(async () => Promise.reject({ cause: { code: "42P01" } })), { missing: true });
      } finally {
        console.warn = warn;
      }
      await assert.rejects(() => readPointsTables(async () => Promise.reject({ code: "08006" })), (e: unknown) => (e as { code: string }).code === "08006");
      assert.deepEqual(await readPointsTables(async () => 42), { missing: false, value: 42 });
      // stránky a bonus jdou přes obal
      const q = stripComments(read("lib/db/queries/semafor-points.ts"));
      for (const fn of ["listMyPoints", "listMyWrittenThanks", "listPointsForManagement", "listRecentNewMembers", "readPointEvents"]) {
        const start = q.indexOf(`export async function ${fn}`);
        assert.ok(start > 0, fn);
        assert.ok(q.slice(start, start + 600).includes("readPointsTables("), `${fn} přes readPointsTables`);
      }
      for (const page of ["app/(app)/semafor/page.tsx", "app/(app)/semafor/body/page.tsx"]) {
        assert.ok(/errNoTable|readNoTable/.test(read(page)), `${page}: věta při chybějící tabulce`);
      }
    },
  },
  {
    name: "21. zdroje bonusu (R-05): CATEGORY_SOURCE úplná, filtr, hasBonusSource, čtyři kombinace Master mind a Burza bez slov vypnutých částí, žádná otázka FAQ prázdná",
    run: () => {
      assert.deepEqual(Object.keys(CATEGORY_SOURCE).sort(), [...BONUS_CATEGORIES].sort());
      assert.equal(CATEGORY_SOURCE.mastermind, "mastermind");
      assert.equal(CATEGORY_SOURCE.burza, "burza");
      for (const c of ["function", "training", "host_member", "activity", "thanks", "work"] as BonusCategory[]) assert.equal(CATEGORY_SOURCE[c], "points", c);
      assert.equal(hasBonusSource(ALL), true);
      assert.equal(hasBonusSource({ mastermind: false, burza: false, points: true }), true, "při zapnutém semaforu vždy true");
      assert.equal(hasBonusSource({ mastermind: false, burza: false, points: false }), false);
      for (const s of COMBOS) {
        const parts = [
          myIntroText(s),
          bonusNoneText(s),
          scoreLegendText(s),
          overviewLegendText(s),
          semaforMemberQa(s).map((x) => `${x.q} ${x.a}`).join(" "),
          helpSemaforLeadership(s).map((h) => h.text).join(" "),
          bonusAnswerText(s),
          workGuideText(s),
        ].join(" ");
        if (!s.mastermind) assert.ok(!/Master mind/.test(parts), `bez Master mindu: ${JSON.stringify(s)}`);
        if (!s.burza) assert.ok(!/Burz/.test(parts), `bez Burzy: ${JSON.stringify(s)}`);
        assert.ok(semaforMemberQa(s).every((x) => x.q.trim() !== "" && x.a.trim() !== ""), "žádná prázdná otázka");
        assert.equal(semaforMemberFaq(s).length, semaforMemberQa(s).length);
        assert.deepEqual(helpSemaforMember(s), semaforMemberQa(s).map((x) => x.a));
        assert.ok(bonusNoneText(s) !== "");
      }
      // vypnutý semafor: o bonusu ani slovo
      const off: BonusSources = { mastermind: false, burza: false, points: false };
      assert.ok(!/bonus/i.test(scoreLegendText(off) + overviewLegendText(off) + helpSemaforMember(off).join(" ")));
      // nápověda neháda otázku podle začátku odpovědi
      assert.ok(!/startsWith\(/.test(stripComments(read("components/help/help-texts.ts"))));
    },
  },
  {
    name: "22. eventsAfterSnapshot (R-08): funkce s date <= afterDate vypadne, s date > afterDate zůstane, ostatní beze změny",
    run: () => {
      const ev = [
        { category: "function" as const, date: "2026-09-30" },
        { category: "function" as const, date: "2026-10-05" },
        { category: "thanks" as const, date: "2026-10-05" },
        { category: "mastermind" as const, date: "2026-09-01" },
      ];
      const r = eventsAfterSnapshot(ev, "2026-09-30");
      assert.deepEqual(r.map((e) => `${e.category}:${e.date}`), ["function:2026-10-05", "thanks:2026-10-05", "mastermind:2026-09-01"]);
      const q = stripComments(read("lib/db/queries/semafor.ts"));
      assert.ok(q.slice(q.indexOf("export async function countMyEventsAfter")).includes("eventsAfterSnapshot("));
    },
  },
  {
    name: "25. skloňování (R-20): 1, 2, 5, 7, 10 bodů v řádcích rozpisu",
    run: () => {
      assert.equal(plural(1, "a", "b", "c"), "a");
      assert.equal(plural(4, "a", "b", "c"), "b");
      assert.equal(plural(0, "a", "b", "c"), "c");
      assert.equal(bonusLineText("thanks", 1, 1), "Poděkování: 1× po 1 bodu");
      assert.equal(bonusLineText("activity", 3, 2), "Akce chapteru: 3× po 2 bodech");
      assert.equal(bonusLineText("burza", 2, 5), "Burza pomoci: 2× po 5 bodech");
      assert.equal(bonusLineText("training", 1, 7), "Školení: 1× po 7 bodech");
      assert.equal(bonusLineText("host_member", 1, 10), "Přivedený host, který se stal členem: 1× po 10 bodech");
      assert.equal(bonusLineText("function", 1, 5), "Funkce v chapteru: 5 bodů");
      assert.equal(bonusLineText("work", 2, 1), "Ostatní práce: 1 bod");
      assert.equal(bonusLineText("work", 2, 2), "Ostatní práce: 2 body");
      assert.equal(bonusLineText("work", 3, 10), "Ostatní práce: 10 bodů");
      assert.equal(pointsText(1), "1 bod");
      assert.equal(pointsText(2), "2 body");
      assert.equal(pointsText(5), "5 bodů");
      assert.equal(eachPointsText(2), "po 2 bodech");
      assert.equal(categoryCapText("thanks"), "Z poděkování se počítá nejvýš 5 bodů.");
      assert.equal(categoryCapText("activity"), "Z akcí se počítá nejvýš 6 bodů.");
      assert.equal(categoryCapText("work"), "");
    },
  },
  {
    name: "26b. UI: MyScoreCard a přehled skládají rozpis z BonusLines, záložka Body jen s canPoints, nav se posouvá vodorovně",
    run: () => {
      const tabs = read("components/semafor/SemaforTabs.tsx");
      assert.ok(tabs.includes("canPoints") && tabs.includes("overflow-x-auto") && tabs.includes("!canViewAll && !canImport && !canPoints"));
      assert.ok(tabs.indexOf('"points"') < tabs.indexOf('"import" as const'), "pořadí Můj semafor, Přehled, Body, Import");
      for (const page of ["app/(app)/semafor/page.tsx", "app/(app)/semafor/prehled/page.tsx", "app/(app)/semafor/import/page.tsx", "app/(app)/semafor/body/page.tsx"]) {
        assert.ok(read(page).includes("canPoints"), `${page}: canPoints do záložek`);
      }
      assert.ok(read("components/semafor/MyScoreCard.tsx").includes("<BonusLines"));
      assert.ok(read("components/semafor/OverviewTable.tsx").includes("<BonusLines"));
      const lines = read("components/semafor/BonusLines.tsx");
      assert.ok(lines.includes("CATEGORY_SOURCE[l.category]"), "kategorie vypnutých částí se nevypíší");
      // mobil: tlačítka a pole mají cíl 44 px
      const forms = read("components/semafor/PointsForms.tsx");
      assert.ok(forms.includes("h-11") && forms.includes("min-h-[44px]"));
      // formuláře nepoužívají router.refresh (LL-017)
      assert.ok(!stripComments(forms).includes("router.refresh") && !stripComments(read("components/semafor/DeleteButtons.tsx")).includes("router.refresh"));
      assert.ok(!existsSync(join(ROOT, "app/loading.tsx")), "žádný root loading.tsx (LL-017)");
    },
  },
  {
    name: "28. help: nové body nápovědy jen s příznaky, Člen výboru vidí bod o udělování, admin větu o funkci",
    run: () => {
      const items = helpSemaforLeadership(ALL);
      assert.equal(items.filter((i) => i.pointsOnly).length, 5);
      assert.equal(items.filter((i) => i.committeeOnly).length, 1);
      assert.ok(items.find((i) => i.committeeOnly)!.text.includes(workGuideText()));
      assert.ok(items.find((i) => i.text.startsWith("Přehled se jmény"))!.text.includes("Ostatní práci jen držitel funkce Člen výboru."));
      assert.equal(helpSemaforLeadership({ ...ALL, points: false }).filter((i) => i.pointsOnly || i.committeeOnly).length, 0);
      const mod = read("components/help/sections/ModeratorHelp.tsx");
      assert.ok(mod.includes("semaforPoints || !h.pointsOnly") && mod.includes("semaforCommittee || !h.committeeOnly"));
      const page = read("components/help/HelpPage.tsx");
      assert.ok(page.includes("showSemaforPointsHelp") && page.includes("showSemaforCommitteeHelp"));
      const admin = read("components/help/sections/AdminHelp.tsx");
      assert.ok(admin.includes("Ostatní práci v semaforu uděluje jen držitel funkce Člen výboru.") && admin.includes("Po odebrání funkce bonus zmizí i ze starších měsíců."));
      assert.ok(read("components/help/sections/MemberHelp.tsx").includes("/pravidla/semafor"));
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
      console.log(`FAIL ${t.name}\n     ${(e as Error).stack?.split("\n").slice(0, 14).join("\n     ") ?? (e as Error).message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testů prošlo`);
  process.exit(failed ? 1 : 0);
})();
void SEMAFOR_TEXTS;
