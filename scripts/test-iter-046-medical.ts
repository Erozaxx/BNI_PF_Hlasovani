/**
 * Testy iter-046, část A (medical, docházka, blokace hlasu): čisté moduly a
 * statické kontroly zdrojů. Bez DATABASE_URL, bez sítě. Číslování podle
 * arch_iter-046_T-001 kap. 13.1: 1 až 12, 15, 16 a texty z testu 35 pro C1 až
 * C4. Testy 13, 14 (docházka všech), 17 až 24 (heslo) patří části B.
 *
 * Spuštění: npm run test:iter-046-medical
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  MEDICAL_TEXTS,
  decideMedicalChange,
  isMedicalOn,
  medicalLabel,
  validateMedicalUntil,
} from "../lib/members/medical";
import { isCountedAbsence } from "../lib/attendance/rules";
import {
  ATTENDANCE_MANAGER_PERMISSIONS,
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  PERMISSIONS,
  expandFunctionPermissions,
  permissionsFor,
} from "../lib/auth/permissions";
import {
  functionGrantsSql,
  medicalPeriodAppliesSql,
  memberMedicalOnSql,
} from "../lib/db/queries/member-active";
import { absenceStatusSql, missingStatusSql } from "../lib/db/queries/absence-status";
import {
  SHEET_TEXTS,
  announcedText,
  auditLine,
  effectiveStatus,
  medicalPeriodText,
  parseWriteBody,
  type SheetRow,
} from "../lib/attendance/sheet";
import { memberMark } from "../lib/attendance/export-marks";
import { expandMedicalPeriods, planEntryMeta, scheduleDaysInRange } from "../lib/attendance/plan";
import { buildAttendanceReport, type ReportData, type ReportMember } from "../lib/attendance/report";
import { planVotingDispatch } from "../lib/meetings/voting-plan";
import { VOTE_TEXTS } from "../lib/meetings/token-error-text";
import { ABSENCE_MEDICAL_DDL, AUDIT_MEDICAL_DDL, MEMBER_MEDICAL_DDL, doBlock, smokeDdl } from "../lib/members/medical-ddl";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
type TestCase = { name: string; run: () => void | Promise<void> };
const tests: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => tests.push({ name, run });

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const dialect = new PgDialect();
const render = (q: ReturnType<typeof sql>) => dialect.sqlToQuery(q).sql;

const UUID_A = "11111111-1111-4111-8111-111111111111";

test("1. isMedicalOn: před from, from, uprostřed, until, den po, null hodnoty", () => {
  const m = { medicalFrom: "2026-11-10", medicalUntil: "2026-11-20" };
  assert.equal(isMedicalOn(m, "2026-11-09"), false);
  assert.equal(isMedicalOn(m, "2026-11-10"), true);
  assert.equal(isMedicalOn(m, "2026-11-15"), true);
  assert.equal(isMedicalOn(m, "2026-11-20"), true);
  assert.equal(isMedicalOn(m, "2026-11-21"), false);
  assert.equal(isMedicalOn({ medicalFrom: null, medicalUntil: null }, "2026-11-15"), false);
  assert.equal(isMedicalOn({ medicalFrom: "2026-11-10", medicalUntil: null }, "2026-11-15"), false);
  assert.equal(medicalLabel(m, "2026-11-15"), "medical do 20. 11.");
  assert.equal(medicalLabel(m, "2026-11-21"), null);
});

test("2. validateMedicalUntil: dnešek ok, včera chyba, +365 ok, +366 chyba, neplatné datum, ne-řetězec", () => {
  const today = "2026-11-15";
  assert.deepEqual(validateMedicalUntil("2026-11-15", today), { ok: true, value: "2026-11-15" });
  const past = validateMedicalUntil("2026-11-14", today);
  assert.ok(!past.ok && past.error === MEDICAL_TEXTS.pastDate);
  assert.equal(validateMedicalUntil("2027-11-15", today).ok, true);
  const far = validateMedicalUntil("2027-11-16", today);
  assert.ok(!far.ok && far.error === MEDICAL_TEXTS.tooFar);
  assert.equal(validateMedicalUntil("2026-02-31", today).ok, false);
  assert.equal(validateMedicalUntil(20261120, today).ok, false);
  assert.equal(validateMedicalUntil(null, today).ok, false);
});

test("3. decideMedicalChange: pořadí důvodů (právo, sebe, nenalezen, admin cíl, datum)", () => {
  const base = { actorId: UUID_A, hasPermission: true, actorIsAdmin: false, today: "2026-11-15" };
  const t = { id: "22222222-2222-4222-8222-222222222222", isAdmin: false };
  const r = (o: Partial<Parameters<typeof decideMedicalChange>[0]>) => {
    const d = decideMedicalChange({ ...base, target: t, until: "2026-11-20", ...o });
    return d.ok ? "ok" : d.reason;
  };
  assert.equal(r({}), "ok");
  assert.equal(r({ hasPermission: false, target: { id: UUID_A, isAdmin: false } }), "no-permission");
  assert.equal(r({ target: { id: UUID_A, isAdmin: false } }), "self");
  assert.equal(r({ target: null }), "not-found");
  assert.equal(r({ target: { ...t, isAdmin: true } }), "admin-target");
  assert.equal(r({ target: { ...t, isAdmin: true }, actorIsAdmin: true }), "ok");
  assert.equal(r({ until: "2026-11-01" }), "invalid-date");
  assert.equal(r({ until: undefined }), "ok", "zrušení datum nekontroluje");
});

test("4. isCountedAbsence: absent a unexcused bez medical ano, s medical ne, present a substitute ne", () => {
  assert.equal(isCountedAbsence({ status: "absent", medical: false }), true);
  assert.equal(isCountedAbsence({ status: "unexcused", medical: false }), true);
  assert.equal(isCountedAbsence({ status: "absent", medical: true }), false);
  assert.equal(isCountedAbsence({ status: "unexcused", medical: true }), false);
  assert.equal(isCountedAbsence({ status: "present", medical: false }), false);
  assert.equal(isCountedAbsence({ status: "substitute", medical: false }), false);
  assert.equal(isCountedAbsence({ status: null, medical: false }), false);
  // společný test s SQL: absenceStatusSql vylučuje medical omluvu, missingStatusSql ne
  const a = render(absenceStatusSql("r"));
  assert.ok(a.includes("'absent', 'unexcused'") && a.includes("mma.medical") && a.includes("NOT EXISTS"));
  const m = render(missingStatusSql("r"));
  assert.ok(m.includes("'absent', 'unexcused'") && !m.includes("medical"));
});

test("5. práva: members.medical v katalogu a výchozí sadě funkce, ne v moderátorovi ani u správce docházky", () => {
  assert.ok((PERMISSIONS as readonly string[]).includes("members.medical"));
  assert.ok(expandFunctionPermissions(null).includes("members.medical"));
  assert.ok(expandFunctionPermissions(["admin-delegable"]).includes("members.medical"));
  assert.ok(!expandFunctionPermissions(["guests.manage"]).includes("members.medical"));
  assert.ok(DEFAULT_FUNCTION_PERMISSIONS.includes("members.medical"));
  assert.ok(!MODERATOR_ROLE_PERMISSIONS.includes("members.medical"));
  assert.ok(!ATTENDANCE_MANAGER_PERMISSIONS.includes("members.medical"));
  const fn = [{ name: "Člen výboru", permissions: null }];
  const link = permissionsFor({ authMethod: "magic_link", managementRole: null, functions: fn, attendanceManager: false });
  assert.equal(link.size, 0, "odkazem práva nejsou ani s funkcí");
  const pw = permissionsFor({ authMethod: "password", managementRole: null, functions: fn, attendanceManager: false });
  assert.ok(pw.has("members.medical"));
  const mod = permissionsFor({ authMethod: "password", managementRole: "moderator", functions: [], attendanceManager: false });
  assert.ok(!mod.has("members.medical"));
  const mgr = permissionsFor({ authMethod: "magic_link", managementRole: null, functions: [], attendanceManager: true });
  assert.ok(!mgr.has("members.medical"));
  const adm = permissionsFor({ authMethod: "password", managementRole: "admin", functions: [], attendanceManager: false });
  assert.ok(adm.has("members.medical"));
});

test("6. functionGrantsSql(members.medical) renderuje větev IS NULL (výchozí sada) a značku", () => {
  const r = render(functionGrantsSql(sql`cf.permissions`, "members.medical"));
  assert.ok(r.includes("cf.permissions IS NULL OR"), r);
  const other = render(functionGrantsSql(sql`cf.permissions`, "chapter.settings"));
  assert.ok(!other.includes("IS NULL OR"));
});

test("7. parseWriteBody op medical: platný, chybí medical, ne-boolean, špatné uuid", () => {
  const ok = parseWriteBody({ op: "medical", memberId: UUID_A, medical: true });
  assert.ok(ok.ok && ok.value.op === "medical" && ok.value.medical === true);
  assert.equal(parseWriteBody({ op: "medical", memberId: UUID_A }).ok, false);
  assert.equal(parseWriteBody({ op: "medical", memberId: UUID_A, medical: "ano" }).ok, false);
  assert.equal(parseWriteBody({ op: "medical", memberId: "x", medical: true }).ok, false);
  // starší operace beze změny
  assert.equal(parseWriteBody({ op: "excuse", memberId: UUID_A, excused: true }).ok, true);
});

const row = (p: Partial<SheetRow>): SheetRow => ({
  memberId: UUID_A,
  name: "Test",
  status: null,
  substituteName: null,
  version: 0,
  updatedById: null,
  updatedByName: null,
  updatedAt: null,
  excused: false,
  medical: false,
  medicalPeriodUntil: null,
  announcedName: null,
  names: [],
  ...p,
});

test("8. M3 tisk: medical řádek je omluva, v poznámce a jménu není slovo medical", () => {
  const r = row({ excused: true, medical: true, medicalPeriodUntil: "2026-11-20", announcedName: null });
  assert.equal(effectiveStatus(r), "absent");
  const mark = memberMark(r, "Člen Test");
  assert.equal(mark.kind, "excused");
  assert.equal(mark.note, "Omluven(a)");
  assert.ok(!/medical/i.test(JSON.stringify(mark)));
  const exp = read("app/api/meetings/[id]/export-list/route.ts");
  assert.ok(exp.includes("listSheetRows("), "export čte řádky přes listSheetRows");
  assert.ok(!/medical/i.test(read("lib/attendance/export-marks.ts")), "export-marks medical nezná");
  assert.ok(!/medical/i.test(stripComments(exp)), "route medical nezná");
});

test("9. announcedText: medical varianta jen u omluvy bez náhradníka bez zápisu nebo s absent", () => {
  const t = SHEET_TEXTS.medicalAnnounced;
  assert.equal(announcedText({ excused: true, medical: true, announcedName: null, status: null }), t);
  assert.equal(announcedText({ excused: true, medical: true, announcedName: null, status: "absent" }), t);
  assert.notEqual(announcedText({ excused: true, medical: false, announcedName: null, status: null }), t);
  assert.notEqual(announcedText({ excused: true, medical: true, announcedName: "Jan Test", status: null }), t);
  assert.equal(medicalPeriodText("2026-11-30"), "Medical do 30. 11., nastavuje se v menu Členové.");
  const line = auditLine({
    id: "1", at: "2026-11-15T10:00:00.000Z", actorName: "A", memberName: "B", date: "2026-11-10",
    field: "medical", oldValue: "ne", newValue: "ano",
  });
  assert.ok(line.includes("Medical: ne → Medical: ano"), line);
});

test("10. expandMedicalPeriods: jen schůzkové dny v období, vlastní omluva má přednost, mimo rozsah nic", () => {
  const periods = [{ memberId: UUID_A, name: "Test", medicalFrom: "2026-11-10", medicalUntil: "2026-11-24" }];
  // čtvrtky 12., 19. a 26. 11. 2026
  const days = scheduleDaysInRange("2026-11-01", "2026-11-30", 4, ["2026-11-17"]);
  assert.deepEqual(days, ["2026-11-05", "2026-11-12", "2026-11-17", "2026-11-19", "2026-11-26"]);
  const out = expandMedicalPeriods(periods, days, "2026-11-01", "2026-11-30", []);
  assert.deepEqual(out.map((e) => e.date), ["2026-11-12", "2026-11-17", "2026-11-19"]);
  assert.ok(out.every((e) => e.medical === true && e.substituteName === null && e.announcedOn === "2026-11-10"));
  const own = expandMedicalPeriods(periods, days, "2026-11-01", "2026-11-30", [{ date: "2026-11-12", memberId: UUID_A }]);
  assert.deepEqual(own.map((e) => e.date), ["2026-11-17", "2026-11-19"]);
  assert.deepEqual(expandMedicalPeriods(periods, days, "2026-12-01", "2026-12-31", []), []);
  assert.equal(planEntryMeta({ announcedOn: "2026-11-10", medical: true }, "2026-11-15"), "medical");
  assert.equal(planEntryMeta({ announcedOn: "2026-11-10" }, "2026-11-15"), "omluveno 10. 11.");
});

const rm = (p: Partial<ReportMember>): ReportMember => ({
  name: "Test",
  status: "absent",
  substituteName: null,
  excused: true,
  announcedSubstitute: false,
  ordinal: null,
  ...p,
});

test("11. report: medical je v Omluvení s příponou (medical), bez pořadí absence", () => {
  const data: ReportData = {
    date: "2026-11-12",
    hasMeeting: true,
    mode: "recorded",
    late: false,
    members: [
      rm({ name: "Alena", medical: true, ordinal: 3 }),
      rm({ name: "Bedřich", ordinal: 2 }),
      rm({ name: "Cyril", status: "present", excused: false }),
    ],
    writers: [],
    lastChange: null,
  };
  const mail = buildAttendanceReport({ data, recipientName: "X", url: "https://example.test/dochazka" });
  assert.ok(mail.text.includes("Alena (medical)"), mail.text);
  assert.ok(!mail.text.includes("Alena (3. absence"), "medical pořadí nedostane");
  assert.ok(mail.text.includes("Bedřich (2. absence za 6 měsíců)"));
});

test("11b. report nezapsaného dne: medical omluva je „Jméno (medical)“ bez pořadí, ostatní beze změny", () => {
  const data: ReportData = {
    date: "2026-11-12",
    hasMeeting: true,
    mode: "unrecorded",
    late: false,
    members: [
      rm({ name: "Alena", medical: true, ordinal: 3 }),
      rm({ name: "Bedřich", ordinal: 2 }),
    ],
    writers: [],
    lastChange: null,
  };
  const mail = buildAttendanceReport({ data, recipientName: "X", url: "https://example.test/dochazka" });
  assert.ok(mail.text.includes("  Alena (medical)"), mail.text);
  assert.ok(!mail.text.includes("Alena (3. absence"), "medical pořadí nedostane");
  assert.ok(mail.html.includes("Alena (medical)") && !mail.html.includes("3. absence"), mail.html);
  assert.ok(mail.text.includes("Bedřich (2. absence za 6 měsíců)"));
});

test("12. planVotingDispatch: medical = skip medical po inactive a před no-email, nepočítá se do willSend ani do Y", () => {
  const mk = (id: string, p: Partial<{ email: string | null; active: boolean; medical: boolean }> = {}) => ({
    memberId: id,
    memberName: id,
    memberEmail: p.email === undefined ? `${id}@example.test` : p.email,
    active: p.active ?? true,
    medical: p.medical,
  });
  const plan = planVotingDispatch({
    members: [
      mk("a"),
      mk("b", { medical: true }),
      mk("c", { medical: true, email: null }),
      mk("d", { medical: true, active: false }),
    ],
    links: [],
    mode: "start",
  });
  const reason = (id: string) => {
    const r = plan.rows.find((x) => x.memberId === id)!;
    return r.action.kind === "skip" ? r.action.reason : "send";
  };
  assert.equal(reason("a"), "send");
  assert.equal(reason("b"), "medical");
  assert.equal(reason("c"), "medical", "medical před no-email");
  assert.equal(reason("d"), "inactive", "inactive před medical");
  assert.equal(plan.counts.willSend, 1);
  assert.equal(plan.counts.skippedMedical, 2);
  assert.equal(plan.counts.totalMembers, 1);
  assert.deepEqual(plan.linksToCreate, ["a"]);
  // bez příznaku medical se chová jako dřív
  const old = planVotingDispatch({ members: [{ memberId: "x", memberName: "x", memberEmail: "x@example.test", active: true }], links: [], mode: "start" });
  assert.equal(old.counts.willSend, 1);
});

test("15. statický: souhrn dne jde přes missingStatusSql; holé status IN ('absent', 'unexcused') je jen v absence-status.ts a palms.ts", () => {
  const att = stripComments(read("lib/db/queries/attendance.ts"));
  const closed = att.slice(att.indexOf("export async function listClosedDays"), att.indexOf("export interface MemberDayRow"));
  assert.ok(closed.includes('missingStatusSql("r")') && !closed.includes("absenceStatusSql"));
  const walk = (dir: string): string[] =>
    readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : []
    );
  for (const f of walk("lib")) {
    if (f.endsWith("absence-status.ts") || f.endsWith("palms.ts")) continue;
    const src = stripComments(read(f));
    assert.ok(!/status\s+IN\s*\(\s*'absent'\s*,\s*'unexcused'\s*\)/.test(src), `${f}: holé počítání absencí`);
  }
  const detail = read("app/(app)/dochazka/prehled/[memberId]/page.tsx");
  assert.ok(detail.includes("isCountedAbsence(d)"));
});

test("16. statický: tři cesty hlasu volají kontrolu medical (memberMayVoteNow, isEventParticipantAllowedToVote)", () => {
  const v1 = stripComments(read("app/api/m/[token]/vote/route.ts"));
  assert.ok(v1.includes("memberMayVoteNow(memberId)"));
  assert.ok(v1.indexOf("memberMayVoteNow") < v1.indexOf(".insert(vote)"), "kontrola před zápisem");
  const v2 = stripComments(read("actions/votes.ts"));
  assert.ok(v2.includes("memberMayVoteNow(auth.session.memberId)"));
  assert.ok(v2.indexOf("memberMayVoteNow") < v2.indexOf("dbCastVote("), "kontrola před zápisem");
  const v3 = stripComments(read("actions/events.ts"));
  const fn = v3.slice(v3.indexOf("export async function castVoteAction"));
  assert.ok(fn.includes("isEventParticipantAllowedToVote(participantId)"));
  assert.ok(fn.indexOf("isEventParticipantAllowedToVote") < fn.indexOf("castVote(participantId"), "kontrola před zápisem");
  // jiná cesta, která by zapisovala hlas, nevznikla
  // iter-046 (F-07): V1 a V2 berou text z voteBlockedText (neaktivní bez medical), V3 přímo
  for (const f of ["app/api/m/[token]/vote/route.ts", "actions/votes.ts"]) {
    assert.ok(read(f).includes("voteBlockedText("), f);
  }
  assert.ok(read("actions/events.ts").includes("VOTE_TEXTS.medical"));
  assert.ok(read("lib/db/queries/member-medical.ts").includes("VOTE_TEXTS.medical"));
  const events = stripComments(read("lib/db/queries/events.ts"));
  assert.ok(events.includes("export async function isEventParticipantAllowed("), "přidání možnosti beze změny");
  const memberMedical = stripComments(read("lib/db/queries/member-medical.ts"));
  assert.ok(/ok === true/.test(memberMedical), "memberMayVoteNow je fail closed");
});

test("16b. statický: odkazy a připomínky medical členovi neodcházejí, ruční poslání a obnovení vrací 409", () => {
  for (const f of ["lib/meetings/voting-dispatch.ts", "app/api/cron/close-voting/route.ts"]) {
    assert.ok(read(f).includes("isMedicalOn("), f);
  }
  assert.ok(read("lib/meetings/reminder-run.ts").includes("isMedicalOn("));
  for (const f of [
    "app/api/meetings/[id]/member-links/[memberId]/send-email/route.ts",
    "app/api/meetings/[id]/member-links/[memberId]/regenerate/route.ts",
  ]) {
    const s = read(f);
    assert.ok(s.includes("isMedicalOn(memberData") && s.includes("VOTE_TEXTS.linkMedical") && s.includes("VOTE_TEXTS.linkExcused") && s.includes("409"), f);
  }
  assert.ok(read("app/api/meetings/[id]/member-links/route.ts").includes("isMedical"));
  assert.ok(read("app/(app)/meetings/[id]/MemberLinksManager.tsx").includes("isMedical"));
  assert.ok(read("app/api/m/[token]/meeting/route.ts").includes("voteBlocked"));
});

test("16c. statický: krok 0 uzávěrky běží před doplněním řádků a před uzavřením dne; Medical v zápisu chce members.medical", () => {
  const cron = stripComments(read("lib/attendance/cron.ts"));
  const i = cron.indexOf("await materializeMedical(date)");
  assert.ok(i > 0);
  assert.ok(i < cron.indexOf("await fillDayRows(date, mode)"));
  assert.ok(i < cron.indexOf("await markDayFinalized("));
  const route = stripComments(read("app/api/attendance/[date]/route.ts"));
  assert.ok(/body\.op === "medical" && !hasPermission\(session, "members\.medical"\)/.test(route));
  const d = stripComments(read("app/api/d/[token]/route.ts"));
  assert.ok(d.includes('body.op === "medical"'), "ranní odkaz medical neumí");
  const att = stripComments(read("lib/db/queries/attendance.ts"));
  assert.ok(att.includes("memberMedicalOnSql(\"em\""), "excuse_ok zná medical z období");
  assert.ok(att.includes("medicalPeriodAppliesSql(\"m\""), "listSheetRows používá jednu podmínku období");
  assert.ok(stripComments(read("lib/db/queries/attendance-close.ts")).includes("medicalPeriodAppliesSql"));
});

test("16d. SQL: medicalPeriodAppliesSql a memberMedicalOnSql mají přesný tvar (alias z literálu, den jako parametr)", () => {
  const on = render(memberMedicalOnSql("m", sql`${"2026-11-15"}::date`));
  assert.ok(on.includes("m.medical_until IS NOT NULL") && on.includes("BETWEEN m.medical_from AND m.medical_until"));
  const ap = render(medicalPeriodAppliesSql("m", sql`${"2026-11-15"}::date`));
  for (const part of ["'present', 'substitute', 'unexcused'", "substitute_name IS NOT NULL", "NOT EXISTS"]) {
    assert.ok(ap.includes(part), part);
  }
});

test("16e. DDL: doBlock bez interpolace, lock_timeout doslova, tři bloky a smoke test na dočasných tabulkách (LL-006)", () => {
  for (const body of [MEMBER_MEDICAL_DDL, ABSENCE_MEDICAL_DDL, AUDIT_MEDICAL_DDL]) {
    const b = doBlock(body);
    assert.ok(b.includes("PERFORM set_config('lock_timeout', '5s', true);"));
    assert.ok(!b.includes("${"), "žádná JS interpolace");
    assert.equal((b.match(/\$\$/g) ?? []).length, 2);
  }
  assert.throws(() => doBlock("SELECT $$x$$"));
  const smoke = smokeDdl();
  assert.ok(smoke.includes("CREATE TEMPORARY TABLE _iter046_member_smoke"));
  assert.ok(!/\bALTER TABLE member\b/.test(smoke) && !/\bALTER TABLE member_absence\b/.test(smoke));
  const mig = stripComments(read("scripts/migrate-iter-046-medical.ts"));
  assert.ok(!/db\.transaction|\.transaction\(/.test(mig), "LL-003");
  assert.ok(mig.includes("EXPECT_DB_HOST"));
  assert.ok(!/DO \$\$[^`]*\$\{/.test(mig), "žádná interpolace v DO $$");
});

test("35a. texty části A bez em dash a bez jmen (medical, hlasování, zápis)", () => {
  const strings: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
  };
  for (const [k, v] of Object.entries(MEDICAL_TEXTS)) {
    if (typeof v === "function") push(v("2026-11-30"));
    else push(v);
    void k;
  }
  for (const v of Object.values(VOTE_TEXTS)) push(v);
  for (const k of ["medical", "errNoMedical", "errNoExcuseForMedical", "medicalAnnounced"] as const) push(SHEET_TEXTS[k]);
  push(medicalPeriodText("2026-11-30"));
  assert.ok(strings.length > 15);
  for (const s of strings) assert.ok(!s.includes(EM_DASH), s);
  const files = [
    "lib/members/medical.ts",
    "lib/members/medical-ddl.ts",
    "lib/db/queries/member-medical.ts",
    "actions/member-medical.ts",
    "app/(app)/admin/members/MedicalControls.tsx",
    "app/(app)/admin/members/MedicalList.tsx",
    "scripts/migrate-iter-046-medical.ts",
    "scripts/test-iter-046-medical.ts",
    "scripts/test-iter-046-sql.ts",
  ];
  for (const f of files) {
    const s = read(f);
    assert.ok(!s.includes(EM_DASH), `${f}: em dash`);
    assert.ok(!/[\w.]+@[\w-]+\.\w{2,}/.test(s.replace(/@example\.test|@\/|@electric|@neondatabase/g, "")), `${f}: e-mail`);
  }
});

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
