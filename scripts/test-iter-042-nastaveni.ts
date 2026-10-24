/**
 * Testy iter-042 (T-003a, B-základ): Nastavení chapteru. Bez DATABASE_URL,
 * bez sítě. Statické kontroly čtou zdrojáky z disku.
 *
 * Číslování podle arch B7. T-003a: položky 1, 2, 7, 8, 9, 10, 13 a testy
 * stránky, formuláře, akce a textů. T-003g (fáze 3) doplnil položky 1b
 * (memberDeadline), 3 (tóny a barvy kalendáře), 4 (kalendáře bez čtvrtka),
 * 5 (vypnuté části), 6 (bonus podle zapnutých částí), 11 (čtvrtek pryč z logiky)
 * a 12 (konec hlasování).
 *
 * Spuštění: npx tsx scripts/test-iter-042-nastaveni.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_DELEGABLE_MARKER,
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  NON_DELEGABLE,
  PERMISSIONS,
  can,
  expandFunctionPermissions,
  permissionsFor,
} from "../lib/auth/permissions";
import {
  DEFAULT_CHAPTER_SETTINGS,
  FEATURE_KEYS,
  MEETING_TIME_OPTIONS,
  WEEKDAY_ORDER,
  changedSettingKeys,
  isFeatureEnabled,
  isRegularDay,
  nextRegularDay,
  resolveChapterSettings,
  settingsFromRow,
  validateSettingsInput,
  weekdayAccusative,
  weekdayLocative,
  weekdayName,
  type ChapterSettings,
} from "../lib/chapter/settings";
import { settingsChangedEvent } from "../lib/chapter/events";
import { assertApplyAllowed, hostMatchesExpect } from "../lib/attendance/palms";
import {
  CHAPTER_SETTINGS_TEXTS,
  FEATURE_LABELS,
  FEATURE_OFF_ACTION_TEXT,
  FEATURE_OFF_PAGE_TEXT,
  disableConfirmText,
  settingsConfirmTexts,
  weekdayChangeConfirmText,
} from "../lib/chapter/texts";
import { TERMINAL_KINDS } from "../lib/ops/types";
import { ATTENDANCE_START, memberDeadline } from "../lib/attendance/rules";
import { dayCellClass, dayNumberClass, dayTone } from "../lib/attendance/internal";
import { MEMBER_TEXTS } from "../lib/attendance/rules";
import { PLAN_TEXTS } from "../lib/attendance/plan";
import {
  nextWednesday2359InPrague,
  todayInPrague,
  votingCloseBeforeRegularDay,
  votingClosesAtFor,
} from "../lib/meetings/voting-window";
import { BONUS_CAP, bonusSources, computeBonus, filterBonusEvents, hasBonusSource, internalScore } from "../lib/semafor/bonus";
import { helpSemaforLeadership, helpSemaforMember, overviewLegendText, scoreLegendText } from "../lib/semafor/texts";
import { TEXTS as BURZA_TEXTS } from "../lib/burza/rules";
import { UI_TEXTS as MM_TEXTS, isMeetingWeekday } from "../lib/mastermind/rules";
import { buildOpsEvent } from "../lib/ops/event-shape";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Všechny soubory `name` pod složkou (rekurzivně, relativní cesty). */
function filesNamed(dirRel: string, name: string): string[] {
  const out: string[] = [];
  const walk = (rel: string) => {
    for (const entry of readdirSync(join(ROOT, rel))) {
      const child = `${rel}/${entry}`;
      if (statSync(join(ROOT, child)).isDirectory()) walk(child);
      else if (entry === name) out.push(child);
    }
  };
  walk(dirRel);
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const EM_DASH = String.fromCharCode(0x2014);

/** Soubory skupiny B-základ (bez testu samotného). */
const OWN_FILES = [
  "lib/chapter/settings.ts",
  "lib/chapter/texts.ts",
  "lib/chapter/events.ts",
  "lib/chapter/feature-guard.ts",
  "lib/db/queries/chapter-settings.ts",
  "actions/chapter-settings.ts",
  "app/(app)/admin/nastaveni/page.tsx",
  "app/(app)/admin/nastaveni/ChapterSettingsForm.tsx",
  "components/chapter/FeatureOff.tsx",
  "scripts/migrate-iter-042-nastaveni.ts",
];

const SETTINGS_BASE: ChapterSettings = { ...DEFAULT_CHAPTER_SETTINGS };

const tests: TestCase[] = [
  {
    name: "1. výchozí hodnoty = dnešní chování (čtvrtek 7:30, vše zapnuté)",
    run: () => {
      assert.deepEqual(DEFAULT_CHAPTER_SETTINGS, {
        mastermindEnabled: true,
        burzaEnabled: true,
        semaforEnabled: true,
        meetingWeekday: 4,
        meetingTime: "07:30",
      });
      for (const key of FEATURE_KEYS) assert.equal(isFeatureEnabled(DEFAULT_CHAPTER_SETTINGS, key), true, key);
      assert.deepEqual([...FEATURE_KEYS], ["mastermind", "burza", "semafor"]);
    },
  },
  {
    name: "2a. isRegularDay: všech 7 dnů a neplatná data",
    run: () => {
      // 2026-10-19 je pondělí.
      const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];
      for (let wd = 0; wd <= 6; wd++) {
        const matching = week.filter((d) => isRegularDay(d, { meetingWeekday: wd }));
        assert.equal(matching.length, 1, `den ${wd}`);
      }
      assert.equal(isRegularDay("2026-10-22", { meetingWeekday: 4 }), true, "čtvrtek");
      assert.equal(isRegularDay("2026-10-22"), true, "výchozí je čtvrtek");
      assert.equal(isRegularDay("2026-10-21"), false);
      assert.equal(isRegularDay("2026-02-30"), false, "neplatné datum");
      assert.equal(isRegularDay("22.10.2026"), false);
      assert.equal(isRegularDay("2026-10-25", { meetingWeekday: 0 }), true, "neděle = 0");
    },
  },
  {
    name: "2b. nextRegularDay: včetně dne samého, přelom měsíce a roku, shoda s nextThursday",
    run: () => {
      assert.equal(nextRegularDay("2026-10-22"), "2026-10-22", "čtvrtek zůstává");
      assert.equal(nextRegularDay("2026-10-23"), "2026-10-29");
      assert.equal(nextRegularDay("2026-10-28", { meetingWeekday: 2 }), "2026-11-03", "přelom měsíce");
      assert.equal(nextRegularDay("2026-12-30", { meetingWeekday: 1 }), "2027-01-04", "přelom roku");
      assert.equal(nextRegularDay("2028-02-28", { meetingWeekday: 2 }), "2028-02-29", "přestupný rok");
      assert.equal(nextRegularDay("2027-02-26", { meetingWeekday: 0 }), "2027-02-28");
      // Pro čtvrtek přesně dnešní `nextThursday` (lib/attendance/rules.ts).
      const rules = read("lib/attendance/rules.ts");
      assert.ok(rules.includes("export function nextThursday"), "referenční funkce existuje");
      for (let i = 0; i < 400; i++) {
        const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
        const diff = (4 - new Date(`${d}T00:00:00Z`).getUTCDay() + 7) % 7;
        const expected = new Date(Date.UTC(2026, 0, 1 + i + diff)).toISOString().slice(0, 10);
        assert.equal(nextRegularDay(d), expected, d);
      }
      assert.throws(() => nextRegularDay("nesmysl"));
    },
  },
  {
    name: "2c. názvy dnů ve třech pádech, pořadí výběru pondělí až neděle",
    run: () => {
      assert.equal(weekdayName(4), "čtvrtek");
      assert.equal(weekdayName(0), "neděle");
      assert.equal(weekdayAccusative(2), "úterý");
      assert.equal(weekdayAccusative(3), "středu");
      assert.equal(weekdayAccusative(6), "sobotu");
      assert.equal(weekdayLocative(4), "ve čtvrtek");
      assert.equal(weekdayLocative(3), "ve středu");
      assert.equal(weekdayName(9), "");
      assert.deepEqual([...WEEKDAY_ORDER], [1, 2, 3, 4, 5, 6, 0]);
    },
  },
  {
    name: "13. volby času: 17 hodnot od 7:00 do 11:00, validace odmítne 6:45 i 11:15",
    run: () => {
      assert.equal(MEETING_TIME_OPTIONS.length, 17);
      assert.equal(MEETING_TIME_OPTIONS[0], "07:00");
      assert.equal(MEETING_TIME_OPTIONS[1], "07:15");
      assert.equal(MEETING_TIME_OPTIONS[2], "07:30");
      assert.equal(MEETING_TIME_OPTIONS[16], "11:00");
      assert.ok(MEETING_TIME_OPTIONS.includes(DEFAULT_CHAPTER_SETTINGS.meetingTime));
      for (const bad of ["06:45", "11:15", "07:10", "7:30", "07:30:00", "", "12:00"]) {
        const res = validateSettingsInput({ ...SETTINGS_BASE, meetingTime: bad });
        assert.equal(res.ok, false, `čas ${bad} se odmítne`);
      }
      for (const good of MEETING_TIME_OPTIONS) {
        assert.equal(validateSettingsInput({ ...SETTINGS_BASE, meetingTime: good }).ok, true, good);
      }
    },
  },
  {
    name: "13b. validateSettingsInput: den 0 až 6, pravdivostní hodnoty, žádná cizí pole",
    run: () => {
      assert.equal(validateSettingsInput(SETTINGS_BASE).ok, true);
      for (const wd of [-1, 7, 1.5, NaN, "4", null, undefined]) {
        assert.equal(validateSettingsInput({ ...SETTINGS_BASE, meetingWeekday: wd }).ok, false, `den ${String(wd)}`);
      }
      for (const field of ["mastermindEnabled", "burzaEnabled", "semaforEnabled"] as const) {
        for (const v of ["true", 1, null, undefined]) {
          assert.equal(validateSettingsInput({ ...SETTINGS_BASE, [field]: v }).ok, false, `${field}=${String(v)}`);
        }
      }
      for (const raw of [null, undefined, "x", 4, [], {}]) {
        assert.equal(validateSettingsInput(raw).ok, false, JSON.stringify(raw));
      }
      const withExtra = validateSettingsInput({ ...SETTINGS_BASE, evil: "x", updatedBy: "uuid" });
      assert.ok(withExtra.ok);
      if (withExtra.ok) assert.deepEqual(Object.keys(withExtra.value).sort(), Object.keys(SETTINGS_BASE).sort());
      const bad = validateSettingsInput(null);
      assert.ok(!bad.ok && bad.error === CHAPTER_SETTINGS_TEXTS.saveFailed);
    },
  },
  {
    name: "10. fallback: 42P01, chybějící a vadný řádek vrátí výchozí hodnoty, jiná chyba se nepolyká",
    run: async () => {
      const warnings: string[] = [];
      const warn = (m: string) => warnings.push(m);

      const missingTable = await resolveChapterSettings(async () => {
        throw Object.assign(new Error('relation "chapter_settings" does not exist'), { code: "42P01" });
      }, warn);
      assert.deepEqual(missingTable, DEFAULT_CHAPTER_SETTINGS);
      assert.equal(warnings.length, 1);

      const wrapped = await resolveChapterSettings(async () => {
        throw Object.assign(new Error("Failed query"), { cause: { code: "42P01" } });
      }, warn);
      assert.deepEqual(wrapped, DEFAULT_CHAPTER_SETTINGS, "chyba obalená driverem (cause)");

      const noRow = await resolveChapterSettings(async () => undefined, warn);
      assert.deepEqual(noRow, DEFAULT_CHAPTER_SETTINGS);

      const brokenRow = await resolveChapterSettings(async () => ({ mastermind_enabled: "ano" }), warn);
      assert.deepEqual(brokenRow, DEFAULT_CHAPTER_SETTINGS);
      assert.equal(warnings.length, 4);

      // Výchozí hodnoty se vrací jako kopie, volající je nezmění.
      noRow.burzaEnabled = false;
      assert.equal(DEFAULT_CHAPTER_SETTINGS.burzaEnabled, true);

      await assert.rejects(
        resolveChapterSettings(async () => {
          throw Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
        }, warn),
        /connection reset/
      );

      const real = await resolveChapterSettings(async () => ({
        mastermind_enabled: true,
        burza_enabled: false,
        semafor_enabled: true,
        meeting_weekday: 2,
        meeting_time: "08:15:00",
      }));
      assert.deepEqual(real, {
        mastermindEnabled: true,
        burzaEnabled: false,
        semaforEnabled: true,
        meetingWeekday: 2,
        meetingTime: "08:15",
      });
      // L-1: vadný čas nebo den neshodí přepínače (vypnutá část zůstane vypnutá), nahradí se jen on sám.
      const off = { mastermind_enabled: false, burza_enabled: true, semafor_enabled: false };
      assert.deepEqual(settingsFromRow({ ...off, meeting_weekday: 2, meeting_time: "07:10" }), {
        mastermindEnabled: false,
        burzaEnabled: true,
        semaforEnabled: false,
        meetingWeekday: 2,
        meetingTime: DEFAULT_CHAPTER_SETTINGS.meetingTime,
      });
      assert.deepEqual(settingsFromRow({ ...off, meeting_weekday: 9, meeting_time: "12:00" }), {
        mastermindEnabled: false,
        burzaEnabled: true,
        semaforEnabled: false,
        meetingWeekday: DEFAULT_CHAPTER_SETTINGS.meetingWeekday,
        meetingTime: DEFAULT_CHAPTER_SETTINGS.meetingTime,
      });
      assert.equal(settingsFromRow({ mastermind_enabled: "ano", burza_enabled: true, semafor_enabled: true, meeting_weekday: 4, meeting_time: "07:30" }), null);
      const badTime = await resolveChapterSettings(async () => ({ ...off, meeting_weekday: 4, meeting_time: "07:10:00" }));
      assert.equal(badTime.mastermindEnabled, false);
      assert.equal(badTime.semaforEnabled, false);
    },
  },
  {
    name: "7a. práva: 28 klíčů, chapter.settings není nedelegovatelné ani v sadě moderátora a Člena výboru",
    run: () => {
      assert.equal(PERMISSIONS.length, 28);
      assert.ok((PERMISSIONS as readonly string[]).includes("chapter.settings"));
      assert.ok(!NON_DELEGABLE.includes("chapter.settings"));
      assert.ok(!MODERATOR_ROLE_PERMISSIONS.includes("chapter.settings"));
      assert.ok(!DEFAULT_FUNCTION_PERMISSIONS.includes("chapter.settings"));
      assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length);
    },
  },
  {
    name: "7b. práva: admin, Prezident a Viceprezident (značka) ano; Člen výboru, moderátor, odkaz a správce docházky ne",
    run: () => {
      const admin = permissionsFor({ authMethod: "password", managementRole: "admin", functions: [], attendanceManager: false });
      assert.ok(admin.has("chapter.settings"), "admin");
      for (const name of ["Prezident", "Viceprezident"]) {
        const set = permissionsFor({
          authMethod: "password",
          managementRole: null,
          functions: [{ name, permissions: [ADMIN_DELEGABLE_MARKER] }],
          attendanceManager: false,
        });
        assert.ok(set.has("chapter.settings"), name);
        assert.ok(!set.has("access.manage"), `${name} nedostane access.manage`);
      }
      const committee = permissionsFor({
        authMethod: "password",
        managementRole: null,
        functions: [{ name: "Člen výboru", permissions: null }],
        attendanceManager: false,
      });
      assert.ok(!committee.has("chapter.settings"), "Člen výboru");
      const moderator = permissionsFor({ authMethod: "password", managementRole: "moderator", functions: [], attendanceManager: false });
      assert.ok(!moderator.has("chapter.settings"), "moderátor");
      const link = permissionsFor({
        authMethod: "magic_link",
        managementRole: "admin",
        functions: [{ name: "Prezident", permissions: [ADMIN_DELEGABLE_MARKER] }],
        attendanceManager: false,
      });
      assert.equal(link.size, 0, "přihlášení odkazem = prázdná množina");
      const attendance = permissionsFor({ authMethod: "magic_link", managementRole: null, functions: [], attendanceManager: true });
      assert.ok(!attendance.has("chapter.settings"), "správce docházky");
      assert.ok(expandFunctionPermissions([ADMIN_DELEGABLE_MARKER]).includes("chapter.settings"));
      assert.ok(!expandFunctionPermissions(["chapter.settings"]).includes("access.manage"));
      assert.equal(can({ permissions: [...admin] }, "chapter.settings"), true);
      assert.equal(can({ permissions: [...moderator] }, "chapter.settings"), false);
    },
  },
  {
    name: "7c. stránka /admin/nastaveni hlídá chapter.settings, akce má guardy jako první kroky",
    run: () => {
      const page = read("app/(app)/admin/nastaveni/page.tsx");
      assert.ok(page.includes('requirePageSession({ permission: "chapter.settings" })'));
      const action = stripComments(read("actions/chapter-settings.ts"));
      const iPerm = action.indexOf('requirePermission("chapter.settings")');
      const iPass = action.indexOf("requirePasswordSession()");
      const iValid = action.indexOf("validateSettingsInput(");
      const iSave = action.indexOf("saveChapterSettings(");
      assert.ok(iPerm > 0 && iPass > iPerm && iValid > iPass && iSave > iValid, "pořadí: právo, heslo, validace, zápis");
      assert.ok(action.startsWith('"use server"') || action.includes('"use server"'));
      assert.ok(action.includes('revalidatePath("/", "layout")'));
      assert.ok(!/db\.transaction|\.transaction\(/.test(action), "LL-003");
      // log po zápisu, skládání události uvnitř try (LL-011)
      const tryIdx = action.indexOf("try {", iSave + 1);
      assert.ok(tryIdx > iSave && action.indexOf("settingsChangedEvent(") > tryIdx, "událost se skládá uvnitř try");
      assert.ok(action.indexOf("logOpsEvent(") > iSave, "log je až po zápisu");
    },
  },
  {
    name: "7d. dotazy: React.cache, žádná Data Cache ani transakce, CTE s IS DISTINCT FROM",
    run: () => {
      const q = stripComments(read("lib/db/queries/chapter-settings.ts"));
      assert.ok(q.includes('import { cache } from "react"') && q.includes("getChapterSettings = cache("));
      assert.ok(!q.includes("unstable_cache"), "LL-004");
      assert.ok(!/\.transaction\(/.test(q), "LL-003");
      assert.ok(q.includes("IS DISTINCT FROM") && q.includes("WHERE id = 1"));
      assert.ok(q.includes("updated_by = ${actorId}::uuid"), "kdo změnil");
      assert.ok(!q.includes("sql.raw"), "jen bind parametry");
    },
  },
  {
    name: "8. migrace: EXPECT_DB_HOST, IF NOT EXISTS, ON CONFLICT, bez interpolace v DO $$, smoke stejného tvaru",
    run: () => {
      const src = read("scripts/migrate-iter-042-nastaveni.ts");
      assert.ok(src.includes("EXPECT_DB_HOST"));
      // L-2: povinné EXPECT_DB_HOST, přesná shoda s hostem nebo prvním labelem (sdílená funkce z PALMS), ne podřetězec
      assert.ok(src.includes("assertExpectHostGiven(true, process.env.EXPECT_DB_HOST)") && src.includes("assertApplyAllowed(true,"), "povinné EXPECT_DB_HOST");
      assert.ok(!/\.includes\(expectHost\)/.test(src), "bez porovnání podřetězcem");
      assert.ok(src.indexOf("assertExpectHostGiven(") < src.indexOf("dotenv.config("), "kontrola před načtením .env.local");
      const host = "ep-quiet-sound-a1b2c3d4-pooler.eu-central-1.aws.neon.tech";
      assert.ok(hostMatchesExpect(host, host) && hostMatchesExpect(host, "ep-quiet-sound-a1b2c3d4-pooler") && hostMatchesExpect(host, "ep-quiet-sound-a1b2c3d4"));
      assert.ok(!hostMatchesExpect(host, "neon.tech") && !hostMatchesExpect(host, "quiet-sound") && !hostMatchesExpect(host, ""));
      assert.throws(() => assertApplyAllowed(true, undefined, host));
      assert.throws(() => assertApplyAllowed(true, "neon.tech", host));
      assert.doesNotThrow(() => assertApplyAllowed(true, "ep-quiet-sound-a1b2c3d4", host));
      // Bez EXPECT_DB_HOST skript skončí hned (exit 1), ještě před .env.local a před jakýmkoli dotazem.
      const env = { ...process.env, EXPECT_DB_HOST: "", DATABASE_URL: "postgresql://ep-test-host-12345678.invalid/db" };
      let exit = 0;
      try {
        execFileSync(join(ROOT, "node_modules/.bin/tsx"), ["scripts/migrate-iter-042-nastaveni.ts"], { cwd: ROOT, env, stdio: "pipe", timeout: 60000 });
      } catch (err) {
        exit = (err as { status?: number }).status ?? -1;
      }
      assert.equal(exit, 1, "bez EXPECT_DB_HOST migrace skončí s exit 1");
      assert.ok(src.includes("CREATE TABLE IF NOT EXISTS chapter_settings"));
      assert.ok(src.includes("ON CONFLICT (id) DO NOTHING"));
      assert.ok(src.includes("ON DELETE SET NULL"));
      const blocks = src.match(/DO \$\$ BEGIN[\s\S]*?END \$\$/g) ?? [];
      assert.equal(blocks.length, 2, "smoke a ostrý DO blok");
      for (const b of blocks) {
        assert.ok(!b.includes("${"), "v DO $$ bloku není JS interpolace (LL-006)");
        assert.ok(b.includes("set_config('lock_timeout', '5s', true)"), "doslovná hodnota");
      }
      // Smoke a ostrý krok mají stejný tvar po odstranění názvů tabulek a omezení.
      const shape = (b: string) =>
        b
          .replace(/CREATE TEMPORARY TABLE _iter042_member_smoke[\s\S]*?ON COMMIT DROP;\s*/, "")
          .replace(/_iter042_settings_smoke|chapter_settings(?!_)/g, "T")
          .replace(/iter042_smoke_|chapter_settings_/g, "c_")
          .replace(/_iter042_member_smoke\(id\)|member\(id\)/g, "M(id)")
          .replace(/CREATE TEMPORARY TABLE/g, "CREATE TABLE")
          .replace(/\s*ON COMMIT DROP/g, "")
          .replace(/\s+/g, " ");
      assert.equal(shape(blocks[0]), shape(blocks[1]), "smoke test má stejný tvar jako krok [2/4]");
      assert.ok(!stripComments(src).includes("db.transaction"), "LL-003");
      // Neotvírá žádný soubor s tajnostmi sám, jen přes dotenv jako ostatní migrace.
      assert.ok(src.includes('dotenv.config({ path: ".env.local" })'));
      // Schéma: Drizzle i schema.sql
      const sch = read("lib/db/schema.ts");
      assert.ok(sch.includes('pgTable(\n  "chapter_settings"') || sch.includes('"chapter_settings"'));
      assert.ok(sch.includes("chapter_settings_singleton") && sch.includes("chapter_settings_weekday") && sch.includes("chapter_settings_time"));
      const ddl = read("lib/db/schema.sql");
      assert.ok(ddl.includes("CREATE TABLE IF NOT EXISTS chapter_settings"));
      assert.ok(ddl.includes("INSERT INTO chapter_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING"));
    },
  },
  {
    name: "9. ops: settings.changed v unionu, v TERMINAL_KINDS a v KIND_LABELS; událost bez jmen, e-mailu a memberId",
    run: () => {
      assert.ok(read("lib/ops/types.ts").includes('| "settings.changed"'));
      assert.ok(TERMINAL_KINDS.includes("settings.changed"));
      const after: ChapterSettings = { ...SETTINGS_BASE, burzaEnabled: false, meetingWeekday: 2 };
      const ev = settingsChangedEvent(SETTINGS_BASE, after);
      assert.ok(ev);
      assert.equal(ev!.kind, "settings.changed");
      assert.equal(ev!.severity, "info");
      assert.equal(ev!.source, "gui");
      assert.deepEqual(ev!.detail, { changed: ["burza_enabled", "meeting_weekday"], burza_enabled: false, meeting_weekday: 2 });
      for (const forbidden of ["memberName", "email", "memberId", "actor"]) {
        assert.ok(!(forbidden in ev!), `událost nemá ${forbidden}`);
      }
      const row = buildOpsEvent({ runId: "00000000-0000-4000-8000-000000000042", seq: 1, ...ev! });
      assert.equal(row.memberName, null);
      assert.equal(row.email, null);
      assert.equal(row.memberId, null);
      assert.equal(settingsChangedEvent(SETTINGS_BASE, { ...SETTINGS_BASE }), null, "beze změny žádná událost");
      assert.deepEqual(changedSettingKeys(SETTINGS_BASE, { ...SETTINGS_BASE, meetingTime: "08:00" }), ["meeting_time"]);
    },
  },
  {
    name: "9b. KIND_LABELS na /status má štítek settings.changed (dodává skupina C4, soubor EventTable.tsx)",
    run: () => {
      assert.ok(
        /"settings\.changed":\s*"Nastavení chapteru změněno"/.test(read("app/(app)/status/EventTable.tsx")),
        'KIND_LABELS má "settings.changed"'
      );
    },
  },
  {
    name: "T1. texty potvrzení podle gate (Z8): jen vypnutí a změna dne, bonus jen při zapnutém semaforu",
    run: () => {
      assert.equal(
        disableConfirmText("burza", true),
        "Vypnout Burzu pomoci? Zmizí z menu, dashboardu i nápovědy a bonus za ni přestane platit v interním semaforu. Části členů se tím může změnit barva. Data zůstanou."
      );
      assert.equal(disableConfirmText("burza", false), "Vypnout Burzu pomoci? Zmizí z menu, dashboardu i nápovědy. Data zůstanou.");
      assert.equal(
        disableConfirmText("mastermind", true),
        "Vypnout Master mind? Zmizí z menu, dashboardu i nápovědy a bonus za něj přestane platit v interním semaforu. Části členů se tím může změnit barva. Data zůstanou."
      );
      assert.equal(
        disableConfirmText("semafor", true),
        "Vypnout Interní semafor? Zmizí z menu i nápovědy, bonusy se přestanou ukazovat. Data zůstanou."
      );
      assert.equal(
        weekdayChangeConfirmText(2),
        "Změnit den pravidelné schůzky na úterý? Změní se kalendář docházky, termíny Master mindu a ranní spuštění hlasování. Už založené schůzky, omluvy a zařazené případy zůstanou na svých dnech."
      );
      // Zapnutí a změna začátku bez potvrzení.
      const off: ChapterSettings = { ...SETTINGS_BASE, burzaEnabled: false, mastermindEnabled: false };
      assert.deepEqual(settingsConfirmTexts(off, { ...off, burzaEnabled: true, meetingTime: "08:00" }), []);
      assert.deepEqual(settingsConfirmTexts(SETTINGS_BASE, SETTINGS_BASE), []);
      // Vypnutí semaforu spolu s Burzou: bonus se nezmiňuje (semafor nezůstává zapnutý).
      const both = settingsConfirmTexts(SETTINGS_BASE, { ...SETTINGS_BASE, burzaEnabled: false, semaforEnabled: false });
      assert.equal(both.length, 2);
      assert.ok(!both[0].includes("bonus"), "bonus u Burzy, když se vypíná i semafor");
      assert.deepEqual(
        settingsConfirmTexts(SETTINGS_BASE, { ...SETTINGS_BASE, meetingWeekday: 2, mastermindEnabled: false }).map((t) => t.split("?")[0]),
        ["Změnit den pravidelné schůzky na úterý", "Vypnout Master mind"]
      );
      assert.equal(FEATURE_LABELS.burza.nominative, "Burza pomoci");
      assert.equal(FEATURE_OFF_PAGE_TEXT, "Tahle část je vypnutá. Zapnout ji může vedení v Nastavení chapteru.");
      assert.equal(FEATURE_OFF_ACTION_TEXT, "Tahle část je vypnutá.");
      assert.equal(CHAPTER_SETTINGS_TEXTS.saved, "Nastavení je uložené.");
      assert.equal(CHAPTER_SETTINGS_TEXTS.saveFailed, "Nastavení se nepodařilo uložit. Zkus to znovu.");
    },
  },
  {
    name: "T2. formulář: confirm před akcí, 44 px, žádné router.refresh, přepínače a výběry podle gate",
    run: () => {
      const form = stripComments(read("app/(app)/admin/nastaveni/ChapterSettingsForm.tsx"));
      assert.ok(form.includes('"use client"'));
      assert.ok(form.indexOf("window.confirm(") > 0 && form.indexOf("window.confirm(") < form.indexOf("saveChapterSettingsAction(draft)"), "confirm před akcí");
      assert.ok(form.includes("settingsConfirmTexts(saved, draft)"));
      assert.ok(!form.includes("router.refresh"), "LL-017");
      assert.ok((form.match(/min-h-\[44px\]/g) ?? []).length >= 2, "přepínače i tlačítko mají 44 px");
      assert.ok(form.includes('role="switch"'));
      assert.ok(form.includes("grid-cols-1"), "na 390 px pod sebou");
      for (const t of ["featuresHeading", "featuresHint", "meetingHeading", "meetingHint", "weekdayLabel", "timeLabel", "T.saved", "T.saveFailed"]) {
        assert.ok(form.includes(t), t);
      }
      const texts = read("lib/chapter/texts.ts");
      for (const s of [
        "Vypnutá část zmizí z menu, dashboardu i nápovědy. Data zůstanou, po zapnutí se vrátí.",
        "Den a začátek řídí kalendář docházky, termíny Master mindu, uzávěrku omluv a ranní spuštění hlasování. Ranní maily odcházejí mezi 6:00 a 7:00, proto jde začátek nastavit jen od 7:00 do 11:00.",
        "Pravidelná schůzka",
        "Části aplikace",
      ]) {
        assert.ok(texts.includes(s), s);
      }
    },
  },
  {
    name: "T3. FeatureOff a guardy: věta podle gate, odkaz jen pro držitele práva, featureOff a requireFeature",
    run: () => {
      const comp = read("components/chapter/FeatureOff.tsx");
      assert.ok(comp.includes('href="/admin/nastaveni"') && comp.includes("canManageSettings"));
      assert.ok(comp.includes("min-h-[44px]"));
      assert.ok(!comp.includes("redirect("), "bez přesměrování");
      const guard = read("lib/chapter/feature-guard.ts");
      assert.ok(guard.includes("export async function featureOff(") && guard.includes("export async function requireFeature("));
      assert.ok(guard.includes("FEATURE_OFF_ACTION_TEXT"));
    },
  },
  {
    name: "1b. memberDeadline bez parametru = dnešních 7:30, s časem z nastavení se posune (B7/1)",
    run: () => {
      assert.equal(ATTENDANCE_START, DEFAULT_CHAPTER_SETTINGS.meetingTime);
      for (const d of ["2026-01-15", "2026-07-15", "2026-03-26", "2026-10-29"]) {
        assert.equal(memberDeadline(d).toISOString(), memberDeadline(d, "07:30").toISOString(), d);
      }
      assert.equal(memberDeadline("2026-01-15").toISOString(), "2026-01-15T06:30:00.000Z");
      assert.equal(memberDeadline("2026-07-15").toISOString(), "2026-07-15T05:30:00.000Z");
      assert.equal(memberDeadline("2026-01-15", "09:15").toISOString(), "2026-01-15T08:15:00.000Z");
    },
  },
  {
    name: "3. dayTone a dayCellClass: meeting > internal > regular > none, minulost to nemění, kontrast AA (B7/3)",
    run: () => {
      const order = [
        [{ hasMeeting: true, hasInternal: true, isRegularDay: true }, "meeting"],
        [{ hasMeeting: true, hasInternal: false, isRegularDay: false }, "meeting"],
        [{ hasMeeting: false, hasInternal: true, isRegularDay: true }, "internal"],
        [{ hasMeeting: false, hasInternal: false, isRegularDay: true }, "regular"],
        [{ hasMeeting: false, hasInternal: false, isRegularDay: false }, "none"],
      ] as const;
      for (const [input, tone] of order) assert.equal(dayTone(input), tone);
      for (const past of [false, true]) {
        assert.ok(dayCellClass("meeting", past, false).includes("bg-navy "), "minulý den se schůzkou zůstává tmavě modrý");
        assert.ok(dayCellClass("internal", past, false).includes("bg-success"));
        assert.ok(dayCellClass("regular", past, false).includes("bg-navy-soft"));
        assert.ok(!dayCellClass("none", past, false).includes("bg-navy"));
      }
      assert.ok(dayCellClass("none", false, true).includes("ring-offset-2"));
      assert.equal(dayNumberClass("regular"), "");
      const cfg = read("tailwind.config.ts");
      const hex = (re: RegExp) => {
        const m = cfg.match(re);
        assert.ok(m, `tailwind.config.ts: ${re}`);
        return m![1];
      };
      const navy = hex(/navy:\s*\{\s*DEFAULT:\s*"(#[0-9a-fA-F]{6})"/);
      const soft = hex(/soft:\s*"(#[0-9a-fA-F]{6})"/);
      const success = hex(/success:\s*\{\s*DEFAULT:\s*"(#[0-9a-fA-F]{6})"/);
      const textMain = hex(/"text-main":\s*"(#[0-9a-fA-F]{6})"/);
      const lum = (h: string) => {
        const c = [1, 3, 5]
          .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
          .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
      };
      assert.ok(ratio("#ffffff", navy) >= 4.5, "bílá na navy");
      assert.ok(ratio("#ffffff", success) >= 4.5, "bílá na success");
      assert.ok(ratio(textMain, soft) >= 4.5, "text-main na navy-soft");
    },
  },
  {
    name: "4. kalendáře: bez isThursday a „Čt“ natvrdo, berou regularWeekday, legenda doslova z B3 (B7/4)",
    run: () => {
      for (const f of ["components/attendance/AbsenceCalendar.tsx", "components/attendance/AbsencePlanCalendar.tsx"]) {
        const src = stripComments(read(f));
        assert.ok(!src.includes("isThursday("), `${f}: isThursday(`);
        assert.ok(!/"Čt"\s*\?/.test(src), `${f}: "Čt" ?`);
        assert.ok(/regularWeekday\s*:\s*number/.test(src), `${f}: prop regularWeekday`);
      }
      const b3 = "Světle modrý den je pravidelná schůzka, tmavě modrý schůzka s hosty, zelený interní schůzka.";
      assert.ok(MEMBER_TEXTS.legend.startsWith(b3));
      assert.ok(MEMBER_TEXTS.legend.endsWith("● omluva bez náhradníka, ◐ omluva s náhradníkem."));
      assert.ok(PLAN_TEXTS.legend.endsWith(b3));
    },
  },
  {
    name: "5. vypnuté části: featureOff na každé stránce, requireFeature v každé akci, menu, dashboard, nápověda (B7/5)",
    run: () => {
      for (const dir of ["app/(app)/mastermind", "app/(app)/burza", "app/(app)/semafor"]) {
        const pages = filesNamed(dir, "page.tsx");
        assert.ok(pages.length >= 3, `${dir}: stránky`);
        for (const f of pages) assert.ok(read(f).includes("featureOff("), `${f}: featureOff(`);
      }
      for (const f of ["actions/mastermind.ts", "actions/burza.ts", "actions/semafor.ts"]) {
        const src = stripComments(read(f));
        const parts = src.split(/export async function /).slice(1);
        assert.ok(parts.length > 0, `${f}: akce`);
        for (const part of parts) {
          const name = part.slice(0, part.indexOf("(")).trim();
          assert.ok(part.includes("requireFeature("), `${f}: akce ${name} nevolá requireFeature(`);
        }
      }
      for (const f of ["app/(app)/layout.tsx", "components/layout/MobileNav.tsx"]) {
        const src = read(f);
        for (const key of ["mastermind", "burza", "semafor"]) {
          assert.ok(new RegExp(`show\\.${key}\\b|${key}Enabled`).test(src), `${f}: podmínka pro ${key}`);
        }
      }
      const dash = read("app/(app)/dashboard/page.tsx");
      assert.ok(dash.includes("settings.mastermindEnabled &&") && dash.includes("settings.burzaEnabled &&"));
      // nápověda: stránka bere nastavení, HelpPage ho předává, sekce se podmiňují
      const page = read("app/(app)/help/page.tsx");
      assert.ok(page.includes("getChapterSettings()") && page.includes("settings={settings}"));
      const helpPage = read("components/help/HelpPage.tsx");
      assert.ok(helpPage.includes("settings.semaforEnabled") && helpPage.includes("settings={settings}"));
      const member = read("components/help/sections/MemberHelp.tsx");
      for (const flag of ["settings.mastermindEnabled", "settings.burzaEnabled", "settings.semaforEnabled"]) {
        assert.ok(member.includes(flag), `MemberHelp: ${flag}`);
      }
      const moderator = read("components/help/sections/ModeratorHelp.tsx");
      for (const flag of ["settings.mastermindEnabled", "settings.burzaEnabled", "settings.semaforEnabled"]) {
        assert.ok(moderator.includes(flag), `ModeratorHelp: ${flag}`);
      }
    },
  },
  {
    name: "6. bonus podle zapnutých částí (BK2, Z3): funkce, skóre a texty (B7/6)",
    run: () => {
      const on = { ...DEFAULT_CHAPTER_SETTINGS };
      assert.deepEqual(bonusSources(on), { mastermind: true, burza: true });
      assert.deepEqual(bonusSources({ ...on, mastermindEnabled: false }), { mastermind: false, burza: true });
      assert.deepEqual(bonusSources({ ...on, burzaEnabled: false }), { mastermind: true, burza: false });
      // vypnutý semafor: bonus neexistuje, i když jsou části zapnuté
      assert.deepEqual(bonusSources({ ...on, semaforEnabled: false }), { mastermind: false, burza: false });
      const events = [
        { category: "mastermind" as const, date: "2026-09-10" },
        { category: "burza" as const, date: "2026-09-11" },
        { category: "burza" as const, date: "2026-09-12" },
      ];
      assert.deepEqual(filterBonusEvents(events, { mastermind: false, burza: true }).map((e) => e.category), ["burza", "burza"]);
      assert.deepEqual(filterBonusEvents(events, { mastermind: true, burza: false }).map((e) => e.category), ["mastermind"]);
      assert.deepEqual(filterBonusEvents(events, { mastermind: false, burza: false }), []);
      // oba zdroje vypnuté: bonus 0 a vnitřní skóre = skóre BNI
      const none = computeBonus({
        mastermind: filterBonusEvents(events, { mastermind: false, burza: false }).length,
        burza: 0,
      });
      assert.equal(none.bonus, 0);
      assert.equal(internalScore(62.5, none.bonus), 62.5);
      assert.ok(internalScore(95, computeBonus({ mastermind: 9, burza: 9 }).bonus) <= 100 && BONUS_CAP === 20);
      assert.equal(hasBonusSource({ mastermind: false, burza: false }), false);
      // texty: bez zdroje o bonusu ani slovo
      const off = { mastermind: false, burza: false };
      assert.ok(!/bonus/i.test(scoreLegendText(off)));
      assert.ok(!/bonus/i.test(overviewLegendText(off)));
      assert.ok(!/bonus/i.test(helpSemaforMember(off).join(" ")));
      assert.ok(!/Master mind|bonus/i.test(helpSemaforLeadership(off).map((h) => h.text).join(" ")));
      assert.ok(!/Burz/.test(scoreLegendText({ mastermind: true, burza: false })));
      assert.ok(!/bonus/.test(BURZA_TEXTS.usedHelpHint(false)) && !/bonus/.test(BURZA_TEXTS.usedContactHint(false)));
      assert.ok(/bonus/.test(BURZA_TEXTS.usedHelpHint(true)) && /bonus/.test(BURZA_TEXTS.usedContactHint(true)));
      assert.ok(!/bonus/.test(MM_TEXTS.confirmPresented(false)) && /bonus/.test(MM_TEXTS.confirmPresented(true)));
    },
  },
  {
    name: "11. čtvrtek pryč z logiky: žádné „Thursday“ ani vlastní isThursday, den 4 dává dnešní chování (B7/11)",
    run: () => {
      for (const f of [
        "lib/meetings/morning-dispatch.ts",
        "lib/meetings/warning-plan.ts",
        "app/api/cron/close-voting/route.ts",
        "lib/mastermind/rules.ts",
      ]) {
        const src = stripComments(read(f));
        assert.ok(!/thursday/i.test(src), `${f}: Thursday`);
        assert.ok(!/function\s+isThursday/.test(src), `${f}: vlastní isThursday`);
      }
      // den 4: čtvrtek je pravidelný den, úterý podle parametru
      assert.equal(isMeetingWeekday("2026-10-22"), true);
      assert.equal(isMeetingWeekday("2026-10-21"), false);
      assert.equal(isMeetingWeekday("2026-10-20", 2), true);
      assert.equal(isMeetingWeekday("2026-10-22", 2), false);
      // konec hlasování bez parametru = čtvrtek
      const now = new Date("2026-10-22T07:00:00Z");
      assert.equal(votingCloseBeforeRegularDay(now).toISOString(), votingCloseBeforeRegularDay(now, 4).toISOString());
    },
  },
  {
    name: "12. konec hlasování (BK3): shoda s nezávislým výpočtem středy 23:59 včetně přechodu času, úterý dává pondělí (B7/12)",
    run: () => {
      // Nezávislý výpočet: pražské datum cílového dne a okamžik 23:59:59 podle toho, které UTC se v Praze zobrazí takto.
      const pragueParts = (d: Date) => {
        const f = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Prague",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        });
        return f.format(d).replace(" ", "T");
      };
      const reference = (now: Date, weekdayBefore: number): string => {
        let day = todayInPrague(now);
        for (let i = 0; i < 8; i++) {
          const next = new Date(`${day}T12:00:00Z`);
          next.setUTCDate(next.getUTCDate() + 1);
          day = next.toISOString().slice(0, 10);
          if (new Date(`${day}T12:00:00Z`).getUTCDay() === weekdayBefore) break;
        }
        for (const offset of [1, 2]) {
          const candidate = new Date(Date.parse(`${day}T23:59:59Z`) - offset * 3600_000);
          if (pragueParts(candidate) === `${day}T23:59:59`) return candidate.toISOString();
        }
        throw new Error(`bez řešení pro ${day}`);
      };
      let count = 0;
      const start = Date.parse("2026-01-01T09:00:00Z");
      // 60 dat po šesti dnech: pokrývá přechod na letní (29. 3.) i zimní čas (25. 10.)
      for (let i = 0; i < 60; i++) {
        const now = new Date(start + i * 6 * 86400_000 + (i % 5) * 3600_000);
        assert.equal(nextWednesday2359InPrague(now).toISOString(), reference(now, 3), `středa ${now.toISOString()}`);
        assert.equal(votingCloseBeforeRegularDay(now, 4).toISOString(), reference(now, 3), `den 4 ${now.toISOString()}`);
        assert.equal(votingCloseBeforeRegularDay(now, 2).toISOString(), reference(now, 1), `úterý ${now.toISOString()}`);
        count++;
      }
      assert.equal(count, 60);
      // pro úterní schůzku vychází pondělí 23:59 (po přechodu na zimní čas, 22:59:59Z)
      assert.equal(votingCloseBeforeRegularDay(new Date("2026-10-19T08:00:00Z"), 2).toISOString(), "2026-10-26T22:59:59.000Z");
      assert.equal(votingClosesAtFor("2026-10-22", new Date("2026-10-20T08:00:00Z")).toISOString(), "2026-10-28T22:59:59.000Z");
      assert.equal(votingClosesAtFor("2026-10-20", new Date("2026-10-15T08:00:00Z"), 2).toISOString(), "2026-10-26T22:59:59.000Z");
    },
  },
  {
    name: "T4. soubory skupiny: bez em dash, bez ASCII-only textů, bez jmen a e-mailů",
    run: () => {
      for (const f of [...OWN_FILES, "scripts/test-iter-042-nastaveni.ts"]) {
        assert.ok(existsSync(join(ROOT, f)), `${f} existuje`);
        const src = read(f);
        assert.ok(!src.includes(EM_DASH), `${f}: dlouhá pomlčka`);
        assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(src), `${f}: e-mailová adresa`);
      }
      for (const f of OWN_FILES.filter((p) => /texts\.ts$|Form\.tsx$|FeatureOff/.test(p))) {
        const src = read(f);
        for (const bad of ["Nastaveni", "Zmenit", "Ulozit", "vypnuta", "Tahle cast"]) {
          assert.ok(!src.includes(bad), `${f}: text bez diakritiky „${bad}“`);
        }
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
