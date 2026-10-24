/**
 * Testy iter-041, část docházka: stav „Chyběl(a) bez omluvy“ (`unexcused`,
 * arch 7, gate Z1, K6). Bez DATABASE_URL, bez sítě. Statické kontroly čtou
 * zdrojáky z disku. SQL se ověřuje zvlášť na pglite (viz report T-003).
 *
 * Spuštění: npm run test:iter-041-attendance
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { fillDayRowsSql, type DayMode } from "../lib/db/queries/attendance-close";
import {
  ABSENCE_STATUSES,
  RECORD_SOURCES,
  dayAriaLabel,
  isAbsenceStatus,
  pastResultGlyph,
  pragueInstant,
} from "../lib/attendance/rules";
import {
  OVERVIEW_TEXTS,
  SHEET_TEXTS,
  confirmExcuseOffSubstituteText,
  TARGET_UNEXCUSED,
  auditValueText,
  parseWriteBody,
  rowDecided,
  summarizeSheet,
  unexcusedAllowedAt,
  type SheetRow,
} from "../lib/attendance/sheet";
import { buildAttendanceReport, type ReportData, type ReportMember } from "../lib/attendance/report";
import { UNEXCUSED_TEXTS, unexcusedTooEarlyHintText, unexcusedTooEarlyText } from "../lib/attendance/texts";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// pglite in-process (falešný host, žádná síť), modul z PGLITE_MODULE_DIR nebo cwd
interface PgLite {
  waitReady: Promise<unknown>;
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}
function loadPglite(): (new () => PgLite) | null {
  const dirs = [process.env.PGLITE_MODULE_DIR, process.cwd()].filter((d): d is string => !!d);
  for (const dir of dirs) {
    try {
      const req = createRequire(join(dir, "noop.js"));
      return (req("@electric-sql/pglite") as { PGlite: new () => PgLite }).PGlite;
    } catch {
      /* zkusit další */
    }
  }
  return null;
}
const D = "2026-10-22";
const DDL = `
CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  deactivated_at timestamptz, inactive_until date
);
CREATE TABLE attendance_record (
  attendance_date date NOT NULL, member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  status text NOT NULL, substitute_name text, source text NOT NULL DEFAULT 'manager', version integer NOT NULL DEFAULT 1,
  updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attendance_date, member_id),
  CONSTRAINT ar_status CHECK (status IN ('absent', 'present', 'substitute', 'unexcused')),
  CONSTRAINT ar_sub CHECK ((status = 'substitute') = (substitute_name IS NOT NULL))
);
CREATE TABLE member_absence (
  member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE, absence_date date NOT NULL,
  substitute_name text, PRIMARY KEY (member_id, absence_date)
);
`;

const MEMBER = "00000000-0000-4000-8000-000000000001";

const tests: TestCase[] = [
  {
    name: "28. parseWriteBody přijme unexcused bez jména, jméno zahodí; neznámý stav ne",
    run: () => {
      const ok = parseWriteBody({ op: "presence", memberId: MEMBER, status: "unexcused", substituteName: "Kdosi", expectedVersion: 2 });
      assert.ok(ok.ok);
      if (ok.ok && ok.value.op === "presence") {
        assert.equal(ok.value.status, "unexcused");
        assert.equal(ok.value.substituteName, null);
        assert.equal(ok.value.expectedVersion, 2);
      }
      assert.ok(!parseWriteBody({ op: "presence", memberId: MEMBER, status: "late", expectedVersion: 0 }).ok);
      assert.deepEqual(TARGET_UNEXCUSED, { status: "unexcused", substituteName: null });
    },
  },
  {
    name: "29. rowDecided: unexcused je rozhodnutý (filtr Bez zápisu ho skryje), absent a bez řádku ne",
    run: () => {
      assert.equal(rowDecided({ status: "unexcused" }), true);
      assert.equal(rowDecided({ status: "present" }), true);
      assert.equal(rowDecided({ status: "substitute" }), true);
      assert.equal(rowDecided({ status: "absent" }), false);
      assert.equal(rowDecided({ status: null }), false);
      const ui = stripComments(read("components/attendance/AttendanceSheet.tsx"));
      assert.ok(ui.includes('filter === "open" ? rows.filter((r) => !rowDecided(r))'));
    },
  },
  {
    name: "30. summarizeSheet: unexcused je v „chybí“, ne v „omluveno“; bez řádku a bez omluvy = přítomen",
    run: () => {
      const rows: Pick<SheetRow, "status" | "excused">[] = [
        { status: "present", excused: false },
        { status: "unexcused", excused: false },
        { status: "absent", excused: true },
        { status: null, excused: false },
      ];
      // T-005b: řádek bez zápisu a bez omluvy je přítomen
      assert.deepEqual(summarizeSheet(rows), { total: 4, present: 2, substitutes: 0, missing: 2, excused: 1 });
    },
  },
  {
    name: "31. report: unexcused v sekci „Bez omluvy“ s pořadím absence, omluvená absence v „Omluvení“",
    run: () => {
      const m = (name: string, status: ReportMember["status"], excused: boolean, ordinal: number | null): ReportMember => ({
        name, status, substituteName: null, excused, announcedSubstitute: false, ordinal,
      });
      const data: ReportData = {
        date: "2026-10-15", hasMeeting: true, mode: "recorded", late: false, writers: [], lastChange: null,
        members: [m("Anna Test", "unexcused", false, 3), m("Bořek Test", "absent", true, 1), m("Cyril Test", "absent", false, 2), m("Dana Test", "present", false, null)],
      };
      const text = buildAttendanceReport({ data, recipientName: "P", url: "u" }).text;
      const without = text.slice(text.indexOf("Bez omluvy"));
      assert.ok(without.includes("Anna Test"), "unexcused v sekci Bez omluvy");
      assert.ok(without.includes("Cyril Test"));
      assert.ok(!without.includes("Bořek Test"));
      assert.ok(text.slice(text.indexOf("Omluvení"), text.indexOf("Bez omluvy")).includes("Bořek Test"));
      assert.ok(!text.includes("Chyběl"), "bez nového textu v reportu");
    },
  },
  {
    name: "32. isAbsenceStatus, glyf A, aria „absence bez omluvy“, audit, zdroj palms",
    run: () => {
      assert.deepEqual([...ABSENCE_STATUSES], ["absent", "unexcused"]);
      assert.equal(isAbsenceStatus("unexcused"), true);
      assert.equal(isAbsenceStatus("absent"), true);
      assert.equal(isAbsenceStatus("present"), false);
      assert.equal(isAbsenceStatus("substitute"), false);
      assert.equal(isAbsenceStatus(null), false);
      assert.equal(pastResultGlyph("unexcused"), "A");
      const aria = dayAriaLabel("2026-10-15", { mark: "none", result: "unexcused", hasMeeting: true });
      assert.ok(aria.includes("absence bez omluvy"), aria);
      assert.equal(auditValueText("unexcused"), "Chyběl(a) bez omluvy");
      assert.equal(auditValueText("absent"), "Nepřítomen");
      assert.deepEqual([...RECORD_SOURCES], ["manager", "auto", "palms"]);
      assert.equal(SHEET_TEXTS.unexcused, "Chyběl(a) bez omluvy");
    },
  },
  {
    name: "33. statický: v lib/db/queries/attendance*.ts není holé status = 'absent' mimo zápis; počítání přes absenceStatusSql",
    run: () => {
      const files = readdirSync(join(ROOT, "lib/db/queries")).filter((f) => /^attendance.*\.ts$/.test(f));
      assert.ok(files.length >= 3);
      for (const f of files) {
        const src = stripComments(read(`lib/db/queries/${f}`));
        const bare = [...src.matchAll(/status\s*=\s*'absent'/g)];
        assert.equal(bare.length, 0, `${f}: holé status = 'absent'`);
        // 'absent' jako zapisovaná hodnota je jen ve fillDayRows
        if (f !== "attendance-close.ts") assert.ok(!/'absent'\s*,\s*NULL/.test(src), f);
      }
      const att = stripComments(read("lib/db/queries/attendance.ts"));
      assert.equal((att.match(/absenceStatusSql\("r"\)/g) ?? []).length, 3, "listMyAbsenceDays, listOverviewMembers, listClosedDays");
      const close = stripComments(read("lib/db/queries/attendance-close.ts"));
      assert.equal((close.match(/absenceStatusSql\("[rx]"\)/g) ?? []).length, 2, "pořadí absence v reportu");
      assert.ok(close.includes("isAbsenceStatus(status)"));
      const detail = read("app/(app)/dochazka/prehled/[memberId]/page.tsx");
      assert.ok(detail.includes("isAbsenceStatus(d.status)"));
      const ab = stripComments(read("lib/db/queries/absence-status.ts"));
      assert.ok(ab.includes("IN ('absent', 'unexcused')"));
    },
  },
  {
    name: "34. Z1: unexcusedAllowedAt 7:29 ne, 7:30 ano, minulý den ano (DST 25. 10. 2026)",
    run: () => {
      for (const date of ["2026-10-22", "2026-10-25", "2027-03-28", "2026-07-16"]) {
        const edge = pragueInstant(date, "07:30");
        assert.equal(unexcusedAllowedAt(new Date(edge.getTime() - 60_000), date), false, `${date} 7:29`);
        assert.equal(unexcusedAllowedAt(edge, date), true, `${date} 7:30`);
      }
      assert.equal(unexcusedAllowedAt(new Date("2026-10-22T12:00:00Z"), "2026-10-15"), true);
      assert.equal(unexcusedAllowedAt(new Date("2026-10-22T04:00:00Z"), "2026-10-23"), false, "budoucí den");
      // iter-042 (B4): začátek z nastavení, např. 8:00
      for (const date of ["2026-10-22", "2026-10-25", "2027-03-28", "2026-07-16"]) {
        const edge = pragueInstant(date, "08:00");
        assert.equal(unexcusedAllowedAt(new Date(edge.getTime() - 60_000), date, "08:00"), false, `${date} 7:59`);
        assert.equal(unexcusedAllowedAt(edge, date, "08:00"), true, `${date} 8:00`);
      }
    },
  },
  {
    name: "35. Z1 a K6 v SQL: podmínka 7:30 a konflikty jsou v g, ne jen v klientu; routes vrací blocked",
    run: () => {
      const q = stripComments(read("lib/db/queries/attendance.ts"));
      const w = q.slice(q.indexOf("export async function writePresenceGuarded"), q.indexOf("export type ExcuseWriteResult"));
      assert.ok(w.includes("unexcusedTimeSql(date, meetingTime)") && w.includes("AS time_ok") && w.includes("AS excuse_ok"));
      assert.ok(/ok AS \(SELECT \(day_ok AND member_ok AND time_ok AND excuse_ok\) AS go FROM g\)/.test(w));
      assert.ok(w.includes("FROM member_absence ea"));
      assert.ok(q.includes("(now() >= ((${date}::date + ${time}::time) AT TIME ZONE 'Europe/Prague'))"), "iter-042 B4: čas z nastavení jako bind parametr");
      const e = q.slice(q.indexOf("export async function setExcuseGuarded"), q.indexOf("// ── Audit a přehled"));
      assert.ok(e.includes("ur.status = 'unexcused'") && /ok AS \(SELECT \(day_ok AND member_ok AND unexcused_ok\) AS go FROM g\)/.test(e));
      assert.ok(!/transaction\(/.test(q));
      // setMyAbsenceGuarded (člen) se nemění: po 7:30 omluvu nepustí
      const my = q.slice(q.indexOf("export async function setMyAbsenceGuarded"), q.indexOf("export async function setMyAbsenceGuarded") + 2500);
      assert.ok(!my.includes("unexcused"));
      for (const route of ["app/api/attendance/[date]/route.ts", "app/api/d/[token]/route.ts"]) {
        const r = stripComments(read(route));
        assert.ok(r.includes("unexcusedTooEarlyText(meetingTime)") && r.includes("getChapterSettings") && r.includes("UNEXCUSED_TEXTS.excusedConflict") && r.includes("UNEXCUSED_TEXTS.unexcusedConflict"), route);
        assert.ok(r.includes('result: "blocked"'), route);
      }
      assert.equal(UNEXCUSED_TEXTS.tooEarly, SHEET_TEXTS.unexcusedTooEarly);
      // iter-042 (Z5): text s časem z nastavení, výchozí hodnota = dnešní znění
      assert.equal(unexcusedTooEarlyText("07:30"), UNEXCUSED_TEXTS.tooEarly);
      assert.equal(unexcusedTooEarlyHintText("07:30"), UNEXCUSED_TEXTS.tooEarlyHint);
      assert.equal(unexcusedTooEarlyText("08:15"), "Chyběl(a) bez omluvy jde zapsat od 8:15. Do té doby se člen může omluvit.");
      assert.equal(unexcusedTooEarlyHintText("10:00"), "Od 10:00. Do té doby se člen může omluvit.");
      assert.ok(read("components/attendance/AttendanceSheet.tsx").includes("unexcusedTooEarlyHintText(payload.meetingTime)"));
    },
  },
  {
    name: "36. uzávěrka nepřepíše ruční unexcused (ON CONFLICT DO NOTHING) a palms se nepočítá jako zápis správce",
    run: () => {
      const close = stripComments(read("lib/db/queries/attendance-close.ts"));
      const from = close.indexOf("export function fillDayRowsSql");
      const fill = close.slice(from, close.indexOf("export async function markDayFinalized"));
      assert.ok(from > 0);
      assert.equal((fill.match(/ON CONFLICT \(attendance_date, member_id\) DO NOTHING/g) ?? []).length, 2);
      for (const f of ["attendance-close.ts", "attendance-internal.ts", "attendance.ts"]) {
        const src = stripComments(read(`lib/db/queries/${f}`));
        for (const m of src.matchAll(/source\s*(=|<>|!=|IN)\s*[^\n]{0,40}/g)) {
          assert.ok(!m[0].includes("palms") || m[0].includes("'manager'") === false, `${f}: ${m[0]}`);
        }
        assert.ok(!/source\s*<>\s*'auto'/.test(src), `${f}: has_manager nesmí být negací auto`);
      }
    },
  },
  {
    name: "37. texty: bez U+2014, UI tyká, nápověda vyká; UI a sdílené konstanty shodné",
    run: () => {
      for (const t of Object.values(UNEXCUSED_TEXTS)) assert.ok(!t.includes(EM_DASH));
      assert.ok(!read("components/attendance/AttendanceSheet.tsx").includes(EM_DASH));
      assert.equal(SHEET_TEXTS.errExcusedConflict, UNEXCUSED_TEXTS.excusedConflict);
      assert.equal(SHEET_TEXTS.errUnexcusedConflict, UNEXCUSED_TEXTS.unexcusedConflict);
    },
  },
  {
    name: "38. T-005b: úvod Zápisu (dva způsoby, náhradník přes Přítomen, nezaškrtnutý = přítomný, odškrtnutí omluvy) je v Zápisu i v nápovědě, bez em dash",
    run: () => {
      const ui = read("components/attendance/AttendanceSheet.tsx");
      const keys = ["introTitle", "introWays", "introSubstitute", "introOpen", "introExcuse"];
      for (const k of keys) {
        assert.ok(ui.includes(`SHEET_TEXTS.${k}`), k);
        const t = (SHEET_TEXTS as Record<string, string>)[k];
        assert.ok(t && !t.includes(EM_DASH), k);
      }
      assert.ok(ui.indexOf("SHEET_TEXTS.introTitle") < ui.indexOf("aria-live"), "úvod je nad souhrnem");
      assert.ok(ui.includes('data-testid="sheet-intro"') && !/hidden|sm:block/.test(ui.slice(ui.indexOf('data-testid="sheet-intro"') - 200, ui.indexOf('data-testid="sheet-intro"'))), "úvod je vidět na první pohled");
      // iter-042 (#13): zkrácený úvod, doslova z gate sekce 6 a návrhu
      assert.equal(SHEET_TEXTS.introWays, "Zaškrtávej Přítomen u příchozích, nebo označ jen ty, kdo chyběli (Chyběl(a) bez omluvy).");
      assert.equal(SHEET_TEXTS.introSubstitute, "Náhradníka zapíšeš zaškrtnutím Přítomen a volbou s náhradníkem. Ohlášené jméno se vyplní samo.");
      assert.equal(
        SHEET_TEXTS.introOpen,
        "Kdo zůstane bez zápisu, počítá se při uzávěrce jako přítomný, s omluvou jako omluvený a s ohlášeným náhradníkem jako náhradník."
      );
      assert.equal(SHEET_TEXTS.introExcuse, "Odškrtnutím Omluven(a) smažeš omluvu i se jménem náhradníka.");
      // nápověda (components/help/**) patří fázi 3 iter-042, její znění tu nehlídáme; hlídá ho test-iter-036-help a test-iter-042-srozumitelnost
      const help = read("components/help/sections/ModeratorHelp.tsx");
      assert.ok(help.includes("Omluven(a)"));
      assert.ok(!help.includes("je při uzávěrce nepřítomný"), "staré tvrzení je pryč");
      assert.ok(!help.includes(EM_DASH));
      // žádný zbytek redesignu „Náhradník přišel“
      for (const f of ["components/attendance/AttendanceSheet.tsx", "lib/attendance/sheet.ts", "lib/db/queries/attendance-close.ts", "components/help/sections/ModeratorHelp.tsx"]) {
        assert.ok(!/Náhradník přišel|arrivedSubstitute/.test(read(f)), f); // velké N: zbytek tlačítka; věta v potvrzení iter-042 #2 má malé n
      }
    },
  },
  {
    name: "40. iter-042 #1, #2, #12: řádek bez zápisu říká následek, odškrtnutí Omluven(a) se potvrzuje před změnou, filtr Bez zápisu a pruh bez schůzky",
    run: () => {
      const ui = read("components/attendance/AttendanceSheet.tsx");
      // #2: confirm je první příkaz větve odškrtnutí, před optimistickou změnou i před fetch
      const fn = ui.slice(ui.indexOf("async function onToggleExcuse"), ui.indexOf("// ── Vykreslení"));
      assert.ok(fn.includes("window.confirm("));
      assert.ok(fn.indexOf("window.confirm(") < fn.indexOf("setRow(id, { ...before, excused"), "confirm před optimistickou změnou");
      assert.ok(fn.indexOf("window.confirm(") < fn.indexOf("postJson("), "confirm před fetch");
      assert.ok(/if \(!excused && before\.excused\)/.test(fn), "jen při odškrtnutí");
      assert.ok(/if \(!ok\) return;/.test(fn), "Zrušit nic nezmění");
      assert.equal(
        confirmExcuseOffSubstituteText("Jan Test"),
        "Smazat omluvu i s náhradníkem Jan Test? Vrátit to nepůjde. Když náhradník přišel, dej Zrušit a zaškrtni Přítomen."
      );
      assert.equal(SHEET_TEXTS.confirmExcuseOff, "Smazat omluvu člena? Vrátit to nepůjde.");
      // #12
      assert.equal(SHEET_TEXTS.filterOpen, "Bez zápisu");
      assert.equal(SHEET_TEXTS.noMeeting, "Na dnešek není v aplikaci žádná schůzka. Zapisuj, jen když se opravdu konala.");
      assert.equal(SHEET_TEXTS.writeAnyway, "Zapisovat i tak");
      // #28
      assert.equal(SHEET_TEXTS.errInactive, "Člen ten den nebyl aktivní (neaktivní nebo vstoupil později). Docházka se mu nezapisuje.");
      // #11
      assert.equal(SHEET_TEXTS.unrecordedBanner, "Docházka se ten den nezapisovala. Počítají se jen omluvy bez náhradníka.");
      assert.equal(OVERVIEW_TEXTS.detailUpcoming, "Omluvy dopředu");
      // žádné texty o stavu dne nevzaly čas natvrdo
      for (const f of ["lib/attendance/texts.ts", "lib/attendance/sheet.ts", "lib/attendance/rules.ts", "components/attendance/AttendanceSheet.tsx"]) {
        const src = stripComments(read(f));
        assert.ok(!/\b0?7:30\b/.test(src.replace(/DEFAULT_CHAPTER_SETTINGS/g, "")), `${f}: čas natvrdo`);
      }
    },
  },
  {
    name: "39. T-005b: uzávěrka recorded nad pglite: nezaškrtnutý = present, ohlášený náhradník = substitute se jménem, omluva = absent, explicitní řádky zůstanou, opakování nic nezmění; unrecorded present nezapisuje",
    run: async () => {
      const PGlite = loadPglite();
      if (!PGlite) {
        const msg = "PGlite nenalezen (PGLITE_MODULE_DIR), test 39 přeskočen";
        if (process.env.REQUIRE_PGLITE === "1") throw new Error(msg);
        console.log(`UPOZORNĚNÍ: ${msg}`);
        return;
      }
      const db = new PGlite();
      try {
        await db.waitReady;
        await db.exec(DDL);
        const dialect = new PgDialect();
        const run = async (mode: DayMode) => {
          const q = dialect.sqlToQuery(fillDayRowsSql(D, mode));
          return Number((await db.query(q.sql, q.params as unknown[])).rows[0].n);
        };
        const ids: Record<string, string> = {};
        const names = ["Ales Prvni", "Berta Druha", "Cyril Treti", "Dana Ctvrta", "Emil Paty", "Filip Sesty", "Gita Sedma", "Hugo Osmy"];
        for (const n of names) {
          const joined = n === "Hugo Osmy" ? "2027-01-01" : "2020-01-01";
          const r = await db.query("INSERT INTO member (name, joined_at) VALUES ($1, $2) RETURNING id::text AS id", [n, joined]);
          ids[n] = String(r.rows[0].id);
        }
        // Gita je deaktivovaná, Hugo vstoupil později: oba bez řádku
        await db.query("UPDATE member SET deactivated_at = now() - interval '10 days' WHERE name = 'Gita Sedma'");
        // ohlášení: Berta bez náhradníka, Cyril s náhradníkem, Gita (neaktivní)
        await db.query("INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $4, NULL), ($2, $4, 'Jan Nahradnik'), ($3, $4, NULL)", [ids["Berta Druha"], ids["Cyril Treti"], ids["Gita Sedma"], D]);
        // správce zapsal: Dana explicitně absent, Emil unexcused, Filip present
        await db.query("INSERT INTO attendance_record (attendance_date, member_id, status, source) VALUES ($1, $2, 'absent', 'manager'), ($1, $3, 'unexcused', 'manager'), ($1, $4, 'present', 'manager')", [D, ids["Dana Ctvrta"], ids["Emil Paty"], ids["Filip Sesty"]]);
        const snap = async () => (await db.query("SELECT m.name, r.status, r.substitute_name, r.source, r.version FROM attendance_record r JOIN member m ON m.id = r.member_id ORDER BY m.name")).rows;

        assert.equal(await run("recorded"), 3, "vloženy Ales, Berta, Cyril");
        const rows = Object.fromEntries((await snap()).map((r) => [String(r.name), r]));
        assert.equal(rows["Ales Prvni"].status, "present");
        assert.equal(rows["Ales Prvni"].source, "auto");
        assert.equal(rows["Ales Prvni"].substitute_name, null);
        assert.equal(rows["Berta Druha"].status, "absent");
        assert.equal(rows["Berta Druha"].substitute_name, null);
        assert.equal(rows["Cyril Treti"].status, "substitute");
        assert.equal(rows["Cyril Treti"].substitute_name, "Jan Nahradnik");
        assert.equal(rows["Cyril Treti"].source, "auto");
        assert.equal(rows["Dana Ctvrta"].status, "absent", "explicitní absent zůstal");
        assert.equal(rows["Dana Ctvrta"].source, "manager");
        assert.equal(rows["Emil Paty"].status, "unexcused", "unexcused zůstal");
        assert.equal(rows["Filip Sesty"].status, "present");
        assert.equal(rows["Filip Sesty"].source, "manager");
        assert.equal(rows["Gita Sedma"], undefined, "neaktivní člen bez řádku");
        assert.equal(rows["Hugo Osmy"], undefined, "člen, který vstoupil později, bez řádku");
        const after = JSON.stringify(await snap());
        assert.equal(await run("recorded"), 0, "opakování nic nevloží");
        assert.equal(JSON.stringify(await snap()), after, "opakování nic nezmění");

        // unrecorded: přítomným se řádek nezapisuje, platí jen ohlášení
        await db.exec("TRUNCATE attendance_record");
        assert.equal(await run("unrecorded"), 2, "jen Berta a Cyril");
        const u = (await snap()).map((r) => `${r.name}:${r.status}`);
        assert.deepEqual(u, ["Berta Druha:absent", "Cyril Treti:substitute"]);
        assert.equal(await run("unrecorded"), 0);
      } finally {
        await db.close();
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
      console.log(`FAIL ${t.name}\n     ${(e as Error).stack?.split("\n").slice(0, 8).join("\n     ") ?? (e as Error).message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testů prošlo`);
  process.exit(failed ? 1 : 0);
})();
