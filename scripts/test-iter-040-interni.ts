/**
 * Testy iter-040 (interní schůzka v docházce, arch T-001 sekce 12, gate Z1 až Z4).
 * Bez DATABASE_URL, bez sítě. Statické kontroly čtou zdrojáky z disku.
 *
 * Případy 1 až 7: čisté funkce `lib/attendance/internal.ts` a navazující
 * pravidla (práva, guard dne, report). Případy 8 až 17: statika dotazů, akcí,
 * migrace, textů, mřížky, ops logu a UI.
 *
 * Spuštění: npm run test:iter-040 (tento soubor + test:iter-039)
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  INTERNAL_TEXTS,
  absencesDeletedFlag,
  dayCellClass,
  dayNumberClass,
  dayTone,
  decideInternalCancel,
  decideInternalCreate,
  internalCardView,
  internalOpsEvent,
} from "../lib/attendance/internal";
import { dayAriaLabel, MEMBER_TEXTS, pragueInstant } from "../lib/attendance/rules";
import { PLAN_TEXTS, planDayAria } from "../lib/attendance/plan";
import { isGuardedDay } from "../lib/attendance/sheet";
import { buildAttendanceReport, buildMorningMail, type ReportData } from "../lib/attendance/report";
import {
  ADMIN_DELEGABLE_MARKER,
  ATTENDANCE_MANAGER_PERMISSIONS,
  DEFAULT_FUNCTION_PERMISSIONS,
  permissionsFor,
  type Permission,
} from "../lib/auth/permissions";
import { TERMINAL_KINDS } from "../lib/ops/types";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 21. 10. 2026 12:00 pražského času (letní čas). */
const NOW = new Date("2026-10-21T10:00:00Z");
const TODAY = "2026-10-21";
const NONE = { hasMeeting: false, hasInternal: false };

const fn = (name: string, permissions: string[] | null) => ({ name, permissions });
const perms = (authMethod: "password" | "magic_link" | "email_link", role: "admin" | "moderator" | null, functions: ReturnType<typeof fn>[], flag: boolean) =>
  permissionsFor({ authMethod, managementRole: role, functions, attendanceManager: flag });

const tests: TestCase[] = [
  {
    name: "1. dayTone: none, internal, meeting, meeting + internal vyhraje meeting",
    run: () => {
      assert.equal(dayTone({ hasMeeting: false, hasInternal: false }), "none");
      assert.equal(dayTone({ hasMeeting: false, hasInternal: true }), "internal");
      assert.equal(dayTone({ hasMeeting: true, hasInternal: false }), "meeting");
      assert.equal(dayTone({ hasMeeting: true, hasInternal: true }), "meeting");
    },
  },
  {
    name: "2. decideInternalCreate: dnes ne, zítra ano, +365 ano, +366 ne, včera ne, běžná ne, existující = toastExists",
    run: () => {
      const d = (date: string, s = NONE) => decideInternalCreate(NOW, date, s);
      const today = d(TODAY);
      assert.equal(today.ok, false);
      if (!today.ok) assert.equal(today.message, INTERNAL_TEXTS.errToday);
      assert.deepEqual(d("2026-10-22"), { ok: true, alreadyExists: false });
      assert.deepEqual(d("2027-10-21"), { ok: true, alreadyExists: false }, "dnes + 365");
      const far = d("2027-10-22");
      assert.equal(far.ok, false);
      if (!far.ok) assert.equal(far.message, INTERNAL_TEXTS.errRange);
      const past = d("2026-10-20");
      assert.equal(past.ok, false);
      const meeting = d("2026-10-22", { hasMeeting: true, hasInternal: false });
      assert.equal(meeting.ok, false);
      if (!meeting.ok) assert.equal(meeting.message, INTERNAL_TEXTS.errMeeting);
      const exists = d("2026-10-22", { hasMeeting: false, hasInternal: true });
      assert.deepEqual(exists, { ok: true, alreadyExists: true, message: INTERNAL_TEXTS.toastExists });
      assert.equal(d("2026-13-40").ok, false, "neplatné datum");
    },
  },
  {
    name: "3. decideInternalCancel: zítra ano, 16:59:59 ano a 17:00:00 ne (DST 25. 10. 2026 a 28. 3. 2027), uzavřený ne, zápis ne, minulý ne",
    run: () => {
      const free = { hasMeeting: false, finalized: false, hasManagerRecord: false };
      assert.equal(decideInternalCancel(NOW, "2026-10-22", free).ok, true);
      assert.equal(decideInternalCancel(NOW, TODAY, free).ok, true, "dnes před 17:00");
      for (const date of ["2026-10-25", "2027-03-28", "2026-07-15"]) {
        const edge = pragueInstant(date, "17:00");
        const before = decideInternalCancel(new Date(edge.getTime() - 1000), date, free);
        const at = decideInternalCancel(edge, date, free);
        assert.equal(before.ok, true, `${date} 16:59:59`);
        assert.equal(at.ok, false, `${date} 17:00:00`);
        if (!at.ok) assert.equal(at.message, INTERNAL_TEXTS.errClosed);
      }
      // 17:00 pražského času: 25. 10. 2026 je už zimní (16:00Z), 28. 3. 2027 letní (15:00Z)
      assert.equal(pragueInstant("2026-10-25", "17:00").toISOString(), "2026-10-25T16:00:00.000Z");
      assert.equal(pragueInstant("2027-03-28", "17:00").toISOString(), "2027-03-28T15:00:00.000Z");
      const closed = decideInternalCancel(NOW, "2026-10-22", { ...free, finalized: true });
      assert.equal(closed.ok, false);
      if (!closed.ok) assert.equal(closed.message, INTERNAL_TEXTS.errClosed);
      const rec = decideInternalCancel(NOW, "2026-10-22", { ...free, hasManagerRecord: true });
      assert.equal(rec.ok, false);
      if (!rec.ok) assert.equal(rec.message, INTERNAL_TEXTS.errRecorded);
      const recMeeting = decideInternalCancel(NOW, "2026-10-22", { ...free, hasManagerRecord: true, hasMeeting: true });
      assert.equal(recMeeting.ok, true, "zápis správce s běžnou schůzkou zrušení nebrání");
      const past = decideInternalCancel(NOW, "2026-10-20", free);
      assert.equal(past.ok, false);
      if (!past.ok) assert.equal(past.message, INTERNAL_TEXTS.errPast);
    },
  },
  {
    name: "4. deletesAbsences = !hasMeeting a Z1: absencesDeleted z pravidla, při n = 0 false",
    run: () => {
      const free = { hasMeeting: false, finalized: false, hasManagerRecord: false };
      const a = decideInternalCancel(NOW, "2026-10-22", free);
      const b = decideInternalCancel(NOW, "2026-10-22", { ...free, hasMeeting: true });
      assert.ok(a.ok && a.deletesAbsences === true);
      assert.ok(b.ok && b.deletesAbsences === false);
      assert.equal(absencesDeletedFlag(1, false), true);
      assert.equal(absencesDeletedFlag(1, true), false);
      assert.equal(absencesDeletedFlag(0, false), false, "Z1: při n = 0 false");
      assert.equal(absencesDeletedFlag(0, true), false);
    },
  },
  {
    name: "5. permissionsFor: moderátor, Člen výboru, P a VP, admin, správce odkazem přesně čtyři bez edit_history, moderátor odkazem nic",
    run: () => {
      const P = "attendance.internal_manage";
      assert.ok(perms("password", "moderator", [], false).has(P));
      assert.ok(perms("password", null, [fn("Člen výboru", null)], false).has(P));
      for (const name of ["Prezident", "Viceprezident"]) {
        assert.ok(perms("password", null, [fn(name, [ADMIN_DELEGABLE_MARKER])], false).has(P), name);
      }
      assert.ok(perms("password", "admin", [], false).has(P));
      for (const method of ["magic_link", "email_link"] as const) {
        const got = perms(method, null, [], true);
        assert.deepEqual([...got].sort(), [...ATTENDANCE_MANAGER_PERMISSIONS].sort());
        assert.equal(got.size, 4);
        assert.ok(!got.has("attendance.edit_history"));
        assert.ok(got.has(P));
        assert.equal(perms(method, "moderator", [], false).size, 0, "moderátor odkazem nic");
        assert.equal(perms(method, null, [], false).size, 0, "člen odkazem nic");
        const boss = perms(method, null, [fn("Prezident", [ADMIN_DELEGABLE_MARKER])], true);
        assert.ok(!boss.has("attendance.edit_history"));
        assert.equal(boss.size, 4);
      }
      assert.ok(DEFAULT_FUNCTION_PERMISSIONS.includes(P as Permission));
      assert.ok(!perms("password", null, [], false).has(P), "běžný člen s heslem právo nemá");
      assert.ok(read("lib/auth/permissions.ts").includes("Přesně čtyři"), "komentář opraven");
    },
  },
  {
    name: "6. isGuardedDay: interní den není guard, den bez čehokoli ano",
    run: () => {
      const base = { date: "2026-10-22", today: "2026-10-22", mode: "normal" as const, hasMeeting: false, hasInternal: false, hasManagerRecord: false };
      assert.equal(isGuardedDay(base), true);
      assert.equal(isGuardedDay({ ...base, hasInternal: true }), false);
      assert.equal(isGuardedDay({ ...base, hasMeeting: true }), false);
      assert.equal(isGuardedDay({ ...base, hasManagerRecord: true }), false);
    },
  },
  {
    name: "7. report a ranní mail: interní, běžná + interní, dayKind v payloadu",
    run: () => {
      const base: ReportData = {
        date: "2026-10-22",
        hasMeeting: false,
        internal: true,
        mode: "recorded",
        late: false,
        members: [],
        writers: [],
        lastChange: null,
      };
      const t = (d: ReportData) => buildAttendanceReport({ data: d, recipientName: "P", url: "u" }).text;
      assert.ok(t(base).includes("docházka z interní schůzky ve čtvrtek 22. 10. 2026."));
      assert.ok(t({ ...base, hasMeeting: true }).includes("docházka ze schůzky ve čtvrtek 22. 10. 2026."));
      assert.ok(!t({ ...base, hasMeeting: true }).includes("interní"));
      assert.ok(t({ ...base, internal: false }).includes("docházka ze dne čtvrtek 22. 10. 2026."));
      const mail = (internal?: boolean) =>
        buildMorningMail({ name: "A", date: "2026-10-22", expiresAt: new Date("2026-10-22T10:00:00Z"), excused: 0, withSubstitute: 0, url: "u", internal }).text;
      assert.ok(mail(true).includes("dnes je interní schůzka. Docházku odškrtáš přes tenhle odkaz, bez přihlašování."));
      assert.ok(mail(false).includes("dnes je schůzka. Docházku odškrtáš"));
      assert.ok(!mail(undefined).includes("interní"));
      const dv = read("lib/attendance/day-view.ts");
      assert.ok(dv.includes('dayKind: meta.hasMeeting ? "meeting" : meta.hasInternal ? "internal" : "none"'));
      assert.ok(read("lib/attendance/sheet.ts").includes('dayKind: "meeting" | "internal" | "none"'));
    },
  },
  {
    name: "8. statické: cron, getCloseState, getDayMeta a isAttendanceDay znají interní den",
    run: () => {
      const cron = stripComments(read("lib/attendance/cron.ts"));
      assert.ok(/todayState\.hasMeeting \|\| todayState\.hasInternal\) linkTargets/.test(cron), "ranní odkazy");
      assert.ok(/internal: !state\.hasMeeting && state\.hasInternal/.test(cron), "report");
      assert.ok(/morningInternal = !todayState\.hasMeeting && todayState\.hasInternal/.test(cron), "ranní mail");
      const close = stripComments(read("lib/db/queries/attendance-close.ts"));
      assert.ok(close.includes("attendance_internal_day") && close.includes("AS has_internal"));
      assert.ok(/isAttendanceDay: hasMeeting \|\| hasInternal \|\| hasManagerRecord/.test(close));
      const q = stripComments(read("lib/db/queries/attendance.ts"));
      const meta = q.slice(q.indexOf("export async function getDayMeta"), q.indexOf("function dayListCriteriaSql"));
      assert.ok(meta.includes("attendance_internal_day") && meta.includes("hasInternal"));
    },
  },
  {
    name: "9. statické SQL: bez transakce, mazání omluv a odkazů jen s EXISTS (del) a bez běžné, Z1 bez abs_deleted a count nad gone",
    run: () => {
      const src = stripComments(read("lib/db/queries/attendance-internal.ts"));
      assert.ok(!/transaction\(/.test(src), "žádná transakce (LL-003)");
      assert.ok(!/sql\.raw/.test(src), "žádné sql.raw");
      const cancel = src.slice(src.indexOf("export async function cancelInternalDay"));
      assert.equal((cancel.match(/getDb\(\)\.execute/g) ?? []).length, 1, "zrušení je jeden příkaz");
      const absStmt = cancel.slice(cancel.indexOf("gone AS ("), cancel.indexOf("rev AS ("));
      assert.ok(absStmt.includes("DELETE FROM member_absence"));
      assert.ok(absStmt.includes("EXISTS (SELECT 1 FROM del)") && absStmt.includes("NOT (SELECT has_meeting FROM g)"));
      const revStmt = cancel.slice(cancel.indexOf("rev AS ("), cancel.indexOf("SELECT g.time_ok"));
      assert.ok(revStmt.includes("UPDATE attendance_link"));
      assert.ok(revStmt.includes("EXISTS (SELECT 1 FROM del)") && revStmt.includes("NOT (SELECT has_meeting FROM g)"));
      // Z1: výsledek příkazu nenese počet ani příznak smazaných omluv
      assert.ok(!/abs_deleted|absDeleted/.test(src), "Z1: žádné abs_deleted");
      assert.ok(!/count\(\*\)[^\n]*gone|FROM gone/.test(src), "Z1: žádný počet nad gone");
      const finalSelect = cancel.slice(cancel.indexOf("SELECT g.time_ok"));
      assert.ok(!/gone/.test(finalSelect));
      assert.equal((src.match(/DELETE FROM attendance_internal_day/g) ?? []).length, 1, "jediné mazání řádku interní");
      // založení: jeden příkaz, ON CONFLICT
      const create = src.slice(src.indexOf("export async function createInternalDay"), src.indexOf("export interface CancelInternalResult"));
      assert.equal((create.match(/getDb\(\)\.execute/g) ?? []).length, 1);
      assert.ok(create.includes("ON CONFLICT (attendance_date) DO NOTHING"));
      // jediné místo zápisu do tabulky
      for (const f of ["actions/attendance-internal.ts"]) {
        assert.ok(!/INSERT INTO attendance_internal_day|DELETE FROM attendance_internal_day/.test(read(f)), f);
      }
    },
  },
  {
    name: "10. migrace: DO bloky bez ${ (LL-006), smoke stejného tvaru jako krok [2/4], EXPECT_DB_HOST, jen názvy funkcí",
    run: () => {
      const src = read("scripts/migrate-iter-040-interni-schuzky.ts");
      const blocks = src.match(/DO \$\$[\s\S]*?END \$\$/g) ?? [];
      assert.equal(blocks.length, 2, "smoke a ostrý DO blok");
      for (const b of blocks) assert.ok(!b.includes("${"), "JS interpolace uvnitř DO $$");
      const [smoke, real] = blocks;
      for (const b of blocks) {
        assert.ok(b.includes("PERFORM set_config('lock_timeout', '5s', true);"));
        assert.ok(b.includes("attendance_date DATE        PRIMARY KEY,"));
        assert.ok(/created_by\s+UUID\s+REFERENCES \w+\(id\) ON DELETE SET NULL,/.test(b));
        assert.ok(b.includes("created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()"));
        assert.ok(b.includes("CREATE ") && b.includes("TABLE IF NOT EXISTS"));
      }
      assert.ok(smoke.includes("TEMPORARY") && !real.includes("TEMPORARY"));
      assert.ok(real.includes("CREATE TABLE IF NOT EXISTS attendance_internal_day"));
      assert.ok(src.includes("EXPECT_DB_HOST"));
      assert.ok(/SELECT name FROM chapter_function/.test(src) && !/SELECT[^;]*\bname\b[^;]*FROM member\b/.test(src));
      assert.ok(src.includes("confdeltype !== \"n\"") && src.includes("attendance_internal_day_pkey"));
      // žádný DROP, DELETE, UPDATE ani TRUNCATE nad skutečnými tabulkami
      assert.ok(!/\b(DELETE FROM|UPDATE |TRUNCATE|DROP TABLE)\b/.test(stripComments(src)));
      // schéma: Drizzle a schema.sql
      assert.ok(read("lib/db/schema.ts").includes('pgTable("attendance_internal_day"'));
      assert.ok(read("lib/db/schema.sql").includes("CREATE TABLE IF NOT EXISTS attendance_internal_day"));
    },
  },
  {
    name: "11. texty: INTERNAL_TEXTS doslova z gate sekce 5, bez U+2014, UI tyká, nápověda vyká",
    run: () => {
      assert.equal(INTERNAL_TEXTS.title, "Interní schůzka");
      assert.equal(INTERNAL_TEXTS.hint, "Počítá se do docházky jako běžná schůzka, jen bez hostů a hlasování.");
      assert.equal(INTERNAL_TEXTS.create, "Založit interní schůzku");
      assert.equal(INTERNAL_TEXTS.created, "Na tenhle den je interní schůzka. Počítá se do docházky.");
      assert.equal(INTERNAL_TEXTS.pastInternal, "Ten den byla interní schůzka.");
      assert.equal(INTERNAL_TEXTS.cancel, "Zrušit interní schůzku");
      assert.equal(
        INTERNAL_TEXTS.confirmCancel,
        "Smažou se všechny omluvy členů na tenhle den a vrátit to nejde. Když tu má být běžná schůzka, založ ji ve Schůzkách a interní neruš, omluvy pak zůstanou."
      );
      assert.equal(INTERNAL_TEXTS.confirmCancelOverridden, "Omluvy zůstanou, platí běžná schůzka. Zrušit interní?");
      assert.equal(INTERNAL_TEXTS.confirmYes, "Ano, zrušit");
      assert.equal(INTERNAL_TEXTS.confirmNo, "Nechat");
      assert.equal(INTERNAL_TEXTS.overridden, "Na tenhle den je i běžná schůzka, docházka se počítá podle ní.");
      assert.equal(INTERNAL_TEXTS.meetingDay, "Na tenhle den je běžná schůzka.");
      assert.equal(INTERNAL_TEXTS.toastCreated, "Interní schůzka založena.");
      assert.equal(INTERNAL_TEXTS.toastCancelled, "Interní schůzka zrušena.");
      assert.equal(INTERNAL_TEXTS.toastExists, "Interní schůzka už na tenhle den je.");
      assert.equal(INTERNAL_TEXTS.toastGone, "Interní schůzka už je zrušená.");
      assert.equal(INTERNAL_TEXTS.errMeeting, "Na tenhle den už je běžná schůzka.");
      assert.equal(
        INTERNAL_TEXTS.errToday,
        "Na dnešek už interní schůzku založit nejde. Dnešní docházku zapíše správce docházky v Zápisu přes Zapisovat i tak."
      );
      assert.equal(INTERNAL_TEXTS.errRange, "Interní schůzku jde založit nejvýš rok dopředu.");
      assert.equal(INTERNAL_TEXTS.errRecorded, "Na tenhle den už je zapsaná docházka, interní schůzku zrušit nejde.");
      assert.equal(INTERNAL_TEXTS.errClosed, "Po 17:00 se den uzavírá, interní schůzku už zrušit nejde.");
      assert.equal(INTERNAL_TEXTS.errPast, "Minulou schůzku zrušit nejde.");
      assert.equal(INTERNAL_TEXTS.sheetInternal, "Interní schůzka.");
      assert.equal(INTERNAL_TEXTS.ariaInternal, "interní schůzka");
      assert.equal(
        MEMBER_TEXTS.legend,
        "Modrý den je běžná schůzka s hosty, zelený den interní schůzka. ● nepřijdu, ◐ pošlu náhradníka."
      );
      assert.equal(
        PLAN_TEXTS.legend,
        "Číslo pod dnem je počet omluvených. Modrý den je běžná schůzka s hosty, zelený den interní schůzka."
      );
      for (const v of Object.values(INTERNAL_TEXTS)) assert.ok(!v.includes(EM_DASH));
      for (const v of Object.values(INTERNAL_TEXTS)) {
        assert.ok(!/Založte|můžete|zrušte|nerušte|Zapisujte/i.test(v), `UI nesmí vykat: ${v}`);
      }
      // nápověda vyká a netyká
      const help = read("components/help/sections/ModeratorHelp.tsx");
      const sec = help.slice(help.indexOf("Interní schůzka</h2>"), help.indexOf("{showLeadership && (")).replace(/\s+/g, " ");
      assert.ok(/Založit interní schůzku|klepněte/.test(sec) && !/založ ji|neruš[ ,.]|klepni[ ,.]/.test(sec));
      assert.ok(read("components/help/sections/MemberHelp.tsx").includes("omlouváte se stejně"));
      for (const f of [
        "lib/attendance/internal.ts",
        "lib/attendance/report.ts",
        "lib/attendance/plan.ts",
        "lib/attendance/rules.ts",
        "actions/attendance-internal.ts",
        "lib/db/queries/attendance-internal.ts",
        "components/attendance/InternalDayCard.tsx",
        "components/help/sections/ModeratorHelp.tsx",
        "components/help/sections/MemberHelp.tsx",
        "scripts/migrate-iter-040-interni-schuzky.ts",
        "scripts/test-iter-040-interni.ts",
      ]) {
        assert.ok(!read(f).includes(EM_DASH), `${f}: em dash`);
      }
      assert.ok(read("app/(app)/status/EventTable.tsx").includes('"attendance.internal-created": "Interní schůzka založena"'));
      assert.ok(read("app/(app)/status/EventTable.tsx").includes('"attendance.internal-cancelled": "Interní schůzka zrušena"'));
    },
  },
  {
    name: "12. dayCellClass: internal zeleně a ne navy, běžná schůzka modře v kterýkoli den, čtvrtek bez schůzky bez podkladu, obě podtržená, výběr ring",
    run: () => {
      const internal = dayCellClass("internal", true, false, false);
      assert.ok(internal.includes("bg-success-light") && internal.includes("text-success"));
      assert.ok(!internal.includes("bg-navy-light"));
      assert.ok(dayCellClass("internal", false, false, false).includes("bg-success-light"), "i mimo čtvrtek");
      assert.ok(dayCellClass("meeting", true, false, false).includes("bg-navy-light"));
      assert.ok(!dayCellClass("meeting", true, false, false).includes("bg-success-light"));
      assert.ok(dayCellClass("meeting", false, false, false).includes("bg-navy-light"), "běžná schůzka i mimo čtvrtek (úterý)");
      assert.ok(!dayCellClass("internal", false, false, false).includes("bg-navy-light"), "interní v pondělí je zelená");
      const emptyThu = dayCellClass("none", true, false, false);
      assert.ok(!emptyThu.includes("bg-navy-light") && !emptyThu.includes("bg-success-light") && emptyThu.includes("font-semibold"), "čtvrtek bez schůzky");
      assert.ok(!dayCellClass("none", false, false, false).includes("font-semibold"));
      // přebitá interní (obě v jeden den) je modrá
      const overridden = dayCellClass(dayTone({ hasMeeting: true, hasInternal: true }), false, false, false);
      assert.ok(overridden.includes("bg-navy-light") && !overridden.includes("bg-success-light"));
      // kontrast WCAG AA (4,5:1) textu na podkladu, tokeny z globals.css
      const css = read("app/globals.css");
      const tok = (n: string) => css.match(new RegExp(`--color-${n}:\\s*(#[0-9a-fA-F]{6})`))![1];
      const lum = (h: string) => {
        const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      assert.ok(ratio(tok("success"), tok("success-light")) >= 4.5, "zelená AA");
      assert.ok(ratio(tok("text-primary"), tok("navy-light")) >= 4.5, "modrá AA");
      assert.ok(dayCellClass("meeting", false, true, false).includes("text-text-main"), "minulá běžná schůzka drží tmavý text");
      assert.ok(dayCellClass("none", false, true, false).includes("text-text-muted"));
      assert.ok(dayCellClass("internal", false, false, true).includes("ring-2 ring-primary"));
      assert.ok(dayCellClass("none", false, false, false).includes("min-h-[44px]"));
      assert.ok(dayNumberClass("internal").includes("underline"));
      assert.ok(dayNumberClass("meeting").includes("underline"));
      assert.equal(dayNumberClass("none"), "");
      // aria
      assert.ok(dayAriaLabel("2026-10-22", { mark: "none", result: null, hasMeeting: false, hasInternal: true }).endsWith("interní schůzka"));
      assert.ok(planDayAria("2026-10-22", 2, false, true).endsWith("2 omluvení, interní schůzka"));
      assert.ok(planDayAria("2026-10-22", 0, true, true).endsWith("schůzka v aplikaci"), "běžná přebíjí");
      // obě mřížky používají společné funkce
      for (const f of ["components/attendance/AbsenceCalendar.tsx", "components/attendance/AbsencePlanCalendar.tsx"]) {
        const src = read(f);
        assert.ok(src.includes("dayCellClass(tone, thursday, past, isSelected)") && src.includes("dayNumberClass(tone)"), f);
        assert.ok(src.includes("internalDates") && src.includes("InternalDayCard"), f);
      }
    },
  },
  {
    name: "13. internalOpsEvent: bez memberId, memberName, count, zpráva bez číslic, oba kindy v TERMINAL_KINDS a EventTable",
    run: () => {
      for (const kind of ["attendance.internal-created", "attendance.internal-cancelled"] as const) {
        const e = internalOpsEvent(kind, "2026-10-22", false) as Record<string, unknown>;
        for (const key of ["memberId", "memberName", "count", "email"]) assert.ok(!(key in e), key);
        assert.ok(!/\d/.test(String(e.message)), "zpráva bez číslic");
        assert.equal(e.source, "gui");
        assert.equal(e.meetingDate, "2026-10-22");
        assert.deepEqual(e.detail, { overridden: false });
        assert.ok(TERMINAL_KINDS.includes(kind));
        assert.ok(read("app/(app)/status/EventTable.tsx").includes(`"${kind}"`));
        assert.equal((read("lib/ops/types.ts").match(new RegExp(`"${kind.replace(".", "\\.")}"`, "g")) ?? []).length, 2, "union i TERMINAL_KINDS");
      }
      assert.equal(internalOpsEvent("attendance.internal-created", "2026-10-22", false).message, "Založena.");
      assert.equal(internalOpsEvent("attendance.internal-cancelled", "2026-10-22", true).message, "Zrušena.");
      const act = stripComments(read("actions/attendance-internal.ts"));
      assert.ok(!/memberId:|memberName|absencesDeleted:[^\n]*count/.test(act.slice(act.indexOf("async function safeLog"), act.indexOf("export async function createInternalDayAction"))));
    },
  },
  {
    name: "14. statické: obě akce volají requirePermission jako první krok, sekce schůzek je netknutá",
    run: () => {
      const act = stripComments(read("actions/attendance-internal.ts"));
      assert.equal((act.match(/requirePermission\("attendance\.internal_manage"\)/g) ?? []).length, 2);
      for (const name of ["createInternalDayAction", "cancelInternalDayAction"]) {
        const body = act.slice(act.indexOf(`export async function ${name}`));
        assert.ok(/^[^{]*\{\s*const auth = await requirePermission\("attendance\.internal_manage"\);/.test(body.replace(/\n/g, " ")), `${name}: první krok`);
        assert.ok(/dateSchema\.safeParse/.test(body));
      }
      assert.ok(!/transaction\(/.test(act));
      assert.ok(!/router\.refresh/.test(act));
      assert.ok(/revalidatePath\("\/dashboard"\)/.test(act));
      assert.ok(!/revalidatePath\("\/dochazka/.test(act), "LL-017: /dochazka drží stav klient");
      for (const f of ["actions/meetings.ts", "lib/db/queries/meetings.ts", "lib/db/queries/mastermind.ts"]) {
        assert.ok(!/attendance_internal|attendanceInternal|internal_manage/.test(read(f)), `${f}: sekce schůzek netknutá`);
      }
      // žádná jiná cesta k zápisu do tabulky
      const hits: string[] = [];
      for (const f of [
        "actions/attendance.ts",
        "actions/meetings.ts",
        "lib/db/queries/attendance.ts",
        "lib/db/queries/attendance-close.ts",
        "lib/db/queries/meetings.ts",
      ]) {
        if (/(INSERT INTO|DELETE FROM|UPDATE) attendance_internal_day/.test(read(f))) hits.push(f);
      }
      assert.deepEqual(hits, []);
    },
  },
  {
    name: "15. Z3: karta dne pro dnešek, minulý den, rok dopředu, přebití a 17:00",
    run: () => {
      const v = (date: string, s = NONE, now = NOW) => internalCardView({ now, date, ...s });
      // dnešek bez interní a bez běžné: errToday, bez tlačítka
      const today = v(TODAY);
      assert.equal(today.kind, "errToday");
      assert.deepEqual(today.lines, [INTERNAL_TEXTS.errToday]);
      assert.equal(today.button, null);
      // minulý den bez interní: nevykreslí se (i s běžnou)
      assert.equal(v("2026-10-20").kind, "hidden");
      assert.equal(v("2026-10-20", { hasMeeting: true, hasInternal: false }).kind, "hidden");
      // minulý den s běžnou i interní: běžná přebíjí, karta nic
      assert.equal(v("2026-10-20", { hasMeeting: true, hasInternal: true }).kind, "hidden");
      // minulý den s interní: jen pastInternal, bez tlačítka
      const past = v("2026-10-20", { hasMeeting: false, hasInternal: true });
      assert.equal(past.kind, "pastInternal");
      assert.deepEqual(past.lines, [INTERNAL_TEXTS.pastInternal]);
      assert.equal(past.button, null);
      // víc než rok dopředu: errRange, bez tlačítka a bez hintu
      const far = v("2027-10-22");
      assert.equal(far.kind, "errRange");
      assert.deepEqual(far.lines, [INTERNAL_TEXTS.errRange]);
      assert.equal(far.button, null);
      // v rozsahu: hint + tlačítko Založit
      const ok = v("2026-10-22");
      assert.equal(ok.kind, "create");
      assert.deepEqual(ok.lines, [INTERNAL_TEXTS.hint]);
      assert.equal(ok.button, "create");
      assert.equal(v("2027-10-21").kind, "create", "dnes + 365");
      // jen běžná: meetingDay, bez tlačítka
      const m = v("2026-10-22", { hasMeeting: true, hasInternal: false });
      assert.deepEqual([m.kind, m.button, m.lines], ["meetingDay", null, [INTERNAL_TEXTS.meetingDay]]);
      // interní: created + Zrušit s potvrzením confirmCancel
      const c = v("2026-10-22", { hasMeeting: false, hasInternal: true });
      assert.deepEqual([c.kind, c.button, c.confirm, c.lines], ["cancel", "cancel", INTERNAL_TEXTS.confirmCancel, [INTERNAL_TEXTS.created]]);
      // přebitá interní: overridden + confirmCancelOverridden
      const o = v("2026-10-22", { hasMeeting: true, hasInternal: true });
      assert.deepEqual([o.kind, o.button, o.confirm, o.lines], ["cancel", "cancel", INTERNAL_TEXTS.confirmCancelOverridden, [INTERNAL_TEXTS.overridden]]);
      // dnes po 17:00: bez tlačítka, důvod errClosed
      const late = v(TODAY, { hasMeeting: false, hasInternal: true }, new Date("2026-10-21T15:30:00Z"));
      assert.equal(late.kind, "cancelClosed");
      assert.equal(late.button, null);
      assert.deepEqual(late.lines, [INTERNAL_TEXTS.created, INTERNAL_TEXTS.errClosed]);
      // dnes před 17:00 jde zrušit
      assert.equal(v(TODAY, { hasMeeting: false, hasInternal: true }).button, "cancel");
    },
  },
  {
    name: "18. souběh dvou sezení: fallback akcí čte příznaky SQL (timeOk, rangeOk), schéma data s refine, TODAY_SQL sdílené",
    run: () => {
      const act = stripComments(read("actions/attendance-internal.ts"));
      assert.ok(/\.refine\(isValidDateString\)/.test(act));
      assert.ok(/!res\.created && !res\.existed && res\.rangeOk && !res\.hasMeeting/.test(act));
      assert.ok(/res\.existed && res\.timeOk && res\.openOk && \(res\.hasMeeting \|\| !res\.recorded\)/.test(act));
      assert.ok(act.includes("toastGone") && act.includes("toastExists"));
      const q = stripComments(read("lib/db/queries/attendance-internal.ts"));
      assert.ok(/import \{ TODAY_SQL \} from "@\/lib\/db\/queries\/attendance"/.test(q) && !/const TODAY_SQL/.test(q));
      assert.ok(/export const TODAY_SQL/.test(read("lib/db/queries/attendance.ts")));
    },
  },
  {
    name: "16. Z2: Omluvy po zrušení vyprázdní den lokálně, kalendář člena smaže absences[date], bez router.refresh",
    run: () => {
      const plan = stripComments(read("components/attendance/AbsencePlanCalendar.tsx"));
      assert.ok(/if \(absencesDeleted\) setClearedDates/.test(plan));
      assert.ok(/rows\.filter\(\(r\) => !clearedDates\.has\(r\.date\)\)/.test(plan));
      assert.ok(/groupPlan\(/.test(plan));
      const cal = stripComments(read("components/attendance/AbsenceCalendar.tsx"));
      assert.ok(/if \(absencesDeleted\) \{[\s\S]*delete next\[date\]/.test(cal));
      for (const src of [plan, cal, stripComments(read("components/attendance/InternalDayCard.tsx"))]) {
        assert.ok(!/router\.refresh|useRouter/.test(src), "LL-017");
      }
      // karta se vykreslí jen s právem a jen jednou na stránku
      for (const src of [plan, cal]) assert.ok(/canManageInternal && \(/.test(src));
      assert.ok(read("app/(app)/dochazka/page.tsx").includes('canManageInternal={can(session, "attendance.internal_manage")}'));
      assert.ok(read("lib/attendance/plan-view.ts").includes('canManageInternal: can(session, "attendance.internal_manage")'));
    },
  },
  {
    name: "17. UI karty: cíle 44 px, dvoukrokové potvrzení bez modalu, Z1 jednotný toast, řádek v zápisu dne",
    run: () => {
      const card = read("components/attendance/InternalDayCard.tsx");
      assert.ok((card.match(/min-h-\[44px\]/g) ?? []).length >= 4, "všechna tlačítka 44 px");
      assert.ok(card.includes("flex flex-wrap gap-2"), "na 390 px se zalomí");
      assert.ok(card.includes("INTERNAL_TEXTS.confirmYes") && card.includes("INTERNAL_TEXTS.confirmNo"));
      assert.ok(!/modal|dialog/i.test(stripComments(card)));
      assert.ok(card.includes("showToast(\"success\", data.message)"), "toast přichází ze serveru, klient nevětví podle omluv");
      assert.ok(!/absencesDeleted\s*(\?|&&|\|\|)|if \(.*absencesDeleted/.test(stripComments(card)), "karta nepodmiňuje text omluvami");
      const sheet = read("components/attendance/AttendanceSheet.tsx");
      assert.ok(sheet.includes('payload.dayKind === "internal"') && sheet.includes("INTERNAL_TEXTS.sheetInternal"));
      // akce vrací jednotný text toastu
      const act = read("actions/attendance-internal.ts");
      assert.ok(act.includes("message: INTERNAL_TEXTS.toastCancelled"));
      assert.ok(existsSync(join(ROOT, "components/attendance/InternalDayCard.tsx")));
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
