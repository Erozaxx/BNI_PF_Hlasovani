/**
 * Testy iter-046, část B (heslo pro každého člena, docházka všech): čisté
 * moduly a statické kontroly zdrojů. Bez DATABASE_URL, bez sítě. Číslování
 * podle arch_iter-046_T-001 kap. 13.2 (17 až 24), 13 a 14 (pohled na den),
 * gate změny 2 a 3 (kontrolní mail, seznam bez e-mailů) a texty z testu 35
 * pro část B. SQL protějšky (30, 31, 34) jsou v test-iter-046-sql.ts.
 *
 * Spuštění: npm run test:iter-046-heslo
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  decideOwnPasswordMode,
  decidePasswordReset,
  hasPasswordSession,
  permissionsFor,
  type MemberFunctionInfo,
} from "../lib/auth/permissions";
import { checkSession, type SessionCookieState } from "../lib/auth/session-check";
import {
  THROTTLE_LIMITS,
  LOGIN_TEXTS,
  PASSWORD_NOTICE_TEXTS,
  PASSWORD_TEXTS,
  passwordChangeThrottleRule,
  planLoginStart,
  findBlockedRule,
} from "../lib/auth/login-link-core";
import {
  buildPublicCounts,
  buildPublicDay,
  neighbourMeetingDays,
  pickMembersViewDate,
  publicDayLabel,
} from "../lib/attendance/members-day";
import { VOTE_TEXTS, redactMedicalOutcome } from "../lib/meetings/token-error-text";
import { MEMBERS_VIEW_TEXTS } from "../lib/attendance/texts";
import { HELP_ATTENDANCE_MEMBERS, HELP_PASSWORD_LOGIN } from "../components/help/help-texts";

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
/** Tělo `export [async] function name` až po další `export` na začátku řádku. */
function declaration(src: string, name: string): string {
  const m = new RegExp(`export (?:async )?function ${name}\\b`).exec(src);
  assert.ok(m, `chybí funkce ${name}`);
  const rest = src.slice(m.index + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
}

const TODAY = "2026-11-15";
const FN_DEFAULT: MemberFunctionInfo = { name: "Člen výboru", permissions: null };

// 17
test("17. checkSession: heslo bez role a funkce platí, role v cookie jiná než v DB role-mismatch, sv neshoda version-mismatch", () => {
  const c: SessionCookieState = { memberId: "m1", managementRole: null, authMethod: "password", sv: 2 };
  assert.deepEqual(checkSession(c, { sessionVersion: 2, managementRole: null }, TODAY), { valid: true });
  assert.deepEqual(checkSession(c, { sessionVersion: 2, managementRole: null, hasFunction: false }, TODAY), { valid: true });
  const withRole: SessionCookieState = { ...c, managementRole: "admin" };
  assert.deepEqual(checkSession(withRole, { sessionVersion: 2, managementRole: null }, TODAY), {
    valid: false,
    reason: "role-mismatch",
  });
  assert.deepEqual(checkSession(c, { sessionVersion: 3, managementRole: null }, TODAY), {
    valid: false,
    reason: "version-mismatch",
  });
  assert.ok(!stripComments(read("lib/auth/session-check.ts")).includes("no-password-access"));
});

// 18
test("18. matice práv 8.1: běžný člen s heslem má stejná práva jako s odkazem, vedení tabulkově", () => {
  type Who = {
    name: string;
    role: "admin" | "moderator" | null;
    functions: MemberFunctionInfo[];
    manager: boolean;
  };
  const MANAGER_RIGHTS = ["attendance.audit_view", "attendance.internal_manage", "attendance.record", "attendance.view_all"];
  const people: Who[] = [
    { name: "běžný člen", role: null, functions: [], manager: false },
    { name: "běžný člen se Správcem docházky", role: null, functions: [], manager: true },
  ];
  for (const w of people) {
    const link = [...permissionsFor({ authMethod: "email_link", managementRole: w.role, functions: w.functions, attendanceManager: w.manager })].sort();
    const pw = [...permissionsFor({ authMethod: "password", managementRole: w.role, functions: w.functions, attendanceManager: w.manager })].sort();
    const magic = [...permissionsFor({ authMethod: "magic_link", managementRole: w.role, functions: w.functions, attendanceManager: w.manager })].sort();
    assert.deepEqual(pw, link, `${w.name}: heslo = odkaz`);
    assert.deepEqual(magic, link, `${w.name}: osobní odkaz = odkaz`);
    assert.deepEqual(pw, w.manager ? MANAGER_RIGHTS : [], w.name);
  }
  // vedení: odkaz nedá nic (kromě příznaku správce), heslo dá práva role a funkce
  const committeeLink = permissionsFor({ authMethod: "email_link", managementRole: null, functions: [FN_DEFAULT], attendanceManager: false });
  assert.equal(committeeLink.size, 0, "Člen výboru přihlášený odkazem: prázdná množina");
  const committeePw = permissionsFor({ authMethod: "password", managementRole: null, functions: [FN_DEFAULT], attendanceManager: false });
  assert.ok(committeePw.has("members.medical") && committeePw.has("access.password_reset"));
  const modPw = permissionsFor({ authMethod: "password", managementRole: "moderator", functions: [], attendanceManager: false });
  assert.ok(!modPw.has("members.medical") && modPw.has("access.password_reset"));
  const adminPw = permissionsFor({ authMethod: "password", managementRole: "admin", functions: [], attendanceManager: false });
  assert.ok(adminPw.has("members.medical") && adminPw.has("access.manage"));
  assert.equal(permissionsFor({ authMethod: "email_link", managementRole: null, functions: [], attendanceManager: false }).size, 0);
});

// 19
test("19. planLoginStart: člen s hashem password, bez hashe link, blokace blocked", () => {
  const rule = { key: "login-start-ip:1.2.3.4", max: 20, scope: "ip" as const };
  assert.equal(planLoginStart({ blocked: null, member: { email: "a@b.cz", managementRole: null, passwordHash: "h" } }).next, "password");
  assert.equal(planLoginStart({ blocked: null, member: { email: "a@b.cz", managementRole: null, passwordHash: null } }).next, "link");
  assert.equal(planLoginStart({ blocked: null, member: null }).next, "link");
  assert.equal(planLoginStart({ blocked: rule, member: { email: "a@b.cz", managementRole: null, passwordHash: "h" } }).next, "blocked");
});

// 20
test("20. decideOwnPasswordMode: čtyři kombinace hasRealPassword a leadership", () => {
  assert.equal(decideOwnPasswordMode({ hasRealPassword: false, hasHash: false, leadership: false }), "set");
  assert.equal(decideOwnPasswordMode({ hasRealPassword: true, hasHash: true, leadership: false }), "change");
  assert.equal(decideOwnPasswordMode({ hasRealPassword: false, hasHash: false, leadership: true }), "via-link");
  assert.equal(decideOwnPasswordMode({ hasRealPassword: true, hasHash: true, leadership: true }), "change");
  // iter-046 (M-1): zámkový hash po resetu = běžný člen set nemá, jen odkaz z mailu
  assert.equal(decideOwnPasswordMode({ hasRealPassword: false, hasHash: true, leadership: false }), "via-link");
});

// 21
test("21. decidePasswordReset: běžný člen s e-mailem ok, bez e-mailu no-email, sebe, admin jen adminem", () => {
  const base = { actorId: "a", actorIsAdmin: false, actorMayReset: true };
  assert.deepEqual(decidePasswordReset({ ...base, target: { id: "t", managementRole: null, hasEmail: true } }), { ok: true });
  assert.deepEqual(decidePasswordReset({ ...base, target: { id: "t", managementRole: null, hasEmail: false } }), { ok: false, reason: "no-email" });
  assert.deepEqual(decidePasswordReset({ ...base, target: { id: "a", managementRole: null, hasEmail: true } }), { ok: false, reason: "self" });
  assert.deepEqual(decidePasswordReset({ ...base, target: { id: "t", managementRole: "admin", hasEmail: true } }), { ok: false, reason: "admin-target" });
  assert.deepEqual(decidePasswordReset({ ...base, actorIsAdmin: true, target: { id: "t", managementRole: "admin", hasEmail: true } }), { ok: true });
  assert.deepEqual(decidePasswordReset({ ...base, actorMayReset: false, target: { id: "t", managementRole: null, hasEmail: true } }), { ok: false, reason: "no-permission" });
  assert.deepEqual(decidePasswordReset({ ...base, target: null }), { ok: false, reason: "not-found" });
});

// 22
test("22. hasPasswordSession: session heslem běžného člena je false (nápověda vedení se neukáže)", () => {
  assert.equal(hasPasswordSession({ authMethod: "password", managementRole: null, functionNames: [] }), false);
  assert.equal(hasPasswordSession({ authMethod: "password", managementRole: null, functionNames: ["Člen výboru"] }), true);
  assert.equal(hasPasswordSession({ authMethod: "password", managementRole: "moderator", functionNames: [] }), true);
  assert.ok(read("app/(app)/help/page.tsx").includes("showLeadershipHelp={hasPasswordSession(session)}"));
});

// 23
test("23. statika: settings bez passwordSession, changePasswordAction: throttle před compare, režim přes decideOwnPasswordMode", () => {
  const page = stripComments(read("app/(app)/settings/page.tsx"));
  assert.ok(!page.includes("passwordSession"), "settings nechce session s heslem");
  assert.ok(page.includes("requirePageSession()") && page.includes("session.passwordMode"));
  const body = stripComments(declaration(read("actions/auth.ts"), "changePasswordAction"));
  assert.ok(body.includes("requireAuth()") && !body.includes("requirePasswordSession("));
  assert.ok(body.includes("decideOwnPasswordMode("));
  assert.ok(body.indexOf("throttleHit(") >= 0 && body.indexOf("throttleHit(") < body.indexOf("compare(currentPassword"), "throttle před compare");
  assert.ok(body.includes('mode === "via-link"') && body.includes("PASSWORD_TEXTS.viaLinkError"));
  // throttle: 10 za okno, klíč podle člena, blokace nad limit
  const rule = passwordChangeThrottleRule("m1");
  assert.equal(rule.key, "pw-change:m1");
  assert.equal(findBlockedRule([rule], [{ key: rule.key, count: 10 }]), null);
  assert.notEqual(findBlockedRule([rule], [{ key: rule.key, count: 11 }]), null);
  // `requirePasswordSession` zůstává pro nastavení chapteru
  assert.ok(read("actions/chapter-settings.ts").includes("requirePasswordSession"));
});

// 24
test("24. statika: createSession neukládá passwordMode do cookie (vzor testu 9e z iter-037)", () => {
  const session = stripComments(read("lib/auth/session.ts"));
  const create = session.slice(session.indexOf("export async function createSession"));
  assert.ok(!create.includes("passwordMode") && !create.includes("permissions"));
  assert.ok(/NewSession = Omit<SessionData, "sv" \| "permissions" \| "functionNames" \| "passwordMode">/.test(session));
  assert.ok(session.includes("decideOwnPasswordMode("), "getSession počítá režim z DB");
});

// R6 (gate změna 2)
test("R6. kontrolní mail po nastavení i změně hesla: až po zápisu, selhání uložení nezastaví, log bez adresy, znění z gate", () => {
  const body = stripComments(declaration(read("actions/auth.ts"), "changePasswordAction"));
  const iWrite = body.indexOf("setOwnPasswordGuarded(");
  const iMail = body.indexOf("sendPasswordChangedNoticeEmail(");
  const iSession = body.indexOf("createSession");
  assert.ok(iWrite > 0 && iMail > iWrite, "mail až po zápisu hesla");
  assert.ok(iSession > iWrite, "session po zápisu");
  assert.ok(iMail < iSession, "L-2: mail před createSession, výjimka v cookie ho nespolkne");
  // jedno volání mimo větev režimu: odchází z `set` i `change`
  assert.equal((body.match(/sendPasswordChangedNoticeEmail\(/g) ?? []).length, 1);
  assert.ok(iMail > body.indexOf('mode: "change"'), "mail je za větví change, platí pro oba režimy");
  const afterMail = body.slice(iMail - 200, iMail + 700);
  assert.ok(/try \{[\s\S]*sendPasswordChangedNoticeEmail[\s\S]*\} catch/.test(afterMail), "selhání mailu je v try/catch");
  assert.ok(body.indexOf("return { success: true }") > iMail, "po mailu vždy success");
  const logs = body.match(/console\.error\([^)]*\)/g) ?? [];
  for (const l of logs) assert.ok(!/email|\.to\b/i.test(l.replace(/notice mail|mail neodešel/g, "")), `log bez adresy: ${l}`);
  // znění přesně z gate
  assert.equal(PASSWORD_NOTICE_TEXTS.subject, "BNI Plzeň: heslo je nastavené");
  assert.deepEqual([...PASSWORD_NOTICE_TEXTS.lines], [
    "K tvému účtu v aplikaci si právě někdo nastavil heslo. Když jsi to byl(a) ty, nic nedělej. Když ne, napiš hned někomu z vedení, heslo ti zruší.",
  ]);
  // mail bez hesla a bez odkazu
  const mail = declaration(read("lib/email/resend.ts"), "sendPasswordChangedNoticeEmail");
  assert.ok(mail.includes("url: null") && !/password\b/i.test(mail.replace(/Password(Changed|NoticeEmail|_NOTICE)/g, "")));
});

// R9 (gate změna 3)
test("R9. seznam pro reset bez e-mailů: typ řádku nemá klíč email, stránka e-mail nemapuje, potvrzení se jménem, štítek a zámek", () => {
  const list = read("app/(app)/admin/members/LeadershipPasswordList.tsx");
  const iface = list.slice(list.indexOf("export interface LeadershipRow"), list.indexOf("\n}\n", list.indexOf("export interface LeadershipRow")));
  assert.ok(iface.includes("hasEmail: boolean"));
  assert.ok(!/^\s*email\??:/m.test(iface), "typ řádku nemá klíč email");
  const page = read("app/(app)/admin/members/page.tsx");
  const branch = stripComments(page.slice(page.indexOf('if (!can(session, "members.manage"))'), page.indexOf("<LeadershipPasswordList")));
  assert.ok(!/\bm\.email\b[^?]/.test(branch.replace(/Boolean\(m\.email\?\.trim\(\)\)/g, "")), "zúžený pohled nemapuje m.email do props");
  assert.ok(branch.includes("hasEmail: Boolean(m.email?.trim())"));
  assert.ok(!branch.includes("managementRole !== null || functions.has"), "seznam obsahuje všechny členy");
  assert.ok(list.includes("email={null}") && list.includes("hasEmail={r.hasEmail}"));
  assert.ok(list.includes("PASSWORD_TEXTS.noEmailBadge"));
  const controls = read("app/(app)/admin/members/PasswordResetControls.tsx");
  assert.ok(controls.includes("PASSWORD_TEXTS.confirmReset(memberName)"));
  assert.ok(controls.includes("disabled={loading || !hasEmail}"), "tlačítko zamčené bez e-mailu");
  // akce vrací e-mail jen tomu, kdo ho vidí i jinde
  const access = stripComments(read("actions/member-access.ts"));
  assert.ok(access.includes('can(actor, "members.manage") ? row.email : null'));
  assert.ok(access.includes('can(actor, "members.manage") ? target.email : null'));
  assert.equal(PASSWORD_TEXTS.confirmReset("Jana"), "Poslat Jana odkaz pro nové heslo? Zneplatní se i jeho osobní odkaz, nový přijde s další rozesílkou.");
  assert.equal(PASSWORD_TEXTS.noEmailError, "Člen nemá e-mail. Nejdřív mu ho doplň.");
  assert.equal(PASSWORD_TEXTS.noEmailBadge, "bez e-mailu");
  assert.equal(PASSWORD_TEXTS.listTitle, "Hesla členů");
});

// P1 další statika
test("P1. brány „jen vedení“ jsou pryč, povýšení běžného člena s heslem zamkne, reset jde komukoli s e-mailem", () => {
  const login = stripComments(declaration(read("actions/auth.ts"), "loginAction"));
  assert.ok(!login.includes("hasPasswordAccess") && !login.includes("isLeadershipAccount"));
  assert.ok(login.includes("member?.passwordHash ?? DUMMY_PASSWORD_HASH"));
  assert.ok(!stripComments(read("lib/auth/session-check.ts")).includes("no-password-access"));
  assert.ok(!stripComments(read("lib/auth/login-link-core.ts")).includes("hasPasswordAccess"));
  const access = stripComments(read("actions/member-access.ts"));
  assert.ok(access.includes("hadRealPassword && !!targetState?.hasFunction"), "Q9 A: keep jen u cíle s funkcí");
  assert.ok(!access.includes("Heslo mají jen členové vedení") && !access.includes("Odkaz pro heslo jde jen členovi vedení"));
  const q = stripComments(read("lib/db/queries/members.ts"));
  assert.ok(declaration(q, "resetPasswordSql").includes("email IS NOT NULL AND email <> ''"));
  assert.ok(!declaration(q, "resetPasswordSql").includes("member_function"));
  // odkaz „nastav si heslo“ už role ani funkci nechce
  assert.ok(!declaration(q, "setPasswordFromLinkSql").includes("member_function"));
  assert.ok(stripComments(read("lib/auth/login-link.ts")).includes("setPasswordFromLink(memberId, passwordHash)"));
  // UI: menu pro každého, karta na dashboardu jen v režimu set, nápověda u přihlášení
  const layout = read("app/(app)/layout.tsx");
  assert.ok(layout.includes("settings: true") && layout.includes("session.passwordMode"));
  const dash = read("app/(app)/dashboard/page.tsx");
  assert.ok(dash.includes('session.passwordMode === "set"') && dash.includes("PASSWORD_TEXTS.dashboardCard"));
  assert.ok(read("app/(auth)/login/page.tsx").includes("{LOGIN_TEXTS.passwordHint}"));
  const form = read("app/(app)/settings/ChangePasswordForm.tsx");
  assert.ok(form.includes('mode: "set" | "change"'));
  // P02-5: text a skrytí formuláře podle režimu při odeslání, ne podle aktuálního propu
  const formCode = stripComments(form);
  assert.ok(formCode.includes("const modeAtSubmit = mode;") && formCode.includes("setSubmittedMode(modeAtSubmit)"));
  assert.ok(formCode.includes('if (success && submittedMode === "set")'), "po nastavení jen věta bez formuláře");
  assert.ok(formCode.includes('submittedMode === "set" ? PASSWORD_TEXTS.saved : PASSWORD_TEXTS.changed'));
  assert.ok(formCode.includes('modeAtSubmit === "change" ? PASSWORD_TEXTS.changed : PASSWORD_TEXTS.saved'), "toast");
  assert.ok(!formCode.includes("success && !hasPassword"));
  // role medical pro Člena výboru zůstala na /admin/members
  assert.ok(read("app/(app)/admin/members/page.tsx").includes("<MedicalList"));
});

// 13
test("13. publicDayLabel: všechny stavy z 9.2, medical vstup dává „Omluven(a)“", () => {
  const T = MEMBERS_VIEW_TEXTS;
  assert.equal(publicDayLabel({ name: "A", status: "present", substituteName: null, excused: false }), "Přítomen(a)");
  assert.equal(publicDayLabel({ name: "A", status: "substitute", substituteName: "Karel", excused: false }), "Přišel náhradník Karel");
  assert.equal(publicDayLabel({ name: "A", status: "absent", substituteName: null, excused: true }), "Omluven(a)");
  assert.equal(publicDayLabel({ name: "A", status: "absent", substituteName: "Eva", excused: true }), "Omluven(a), náhradník Eva");
  assert.equal(publicDayLabel({ name: "A", status: "absent", substituteName: null, excused: false }), "Chyběl(a) bez omluvy");
  assert.equal(publicDayLabel({ name: "A", status: "unexcused", substituteName: null, excused: false }), T.unexcused);
  assert.equal(T.unexcused, "Chyběl(a) bez omluvy", "gate bod 6: stejný štítek jako v zápisu");
  // otevřený den: omluva a omluva s náhradníkem, pod seznamem věta
  const open = buildPublicDay({
    state: "open",
    rows: [
      { name: "Ž", substituteName: null },
      { name: "Č", substituteName: "Eva" },
    ],
  });
  assert.deepEqual(open.rows, [
    { name: "Č", label: "Omluven(a), náhradník Eva" },
    { name: "Ž", label: "Omluven(a)" },
  ]);
  assert.equal(open.footnote, "Ostatní se zatím neomluvili.");
  const unrec = buildPublicDay({ state: "closed", dayMode: "unrecorded", rows: [] });
  assert.equal(unrec.footnote, "Ostatní se počítají jako přítomní.");
  assert.equal(buildPublicDay({ state: "closed", dayMode: "recorded", rows: [] }).footnote, null);
  // sousední schůzkové dny
  const days = ["2026-11-05", "2026-11-12", "2026-11-19"];
  assert.deepEqual(neighbourMeetingDays(days, "2026-11-12"), { prev: "2026-11-05", next: "2026-11-19" });
  assert.deepEqual(neighbourMeetingDays(days, "2026-11-15"), { prev: "2026-11-12", next: "2026-11-19" });
  assert.deepEqual(neighbourMeetingDays(days, "2026-11-01"), { prev: null, next: "2026-11-05" });
});

// 14
test("14. buildPublicDay a buildPublicCounts: objekty jen s klíči name a label (name a absences), do HTML jen to", () => {
  const closed = buildPublicDay({
    state: "closed",
    dayMode: "recorded",
    rows: [
      { name: "B", status: "absent", substituteName: null, excused: true },
      { name: "A", status: "present", substituteName: null, excused: false },
    ],
  });
  for (const r of closed.rows) assert.deepEqual(Object.keys(r).sort(), ["label", "name"]);
  assert.deepEqual(closed.rows.map((r) => r.name), ["A", "B"], "česká kolace");
  const counts = buildPublicCounts([
    { name: "B", absences: 2, memberId: "x", substitutes: 4 } as { name: string; absences: number },
  ]);
  assert.deepEqual(Object.keys(counts[0]).sort(), ["absences", "name"]);
  // stránka a loader: žádné id člena, e-mail ani medical (bez komentářů)
  for (const f of [
    "app/(app)/dochazka/clenove/page.tsx",
    "lib/attendance/members-view.ts",
    "lib/attendance/members-day.ts",
  ]) {
    const src = stripComments(read(f));
    assert.ok(!/memberId|member_id|email|medical/i.test(src), `${f}: nesmí obsahovat memberId, email ani medical`);
  }
  const page = stripComments(read("app/(app)/dochazka/clenove/page.tsx"));
  assert.ok(page.includes("requirePageSession()") && !/permission:|anyOf:/.test(page), "každý přihlášený, bez práva");
  assert.ok(!/use client/.test(page) && !/onClick|useState/.test(page), "bez klientského JS");
  assert.ok(page.includes('method="get"') && page.includes('type="date"'));
  assert.ok(page.includes("key={i}"), "React klíč = pořadí v seznamu, ne id člena");
  const loader = stripComments(read("lib/attendance/members-view.ts"));
  assert.ok(loader.includes("listDayResultsPublic") && loader.includes("listDayPlannedPublic") && loader.includes("listOverviewMembers"));
  assert.ok(!existsLoading(), "žádný loading.tsx v segmentu (LL-017)");
  function existsLoading(): boolean {
    try {
      read("app/(app)/dochazka/clenove/loading.tsx");
      return true;
    } catch {
      return false;
    }
  }
});

test("T1. záložky: Moje a Členové vidí každý, Zápis, Omluvy a Přehled jen s attendance.view_all, texty z gate", () => {
  const tabs = read("components/attendance/AttendanceTabs.tsx");
  assert.ok(!/if \(!canViewAll\) return null/.test(tabs));
  assert.ok(tabs.includes('"/dochazka/clenove"') && tabs.includes("OVERVIEW_TEXTS.tabMembers"));
  assert.ok(/canViewAll\s*\?\s*\[/.test(tabs), "ostatní záložky jen s právem");
  const T = MEMBERS_VIEW_TEXTS;
  assert.equal(T.title, "Docházka členů");
  assert.equal(T.countsTitle, "Absence za posledních 6 měsíců");
  assert.equal(T.prev, "‹ předchozí schůzka");
  assert.equal(T.next, "další schůzka ›");
  assert.equal(T.excused, "Omluven(a)");
  assert.equal(T.restOpen, "Ostatní se zatím neomluvili.");
  assert.equal(T.restPresent, "Ostatní se počítají jako přítomní.");
});

// 35b
// T-005b
test("40. M-1 statika: SQL set jen password_hash IS NULL, akce předává hasHash, režim set bez čekajícího odkazu", () => {
  const members = stripComments(read("lib/db/queries/members.ts"));
  const fn = members.slice(members.indexOf("export function setOwnPasswordSql"));
  const setBranch = fn.slice(0, fn.indexOf(": sql`AND password_hash ="));
  assert.ok(setBranch.includes("AND password_hash IS NULL"));
  assert.ok(!setBranch.includes("set-password"), "set už nezná čekající odkaz");
  const body = stripComments(declaration(read("actions/auth.ts"), "changePasswordAction"));
  assert.ok(body.includes("hasHash: !!member.passwordHash"));
});

test("44. T-005b: reset hesla zneplatní osobní odkaz stejnou funkcí jako Zneplatnit odkaz, limit pw-login-email je 10", () => {
  const act = stripComments(declaration(read("actions/member-access.ts"), "resetMemberPasswordAction"));
  const iReset = act.indexOf("resetPasswordGuarded(");
  const iRevoke = act.indexOf("revokeMagicLinkGuarded(");
  assert.ok(iReset > 0 && iRevoke > iReset, "zneplatnění po resetu");
  assert.ok(iRevoke < act.indexOf("sendSetPasswordLink("), "před rozesláním odkazu");
  assert.equal(THROTTLE_LIMITS.pwLoginEmail, 10);
});

test("41. M-2: pickMembersViewDate přijme jen schůzkový den v rozsahu, jinak výchozí den", () => {
  const days = ["2026-11-19", "2026-11-26"];
  const f = "2026-11-19";
  assert.equal(pickMembersViewDate("2026-11-26", days, "2026-10-01", "2026-12-31", f), "2026-11-26");
  assert.equal(pickMembersViewDate("2026-11-24", days, "2026-10-01", "2026-12-31", f), f, "úterý mimo schůzky");
  assert.equal(pickMembersViewDate("2026-11-26", days, "2026-11-27", "2026-12-31", f), f, "mimo rozsah");
  assert.equal(pickMembersViewDate("nesmysl", days, "2026-10-01", "2026-12-31", f), f);
  assert.equal(pickMembersViewDate(undefined, days, "2026-10-01", "2026-12-31", f), f);
  assert.ok(stripComments(read("lib/attendance/members-view.ts")).includes("pickMembersViewDate("));
});

test("42. F-01 a L-1: bez members.medical odpověď slovo medical neobsahuje", () => {
  const skipMedical = { status: "skipped" as const, reason: "medical" as const };
  assert.deepEqual(redactMedicalOutcome(skipMedical, false), { status: "skipped", reason: "excused" });
  assert.deepEqual(redactMedicalOutcome(skipMedical, true), skipMedical);
  assert.deepEqual(redactMedicalOutcome({ status: "skipped", reason: "inactive" }, false), { status: "skipped", reason: "inactive" });
  assert.ok(!/medical/i.test(JSON.stringify(redactMedicalOutcome(skipMedical, false))));
  for (const t of [VOTE_TEXTS.linkExcused, VOTE_TEXTS.listLabelExcused, VOTE_TEXTS.skipExcused, VOTE_TEXTS.inactive]) {
    assert.ok(!/medical/i.test(t), t);
  }
  const start = stripComments(read("app/api/meetings/[id]/start-voting/route.ts"));
  assert.ok(start.includes('can(session, "members.medical")') && start.includes("redactMedicalOutcome("));
  const links = stripComments(read("app/api/meetings/[id]/member-links/route.ts"));
  assert.ok(links.includes('can(authz.session, "members.medical")') && links.includes("isMedical: canSeeMedical &&"));
  for (const r of ["send-email", "regenerate"]) {
    const src = stripComments(read(`app/api/meetings/[id]/member-links/[memberId]/${r}/route.ts`));
    assert.ok(src.includes('can(session, "members.medical")') && src.includes("VOTE_TEXTS.linkExcused"), r);
  }
  const panel = read("components/meetings/StartVotingPanel.tsx");
  assert.ok(panel.includes("excused: VOTE_TEXTS.skipExcused") && panel.includes("medical: VOTE_TEXTS.skipMedical"));
});

test("43. F-05 a F-07: changePasswordAction bez zbytečných dotazů, hlas neaktivního bez textu medical", () => {
  const body = stripComments(declaration(read("actions/auth.ts"), "changePasswordAction"));
  assert.ok(!body.includes("hasPendingSetPasswordLink("));
  assert.ok(body.includes("state.pendingSetPassword"));
  assert.ok(read("lib/db/queries/member-medical.ts").includes("export async function voteBlockedText"));
  for (const f of ["actions/votes.ts", "app/api/m/[token]/vote/route.ts"]) {
    const src = stripComments(read(f));
    assert.ok(src.includes("voteBlockedText(") && !src.includes("VOTE_TEXTS.medical"), f);
  }
});

test("35b. texty části B (gate bod 6) a nové soubory bez U+2014, bez jmen a e-mailů", () => {
  assert.equal(LOGIN_TEXTS.passwordHint, "Heslo nemáš nebo jsi ho zapomněl(a)? Přihlas se odkazem níž.");
  assert.equal(PASSWORD_TEXTS.setIntro, "Pak se přihlásíš e-mailem a heslem. Odkaz z mailu funguje dál.");
  assert.equal(PASSWORD_TEXTS.forgotten, "Když heslo zapomeneš, napiš někomu z vedení. Pošle ti odkaz pro nové.");
  assert.equal(PASSWORD_TEXTS.viaLink, "Heslo si nastavíš odkazem z mailu. Když odkaz nemáš, nový ti pošle někdo z vedení.");
  assert.equal(PASSWORD_TEXTS.dashboardCard, "Nastav si heslo a příště se přihlásíš bez odkazu z mailu.");
  assert.equal(PASSWORD_TEXTS.saved, "Heslo je uložené.");
  const strings: string[] = [];
  const collect = (o: Record<string, unknown>) => {
    for (const v of Object.values(o)) {
      if (typeof v === "string") strings.push(v);
      else if (typeof v === "function") strings.push(String((v as (a: string) => string)("Jméno")));
      else if (Array.isArray(v)) strings.push(...v.map(String));
    }
  };
  collect(LOGIN_TEXTS);
  collect(PASSWORD_TEXTS);
  collect(PASSWORD_NOTICE_TEXTS as unknown as Record<string, unknown>);
  collect(MEMBERS_VIEW_TEXTS as unknown as Record<string, unknown>);
  strings.push(HELP_PASSWORD_LOGIN, HELP_ATTENDANCE_MEMBERS);
  for (const s of strings) assert.ok(!s.includes(EM_DASH), `em dash v textu: ${s}`);
  const files = [
    "lib/auth/password-texts.ts",
    "lib/attendance/members-day.ts",
    "lib/attendance/members-view.ts",
    "app/(app)/dochazka/clenove/page.tsx",
    "app/(app)/settings/page.tsx",
    "app/(app)/settings/ChangePasswordForm.tsx",
    "app/(app)/admin/members/LeadershipPasswordList.tsx",
    "app/(app)/admin/members/PasswordResetControls.tsx",
    "components/attendance/AttendanceTabs.tsx",
    "components/help/help-texts.ts",
    "components/help/sections/MemberHelp.tsx",
    "actions/auth.ts",
    "scripts/test-iter-046-heslo.ts",
  ];
  for (const f of files) {
    const s = read(f);
    assert.ok(!s.includes(EM_DASH), `${f}: em dash`);
    assert.ok(!/[\w.]+@[\w-]+\.\w{2,}/.test(s.replace(/@example\.test|@\/|@electric|@neondatabase|@b\.cz/g, "")), `${f}: e-mail`);
  }
  // mail s heslem: nový předmět pro běžného člena
  assert.ok(read("lib/email/resend.ts").includes('"BNI Plzeň: nastav si heslo"'));
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
