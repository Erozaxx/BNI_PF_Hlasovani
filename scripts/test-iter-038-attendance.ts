/**
 * Testy iter-038 (docházka). Bez DATABASE_URL, bez sítě. Statické kontroly čtou
 * zdrojáky z disku.
 *
 * T-003a (testy A1 až A24): čas a uzávěrka člena, DST, jméno náhradníka,
 * `permissionsFor` s příznakem Správce docházky (K1 A, Z4), okno absencí,
 * kalendář, texty karty a člena, migrace, guardy, nápověda člena.
 * T-003b (testy B1 až B15): režim zápisu, Z2, souhrn, validace těla, fronta
 * řádku a verze, audit, Origin, guardy, SQL zápisu, polling, nápověda vedení.
 * T-003c (testy C1 až C14): plán cronu a okna (gate Z1, všech 14 buněk), vercel.json,
 * rozhodnutí o přístupu přes ranní odkaz, middleware, report a ranní mail doslova,
 * texty stránky odkazu, guardy odkazu, SQL uzavření dne, bez práce nic nezapíše,
 * ops log bez tokenu a jmen, líná pošta, bez em dash, AdminHelp.
 *
 * Spuštění: npm run test:iter-038 (tento soubor + test:iter-037)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ATTENDANCE_MANAGER_PERMISSIONS,
  ADMIN_DELEGABLE_MARKER,
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  PERMISSIONS,
  permissionsFor,
  type Permission,
} from "../lib/auth/permissions";
import {
  ABSENCE_LIMIT,
  ATTENDANCE_START,
  DASHBOARD_TEXTS,
  GRID_WEEKDAYS,
  MAX_ADVANCE_DAYS,
  MEMBER_TEXTS,
  absenceCountParts,
  absenceCountText,
  absenceDayLine,
  absenceExpiresOn,
  absenceLine,
  absenceMark,
  absenceWindowStart,
  addMonthsClamped,
  buildAbsenceCardView,
  dayAriaLabel,
  decideMemberAbsenceEdit,
  formatWeekdayDM,
  formatWeekdayLong,
  isThursday,
  memberDeadline,
  memberIntroText,
  memberMayEditAbsence,
  monthEnd,
  monthGrid,
  monthStart,
  monthTitle,
  nextThursday,
  pragueInstant,
  shiftMonth,
  validateSubstituteName,
} from "../lib/attendance/rules";
import {
  SHEET_TEXTS,
  TARGET_ABSENT,
  announcedText,
  auditLine,
  conflictText,
  auditValueText,
  dayBannerText,
  decideAttendanceWriteMode,
  enqueueTarget,
  formatPragueDateTime,
  formatPragueTime,
  isGuardedDay,
  newRowSync,
  nextRequest,
  parseSheetDate,
  parseWriteBody,
  sheetTitle,
  summarizeSheet,
  summaryText,
  targetOnCheck,
  type PresenceTarget,
  type SheetRow,
} from "../lib/attendance/sheet";
import { isSameOrigin } from "../lib/auth/same-origin";
import {
  ATTENDANCE_CRON_SCHEDULES,
  ATTENDANCE_LINK_VALID_HOURS,
  ATTENDANCE_REPORT_FUNCTIONS,
  EVENING_FROM_MINUTES,
  MORNING_FROM_MINUTES,
  MORNING_TO_MINUTES,
  linkExpiresAt,
  planAttendanceCron,
} from "../lib/attendance/cron-plan";
import {
  excusedWord,
  buildAttendanceReport,
  buildMorningMail,
  morningExcusedLine,
  reportCounts,
  type ReportData,
  type ReportMember,
} from "../lib/attendance/report";
import { LINK_TEXTS, linkProblemStatus, linkProblemText } from "../lib/attendance/link-page";
import { decideAttendanceTokenAccess } from "../lib/auth/attendance-token-access";
import { runAttendanceCron } from "../lib/attendance/cron";
import { sendAttendanceLinkEmail, sendAttendanceReportEmail } from "../lib/email/attendance";
import { SUBSTITUTE_NAME_MEMORY_LIMIT } from "../lib/attendance/rules";
import { TERMINAL_KINDS } from "../lib/ops/types";
import { deriveRunStatus } from "../lib/ops/run-status";
import { addDaysToDateString, pragueToday } from "../lib/members/activity";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
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
    else if (/\.(ts|tsx)$/.test(name)) out.push(relative(ROOT, join(ROOT, rel)));
  }
  return out;
}

const EM_DASH = String.fromCharCode(0x2014);
const iso = (d: string, t: string) => pragueInstant(d, t).toISOString();

const fn = (name: string, permissions: string[] | null) => ({ name, permissions });
const perms = (
  authMethod: "password" | "magic_link" | "email_link",
  managementRole: "admin" | "moderator" | null,
  functions: { name: string; permissions: string[] | null }[],
  attendanceManager: boolean
) => permissionsFor({ authMethod, managementRole, functions, attendanceManager });

const ATT_PERMS: Permission[] = [
  "attendance.record",
  "attendance.view_all",
  "attendance.audit_view",
  "attendance.edit_history",
];

const tests: TestCase[] = [
  {
    name: "A1. pragueInstant a uzávěrka člena 7:30: zima a léto, hranice 7:29:59 a 7:30:00",
    run: () => {
      assert.equal(iso("2026-01-15", "07:30"), "2026-01-15T06:30:00.000Z");
      assert.equal(iso("2026-07-15", "07:30"), "2026-07-15T05:30:00.000Z");
      assert.equal(ATTENDANCE_START, "07:30");
      assert.equal(memberDeadline("2026-07-15").toISOString(), "2026-07-15T05:30:00.000Z");
      const d = "2026-11-12";
      const before = new Date(pragueInstant(d, "07:30").getTime() - 1000);
      const at = pragueInstant(d, "07:30");
      assert.equal(memberMayEditAbsence(before, d), true, "7:29:59 ano");
      assert.equal(memberMayEditAbsence(at, d), false, "7:30:00 ne");
      // den předem ano, včera ne
      const noon = pragueInstant("2026-11-11", "12:00");
      assert.equal(memberMayEditAbsence(noon, d), true);
      assert.equal(memberMayEditAbsence(noon, "2026-11-10"), false);
      // rok dopředu: dnes + 365 ano, + 366 ne
      const today = pragueToday(noon);
      assert.equal(today, "2026-11-11");
      assert.equal(memberMayEditAbsence(noon, addDaysToDateString(today, MAX_ADVANCE_DAYS)), true);
      assert.equal(memberMayEditAbsence(noon, addDaysToDateString(today, MAX_ADVANCE_DAYS + 1)), false);
      const tooFar = decideMemberAbsenceEdit(noon, addDaysToDateString(today, 366));
      assert.ok(!tooFar.ok && tooFar.reason === "too-far" && tooFar.message === MEMBER_TEXTS.errTooFar);
      const closed = decideMemberAbsenceEdit(noon, "2026-11-10");
      assert.ok(!closed.ok && closed.reason === "closed" && closed.message === MEMBER_TEXTS.errClosed);
      const bad = decideMemberAbsenceEdit(noon, "2026-02-31");
      assert.ok(!bad.ok && bad.reason === "invalid");
    },
  },
  {
    name: "A1b. iter-042 B4: uzávěrka člena podle času z nastavení, bez parametru výchozí 7:30",
    run: () => {
      assert.equal(memberDeadline("2026-01-15").toISOString(), memberDeadline("2026-01-15", ATTENDANCE_START).toISOString());
      assert.equal(memberDeadline("2026-01-15", "08:00").toISOString(), "2026-01-15T07:00:00.000Z");
      assert.equal(memberDeadline("2026-07-15", "11:00").toISOString(), "2026-07-15T09:00:00.000Z");
      // 7:45 se členovi ještě omluvit dá při začátku v 8:00, v 8:05 už ne
      const at = (iso: string) => new Date(iso);
      assert.equal(decideMemberAbsenceEdit(at("2026-01-15T06:45:00Z"), "2026-01-15", "08:00").ok, true);
      assert.equal(decideMemberAbsenceEdit(at("2026-01-15T07:05:00Z"), "2026-01-15", "08:00").ok, false);
      // bez třetího parametru platí výchozí začátek
      assert.equal(decideMemberAbsenceEdit(at("2026-01-15T06:31:00Z"), "2026-01-15").ok, false);
      assert.equal(memberMayEditAbsence(at("2026-01-15T06:31:00Z"), "2026-01-15", "08:00"), true);
    },
  },
  {
    name: "A2. DST: přechody 25. 10. 2026 a 28. 3. 2027, uzávěrka v pondělí po přechodu a ve čtvrtek před ním",
    run: () => {
      // konec letního času: neděle 25. 10. 2026
      assert.equal(iso("2026-10-22", "07:30"), "2026-10-22T05:30:00.000Z", "čtvrtek před: ještě CEST");
      assert.equal(iso("2026-10-25", "07:30"), "2026-10-25T06:30:00.000Z", "v den přechodu už CET");
      assert.equal(iso("2026-10-26", "07:30"), "2026-10-26T06:30:00.000Z", "pondělí po přechodu");
      // začátek letního času: neděle 28. 3. 2027
      assert.equal(iso("2027-03-25", "07:30"), "2027-03-25T06:30:00.000Z", "čtvrtek před: ještě CET");
      assert.equal(iso("2027-03-28", "07:30"), "2027-03-28T05:30:00.000Z", "v den přechodu už CEST");
      assert.equal(iso("2027-03-29", "07:30"), "2027-03-29T05:30:00.000Z", "pondělí po přechodu");
      // člen v noci přechodu: 25. 10. 2026 6:29:59Z je ještě před 7:30 CET
      const d = "2026-10-25";
      assert.equal(memberMayEditAbsence(new Date("2026-10-25T06:29:59Z"), d), true);
      assert.equal(memberMayEditAbsence(new Date("2026-10-25T06:30:00Z"), d), false);
      // půlnoc po přechodu: pražský den se počítá správně
      assert.equal(pragueToday(new Date("2026-10-24T21:59:59Z")), "2026-10-24");
      assert.equal(pragueToday(new Date("2026-10-24T22:00:00Z")), "2026-10-25");
    },
  },
  {
    name: "A3. validace jména náhradníka: trim, 2 až 80 znaků, řídicí znaky, texty z gate",
    run: () => {
      const ok = validateSubstituteName("  Jan   Novák \t");
      assert.deepEqual(ok, { ok: true, value: "Jan Novák" });
      const bad = (raw: unknown, error: string) => {
        const r = validateSubstituteName(raw);
        assert.ok(!r.ok && r.error === error, `${JSON.stringify(raw)} -> ${JSON.stringify(r)}`);
      };
      bad("", "Napiš jméno náhradníka.");
      bad("   ", "Napiš jméno náhradníka.");
      bad(undefined, "Napiš jméno náhradníka.");
      bad(null, "Napiš jméno náhradníka.");
      bad(42, "Napiš jméno náhradníka.");
      bad("J", "Jméno náhradníka je moc krátké.");
      assert.ok(validateSubstituteName("Jo").ok);
      assert.ok(validateSubstituteName("x".repeat(80)).ok);
      bad("x".repeat(81), "Jméno náhradníka je moc dlouhé.");
      bad("Jan\u0000Novák", MEMBER_TEXTS.errNameChars);
      bad("Jan\u0007", MEMBER_TEXTS.errNameChars);
      // délka se počítá po znacích jako char_length v DB, ne po UTF-16 jednotkách
      assert.ok(validateSubstituteName("😀".repeat(80)).ok);
      bad("😀".repeat(81), "Jméno náhradníka je moc dlouhé.");
    },
  },
  {
    name: "A4. permissionsFor: příznak + odkaz = přesně čtyři práva docházky (iter-040: +internal_manage), nic jiného (K1 A, Z4)",
    run: () => {
      for (const method of ["magic_link", "email_link"] as const) {
        const got = perms(method, null, [], true);
        assert.deepEqual([...got].sort(), [...ATTENDANCE_MANAGER_PERMISSIONS].sort());
        assert.ok(!got.has("attendance.edit_history"));
        // bez příznaku dál prázdná množina (iter-032)
        assert.equal(perms(method, null, [], false).size, 0);
      }
      assert.deepEqual(
        [...ATTENDANCE_MANAGER_PERMISSIONS].sort(),
        ["attendance.audit_view", "attendance.internal_manage", "attendance.record", "attendance.view_all"]
      );
    },
  },
  {
    name: "A5. Z4: Prezident + odkaz + příznak = čtyři práva bez edit_history (samostatný případ)",
    run: () => {
      const president = [fn("Prezident", [ADMIN_DELEGABLE_MARKER])];
      for (const method of ["magic_link", "email_link"] as const) {
        const got = perms(method, "admin", president, true);
        assert.deepEqual([...got].sort(), [...ATTENDANCE_MANAGER_PERMISSIONS].sort());
        assert.ok(!got.has("attendance.edit_history"), "edit_history přes odkaz nikdy");
        assert.ok(!got.has("members.manage") && !got.has("access.manage"));
      }
      // bez příznaku Prezident odkazem nemá nic
      assert.equal(perms("email_link", null, president, false).size, 0);
    },
  },
  {
    name: "A6. permissionsFor: heslo, funkce, admin a moderátor s docházkou",
    run: () => {
      // admin = všechna práva včetně čtyř nových
      const admin = perms("password", "admin", [], false);
      for (const p of ATT_PERMS) assert.ok(admin.has(p), p);
      assert.deepEqual([...admin].sort(), [...PERMISSIONS].sort());
      // Prezident a VP (značka): dostanou všechna čtyři automaticky, bez migrace dat
      for (const name of ["Prezident", "Viceprezident"]) {
        const got = perms("password", null, [fn(name, [ADMIN_DELEGABLE_MARKER])], false);
        for (const p of ATT_PERMS) assert.ok(got.has(p), `${name}: ${p}`);
      }
      // Člen výboru (NULL) a moderátor: z docházky jen attendance.internal_manage (iter-040)
      const committee = perms("password", null, [fn("Člen výboru", null)], false);
      const moderator = perms("password", "moderator", [], false);
      for (const got of [committee, moderator]) {
        for (const p of ATT_PERMS) assert.ok(!got.has(p), p);
        assert.ok(got.has("attendance.internal_manage"));
      }
      // Člen výboru s příznakem: výchozí sada + práva správce, edit_history ne
      const committeeFlag = perms("password", null, [fn("Člen výboru", null)], true);
      assert.deepEqual(
        [...committeeFlag].sort(),
        [...new Set([...DEFAULT_FUNCTION_PERMISSIONS, ...ATTENDANCE_MANAGER_PERMISSIONS])].sort()
      );
      assert.ok(!committeeFlag.has("attendance.edit_history"));
      // běžný člen s heslem? (bez role i funkce) + příznak: jen čtyři práva správce
      assert.deepEqual([...perms("password", null, [], true)].sort(), [...ATTENDANCE_MANAGER_PERMISSIONS].sort());
      // moderátor bez příznaku: dnešní moderátor beze změny (iter-041 Z7: sada role, ne funkce)
      assert.deepEqual([...moderator].sort(), [...MODERATOR_ROLE_PERMISSIONS].sort());
    },
  },
  {
    name: "A7. katalog: čtyři práva docházky (edit_history a spol. mimo výchozí sadu), iter-040 přidala internal_manage",
    run: () => {
      for (const p of ATT_PERMS) assert.ok((PERMISSIONS as readonly string[]).includes(p), p);
      for (const p of ATT_PERMS) assert.ok(!DEFAULT_FUNCTION_PERMISSIONS.includes(p), `výchozí sada: ${p}`);
      assert.equal(PERMISSIONS.length, 30, "iter-044: +semafor.points, iter-043: +access.password_reset, iter-040: +attendance.internal_manage, iter-041: +semafor.view_all, +semafor.import, iter-042: +chapter.settings");
      // jediné místo, kde příznak mění práva, je permissionsFor
      const src = stripComments(read("lib/auth/permissions.ts"));
      assert.ok(/input\.attendanceManager/.test(src));
      assert.equal((src.match(/ATTENDANCE_MANAGER_PERMISSIONS/g) ?? []).length >= 2, true);
    },
  },
  {
    name: "A8. okno absencí: hranice, konec měsíce, přestupný rok, vypršení",
    run: () => {
      assert.equal(absenceWindowStart("2026-10-20"), "2026-04-20");
      assert.equal(absenceWindowStart("2026-08-31"), "2026-02-28");
      assert.equal(absenceWindowStart("2028-08-31"), "2028-02-29", "přestupný rok");
      assert.equal(absenceWindowStart("2026-01-31"), "2025-07-31");
      assert.equal(addMonthsClamped("2026-03-31", -1), "2026-02-28");
      assert.equal(addMonthsClamped("2026-11-30", 3), "2027-02-28");
      // hranice je vyloučená: absence z 20. 4. dne 20. 10. už nepatří
      assert.ok(!("2026-04-20" > absenceWindowStart("2026-10-20")));
      assert.ok("2026-04-21" > absenceWindowStart("2026-10-20"));
      // vypršení: z gate „čt 8. 10. 2026 ... vyprší 8. 4. 2027“
      assert.equal(absenceExpiresOn("2026-10-08"), "2027-04-08");
      // vypršení je přesně první den, kdy absence vypadne z okna
      for (const d of ["2026-10-08", "2026-08-31", "2026-02-28", "2028-02-29", "2026-12-31"]) {
        const exp = absenceExpiresOn(d);
        assert.ok(absenceWindowStart(exp) >= d, `${d}: v den vypršení už mimo okno`);
        assert.ok(absenceWindowStart(addDaysToDateString(exp, -1)) < d, `${d}: den před ještě v okně`);
      }
      assert.equal(absenceDayLine("2026-10-08", false), "čt 8. 10. 2026, bez omluvy, vyprší 8. 4. 2027");
      assert.equal(absenceDayLine("2026-10-08", true), "čt 8. 10. 2026, omluven(a), vyprší 8. 4. 2027");
    },
  },
  {
    name: "A9. kalendář: mřížka po týdnech od pondělí, čtvrtky, posun měsíců, nejbližší čtvrtek",
    run: () => {
      // listopad 2026 začíná v neděli: první týden má 6 prázdných buněk
      const weeks = monthGrid(2026, 11);
      assert.equal(weeks[0].filter((c) => c === null).length, 6);
      assert.equal(weeks[0][6], "2026-11-01");
      assert.ok(weeks.every((w) => w.length === 7));
      assert.equal(weeks.flat().filter((c) => c !== null).length, 30);
      // sloupec Čt má index 3 a jsou v něm čtvrtky
      assert.equal(GRID_WEEKDAYS[3], "Čt");
      for (const w of weeks) {
        const c = w[3];
        if (c) assert.ok(isThursday(c), c);
      }
      assert.equal(monthGrid(2027, 2).flat().filter((c) => c !== null).length, 28);
      assert.equal(monthGrid(2028, 2).flat().filter((c) => c !== null).length, 29);
      assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
      assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
      assert.equal(monthStart(2026, 11), "2026-11-01");
      assert.equal(monthEnd(2026, 2), "2026-02-28");
      assert.equal(monthTitle(2026, 11), "listopad 2026");
      assert.equal(nextThursday("2026-10-20"), "2026-10-22");
      assert.equal(nextThursday("2026-10-22"), "2026-10-22");
      assert.equal(nextThursday("2026-10-23"), "2026-10-29");
      assert.equal(formatWeekdayDM("2026-11-12"), "čt 12. 11.");
      assert.equal(formatWeekdayLong("2026-10-22"), "čtvrtek 22. 10. 2026");
    },
  },
  {
    name: "A10. značky dne a aria-label: ● bez náhradníka, ◐ s náhradníkem, výsledek uzavřené docházky",
    run: () => {
      assert.equal(absenceMark(undefined, false), "none");
      assert.equal(absenceMark(null, true), "absent");
      assert.equal(absenceMark("Jméno", true), "substitute");
      assert.equal(
        dayAriaLabel("2026-11-12", { mark: "absent", result: null, hasMeeting: false }),
        "čtvrtek 12. listopadu, nepřijdeš, bez náhradníka"
      );
      assert.equal(
        dayAriaLabel("2026-11-19", { mark: "substitute", result: null, hasMeeting: true }),
        "čtvrtek 19. listopadu, nepřijdeš, pošleš náhradníka, schůzka s hosty"
      );
      assert.equal(
        dayAriaLabel("2026-10-08", { mark: "none", result: "absent", hasMeeting: false }),
        "čtvrtek 8. října, absence"
      );
      assert.equal(absenceLine("2026-11-12", null), "čt 12. 11., bez náhradníka");
      assert.equal(absenceLine("2026-11-19", "Jméno B"), "čt 19. 11., náhradník Jméno B");
    },
  },
  {
    name: "A11. karta na dashboardu: texty podle počtu doslova z gate, oranžově od 3",
    run: () => {
      assert.equal(ABSENCE_LIMIT, 3);
      assert.equal(absenceCountText(0), "Za posledních 6 měsíců nemáš žádnou absenci.");
      assert.equal(absenceCountText(1), "Absence za posledních 6 měsíců: 1 ze 3");
      assert.equal(absenceCountText(2), "Absence za posledních 6 měsíců: 2 ze 3");
      assert.equal(
        absenceCountText(3),
        "Absence za posledních 6 měsíců: 3 ze 3. Čtvrtou už může řešit členský výbor."
      );
      assert.equal(absenceCountText(4), "Absence za posledních 6 měsíců: 4. Pravidla povolují tři.");
      assert.equal(absenceCountText(7), "Absence za posledních 6 měsíců: 7. Pravidla povolují tři.");
      const view = (count: number) =>
        buildAbsenceCardView({ count, firstClosedDay: "2020-01-01", today: "2026-10-20", next: null });
      assert.deepEqual([0, 1, 2, 3, 4].map((n) => view(n).warn), [false, false, false, true, true]);
      // číslo tučně: kolem čísla absencí, ne „6“ z „6 měsíců“
      assert.deepEqual(absenceCountParts(2), {
        before: "Absence za posledních 6 měsíců: ",
        strong: "2",
        after: " ze 3",
      });
      assert.deepEqual(absenceCountParts(4), {
        before: "Absence za posledních 6 měsíců: ",
        strong: "4",
        after: ". Pravidla povolují tři.",
      });
      assert.equal(absenceCountParts(0).strong, null);
      assert.equal(absenceCountParts(3).after.startsWith(" ze 3"), true);
      assert.equal(DASHBOARD_TEXTS.action, "Omluvit se");
      assert.equal(DASHBOARD_TEXTS.showDays, "Zobrazit dny");
      assert.equal(DASHBOARD_TEXTS.rulesLink, "Jak se absence počítají");
    },
  },
  {
    name: "A12. karta: příště chybíš a věta „Počítáme od“ (do 6 měsíců od prvního uzavřeného dne)",
    run: () => {
      const base = { count: 0, today: "2026-10-20" };
      assert.equal(
        buildAbsenceCardView({ ...base, firstClosedDay: "2020-01-01", next: { date: "2026-10-29", substituteName: null } })
          .nextText,
        "Příště chybíš: čt 29. 10."
      );
      assert.equal(
        buildAbsenceCardView({ ...base, firstClosedDay: "2020-01-01", next: { date: "2026-10-29", substituteName: "Jméno" } })
          .nextText,
        "Příště chybíš: čt 29. 10., náhradník Jméno"
      );
      assert.equal(buildAbsenceCardView({ ...base, firstClosedDay: "2020-01-01", next: null }).nextText, null);
      // první uzavřený den před 2 měsíci: okno sahá před něj, věta se ukáže
      assert.equal(
        buildAbsenceCardView({ ...base, firstClosedDay: "2026-08-20", next: null }).sinceText,
        "Počítáme od 20. 8. 2026."
      );
      // první uzavřený den přesně na hranici okna (20. 4.): okno už nesahá před něj
      assert.equal(buildAbsenceCardView({ ...base, firstClosedDay: "2026-04-20", next: null }).sinceText, null);
      assert.equal(buildAbsenceCardView({ ...base, firstClosedDay: "2025-01-01", next: null }).sinceText, null);
      // žádný uzavřený den
      assert.equal(
        buildAbsenceCardView({ ...base, firstClosedDay: null, next: null }).sinceText,
        "Počítáme od první zapsané schůzky."
      );
    },
  },
  {
    name: "A13. texty člena doslova z gate sekce 5",
    run: () => {
      assert.equal(MEMBER_TEXTS.title, "Docházka");
      // iter-042 (#10, Z5): čas uzávěrky z nastavení chapteru, výchozí hodnota = dnešní chování
      assert.equal(
        MEMBER_TEXTS.intro,
        "Když na schůzku nemůžeš, omluv se tady, nejpozději do 7:30 v den schůzky. Omluva bez náhradníka se počítá jako absence, s náhradníkem ne. Bez záznamu počítáme, že přijdeš."
      );
      assert.equal(
        memberIntroText("08:15"),
        "Když na schůzku nemůžeš, omluv se tady, nejpozději do 8:15 v den schůzky. Omluva bez náhradníka se počítá jako absence, s náhradníkem ne. Bez záznamu počítáme, že přijdeš."
      );
      assert.equal(MEMBER_TEXTS.optionPresent, "Přijdu");
      assert.equal(MEMBER_TEXTS.optionAbsent, "Nepřijdu, bez náhradníka");
      assert.equal(MEMBER_TEXTS.optionSubstitute, "Nepřijdu, pošlu náhradníka");
      assert.equal(MEMBER_TEXTS.nameLabel, "Jméno náhradníka");
      assert.equal(MEMBER_TEXTS.save, "Uložit");
      assert.equal(MEMBER_TEXTS.recentNames, "Dřív:");
      assert.equal(
        MEMBER_TEXTS.legend,
        "Světle modrý den je pravidelná schůzka, tmavě modrý schůzka s hosty, zelený interní schůzka. ● omluva bez náhradníka, ◐ omluva s náhradníkem."
      );
      assert.equal(MEMBER_TEXTS.legendPast, "Po schůzce: ✓ přišel(a), N přišel náhradník, A absence.");
      assert.equal(MEMBER_TEXTS.closedPanel, "Na tenhle den už změnu zapíše jen správce docházky.");
      assert.equal(MEMBER_TEXTS.closedPanel, MEMBER_TEXTS.errClosed, "panel a hláška mají jedno znění (gate)");
      assert.equal(MEMBER_TEXTS.listTitle, "Tvoje omluvy");
      assert.equal(MEMBER_TEXTS.listEmpty, "–");
      assert.equal(MEMBER_TEXTS.cancel, "Zrušit");
      assert.equal(MEMBER_TEXTS.change, "Změnit");
      assert.equal(MEMBER_TEXTS.savedNamesTitle, "Uložená jména náhradníků");
      assert.equal(MEMBER_TEXTS.toastSaved, "Uloženo.");
      assert.equal(MEMBER_TEXTS.toastCancelled, "Omluva zrušena.");
      assert.equal(MEMBER_TEXTS.toastNameForgotten, "Jméno smazáno ze seznamu.");
      assert.equal(MEMBER_TEXTS.errClosed, "Na tenhle den už změnu zapíše jen správce docházky.");
      assert.equal(MEMBER_TEXTS.errTooFar, "Omluvit se jde nejvýš rok dopředu.");
      assert.equal(MEMBER_TEXTS.errNameEmpty, "Napiš jméno náhradníka.");
      assert.equal(MEMBER_TEXTS.errNameShort, "Jméno náhradníka je moc krátké.");
      assert.equal(MEMBER_TEXTS.errNameLong, "Jméno náhradníka je moc dlouhé.");
      // UI tyká: žádné „můžete“ v textech člena
      const all = Object.values(MEMBER_TEXTS).join(" ");
      assert.ok(!/můžete|zadejte|klikněte/i.test(all));
    },
  },
  {
    name: "A14. migrace: celá iterace v jednom skriptu, DO bloky bez JS interpolace, lock_timeout doslova (LL-006)",
    run: () => {
      const src = read("scripts/migrate-iter-038-dochazka.ts");
      const body = stripComments(src);
      // všechny DO $$ ... END $$ bloky
      const blocks = [...body.matchAll(/DO \$\$([\s\S]*?)END \$\$/g)].map((m) => m[1]);
      assert.ok(blocks.length >= 12, `DO bloků: ${blocks.length}`);
      for (const b of blocks) {
        assert.ok(!b.includes("${"), `JS interpolace uvnitř DO bloku: ${b.slice(0, 80)}`);
        assert.ok(b.includes("PERFORM set_config('lock_timeout', '5s', true);"), "lock_timeout doslova");
      }
      for (const t of [
        "member_absence",
        "attendance_record",
        "member_substitute_name",
        "attendance_day",
        "attendance_link",
        "attendance_report_mail",
        "attendance_audit",
      ]) {
        assert.ok(new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`).test(body), `tabulka ${t}`);
      }
      assert.ok(/ADD COLUMN IF NOT EXISTS attendance_manager_since TIMESTAMPTZ/.test(body));
      assert.ok(/ADD COLUMN IF NOT EXISTS attendance_manager_by UUID/.test(body));
      assert.ok(/member_attendance_manager_by_fk/.test(body));
      // audit je append-only: funkce a oba triggery, tabulka bez FK na member
      assert.ok(/CREATE OR REPLACE FUNCTION attendance_audit_immutable\(\)/.test(body));
      assert.ok(/BEFORE UPDATE OR DELETE ON attendance_audit\s+FOR EACH ROW/.test(body));
      assert.ok(/BEFORE TRUNCATE ON attendance_audit\s+FOR EACH STATEMENT/.test(body));
      const auditDdl = /CREATE TABLE IF NOT EXISTS attendance_audit \(([\s\S]*?)\n    \);/.exec(body);
      assert.ok(auditDdl && !/REFERENCES/.test(auditDdl[1]), "attendance_audit bez cizích klíčů");
      // smoke test ověřuje chování triggeru, kontrolní dotazy hlídají ostrou tabulku
      assert.ok(/smoke: UPDATE prošel/.test(body) && /smoke: DELETE prošel/.test(body) && /smoke: TRUNCATE prošel/.test(body));
      // bez transakcí (LL-003) a bez DROP/TRUNCATE ostrých tabulek
      assert.ok(!/\bBEGIN;|\bCOMMIT;|\.transaction\(/.test(body.replace(/DO \$\$[\s\S]*?END \$\$/g, "")));
      assert.ok(!/DROP TABLE|\bTRUNCATE\s+(TABLE\s+)?(attendance|member)/i.test(body.replace(/DO \$\$[\s\S]*?END \$\$/g, "")));
      // pojistka hostu ve skriptu (LL-019)
      assert.ok(src.includes("EXPECT_DB_HOST"));
      // schema.ts má stejné tabulky
      const schema = read("lib/db/schema.ts");
      for (const t of ["member_absence", "attendance_record", "member_substitute_name", "attendance_day", "attendance_link", "attendance_report_mail", "attendance_audit"]) {
        assert.ok(schema.includes(`"${t}"`), `schema: ${t}`);
      }
      assert.ok(schema.includes('"attendance_manager_since"') && schema.includes('"attendance_manager_by"'));
    },
  },
  {
    name: "A15. getMemberAuthState čte příznak a getSession ho předává do permissionsFor (fail closed bez migrace, R6)",
    run: () => {
      const members = read("lib/db/queries/members.ts");
      assert.ok(/attendanceManagerSince: member\.attendanceManagerSince/.test(members));
      assert.ok(/attendanceManagerSince: rows\[0\]\.attendanceManagerSince/.test(members));
      const session = read("lib/auth/session.ts");
      assert.ok(/attendanceManager: row\.attendanceManagerSince != null/.test(session));
      // vypočtená pole se do cookie neukládají (práva se projeví hned)
      const create = session.slice(session.indexOf("export async function createSession"));
      assert.ok(!/permissions|attendanceManager/.test(create.slice(0, create.indexOf("await session.save()"))));
      const check = read("lib/auth/session-check.ts");
      assert.ok(/attendanceManagerSince\?: Date \| string \| null/.test(check));
    },
  },
  {
    name: "A16. queries: každá změna je jeden příkaz, pojistka 7:30 a rok dopředu v SQL, bez transakcí (LL-003)",
    run: () => {
      const q = stripComments(read("lib/db/queries/attendance.ts"));
      assert.ok(!/\.transaction\(|BEGIN;|COMMIT;/.test(q));
      assert.ok(q.includes("AT TIME ZONE 'Europe/Prague'"));
      assert.ok(q.includes("${time}::time"), "čas uzávěrky z nastavení chapteru jako bind parametr");
      assert.ok(!q.includes("ATTENDANCE_START"), "iter-042: žádný čas natvrdo v SQL");
      assert.ok(q.includes("${MAX_ADVANCE_DAYS}::int"));
      assert.ok(/memberActiveSql\("gm"\)/.test(q), "neaktivní člen nezapíše");
      // jméno do paměti ve stejném příkazu jako ohlášení (CTE names)
      assert.ok(/names AS \(\s*INSERT INTO member_substitute_name/.test(q));
      assert.ok(/ON CONFLICT \(member_id, lower\(name\)\)/.test(q));
      // cíl je vždy volající: dotazy členské strany berou memberId z parametru, ne ze vstupu klienta
      const actions = stripComments(read("actions/attendance.ts"));
      assert.ok(/export async function setMyAbsenceAction\(\s*date: string,/.test(actions));
      assert.ok(/memberId = auth\.session\.memberId/.test(actions));
      assert.ok(!/revalidatePath\(["'`]\/dochazka/.test(actions), "LL-017: /dochazka se nerevaliduje");
      // příznak: oprávnění members.manage, účet admina jen admin (SQL i akce)
      assert.ok(/requirePermission\("members\.manage"\)/.test(actions));
      assert.ok(/adminTargetError\(actor/.test(actions));
      assert.ok(/actorMayChangeSql\("member", actorId\)/.test(q));
      // odebrání příznaku zneplatní ranní odkazy v témže příkazu
      assert.ok(/UPDATE attendance_link SET revoked_at = now\(\)/.test(q));
    },
  },
  {
    name: "A17. guardy stránek a menu: /dochazka pro každého člena, přepínač podle members.manage",
    run: () => {
      const page = read("app/(app)/dochazka/page.tsx");
      assert.ok(/requirePageSession\(\)/.test(page));
      assert.ok(!existsSync(join(ROOT, "app/(app)/dochazka/loading.tsx")), "LL-017: žádný loading.tsx");
      const layout = read("app/(app)/layout.tsx");
      const nav = read("components/layout/MobileNav.tsx");
      assert.ok(layout.includes('href="/dochazka">Docházka<'));
      assert.ok(nav.includes('href="/dochazka"') && nav.includes("Docházka"));
      const member = read("app/(app)/admin/members/[id]/page.tsx");
      assert.ok(/can\(session, "members\.manage"\)[\s\S]{0,200}AttendanceManagerToggle/.test(member));
      assert.ok(member.includes("!locked"), "účet admina ostatním přepínač neukáže");
      const dash = read("app/(app)/dashboard/page.tsx");
      assert.ok(/<DashboardAttendance memberId=\{session\.memberId\}/.test(dash));
      const list = read("app/(app)/admin/members/SortableMemberList.tsx");
      assert.ok(list.includes("Správce docházky"));
    },
  },
  {
    name: "A18. UI: bez router.refresh (LL-017), dotykové cíle 44 px, mřížka 7 sloupců, aria-label dne",
    run: () => {
      for (const f of [
        "components/attendance/AbsenceCalendar.tsx",
        "components/attendance/DayPanel.tsx",
        "app/(app)/admin/members/AttendanceManagerToggle.tsx",
      ]) {
        const src = stripComments(read(f));
        assert.ok(!/router\.refresh|useRouter/.test(src), `${f}: refresh`);
        assert.ok(src.includes("min-h-[44px]") || src.includes("h-11"), `${f}: 44 px`);
      }
      const cal = read("components/attendance/AbsenceCalendar.tsx");
      assert.ok(cal.includes("grid-cols-7"));
      assert.ok(cal.includes("aria-label={dayAriaLabel("));
      assert.ok(cal.includes("dayNumberClass(tone)") && read("lib/attendance/internal.ts").includes("underline"), "den se schůzkou podtržený");
      assert.ok(cal.includes("isRegularDay(date, { meetingWeekday: regularWeekday })") && !cal.includes("isThursday("), "iter-042: pravidelný den z nastavení");
      // legenda pod mřížkou
      assert.ok(cal.includes("MEMBER_TEXTS.legend") && cal.includes("MEMBER_TEXTS.legendPast"));
      const panel = read("components/attendance/DayPanel.tsx");
      for (const key of ["optionPresent", "optionAbsent", "optionSubstitute", "nameLabel", "recentNames"]) {
        assert.ok(panel.includes(`MEMBER_TEXTS.${key}`), key);
      }
      assert.ok(/slice\(0, 8\)/.test(panel), "nabídka 8 jmen");
    },
  },
  {
    name: "A19. přepínač Správce docházky: texty z gate, ukládá se hned, bez e-mailu věta",
    run: () => {
      const t = norm(read("app/(app)/admin/members/AttendanceManagerToggle.tsx"));
      assert.ok(t.includes("Správce docházky"));
      assert.ok(t.includes("Zapisuje docházku, vidí docházku všech a dostává ranní odkaz a report."));
      assert.ok(t.includes("Bez e-mailu mu ranní odkaz ani report nepřijde."));
      assert.ok(t.includes('showToast("success", "Uloženo.")'));
      assert.ok(t.includes("setAttendanceManagerAction(memberId, target)"));
      const page = norm(read("app/(app)/admin/members/[id]/page.tsx"));
      assert.ok(page.includes(">Docházka</h2>"));
    },
  },
  {
    name: "A20. ops log: access.attendance-manager-changed je jednorázová událost s popiskem, bez jména náhradníka a odkazu",
    run: () => {
      const types = read("lib/ops/types.ts");
      assert.equal((types.match(/"access\.attendance-manager-changed"/g) ?? []).length, 2, "union i TERMINAL_KINDS");
      assert.ok(read("app/(app)/status/EventTable.tsx").includes('"access.attendance-manager-changed": "Změna správce docházky"'));
      const actions = stripComments(read("actions/attendance.ts"));
      assert.ok(/message: row\.now \? "Přidán\." : "Odebrán\."/.test(actions));
      // log jen při skutečné změně a uvnitř safeLog (LL-011)
      assert.ok(/if \(row\.was !== row\.now\)[\s\S]{0,80}await safeLog\(\(\) => \(\{/.test(actions));
      const logBlock = actions.slice(actions.indexOf("access.attendance-manager-changed") - 200, actions.indexOf("access.attendance-manager-changed") + 400);
      assert.ok(!/email|token|url|substitute/i.test(logBlock));
      // OpsEventInput se nerozšiřuje o pole pro odkaz (N11)
      const input = types.slice(types.indexOf("export interface OpsEventInput"), types.indexOf("export interface OpsEventRow"));
      assert.ok(!/\burl\b|\btoken\b|\blink\b/.test(input));
    },
  },
  {
    name: "A21. nápověda člena: sekce Docházka na konci, texty doslova z gate, vyká",
    run: () => {
      const member = norm(read("components/help/sections/MemberHelp.tsx"));
      assert.ok(member.indexOf('title="Burza pomoci"') >= 0 || member.indexOf("Burza pomoci") >= 0);
      const i = member.indexOf('title="Docházka"');
      assert.ok(i > member.lastIndexOf("Burza pomoci"), "Docházka až za Burzou");
      for (const s of [
        "V menu Docházka klepněte na den.",
        "Zvolte „Nepřijdu, bez náhradníka“, nebo „Nepřijdu, pošlu náhradníka“ a napište jméno. Uloží se hned.",
        // iter-042 (Z5): čas schůzky z nastavení, funkce `memberDeadlineHelp` (výchozí 7:30 hlídá test-iter-036-help).
        "memberDeadlineHelp(settings)",
        "Bez záznamu počítáme, že přijdete. Náhradník se jako absence nepočítá. Na dashboardu vidíte své absence za posledních 6 měsíců.",
        "Kdo vidí, že chybím?",
        "Správci docházky, Prezident, Viceprezident a admin. Ostatní členové ne.",
        "Proč mám absenci, i když jsem se omluvil(a)?",
        "Omluva bez náhradníka se podle pravidel počítá jako absence. Když pošlete náhradníka, absence to není.",
        "Jak smažu jméno náhradníka?",
        "Dole na stránce Docházka v části Uložená jména náhradníků.",
      ]) {
        assert.ok(member.includes(s), `chybí: ${s}`);
      }
      // popisky, na které nápověda odkazuje, existují v UI
      const panel = read("components/attendance/DayPanel.tsx") + read("lib/attendance/rules.ts");
      assert.ok(panel.includes("Nepřijdu, bez náhradníka") && panel.includes("Nepřijdu, pošlu náhradníka"));
      assert.ok(read("app/(app)/layout.tsx").includes("Docházka"));
    },
  },
  {
    name: "A22. v nových textech není em dash a žádné jméno ani kontakt",
    run: () => {
      const files = [
        "lib/attendance/rules.ts",
        "lib/db/queries/attendance.ts",
        "actions/attendance.ts",
        "scripts/migrate-iter-038-dochazka.ts",
        "scripts/test-iter-038-attendance.ts",
        "app/(app)/dochazka/page.tsx",
        "components/attendance/AbsenceCalendar.tsx",
        "components/attendance/DayPanel.tsx",
        "components/attendance/DashboardAttendance.tsx",
        "app/(app)/admin/members/AttendanceManagerToggle.tsx",
        "components/help/sections/MemberHelp.tsx",
      ];
      for (const f of files) {
        const src = read(f);
        assert.ok(!src.includes(EM_DASH), `${f}: em dash`);
        assert.ok(!/@[a-z0-9-]+\.(cz|com|eu)\b/i.test(src), `${f}: e-mail`);
        assert.ok(!/\+?420 ?\d{3} ?\d{3} ?\d{3}/.test(src), `${f}: telefon`);
      }
    },
  },
  {
    name: "A23. v celém kódu žádný UPDATE ani DELETE nad attendance_audit (append-only, aplikace jen INSERT a SELECT)",
    run: () => {
      for (const dir of ["lib", "actions", "app", "components"]) {
        for (const f of walk(dir)) {
          const src = stripComments(read(f));
          assert.ok(!/UPDATE\s+attendance_audit/i.test(src), `${f}: UPDATE attendance_audit`);
          assert.ok(!/DELETE\s+FROM\s+attendance_audit/i.test(src), `${f}: DELETE attendance_audit`);
          assert.ok(!/TRUNCATE\s+attendance_audit/i.test(src), `${f}: TRUNCATE attendance_audit`);
          assert.ok(!/(update|delete)\(attendanceAudit\)/.test(src), `${f}: drizzle update/delete audit`);
        }
      }
    },
  },
  {
    name: "A24. Z4: nikde v kódu se příznak správce neptá na „nějaké právo“ (žádný guard na množinu bez konkrétního práva)",
    run: () => {
      // gate: tři práva docházky přes odkaz nic dalšího neotevřou, protože guardy chtějí konkrétní právo.
      for (const dir of ["actions", "app", "lib", "components"]) {
        for (const f of walk(dir)) {
          if (f === "lib/auth/permissions.ts") continue;
          const src = stripComments(read(f));
          assert.ok(!/permissions\??\.length\s*(>|!==|>=)\s*[01]\b/.test(src), `${f}: kontrola „má nějaké právo“`);
          assert.ok(!/permissions\.size\s*(>|!==|>=)/.test(src), `${f}: kontrola velikosti množiny práv`);
        }
      }
      // session s příznakem přes odkaz nesmí projít heslovým guardem
      const guards = read("lib/auth/guards.ts");
      assert.ok(/hasPasswordSession\(authResult\.session\)/.test(guards));
      // /admin zůstává za konkrétními právy: stránka člena chce members.manage
      assert.ok(read("app/(app)/admin/members/[id]/page.tsx").includes('permission: "members.manage"'));
    },
  },
  {
    name: "A25. práva docházky mají guard v kódu (vyžaduje se od T-003b, jakmile existuje stránka zápisu)",
    run: () => {
      if (!existsSync(join(ROOT, "app/(app)/dochazka/zapis/page.tsx"))) {
        // T-003a: práva jsou v katalogu a v session, guardy zápisu a přehledu přidává T-003b.
        // Do té doby se hlídá aspoň to, že katalog a `permissionsFor` je znají.
        for (const p of ATT_PERMS) assert.ok((PERMISSIONS as readonly string[]).includes(p), p);
        return;
      }
      const code = [...walk("app"), ...walk("actions"), ...walk("components")]
        .map((f) => stripComments(read(f)))
        .join("\n");
      for (const p of ATT_PERMS) {
        assert.ok(code.includes(`"${p}"`), `právo ${p} nemá v kódu žádný guard`);
      }
    },
  },
  // ── T-003b: zápis správce, přehled, audit ──
  {
    name: "B1. decideAttendanceWriteMode (test 4): správce, P, odkaz, budoucnost, uzavřený den",
    run: () => {
      const mgr = { record: true, editHistory: false };
      const boss = { record: true, editHistory: true };
      const today = "2026-10-22";
      const mode = (date: string, finalized: boolean, can: { record: boolean; editHistory: boolean }, op?: "presence" | "excuse") =>
        decideAttendanceWriteMode({ date, today, finalized, can, op }).mode;
      assert.equal(mode(today, false, mgr), "normal", "správce dnes neuzavřený");
      assert.equal(mode(today, true, mgr), "denied", "správce uzavřený");
      assert.equal(mode(today, true, boss), "history", "P uzavřený");
      assert.equal(mode("2026-10-15", true, boss), "history", "P minulý den");
      assert.equal(mode("2026-10-15", true, mgr), "denied", "správce minulý den");
      assert.equal(mode("2026-10-29", false, mgr), "denied", "správce budoucí");
      assert.equal(mode("2026-10-29", false, boss), "denied", "P budoucí přítomnost");
      assert.equal(mode("2026-10-29", false, boss, "excuse"), "history", "P budoucí cizí nepřítomnost");
      assert.equal(mode("2026-10-29", false, mgr, "excuse"), "denied", "správce budoucí nepřítomnost");
      assert.equal(mode(today, false, boss), "normal", "normal má přednost před history");
      // odkaz /d/[token] nemá edit_history (Z4): uzavřený den = denied
      assert.equal(mode(today, true, { record: true, editHistory: false }), "denied");
      // dnes bez record, ale s edit_history: oprava (history)
      assert.equal(mode(today, false, { record: false, editHistory: true }), "history");
      // dnes + 365 ano, + 366 ne
      assert.equal(mode(addDaysToDateString(today, 365), false, boss, "excuse"), "history");
      assert.equal(mode(addDaysToDateString(today, 366), false, boss, "excuse"), "denied");
      // hlášky z gate
      assert.equal(decideAttendanceWriteMode({ date: "2026-10-29", today, finalized: false, can: mgr }).message, "Přítomnost se zapisuje v den schůzky.");
      assert.equal(decideAttendanceWriteMode({ date: today, today, finalized: true, can: mgr }).message, "Den je uzavřený. Opravy dělá admin, Prezident nebo Viceprezident.");
    },
  },
  {
    name: "B2. bannery dne: uzavřený den, oprava s časem reportu, budoucí den, nezapsaný den",
    run: () => {
      const today = "2026-10-22";
      assert.equal(dayBannerText({ mode: "denied", date: today, today, finalized: true, finalizedTime: "17:04" }), "Den je uzavřený.");
      assert.equal(
        dayBannerText({ mode: "history", date: today, today, finalized: true, finalizedTime: "17:04" }),
        "Report odešel v 17:04. Opravy se zapisují do historie, report se znovu neposílá."
      );
      assert.equal(dayBannerText({ mode: "denied", date: "2026-10-29", today, finalized: false, finalizedTime: null }), "Přítomnost se zapisuje v den schůzky.");
      assert.equal(dayBannerText({ mode: "normal", date: today, today, finalized: false, finalizedTime: null }), null);
      assert.ok(SHEET_TEXTS.unrecordedBanner.startsWith("Docházka se ten den nezapisovala."));
      assert.equal(formatPragueTime("2026-10-22T15:04:00.000Z"), "17:04");
      assert.equal(formatPragueTime("2026-10-22T05:42:00.000Z"), "7:42", "hodina bez nuly");
    },
  },
  {
    name: "B3. Z2: pojistka jen dnes, režim normal, bez schůzky a bez zápisu správce",
    run: () => {
      const base = { date: "2026-10-22", today: "2026-10-22", mode: "normal" as const, hasMeeting: false, hasInternal: false, hasManagerRecord: false };
      assert.equal(isGuardedDay(base), true);
      assert.equal(isGuardedDay({ ...base, hasMeeting: true }), false, "schůzka je založená");
      assert.equal(isGuardedDay({ ...base, hasManagerRecord: true }), false, "den už má zápis");
      assert.equal(isGuardedDay({ ...base, mode: "history" }), false);
      assert.equal(isGuardedDay({ ...base, date: "2026-10-15" }), false, "jen dnešek");
      assert.equal(SHEET_TEXTS.noMeeting, "Na dnešek není v aplikaci žádná schůzka. Zapisuj, jen když se opravdu konala.");
      assert.equal(SHEET_TEXTS.writeAnyway, "Zapisovat i tak");
      // UI: zatržítka neaktivní, dokud se neklepne na „Zapisovat i tak“; server zůstává otevřený (K5 A)
      const ui = read("components/attendance/AttendanceSheet.tsx");
      assert.ok(ui.includes("payload.guardUnrecordedDay && !unlocked"));
      assert.ok(ui.includes("setUnlocked(true)"));
    },
  },
  {
    name: "B4. souhrn dne a texty správce doslova z gate",
    run: () => {
      const rows = [
        { status: "present" as const, excused: false },
        { status: "substitute" as const, excused: true },
        { status: "absent" as const, excused: true },
        { status: null, excused: true },
        { status: null, excused: false },
      ];
      const s = summarizeSheet(rows);
      // T-005b: řádek bez zápisu a bez omluvy je přítomen (jako při uzávěrce)
      assert.deepEqual(s, { total: 5, present: 3, substitutes: 1, missing: 2, excused: 2 });
      assert.equal(summaryText(s), "Přítomno 3 z 5 · náhradníci 1 · chybí 2 (omluveno 2)");
      assert.equal(sheetTitle("2026-10-22"), "Docházka · čtvrtek 22. 10. 2026");
      // iter-042 (#1): každý řádek říká, jak se spočítá při uzávěrce
      assert.equal(announcedText({ excused: false, announcedName: null }), "Bez zápisu: počítá se jako přítomen(a).");
      assert.equal(announcedText({ excused: false, announcedName: null, status: "present" }), null);
      assert.equal(announcedText({ excused: true, announcedName: null }), "Omluva bez náhradníka: počítá se jako omluven(a).");
      assert.equal(announcedText({ excused: true, announcedName: "Jan Test" }), "Omluva, náhradník Jan Test: počítá se jako náhradník.");
      assert.equal(announcedText({ excused: true, announcedName: "Jan Test", status: "present" }), "Omluva, náhradník Jan Test.", "po zaškrtnutí Přítomen bez následku");
      assert.equal(SHEET_TEXTS.filterAll, "Všichni");
      assert.equal(SHEET_TEXTS.filterOpen, "Bez zápisu");
      assert.equal(SHEET_TEXTS.errSave, "Neuložilo se. Zkus to znovu.");
      assert.equal(SHEET_TEXTS.errInactive, "Člen ten den nebyl aktivní (neaktivní nebo vstoupil později). Docházka se mu nezapisuje.");
      assert.equal(SHEET_TEXTS.meetingLink, "Docházka tohoto dne");
      assert.equal(SHEET_TEXTS.auditTitle, "Historie oprav");
      const ui = read("components/attendance/AttendanceSheet.tsx");
      assert.ok(ui.includes("conflictText(server?.updatedByName"));
      assert.equal(conflictText("Správce A"), "Mezitím to změnil(a) Správce A. Zkontroluj řádek a klikni znovu.");
      assert.ok(read("lib/attendance/sheet.ts").includes("Zkontroluj řádek a klikni znovu."));
    },
  },
  {
    name: "B5. parseWriteBody: presence, excuse, jméno 2 až 80, present a absent jméno zahodí, verze celé číslo ≥ 0",
    run: () => {
      const id = "11111111-2222-3333-4444-555555555555";
      const ok = (b: unknown) => {
        const r = parseWriteBody(b);
        assert.ok(r.ok, JSON.stringify(r));
        return (r as { ok: true; value: unknown }).value;
      };
      assert.deepEqual(ok({ op: "presence", memberId: id, status: "present", expectedVersion: 0 }), {
        op: "presence", memberId: id, status: "present", substituteName: null, expectedVersion: 0,
      });
      assert.deepEqual(ok({ op: "presence", memberId: id, status: "present", substituteName: "Jan Test", expectedVersion: 3 }), {
        op: "presence", memberId: id, status: "present", substituteName: null, expectedVersion: 3,
      });
      assert.deepEqual(ok({ op: "presence", memberId: id, status: "substitute", substituteName: "  Jan   Test ", expectedVersion: 1 }), {
        op: "presence", memberId: id, status: "substitute", substituteName: "Jan Test", expectedVersion: 1,
      });
      assert.deepEqual(ok({ op: "excuse", memberId: id, excused: true }), { op: "excuse", memberId: id, excused: true });
      const bad = (b: unknown) => assert.equal(parseWriteBody(b).ok, false, JSON.stringify(b));
      bad(null);
      bad({ op: "presence", memberId: "x", status: "present", expectedVersion: 0 });
      bad({ op: "presence", memberId: id, status: "late", expectedVersion: 0 });
      bad({ op: "presence", memberId: id, status: "present", expectedVersion: -1 });
      bad({ op: "presence", memberId: id, status: "present", expectedVersion: 1.5 });
      bad({ op: "presence", memberId: id, status: "present" });
      bad({ op: "presence", memberId: id, status: "substitute", expectedVersion: 0 });
      bad({ op: "presence", memberId: id, status: "substitute", substituteName: "J", expectedVersion: 0 });
      bad({ op: "presence", memberId: id, status: "substitute", substituteName: "x".repeat(81), expectedVersion: 0 });
      bad({ op: "excuse", memberId: id, excused: "ano" });
      bad({ op: "delete", memberId: id });
      assert.equal(parseSheetDate("2026-10-22"), "2026-10-22");
      assert.equal(parseSheetDate("2026-02-30"), null);
      assert.equal(parseSheetDate("22.10.2026"), null);
      assert.equal(parseSheetDate(undefined), null);
    },
  },
  {
    name: "B6. fronta požadavků jednoho řádku (test 15): druhý požadavek dostane verzi z první odpovědi, konflikt přepíše stav",
    run: () => {
      const present: PresenceTarget = { status: "present", substituteName: null };
      const sub: PresenceTarget = { status: "substitute", substituteName: "Jan Test" };
      // první klik letí s verzí 0
      let a = enqueueTarget(newRowSync(0), present);
      assert.deepEqual(a.send, { target: present, expectedVersion: 0 });
      // rychlé druhé klepnutí čeká, neodešle verzi 0 podruhé
      a = enqueueTarget(a.sync, sub);
      assert.equal(a.send, null);
      assert.deepEqual(a.sync.queued, sub);
      // třetí klik přepíše čekající
      a = enqueueTarget(a.sync, TARGET_ABSENT);
      assert.deepEqual(a.sync.queued, TARGET_ABSENT);
      // odpověď ok: čekající jde s verzí 1
      const r1 = nextRequest(a.sync, { kind: "ok", version: 1 });
      assert.deepEqual(r1.send, { target: TARGET_ABSENT, expectedVersion: 1 });
      assert.equal(r1.sync.version, 1);
      assert.equal(r1.showConflict, false);
      // odpověď ok bez čekajícího: konec
      const r2 = nextRequest(r1.sync, { kind: "ok", version: 2 });
      assert.equal(r2.send, null);
      assert.equal(r2.sync.inFlight, null);
      assert.equal(r2.sync.version, 2);
      // konflikt: čekající se zahodí, verze ze serveru, hláška
      const c0 = enqueueTarget(newRowSync(0), present);
      const c1 = enqueueTarget(c0.sync, sub);
      const conflict = nextRequest(c1.sync, { kind: "conflict", version: 2, target: { status: "absent", substituteName: null } });
      assert.equal(conflict.send, null);
      assert.equal(conflict.sync.queued, null);
      assert.equal(conflict.sync.version, 2);
      assert.equal(conflict.showConflict, true);
      assert.equal(conflict.adoptServer, true);
      // konflikt, kde server už má stejný cíl (arch 6.5, 7:31:02): bez hlášky
      const same = nextRequest(enqueueTarget(newRowSync(0), present).sync, { kind: "conflict", version: 1, target: present });
      assert.equal(same.showConflict, false);
      assert.equal(same.adoptServer, true);
      // chyba: čekající se zahodí, verze beze změny
      const err = nextRequest(c1.sync, { kind: "error" });
      assert.equal(err.send, null);
      assert.equal(err.sync.queued, null);
      assert.equal(err.sync.version, 0);
      // cíl po zaškrtnutí: ohlášený náhradník se vyplní sám
      const row = { announcedName: "Jan Test" } as SheetRow;
      assert.deepEqual(targetOnCheck(row), sub);
      assert.deepEqual(targetOnCheck({ announcedName: null } as SheetRow), present);
    },
  },
  {
    name: "B7. audit: překlad hodnot a řádek historie doslova z gate",
    run: () => {
      assert.equal(auditValueText("present"), "Přítomen");
      assert.equal(auditValueText("absent"), "Nepřítomen");
      assert.equal(auditValueText("substitute:Jan Test"), "Náhradník Jan Test");
      assert.equal(auditValueText("none"), "Bez omluvy");
      assert.equal(auditValueText("absence"), "Omluven(a), bez náhradníka");
      assert.equal(auditValueText("absence:Jan Test"), "Omluven(a), náhradník Jan Test");
      assert.equal(auditValueText(null), "Bez záznamu");
      assert.equal(formatPragueDateTime("2026-10-21T07:14:00.000Z"), "21. 10. 2026 9:14");
      const line = auditLine({
        id: "1",
        at: "2026-10-21T07:14:00.000Z",
        actorName: "Prezident Test",
        memberName: "Člen Test",
        date: "2026-10-15",
        field: "presence",
        oldValue: "present",
        newValue: "substitute:Jan Test",
      });
      assert.equal(line, "21. 10. 2026 9:14 · Prezident Test opravil(a) u Člen Test den 15. 10.: Přítomen → Náhradník Jan Test");
    },
  },
  {
    name: "B8. isSameOrigin: stejný host ano, jiný, chybějící a rozbitý Origin ne, x-forwarded-host má přednost",
    run: () => {
      assert.equal(isSameOrigin({ origin: "https://app.example.test", host: "app.example.test" }), true);
      assert.equal(isSameOrigin({ origin: "https://APP.example.test", host: "app.example.test" }), true);
      assert.equal(isSameOrigin({ origin: "https://app.example.test", forwardedHost: "app.example.test", host: "internal:3000" }), true);
      assert.equal(isSameOrigin({ origin: "https://evil.example.test", host: "app.example.test" }), false);
      assert.equal(isSameOrigin({ origin: "https://app.example.test.evil.test", host: "app.example.test" }), false);
      assert.equal(isSameOrigin({ origin: null, host: "app.example.test" }), false);
      assert.equal(isSameOrigin({ origin: "not a url", host: "app.example.test" }), false);
      assert.equal(isSameOrigin({ origin: "https://app.example.test" }), false);
      assert.equal(isSameOrigin({ origin: "https://app.example.test", forwardedHost: "app.example.test, other.test" }), true);
    },
  },
  {
    name: "B9. statické (test 10): guardy podle konkrétního práva na stránkách, API a v nápovědě",
    run: () => {
      const sheet = read("app/(app)/dochazka/zapis/page.tsx");
      assert.ok(/permission:\s*"attendance\.view_all"/.test(sheet));
      const overview = read("app/(app)/dochazka/prehled/page.tsx");
      assert.ok(/permission:\s*"attendance\.view_all"/.test(overview));
      const detail = read("app/(app)/dochazka/prehled/[memberId]/page.tsx");
      assert.ok(/permission:\s*"attendance\.view_all"/.test(detail));
      assert.ok(detail.includes('can(session, "attendance.audit_view")'), "historie člena jen s audit_view");
      const view = read("lib/attendance/day-view.ts");
      assert.ok(view.includes('can(session, "attendance.audit_view")'), "audit dne jen s audit_view");
      assert.ok(view.includes('"attendance.record"') && view.includes('"attendance.edit_history"'));
      const route = stripComments(read("app/api/attendance/[date]/route.ts"));
      assert.ok(route.includes('requirePermissionForRoute("attendance.view_all", { splitStatus: true })'), "GET chce view_all");
      assert.ok(route.includes('["attendance.record", "attendance.edit_history"]'), "POST chce record nebo edit_history");
      assert.ok(route.includes('export const dynamic = "force-dynamic"'));
      assert.ok(route.includes("isSameOrigin("), "POST kontroluje Origin");
      assert.ok(route.indexOf("isSameOrigin(") < route.indexOf("getSession()"), "Origin se kontroluje před session");
      // zápis ve stránce člena a menu jsou za konkrétním právem, ne za „nějakým právem“
      const help = read("app/(app)/help/page.tsx");
      assert.ok(help.includes('can(session, "attendance.view_all")') && help.includes('can(session, "attendance.edit_history")'));
      const tabs = read("components/attendance/AttendanceTabs.tsx");
      assert.ok(tabs.includes("if (!canViewAll) return null"));
      assert.ok(read("app/(app)/dochazka/page.tsx").includes('can(session, "attendance.view_all")'));
    },
  },
  {
    name: "B10. statické: edit_history přes odkaz nikdy (K1 A, Z4): žádný guard zápisu se na ATTENDANCE_MANAGER_PERMISSIONS neptá bez konkrétního práva",
    run: () => {
      assert.ok(!(ATTENDANCE_MANAGER_PERMISSIONS as readonly string[]).includes("attendance.edit_history"));
      const link = permissionsFor({ authMethod: "magic_link", managementRole: null, functions: [], attendanceManager: true });
      assert.ok(link.has("attendance.record") && link.has("attendance.view_all") && link.has("attendance.audit_view"));
      assert.ok(!link.has("attendance.edit_history"));
      // P přihlášený odkazem s příznakem: tři práva bez edit_history
      const boss = permissionsFor({ authMethod: "magic_link", managementRole: null, functions: [fn("Prezident", [ADMIN_DELEGABLE_MARKER])], attendanceManager: true });
      assert.ok(!boss.has("attendance.edit_history"));
      assert.equal(boss.size, 4, "iter-040: čtyři práva správce");
    },
  },
  {
    name: "B11. SQL zápisu: jeden příkaz s podmínkou verze, audit jen v režimu history a ve stejném příkazu, bez transakce a bez UPDATE/DELETE auditu",
    run: () => {
      const src = stripComments(read("lib/db/queries/attendance.ts"));
      const i = src.indexOf("export async function writePresenceGuarded");
      const j = src.indexOf("export type ExcuseWriteResult");
      const presence = src.slice(i, j);
      assert.equal((presence.match(/getDb\(\)\.execute/g) ?? []).length, 1, "zápis přítomnosti je jeden příkaz");
      assert.ok(presence.includes("r.version = ${expectedVersion}::int"), "UPDATE jen při shodě verze");
      assert.ok(presence.includes("ON CONFLICT (attendance_date, member_id) DO NOTHING"), "INSERT při verzi 0");
      assert.ok(presence.includes("member_substitute_name"), "paměť jmen ve stejném příkazu");
      assert.ok(presence.includes('mode === "history"') && presence.includes("INSERT INTO attendance_audit"));
      assert.ok(presence.includes("IS DISTINCT FROM"), "audit jen při skutečné změně");
      const k = src.indexOf("export async function setExcuseGuarded");
      const l = src.indexOf("type AuditDbRow");
      const excuse = src.slice(k, l);
      assert.equal((excuse.match(/getDb\(\)\.execute/g) ?? []).length, 1, "Omluven(a) je jeden příkaz");
      assert.ok(excuse.includes('mode === "history"') && excuse.includes("INSERT INTO attendance_audit"));
      assert.ok(!/\.transaction\(/.test(src), "LL-003: žádná transakce");
      // režim normal nezapisuje audit: INSERT do auditu je jen uvnitř větve history
      assert.equal((src.match(/INSERT INTO attendance_audit/g) ?? []).length, 2);
      // pojistky ve WHERE: den a člen
      assert.ok(src.includes("function dayGuardSql") && src.includes("function memberGuardSql"));
      assert.ok(/fd\.finalized_at IS NOT NULL/.test(src), "normal: uzavřený den se nepřepíše");
      // klient volá jen API dne, ne router.refresh (LL-017)
      for (const f of ["components/attendance/AttendanceSheet.tsx", "app/(app)/dochazka/zapis/page.tsx"]) {
        assert.ok(!/router\.refresh|revalidatePath/.test(stripComments(read(f))), `${f}: bez refresh`);
      }
      // žádný loading.tsx v segmentu /dochazka (LL-017)
      assert.ok(!existsSync(join(ROOT, "app/(app)/dochazka/loading.tsx")));
      assert.ok(!existsSync(join(ROOT, "app/(app)/dochazka/zapis/loading.tsx")));
    },
  },
  {
    name: "B12. polling 10 s jen při viditelné stránce, jen pro dnešek; fronta řádku se používá; datum v URL a výběr dne",
    run: () => {
      const ui = stripComments(read("components/attendance/AttendanceSheet.tsx"));
      assert.ok(ui.includes("POLL_MS = 10_000"));
      assert.ok(ui.includes('document.visibilityState === "visible"'));
      assert.ok(ui.includes('"visibilitychange"') && ui.includes('"focus"'));
      assert.ok(ui.includes("payload.date === payload.today"), "mimo dnešek se nepolluje");
      assert.ok(ui.includes("enqueueTarget(") && ui.includes("nextRequest("));
      const page = read("app/(app)/dochazka/zapis/page.tsx");
      assert.ok(page.includes("searchParams") && page.includes("parseSheetDate"));
      assert.ok(page.includes('name="d"') && page.includes("SHEET_TEXTS.prevDay"));
    },
  },
  {
    name: "B13. ops log: attendance.history-edited je jednorázová událost s popiskem, bez hodnot a jmen náhradníků",
    run: () => {
      const types = read("lib/ops/types.ts");
      assert.equal((types.match(/"attendance\.history-edited"/g) ?? []).length, 2, "union i TERMINAL_KINDS");
      assert.ok(read("app/(app)/status/EventTable.tsx").includes('"attendance.history-edited": "Oprava docházky"'));
      const route = stripComments(read("app/api/attendance/[date]/route.ts"));
      const at = route.indexOf('kind: "attendance.history-edited"');
      assert.ok(at > 0);
      const block = route.slice(at - 300, at + 500);
      assert.ok(block.includes('message: "Oprava docházky."'));
      assert.ok(!/substitute|oldValue|newValue|email|token/i.test(block), "log bez hodnot a jmen náhradníků");
      assert.ok(/mode === "history" && audited && row/.test(route), "loguje se jen skutečná oprava");
      assert.ok(/safeLog\(\(\) => \(\{/.test(route), "LL-011: sestavení uvnitř try");
    },
  },
  {
    name: "B14. nápověda pro vedení: sekce Docházka pro správce a Opravy po uzávěrce doslova z gate, vyká",
    run: () => {
      const mod = norm(read("components/help/sections/ModeratorHelp.tsx"));
      for (const s of [
        'title="Docházka pro správce"',
        "V den schůzky vám ráno před 7:00 přijde mail s odkazem na zápis. Platí 12 hodin a nepotřebuje přihlášení. Docházku najdete i v aplikaci v menu Docházka, záložka Zápis.",
        // T-005b: původní věta o zaškrtávání příchozích nahrazena dvěma kroky podle rozhodnutí Toma 23. 10.
        // iter-042 (#11, #13): slovník omluva, znění podle úvodu Zápisu.
        "Zapisovat jde dvěma způsoby: průběžně zaškrtávejte Přítomen u příchozích, nebo označte jen ty, kdo chyběli (Chyběl(a) bez omluvy).",
        "Náhradníka zapíšete tak, že u člena zaškrtnete Přítomen, tím se zpřístupní volba „s náhradníkem“ (u omluvy s náhradníkem se jméno vyplní samo). Kdo zůstane bez zápisu, počítá se při uzávěrce jako přítomný, s omluvou jako omluvený a s omluvou s náhradníkem jako náhradník. Pod jménem řádku bez zápisu to vidíte napsané.",
        "Kdo se omluvil až ráno, tomu zaškrtněte Omluven(a). Odškrtnutím Omluven(a) se smaže omluva i se jménem náhradníka, aplikace se předtím zeptá a vrátit to nejde.",
        "Každé kliknutí se hned uloží. Když řádek mezitím změnil jiný správce, uvidíte jeho stav a hlášku. Klikněte znovu.",
        "V 17:00 se den uzavře a přijde vám report. Potom už zápis nejde.",
        "Ranní mail nepřišel.",
        "Mrkněte do spamu. Zapisovat můžete i přes menu Docházka.",
        'title="Opravy po uzávěrce"',
        "Opravit uzavřený nebo starší den může admin, Prezident a Viceprezident v záložce Zápis. Každá oprava se zapíše do historie oprav. Report se znovu neposílá.",
      ]) {
        assert.ok(mod.includes(s), `chybí: ${s}`);
      }
      const page = read("components/help/HelpPage.tsx");
      assert.ok(page.includes("showLeadershipHelp || showAttendanceHelp"), "správce bez hesla vidí záložku Pro vedení");
      assert.ok(page.includes("showAttendanceHistoryHelp"));
      // sekce pro správce se vykreslí jen s právem view_all, oprav jen s edit_history
      assert.ok(mod.includes("{attendance && (") && mod.includes("{attendanceHistory && ("));
      // správce přihlášený odkazem nedostane nápovědu vedení s heslem
      assert.ok(mod.includes("{showLeadership && ("));
    },
  },
  {
    name: "B15. T-003b soubory: bez em dash, bez e-mailu a telefonu; nové texty doslova v UI",
    run: () => {
      const files = [
        "lib/attendance/sheet.ts",
        "lib/attendance/day-view.ts",
        "lib/auth/same-origin.ts",
        "app/api/attendance/[date]/route.ts",
        "app/(app)/dochazka/zapis/page.tsx",
        "app/(app)/dochazka/prehled/page.tsx",
        "app/(app)/dochazka/prehled/[memberId]/page.tsx",
        "components/attendance/AttendanceSheet.tsx",
        "components/attendance/AttendanceTabs.tsx",
        "components/attendance/AuditList.tsx",
        "components/help/sections/ModeratorHelp.tsx",
        "components/help/HelpPage.tsx",
      ];
      for (const f of files) {
        const src = read(f);
        assert.ok(!src.includes(EM_DASH), `${f}: em dash`);
        assert.ok(!/@[a-z0-9-]+\.(cz|com|eu)\b/i.test(src), `${f}: e-mail`);
        assert.ok(!/\+?420 ?\d{3} ?\d{3} ?\d{3}/.test(src), `${f}: telefon`);
      }
      const ui = read("components/attendance/AttendanceSheet.tsx");
      assert.ok(ui.includes("SHEET_TEXTS.present") && ui.includes("SHEET_TEXTS.withSubstitute") && ui.includes("SHEET_TEXTS.excused"));
      assert.equal(SHEET_TEXTS.present, "Přítomen");
      assert.equal(SHEET_TEXTS.withSubstitute, "s náhradníkem");
      assert.equal(SHEET_TEXTS.excused, "Omluven(a)");
      assert.equal(SHEET_TEXTS.saving, "ukládá se");
      // odkaz na detailu schůzky jen s view_all
      const meeting = read("app/(app)/meetings/[id]/page.tsx");
      assert.ok(/can\(session, "attendance\.view_all"\)[\s\S]{0,200}\/dochazka\/zapis\?d=\$\{meeting\.date\}/.test(meeting));
      // 44 px cíle dotyku u zatržítek a polí
      assert.ok(ui.split("min-h-[44px]").length > 4);
    },
  },
  {
    name: "C1. planAttendanceCron: všech 14 buněk (7 běhů × léto a zima), hranice 5:59, 6:00, 11:59, 12:00, 16:59, 17:00, 23:59 (gate Z1)",
    run: () => {
      const at = (day: string, h: number, m: number, s: number) =>
        new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}Z`);
      const SUMMER = "2026-07-16";
      const WINTER = "2026-12-17";
      const summer: Record<number, string> = { 4: "morning", 5: "morning", 6: "morning", 7: "morning", 15: "evening", 16: "evening", 17: "evening" };
      const winter: Record<number, string> = { 4: "none", 5: "morning", 6: "morning", 7: "morning", 15: "none", 16: "evening", 17: "evening" };
      let cells = 0;
      for (const hour of [4, 5, 6, 7, 15, 16, 17]) {
        for (const [day, want] of [[SUMMER, summer], [WINTER, winter]] as const) {
          assert.equal(planAttendanceCron(at(day, hour, 0, 0)).phase, want[hour], `${day} ${hour}:00:00Z`);
          assert.equal(planAttendanceCron(at(day, hour, 59, 59)).phase, want[hour], `${day} ${hour}:59:59Z`);
          cells++;
        }
      }
      assert.equal(cells, 14);
      // hranice v pražském čase (zima, UTC+1): 5:59:59 ne, 6:00 ano, 11:59:59 ano, 12:00 ne
      const w = (h: number, m: number, s: number) => planAttendanceCron(at(WINTER, h - 1, m, s)).phase;
      assert.equal(w(5, 59, 59), "none");
      assert.equal(w(6, 0, 0), "morning");
      assert.equal(w(11, 59, 59), "morning");
      assert.equal(w(12, 0, 0), "none");
      assert.equal(w(16, 59, 59), "none");
      assert.equal(w(17, 0, 0), "evening");
      assert.equal(w(23, 59, 59), "evening");
      assert.equal(planAttendanceCron(at("2026-12-17", 23, 0, 0)).phase, "none", "půlnoc v Praze už je další den, 0:00 ne");
      // léto (UTC+2)
      const s = (h: number, m: number, sec: number) => planAttendanceCron(at(SUMMER, h - 2, m, sec)).phase;
      assert.equal(s(5, 59, 59), "none");
      assert.equal(s(6, 0, 0), "morning");
      assert.equal(s(11, 59, 59), "morning");
      assert.equal(s(12, 0, 0), "none");
      assert.equal(s(17, 0, 0), "evening");
      // přechody času: 25. 10. 2026 (CEST na CET), 28. 3. 2027 (CET na CEST)
      assert.equal(planAttendanceCron(new Date("2026-10-25T04:59:59Z")).phase, "none");
      assert.equal(planAttendanceCron(new Date("2026-10-25T05:00:00Z")).phase, "morning");
      assert.equal(planAttendanceCron(new Date("2027-03-28T03:59:59Z")).phase, "none");
      assert.equal(planAttendanceCron(new Date("2027-03-28T04:00:00Z")).phase, "morning");
      // dnešek a včerejšek podle pražského dne, ne UTC
      const late = planAttendanceCron(at(SUMMER, 22, 30, 0));
      assert.equal(late.today, "2026-07-17");
      assert.equal(late.yesterday, "2026-07-16");
      const noon = planAttendanceCron(at(WINTER, 5, 10, 0));
      assert.deepEqual([noon.today, noon.yesterday], ["2026-12-17", "2026-12-16"]);
      // okno i konstanty
      assert.equal(MORNING_FROM_MINUTES, 360);
      assert.equal(MORNING_TO_MINUTES, 720);
      assert.equal(EVENING_FROM_MINUTES, 1020);
    },
  },
  {
    name: "C2. vercel.json: přesně sedm rozvrhů attendance (Z1), close-voting beze změny, platný JSON, bez duplicit",
    run: () => {
      const cfg = JSON.parse(read("vercel.json")) as {
        regions: string[];
        crons: { path: string; schedule: string }[];
      };
      assert.deepEqual(cfg.regions, ["fra1"]);
      const att = cfg.crons.filter((c) => c.path === "/api/cron/attendance").map((c) => c.schedule);
      assert.equal(att.length, 7);
      assert.deepEqual([...att].sort(), [...ATTENDANCE_CRON_SCHEDULES].sort());
      assert.deepEqual(
        [...att].sort(),
        ["0 15 * * *", "0 16 * * *", "0 17 * * *", "0 4 * * *", "0 5 * * *", "0 6 * * *", "0 7 * * *"]
      );
      const cv = cfg.crons.filter((c) => c.path === "/api/cron/close-voting");
      assert.deepEqual(cv, [{ path: "/api/cron/close-voting", schedule: "0 5 * * *" }]);
      assert.equal(cfg.crons.length, 8);
      // Hobby: každý cron nejvýš jednou denně (minuta 0, pevná hodina), do limitu 100
      for (const c of cfg.crons) assert.match(c.schedule, /^0 \d{1,2} \* \* \*$/);
      assert.equal(new Set(cfg.crons.map((c) => `${c.path} ${c.schedule}`)).size, cfg.crons.length);
      assert.ok(cfg.crons.length <= 100);
    },
  },
  {
    name: "C3. decideAttendanceTokenAccess: platný, vypršelý, revokovaný, neodeslaný, neaktivní, bez příznaku, jiný den (9.3)",
    run: () => {
      const now = new Date("2026-10-22T05:00:00Z");
      const today = "2026-10-22";
      const base = {
        id: "l1",
        memberId: "m1",
        attendanceDate: today,
        expiresAt: new Date("2026-10-22T16:10:00Z") as Date | null,
        revokedAt: null as Date | null,
        sentAt: new Date("2026-10-22T04:10:00Z") as Date | null,
        memberActive: true,
        isManager: true,
      };
      const d = (patch: Partial<typeof base>, at = now) =>
        decideAttendanceTokenAccess({ now: at, today, link: { ...base, ...patch } });
      assert.deepEqual(d({}), { status: "ok", linkId: "l1", memberId: "m1", date: today });
      assert.deepEqual(d({ expiresAt: new Date("2026-10-22T04:59:59Z") }), { status: "expired" });
      assert.deepEqual(d({ expiresAt: now }), { status: "expired" }, "přesně v čase vypršení už ne");
      assert.deepEqual(d({ expiresAt: null }), { status: "expired" });
      assert.deepEqual(d({ revokedAt: new Date("2026-10-22T04:30:00Z") }), { status: "revoked" });
      assert.deepEqual(d({ sentAt: null }), { status: "invalid" }, "neodeslaný odkaz nikdo nedostal");
      assert.deepEqual(d({ memberActive: false }), { status: "revoked" });
      assert.deepEqual(d({ isManager: false }), { status: "revoked" }, "příznak odebraný");
      assert.deepEqual(d({ attendanceDate: "2026-10-21" }), { status: "expired" }, "jiný den");
      // revokace má přednost před vypršením i neodeslaným
      assert.deepEqual(d({ revokedAt: new Date(), expiresAt: new Date("2020-01-01T00:00:00Z") }), { status: "revoked" });
      assert.deepEqual(d({ memberActive: false, sentAt: null }), { status: "revoked" });
      // 12 h od odeslání: 6:10 CEST platí do 18:10
      assert.equal(linkExpiresAt(new Date("2026-10-22T04:10:00Z")).toISOString(), "2026-10-22T16:10:00.000Z");
      assert.equal(ATTENDANCE_LINK_VALID_HOURS, 12);
    },
  },
  {
    name: "C4. middleware: /d/, /api/d/ (no-store, no-referrer) a /api/cron/attendance jsou veřejné, bez session (LL-005)",
    run: () => {
      const mw = stripComments(read("middleware.ts"));
      assert.ok(mw.includes('"/api/cron/attendance"'));
      assert.ok(mw.includes('pathname.startsWith("/d/")') && mw.includes('pathname.startsWith("/api/d/")'));
      const block = /startsWith\("\/d\/"\)[\s\S]{0,400}?return response;/.exec(mw);
      assert.ok(block, "větev /d/");
      assert.ok(block[0].includes('"Cache-Control", "no-store"') && block[0].includes('"Referrer-Policy", "no-referrer"'));
      // nic nového neotevřelo cesty docházky pro přihlášené
      assert.ok(!/dochazka/.test(mw), "/dochazka není veřejná");
      assert.ok(!/\/api\/attendance/.test(mw));
    },
  },
  {
    name: "C5. buildAttendanceReport: kategorie, počty v předmětu, pořadí absence, oranžová od 3, escapování HTML, prázdné kategorie pryč (test 9)",
    run: () => {
      const m = (
        name: string,
        status: "present" | "substitute" | "absent",
        o: Partial<ReportMember> = {}
      ): ReportMember => ({
        name,
        status,
        substituteName: null,
        excused: false,
        announcedSubstitute: false,
        ordinal: null,
        ...o,
      });
      const data: ReportData = {
        date: "2026-10-22",
        hasMeeting: true,
        mode: "recorded",
        late: false,
        members: [
          m("Člen B", "present"),
          m("Člen A", "present"),
          m("Člen C", "substitute", { substituteName: "Náhradník X" }),
          m("Člen D", "absent", { excused: true, ordinal: 3 }),
          m("Člen E", "absent", { excused: true, announcedSubstitute: true, ordinal: 1 }),
          m("Člen F", "absent", { ordinal: 1 }),
          m("Člen G", "absent", { ordinal: 4 }),
        ],
        writers: ["Správce B", "Správce A"],
        lastChange: "2026-10-22T06:12:00.000Z",
      };
      const c = reportCounts(data.members);
      assert.deepEqual(c, { total: 7, present: 3, viaSubstitute: 1, missing: 4, excused: 2, unexcused: 2 });
      const mail = buildAttendanceReport({ data, recipientName: "Příjemce", url: "https://app.example/dochazka/zapis?d=2026-10-22" });
      assert.equal(mail.subject, "BNI Plzeň: docházka čt 22. 10. 2026 (přítomno 3 z 7)");
      const lines = mail.text.split("\n");
      assert.equal(lines[0], "Ahoj Příjemce,");
      assert.equal(lines[1], "docházka ze schůzky ve čtvrtek 22. 10. 2026.");
      assert.equal(lines[2], "Přítomno 3 z 7, z toho 1 přes náhradníka. Chybí 4: 2 omluvení, 2 bez omluvy.");
      const body = mail.text;
      const idx = (s: string) => {
        const i = body.indexOf(s);
        assert.ok(i >= 0, `chybí: ${s}`);
        return i;
      };
      assert.ok(idx("Přítomní (2)") < idx("Přišel náhradník (1)"));
      assert.ok(idx("Přišel náhradník (1)") < idx("Omluvení (2)"));
      assert.ok(idx("Omluvení (2)") < idx("Bez omluvy (2)"));
      assert.ok(idx("  Člen A\n  Člen B") > 0, "abecedně");
      idx("  Člen C: náhradník Náhradník X");
      idx("  Člen D (3. absence za 6 měsíců)");
      idx("  Člen E, ohlášený náhradník nepřišel");
      idx("  Člen F (1. absence za 6 měsíců)");
      idx("  Člen G (4. absence za 6 měsíců)");
      idx("Zapisovali: Správce A, Správce B. Poslední změna v 8:12.");
      idx("Pozdější opravy se do reportu nedostanou. Aktuální stav je v aplikaci v menu Docházka.");
      idx("Otevřít docházku: https://app.example/dochazka/zapis?d=2026-10-22");
      // oranžově od 3 (K9): Člen D a Člen G, ne F ani E
      assert.equal((mail.html.match(/color:#c2410c/g) ?? []).length, 2);
      assert.ok(/Člen G <span style="color:#c2410c;font-weight:600;">\(4\. absence za 6 měsíců\)<\/span>/.test(mail.html));
      assert.ok(!/Člen F <span style="color:#c2410c/.test(mail.html));
      // prázdná kategorie se vynechá, bez „Chybí“ a bez „přes náhradníka“
      const only = buildAttendanceReport({
        data: { ...data, members: [m("Člen A", "present"), m("Člen B", "present")], writers: [], lastChange: null },
        recipientName: "P",
        url: "u",
      });
      assert.ok(!only.text.includes("Omluvení") && !only.text.includes("Bez omluvy") && !only.text.includes("Přišel náhradník"));
      assert.ok(only.text.includes("Přítomno 2 z 2.") && !only.text.includes("Chybí") && !only.text.includes("přes náhradníka"));
      assert.ok(!only.text.includes("Zapisovali"));
      // escapování: jméno náhradníka píše člen
      const evil = buildAttendanceReport({
        data: { ...data, members: [m("Člen A", "substitute", { substituteName: "<b>\"x\" & 'y'</b>" })] },
        recipientName: "P",
        url: "https://app.example/?a=1&b=2",
      });
      assert.ok(!evil.html.includes("<b>"), "html: nic neescapovaného");
      assert.ok(evil.html.includes("&lt;b&gt;&quot;x&quot; &amp; &#x27;y&#x27;&lt;/b&gt;"));
      assert.ok(evil.html.includes("https://app.example/?a=1&amp;b=2"));
      // příjemci reportu: přesně Prezident a Viceprezident (K8)
      assert.deepEqual([...ATTENDANCE_REPORT_FUNCTIONS], ["prezident", "viceprezident"]);
    },
  },
  {
    name: "C6. report: den bez zápisu (nezapsáno), den bez schůzky, záchrana (opožděně), pořadí předmětu",
    run: () => {
      const base: ReportData = {
        date: "2026-10-22",
        hasMeeting: true,
        mode: "unrecorded",
        late: false,
        members: [
          { name: "Člen A", status: "absent", substituteName: null, excused: true, announcedSubstitute: false, ordinal: 1 },
          { name: "Člen B", status: "substitute", substituteName: "Náhradník X", excused: true, announcedSubstitute: true, ordinal: null },
        ],
        writers: ["Nemá se ukázat"],
        lastChange: "2026-10-22T06:12:00.000Z",
      };
      const un = buildAttendanceReport({ data: base, recipientName: "P", url: "u" });
      assert.equal(un.subject, "BNI Plzeň: docházka čt 22. 10. 2026 (nezapsáno)");
      assert.ok(un.text.includes("Docházku dnes nikdo nezapsal. Předem se omluvili:"));
      assert.ok(un.text.includes("  Člen A (1. absence za 6 měsíců)") && un.text.includes("  Člen B: náhradník Náhradník X"));
      assert.ok(un.text.includes("Ostatní se počítají jako přítomní."));
      assert.ok(!un.text.includes("Zapisovali") && !un.text.includes("Přítomno"));
      // nikdo se neomluvil
      const none = buildAttendanceReport({ data: { ...base, members: [] }, recipientName: "P", url: "u" });
      assert.ok(none.text.includes("Docházku dnes nikdo nezapsal. Předem se nikdo neomluvil."));
      assert.ok(none.text.includes("Ostatní se počítají jako přítomní."));
      // záchrana druhý den ráno: „(opožděně)“ a „dnes“ nahradí datum
      const late = buildAttendanceReport({ data: { ...base, late: true }, recipientName: "P", url: "u" });
      assert.equal(late.subject, "BNI Plzeň: docházka čt 22. 10. 2026 (nezapsáno) (opožděně)");
      assert.ok(late.text.includes("Docházku 22. 10. 2026 nikdo nezapsal."));
      const lateRec = buildAttendanceReport({
        data: { ...base, mode: "recorded", late: true, members: [base.members[0]] },
        recipientName: "P",
        url: "u",
      });
      assert.equal(lateRec.subject, "BNI Plzeň: docházka čt 22. 10. 2026 (přítomno 0 z 1) (opožděně)");
      // den bez schůzky
      const nm = buildAttendanceReport({ data: { ...base, hasMeeting: false }, recipientName: "P", url: "u" });
      assert.ok(nm.text.includes("docházka ze dne čtvrtek 22. 10. 2026."));
      assert.ok(!nm.text.includes("ze schůzky"));
      // lokativ dne v týdnu
      const tue = buildAttendanceReport({ data: { ...base, date: "2026-10-20" }, recipientName: "P", url: "u" });
      assert.ok(tue.text.includes("ze schůzky v úterý 20. 10. 2026."));
      assert.ok(buildAttendanceReport({ data: { ...base, date: "2026-10-21" }, recipientName: "P", url: "u" }).text.includes("ve středu"));
    },
  },
  {
    name: "C7. ranní mail doslova z gate: předmět, tři varianty věty o omluvených, platnost do 18:10, upozornění",
    run: () => {
      const mail = buildMorningMail({
        name: "Příjemce",
        date: "2026-10-22",
        expiresAt: new Date("2026-10-22T16:10:00.000Z"),
        excused: 3,
        withSubstitute: 1,
        url: "https://app.example/d/TOKEN",
      });
      assert.equal(mail.subject, "BNI Plzeň: docházka dnes, čt 22. 10.");
      assert.deepEqual(mail.text.split("\n"), [
        "Ahoj Příjemce,",
        "dnes je schůzka. Docházku odškrtáš přes tenhle odkaz, bez přihlašování.",
        "Odkaz platí do 18:10 a jen pro dnešní docházku.",
        "Předem se omluvili: 3, z toho 1 s náhradníkem.",
        "",
        "Otevřít docházku: https://app.example/d/TOKEN",
        "",
        "Odkaz nikomu nepřeposílej. Kdo ho má, může dnešní docházku měnit.",
      ]);
      assert.equal(morningExcusedLine(0, 0), "Předem se nikdo neomluvil.");
      assert.equal(morningExcusedLine(3, 0), "Předem se omluvili: 3.");
      assert.equal(morningExcusedLine(3, 1), "Předem se omluvili: 3, z toho 1 s náhradníkem.");
      assert.ok(mail.html.includes("Otevřít docházku") && mail.html.includes('href="https://app.example/d/TOKEN"'));
      // zimní čas: 6:10 CET = 5:10Z, platí do 18:10 CET = 17:10Z
      const winter = buildMorningMail({
        name: "P",
        date: "2026-12-17",
        expiresAt: linkExpiresAt(new Date("2026-12-17T05:10:00Z")),
        excused: 0,
        withSubstitute: 0,
        url: "u",
      });
      assert.ok(winter.text.includes("Odkaz platí do 18:10 a jen pro dnešní docházku."));
      assert.ok(winter.text.includes("Předem se nikdo neomluvil."));
    },
  },
  {
    name: "C8. link-page: texty stránky odkazu doslova, blokace = neplatný odkaz, HTTP stavy",
    run: () => {
      assert.equal(
        LINK_TEXTS.expired,
        "Odkaz na zápis docházky už neplatí. Platí 12 hodin od ranního mailu. Docházku najdeš i po přihlášení do aplikace v menu Docházka."
      );
      assert.equal(LINK_TEXTS.expiredButton, "Přihlásit se");
      assert.equal(LINK_TEXTS.revoked, "Tenhle odkaz už nefunguje.");
      assert.equal(LINK_TEXTS.invalid, "Odkaz není platný. Zkontroluj, že jsi ho zkopíroval(a) celý.");
      assert.equal(linkProblemText("rate_limited"), LINK_TEXTS.invalid);
      assert.equal(linkProblemText("invalid"), LINK_TEXTS.invalid);
      assert.equal(linkProblemStatus("rate_limited"), 429);
      assert.equal(linkProblemStatus("expired"), 401);
      assert.equal(linkProblemStatus("revoked"), 401);
    },
  },
  {
    name: "C9. odkaz /d/[token]: token route bez oprav, bez session, ověření na serveru, throttle jen pro neplatný token (9.3)",
    run: () => {
      const route = stripComments(read("app/api/d/[token]/route.ts"));
      assert.ok(route.includes("verifyAttendanceToken("), "GET i POST ověřují token");
      assert.equal(route.split("verifyAttendanceToken(").length - 1, 2);
      assert.ok(!route.includes("edit_history") && !route.includes("editHistory: true"), "odkaz nikdy nedává opravy");
      assert.ok(route.includes('mode: "normal"') && route.includes("editHistory: false"));
      assert.ok(!route.includes("getSession") && !route.includes("cookies"), "odkaz nevytváří ani nečte session");
      assert.ok(route.includes("v.memberId") && route.includes("v.date"), "správce a den z ověřeného odkazu");
      assert.ok(!/params[\s\S]{0,40}date/.test(route), "den nejde z požadavku");
      assert.ok(route.includes("no-store") && route.includes("no-referrer"));
      const page = stripComments(read("app/d/[token]/page.tsx"));
      assert.ok(page.includes("AttendanceSheet") && page.includes("endpoint={`/api/d/${token}`}"));
      assert.ok(page.includes("verifyAttendanceToken(") && !page.includes("fetch("), "bez self-fetche, throttle vidí skutečnou IP");
      assert.ok(page.includes("LINK_TEXTS.expiredButton") && page.includes('href="/login"'));
      const layout = read("app/d/layout.tsx");
      assert.ok(layout.includes("index: false"));
      const magic = stripComments(read("lib/auth/attendance-magic.ts"));
      assert.ok(magic.includes("throttleCheck(key)") && magic.includes("throttleFail(key)"));
      // throttle se počítá jen pro neznámý nebo špatně utvořený token, ne pro vypršelý ani odebraný
      const fails = magic.split("throttleFail(key)").length - 1;
      assert.equal(fails, 2);
      assert.ok(magic.includes("randomBytes(32)") && magic.includes('"sha256"'));
      assert.ok(magic.includes("last_used_at < now() - interval '1 minute'"));
      assert.ok(!magic.includes("console."), "token ani adresa se nelogují");
    },
  },
  {
    name: "C10. SQL uzavření a reportu: claim s pojistkami, idempotentní doplnění, uzavření jen z NULL, bez transakcí (LL-003)",
    run: () => {
      const src = stripComments(read("lib/db/queries/attendance-close.ts"));
      const n = norm(src);
      // claim odkazu (9.2)
      assert.ok(n.includes("ON CONFLICT (member_id, attendance_date) DO UPDATE"));
      assert.ok(n.includes("WHERE attendance_link.sent_at IS NULL AND attendance_link.revoked_at IS NULL AND attendance_link.claimed_at < now() - make_interval(mins =>"));
      assert.ok(n.includes("now() + make_interval(hours =>"));
      // doplnění řádků: source auto, version 1, DO NOTHING v obou režimech
      assert.equal(n.split("'auto', 1, NULL").length - 1, 2);
      // dvakrát doplnění řádků (recorded, unrecorded) a jednou claim příjemce reportu
      assert.equal(n.split("ON CONFLICT (attendance_date, member_id) DO NOTHING").length - 1, 3);
      assert.ok(n.includes("WHERE attendance_day.finalized_at IS NULL"), "uzavře jen neuzavřený den");
      assert.ok(n.includes("ON CONFLICT (attendance_date, member_id) DO NOTHING RETURNING member_id"), "claim reportu");
      assert.ok(n.includes("m.joined_at <= ${date}::date"));
      assert.ok(n.includes("memberActiveSql(\"m\")"));
      // okno absencí dostane SQL jako parametr z TS (12.2)
      assert.ok(n.includes("absenceWindowStart(date)") && n.includes("x.attendance_date > ${from}::date"));
      // žádná JS interpolace do textu SQL a žádné transakce
      assert.ok(!/\bsql\.raw\(/.test(src));
      assert.ok(!/transaction\s*\(/.test(src));
      for (const f of ["lib/attendance/cron.ts", "lib/auth/attendance-magic.ts", "app/api/d/[token]/route.ts", "app/api/cron/attendance/route.ts"]) {
        assert.ok(!/db\.transaction|\.transaction\s*\(/.test(stripComments(read(f))), `${f}: transakce`);
      }
      // příjemci: P, VP přes lower(name), bez admina jen kvůli roli
      assert.ok(n.includes("m.attendance_manager_since IS NOT NULL OR EXISTS"));
      assert.ok(n.includes("lower(cf.name) IN"));
      assert.ok(!n.includes("management_role"), "admin report nedostává jen kvůli roli (K8)");
    },
  },
  {
    name: "C11. cron: běh mimo okna nesahá na DB a nic nezapisuje; route nebere čas z požadavku, chrání ji CRON_SECRET",
    run: async () => {
      for (const iso of ["2026-12-17T04:10:00Z", "2026-12-17T15:10:00Z", "2026-07-16T12:00:00Z", "2026-07-16T22:30:00Z"]) {
        const r = await runAttendanceCron(new Date(iso), { appUrl: "http://x" });
        assert.equal(r.phase, "none", iso);
        assert.equal(r.worked, false);
        assert.deepEqual(r.daysFinalized, []);
        assert.equal(r.linksSent + r.reportsSent + r.linksFailed + r.reportsFailed, 0);
      }
      const route = stripComments(read("app/api/cron/attendance/route.ts"));
      assert.ok(route.includes("CRON_SECRET") && route.includes("Bearer ${cronSecret}"));
      assert.ok(route.includes("runAttendanceCron(new Date()"));
      assert.ok(!/searchParams|nextUrl|\.json\(\)|\bnow=/.test(route), "čas nejde přepsat požadavkem");
      assert.ok(route.includes("maxDuration = 60") && route.includes('dynamic = "force-dynamic"'));
      assert.ok(route.includes("x-vercel-cron-schedule"));
      assert.ok(route.includes("getAppUrl()"));
      assert.ok(!route.includes("memberName") && !route.includes("email"), "odpověď nenese jména ani adresy");
      // jádro: nejdřív zjištění práce, teprve pak cron.started; ranní okno má záchranu včerejška
      const core = stripComments(read("lib/attendance/cron.ts"));
      assert.ok(core.indexOf("getCloseState(plan.today)") < core.indexOf('kind: "cron.started"'));
      assert.ok(core.includes("plan.yesterday") && core.includes("late: true"));
      assert.ok(core.includes("if (linkTargets.length === 0 && days.length === 0) return result;"));
    },
  },
  {
    name: "C12. ops log: sedm nových druhů v unionu a popiscích, uvnitř běhu (ne terminální), bez tokenu, URL, e-mailu a jmen náhradníků (test 14)",
    run: () => {
      const kinds = [
        "attendance.link-sent",
        "attendance.link-failed",
        "attendance.link-skipped",
        "attendance.day-finalized",
        "attendance.report-sent",
        "attendance.report-failed",
        "attendance.report-skipped",
      ];
      const types = read("lib/ops/types.ts");
      const table = read("app/(app)/status/EventTable.tsx");
      for (const k of kinds) {
        assert.ok(types.includes(`| "${k}"`), `${k} v unionu`);
        assert.ok(table.includes(`"${k}":`), `${k} v popiscích`);
        assert.ok(!(TERMINAL_KINDS as readonly string[]).includes(k), `${k} nesmí být terminální`);
      }
      assert.ok((TERMINAL_KINDS as readonly string[]).includes("attendance.history-edited"));
      // OpsEventInput zůstává uzavřený: žádné pole pro odkaz ani token (N11)
      const body = /export interface OpsEventInput \{([\s\S]*?)\n\}/.exec(types);
      assert.ok(body);
      assert.ok(!/\b(url|link|token|href|rawToken)\??:/.test(body[1]));
      // události cronu nenesou token, URL, adresu ani jméno náhradníka
      const core = stripComments(read("lib/attendance/cron.ts"));
      const blocks = core.match(/emit\(\(\) => \(\{[\s\S]*?\}\)\);/g) ?? [];
      assert.ok(blocks.length >= 8, `událostí v kódu: ${blocks.length}`);
      for (const b of blocks) {
        assert.ok(!/token|\burl\b|\bemail\s*:|substituteName|announcedName|\.email\b/i.test(b), `emit: ${b.slice(0, 80)}`);
      }
      // console v jádru a v poště: jen memberId a třída chyby
      for (const f of ["lib/attendance/cron.ts", "lib/email/attendance.ts", "lib/auth/attendance-magic.ts"]) {
        for (const line of stripComments(read(f)).split("\n").filter((l) => l.includes("console."))) {
          assert.ok(!/token|\.email|\bto\b\}|mail\.|url/i.test(line.replace("memberId", "")), `${f}: ${line.trim()}`);
        }
      }
      // stav běhu: selhání jednoho příjemce dá „partial“, bez selhání „ok“
      const t0 = new Date("2026-10-22T04:10:00Z");
      const ev = (kind: string) => ({ kind, message: "", detail: null, occurredAt: t0 });
      const ok = deriveRunStatus([ev("cron.started"), ev("attendance.link-sent"), ev("cron.finished")], t0);
      assert.equal(ok.state, "ok");
      const part = deriveRunStatus(
        [ev("cron.started"), ev("attendance.link-sent"), ev("attendance.link-failed"), ev("cron.finished")],
        t0
      );
      assert.equal(part.state, "partial");
      const part2 = deriveRunStatus([ev("cron.started"), ev("attendance.report-failed"), ev("cron.finished")], t0);
      assert.equal(part2.state, "partial");
    },
  },
  {
    name: "C13. pošta: líná inicializace Resendu, bez klíče fail-safe (chyba, nic se neodešle, nic se nelogují krom memberId)",
    run: async () => {
      const src = stripComments(read("lib/email/attendance.ts"));
      assert.ok(!/^const\s+\w+\s*=\s*new Resend\(/m.test(src), "žádná inicializace na úrovni modulu");
      assert.ok(src.includes("if (!client) client = new Resend(apiKey)"));
      const saved = process.env.RESEND_API_KEY;
      const origErr = console.error;
      const logged: string[] = [];
      console.error = (...a: unknown[]) => void logged.push(a.map(String).join(" "));
      try {
        delete process.env.RESEND_API_KEY;
        const mail = { subject: "s", text: "t", html: "h" };
        const link = await sendAttendanceLinkEmail({ memberId: "m1", to: "tajny@example.invalid", mail });
        const rep = await sendAttendanceReportEmail({ memberId: "m2", to: "tajny@example.invalid", mail });
        assert.equal(link.success, false);
        assert.equal(rep.success, false);
        assert.equal(link.resendId, undefined);
        assert.ok(logged.length === 2 && logged.every((l) => !l.includes("tajny@example.invalid")));
      } finally {
        console.error = origErr;
        if (saved !== undefined) process.env.RESEND_API_KEY = saved;
      }
    },
  },
  {
    name: "C14. T-003c soubory: bez em dash, bez e-mailu a telefonu; AdminHelp Správce docházky doslova z gate",
    run: () => {
      const files = [
        "lib/attendance/cron-plan.ts",
        "lib/attendance/report.ts",
        "lib/attendance/cron.ts",
        "lib/attendance/link-page.ts",
        "lib/auth/attendance-token-access.ts",
        "lib/auth/attendance-magic.ts",
        "lib/db/queries/attendance-close.ts",
        "lib/email/attendance.ts",
        "app/api/cron/attendance/route.ts",
        "app/api/d/[token]/route.ts",
        "app/d/layout.tsx",
        "app/d/[token]/page.tsx",
        "components/help/sections/AdminHelp.tsx",
        "vercel.json",
      ];
      for (const f of files) {
        const src = read(f);
        assert.ok(!src.includes(EM_DASH), `${f}: em dash`);
        assert.ok(!/@[a-z0-9-]+\.(cz|com|eu)\b/i.test(src), `${f}: e-mail`);
        assert.ok(!/\+?420 ?\d{3} ?\d{3} ?\d{3}/.test(src), `${f}: telefon`);
      }
      const admin = norm(read("components/help/sections/AdminHelp.tsx"));
      assert.ok(admin.includes('title="Správce docházky"'));
      assert.ok(
        admin.includes(
          "Na stránce člena v části Docházka zapněte Správce docházky. Člen pak v den založené schůzky dostane ráno před 7:00 mail s odkazem na zápis a v 17:00 report. Správce může být víc."
        )
      );
      assert.ok(admin.includes("Ranní mail chodí jen v den, kdy je v aplikaci založená schůzka."));
      assert.ok(admin.indexOf('title="Funkce a přístup"') < admin.indexOf('title="Správce docházky"'));
      assert.ok(admin.indexOf('title="Správce docházky"') < admin.indexOf('title="Kategorie"'));
      // texty z gate pro přepínač odpovídají tomu, co nápověda slibuje (ráno před 7:00)
      assert.ok(!admin.includes("v 7:00 mail"), "Z1: ne „v 7:00“");
    },
  },
  {
    name: "D1. T-003d: jméno náhradníka bez zero-width a bidi znaků (security L-3), validace na serveru",
    run: () => {
      // Odmítnout, nebo odstranit: nikdy nesmí projít neviditelný znak do uloženého jména.
      // (U+FEFF je pro JS bílý znak, `\s` ho sloučí s mezerou, jméno ze samých BOM je prázdné.)
      const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
      const bad = (raw: string) => {
        const r = validateSubstituteName(raw);
        assert.ok(r.ok ? !INVISIBLE.test(r.value) : true, JSON.stringify(raw));
        if (!r.ok) assert.ok(r.error === MEMBER_TEXTS.errNameChars || r.error === MEMBER_TEXTS.errNameEmpty, JSON.stringify(raw));
      };
      const hard = (raw: string) => {
        const r = validateSubstituteName(raw);
        assert.ok(!r.ok && r.error === MEMBER_TEXTS.errNameChars, JSON.stringify(raw));
      };
      for (const cp of [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202e, 0x2060, 0x2066, 0x2069]) {
        hard(`Jan${String.fromCodePoint(cp)}Novák`);
      }
      for (const cp of [0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2060, 0x2066, 0x2067, 0x2068, 0x2069, 0xfeff]) {
        const ch = String.fromCodePoint(cp);
        bad(`Jan${ch}Novák`);
        bad(`${ch}${ch}`);
        bad(`Jan Novák${ch}`);
      }
      assert.ok(validateSubstituteName("Jan Novák").ok);
      assert.ok(validateSubstituteName("Žofie Čermáková-Šebestová").ok);
      // jméno ze dvou nulových mezer neprojde ani přes tělo požadavku
      const body = parseWriteBody({
        op: "presence",
        memberId: "00000000-0000-4000-8000-000000000001",
        status: "substitute",
        substituteName: "\u200b\u200b",
        expectedVersion: 0,
      });
      assert.ok(!body.ok && body.error === MEMBER_TEXTS.errNameChars);
      // akce člena i zápis správce volají tutéž validaci
      assert.ok(read("actions/attendance.ts").includes("validateSubstituteName("));
      assert.ok(read("lib/attendance/sheet.ts").includes("validateSubstituteName("));
    },
  },
  {
    name: "D2. T-003d: paměť jmen má horní mez (security L-2), jeden SQL příkaz bez transakce, v obou zápisech",
    run: () => {
      assert.equal(SUBSTITUTE_NAME_MEMORY_LIMIT, 20);
      const src = stripComments(read("lib/db/queries/attendance.ts"));
      assert.equal(src.split("${trimNamesSql(memberId,").length - 1, 2, "člen i správce");
      const n = norm(src);
      assert.ok(n.includes("DELETE FROM member_substitute_name d WHERE d.member_id = ${memberId}::uuid"));
      assert.ok(n.includes("r.rn > ${SUBSTITUTE_NAME_MEMORY_LIMIT}::int - 1"));
      assert.ok(!/transaction\s*\(/.test(src));
    },
  },
  {
    name: "D3. T-003d: deaktivace člena zneplatní jeho ranní odkazy ve stejném příkazu (security L-4)",
    run: () => {
      const src = norm(stripComments(read("lib/db/queries/member-status.ts")));
      const at = src.indexOf("UPDATE attendance_link SET revoked_at = now()");
      assert.ok(at > 0, "UPDATE attendance_link v deaktivaci");
      const fn = src.indexOf("export async function deactivateMemberGuarded");
      const next = src.indexOf("export async function", fn + 10);
      assert.ok(at > fn && at < next, "uvnitř deactivateMemberGuarded");
      assert.ok(src.slice(at, at + 260).includes("member_id IN (SELECT id FROM upd)"));
      assert.ok(src.slice(at, at + 260).includes("revoked_at IS NULL"));
    },
  },
  {
    name: "D4. T-003d: ops události docházky bez jmen a počtů účasti (security L-1)",
    run: () => {
      const route = stripComments(read("app/api/attendance/[date]/route.ts"));
      const block = /kind: "attendance\.history-edited"[\s\S]*?message: "Oprava docházky\."/.exec(route);
      assert.ok(block);
      assert.ok(!/memberName|session\.name|row\.name/.test(block[0]), "history-edited bez jména");
      assert.ok(block[0].includes("memberId: row.memberId") && block[0].includes("meetingDate: date"));
      const core = stripComments(read("lib/attendance/cron.ts"));
      const fin = /kind: "attendance\.day-finalized"[\s\S]*?\}\)\);/.exec(core);
      assert.ok(fin);
      assert.ok(fin[0].includes('message: "Den uzavřen."'));
      assert.ok(!/total|present|missing|excused|viaSubstitute|\.\.\.c\b/.test(fin[0]), "day-finalized bez počtů");
      assert.ok(!/memberName/.test(fin[0]));
    },
  },
  {
    name: "D5. T-003d: gramatika reportu (1 omluvený, 2 až 4 omluvení, 5 a víc omluvených), gate texty beze změny",
    run: () => {
      assert.deepEqual([1, 2, 3, 4, 5, 8].map(excusedWord), ["omluvený", "omluvení", "omluvení", "omluvení", "omluvených", "omluvených"]);
      const mk = (excused: number, unexcused: number): ReportData => ({
        date: "2026-10-22",
        hasMeeting: true,
        mode: "recorded",
        late: false,
        members: [
          { name: "Člen A", status: "present", substituteName: null, excused: false, announcedSubstitute: false, ordinal: null },
          ...Array.from({ length: excused }, (_, i) => ({ name: `Omluven ${i}`, status: "absent" as const, substituteName: null, excused: true, announcedSubstitute: false, ordinal: 1 })),
          ...Array.from({ length: unexcused }, (_, i) => ({ name: `Neomluven ${i}`, status: "absent" as const, substituteName: null, excused: false, announcedSubstitute: false, ordinal: 1 })),
        ],
        writers: [],
        lastChange: null,
      });
      const line = (d: ReportData) => buildAttendanceReport({ data: d, recipientName: "P", url: "u" }).text.split("\n")[2];
      assert.equal(line(mk(1, 0)), "Přítomno 1 z 2. Chybí 1: 1 omluvený.");
      assert.equal(line(mk(3, 2)), "Přítomno 1 z 6. Chybí 5: 3 omluvení, 2 bez omluvy.");
      assert.equal(line(mk(5, 1)), "Přítomno 1 z 7. Chybí 6: 5 omluvených, 1 bez omluvy.");
    },
  },
  {
    name: "D6. T-003d: API 401 bez session a 403 pro přihlášeného bez práva; token ověřen před čtením těla; cron porovnává tajemství konstantním časem",
    run: () => {
      const guards = stripComments(read("lib/auth/guards.ts"));
      assert.ok(/opts\?\.splitStatus && session\.memberId\) \{\s*return \{\s*response: NextResponse\.json\(\{ error: NO_PERMISSION_MESSAGE \}, \{ status: 403 \}\)/.test(guards));
      assert.ok(/status: opts\?\.status \?\? 401/.test(guards), "výchozí 401 beze změny");
      const route = stripComments(read("app/api/attendance/[date]/route.ts"));
      assert.ok(/!session\.memberId\) return json\(\{ error: NO_PERMISSION_MESSAGE \}, 401\)/.test(route));
      assert.ok(/!canAny\(session, \["attendance\.record", "attendance\.edit_history"\]\)\) \{\s*return json\(\{ error: NO_PERMISSION_MESSAGE \}, 403\)/.test(route));
      const d = stripComments(read("app/api/d/[token]/route.ts"));
      const post = d.slice(d.indexOf("export async function POST"));
      assert.ok(post.indexOf("verifyAttendanceToken(") < post.indexOf("req.json()"), "token před tělem");
      const cron = stripComments(read("app/api/cron/attendance/route.ts"));
      assert.ok(cron.includes("timingSafeEqual(a, b)") && !cron.includes("authHeader !== "));
      assert.ok(stripComments(read("app/api/cron/close-voting/route.ts")).includes("authHeader !== `Bearer ${cronSecret}`"), "close-voting beze změny");
    },
  },
  {
    name: "D7. T-003d: migrace má smoke funkci CREATE OR REPLACE (opakovaný běh v jedné session), konflikt po cronu, panel starého dne, řazení česky",
    run: () => {
      const mig = read("scripts/migrate-iter-038-dochazka.ts");
      assert.ok(mig.includes("CREATE OR REPLACE FUNCTION pg_temp._iter038_immutable_smoke()"));
      assert.ok(!/CREATE FUNCTION pg_temp/.test(mig));
      assert.equal(conflictText(null), "Mezitím se to změnilo. Zkontroluj řádek a klikni znovu.");
      assert.ok(read("components/attendance/AbsenceCalendar.tsx").includes("decision.ok || selected < today ? null : decision.message"));
      assert.ok(read("lib/db/queries/attendance.ts").includes('a.name.localeCompare(b.name, "cs")'));
      assert.equal(MEMBER_TEXTS.closedPanel, "Na tenhle den už změnu zapíše jen správce docházky.");
    },
  },
  {
    name: "E1. T-003e (QA N1): middleware vrací 401 JSON pro /api/attendance bez session, /api/d zůstává veřejné, stránky se dál přesměrují na /login",
    run: () => {
      // raw zdroj: stávající komentář v middleware obsahuje `/*.pdf`, který by stripComments rozbil
      const mw = read("middleware.ts");
      const at = mw.indexOf("if (!session.memberId) {");
      assert.ok(at > 0);
      const branch = mw.slice(at, mw.indexOf("return response;", at));
      assert.ok(/pathname === "\/api\/attendance" \|\| pathname\.startsWith\("\/api\/attendance\/"\)/.test(branch), "jen API docházky");
      assert.ok(/NextResponse\.json\(\s*\{ error: "Na tohle nemáš oprávnění\." \},\s*\{ status: 401/.test(branch));
      // redirect na /login pro všechno ostatní zůstává ZA výjimkou
      assert.ok(branch.indexOf("status: 401") < branch.indexOf("NextResponse.redirect(loginUrl)"));
      // veřejný token odkaz včetně holého /api/d (route neexistuje, má dát 404, ne 307)
      assert.ok(mw.includes('pathname === "/api/d"') && mw.includes('pathname.startsWith("/api/d/")'));
      // veřejné cesty jsou před kontrolou session, nic dalšího se neotevřelo
      assert.ok(mw.indexOf('pathname.startsWith("/api/d/")') < at);
      assert.ok(!/api\/attendance/.test(mw.slice(0, at)), "/api/attendance není veřejné");
      // route docházky sama dál rozlišuje 401 bez session a 403 bez práva (D6)
      const route = stripComments(read("app/api/attendance/[date]/route.ts"));
      assert.ok(route.includes("splitStatus: true") && route.includes("}, 403)"));
    },
  },
  {
    name: "E2. T-003e (QA N2): odkazy na dny v přehledu člena mají cíl klepnutí aspoň 44 px",
    run: () => {
      const src = read("app/(app)/dochazka/prehled/[memberId]/page.tsx");
      const link = /<Link\s+href=\{`\/dochazka\/zapis\?d=\$\{d\.date\}`\}[\s\S]*?<\/Link>/.exec(src);
      assert.ok(link);
      assert.ok(link[0].includes("inline-flex") && link[0].includes("min-h-[44px]") && link[0].includes("items-center"));
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
