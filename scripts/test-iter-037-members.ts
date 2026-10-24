/**
 * Testy iter-037 (T-003a): katalog práv, `permissionsFor`, přepis guardů,
 * migrace. Bez DATABASE_URL, bez sítě. Statické kontroly čtou zdrojáky z disku.
 * T-003b (testy T1 až T17): aktivita k datu, deaktivace, Zneplatnit odkaz, /magic,
 * heslo držitele funkce, pojistka posledního účtu se správou členů.
 * T-003c (testy U1 až U10): UI správy členů, stránka člena, záhlaví, nápověda.
 *
 * Spuštění: npm run test:iter-037
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  ADMIN_DELEGABLE_MARKER,
  ADMIN_ONLY_MESSAGE,
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  DELEGABLE_PERMISSIONS,
  NON_DELEGABLE,
  NO_PERMISSION_MESSAGE,
  PERMISSIONS,
  can,
  canAny,
  expandFunctionPermissions,
  functionGrants,
  hasPasswordAccess,
  hasPasswordSession,
  hasRealPassword,
  isAdminSession,
  mayChangeMember,
  permissionsFor,
  type Permission,
} from "../lib/auth/permissions";
import {
  DEACTIVATION_TEXTS,
  addDaysToDateString,
  decideDeactivation,
  deactivationLabel,
  isMemberActive,
  pragueToday,
  validateInactiveUntil,
} from "../lib/members/activity";
import { checkSession, type SessionCookieState } from "../lib/auth/session-check";
import { planLoginLinkRequest, planLoginStart, LOGIN_LINK_RESPONSE_TEXT } from "../lib/auth/login-link-core";
import { planVotingDispatch, type PlanMember } from "../lib/meetings/voting-plan";
import { decideMeetingTokenAccess } from "../lib/auth/meeting-token-access";
import { decideFunctionChange, functionChangeErrorText } from "../lib/auth/function-change";
import { decideRoleChange } from "../lib/auth/role-change";
import { personalLinkState, roleLabel, sessionHeaderLabel } from "../lib/members/labels";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

const ALL_SRC_DIRS = ["app", "actions", "components", "lib"].map((d) => join(ROOT, d));
const allSources = ALL_SRC_DIRS.flatMap((d) => walk(d));

/** Tělo exportované funkce: od `export async function name(` po další export. */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `funkce ${name} nenalezena`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

// Dnešní moderátor podle arch 6.1 (sloupec „Výchozí sada“), napsáno nezávisle
// na kódu katalogu.
const TODAY_MODERATOR: Permission[] = [
  "guests.manage",
  "guests.promote",
  "categories.create",
  "meetings.manage",
  "events.manage",
  "timers.manage",
  "interviews.manage",
  "interviewQuestions.manage",
  "ops.view",
  "mastermind.manage",
  "burza.manage",
  // iter-040: moderátor a Člen výboru zakládají a ruší interní schůzky v docházce (gate K1 A).
  "attendance.internal_manage",
];

// Tabulka akce -> právo (arch 6.6, upravená o změny zadání).
const ACTION_TABLE: Array<[string, string, Permission]> = [
  ["actions/guests.ts", "createGuestAction", "guests.manage"],
  ["actions/guests.ts", "updateGuestAction", "guests.manage"],
  ["actions/guests.ts", "updateGuestCategoryAction", "guests.manage"],
  ["actions/guests.ts", "promoteGuestToMemberAction", "guests.promote"],
  ["actions/guests.ts", "deleteGuestAction", "guests.delete"],
  ["actions/categories.ts", "createCategoryAction", "categories.create"],
  ["actions/categories.ts", "renameCategoryAction", "categories.manage"],
  ["actions/categories.ts", "deleteCategoryAction", "categories.manage"],
  ["actions/meetings.ts", "createMeetingAction", "meetings.manage"],
  ["actions/meetings.ts", "addGuestToMeetingAction", "meetings.manage"],
  ["actions/meetings.ts", "removeGuestFromMeetingAction", "meetings.manage"],
  ["actions/meetings.ts", "closeVotingAction", "meetings.manage"],
  ["actions/meetings.ts", "deleteMeetingAction", "meetings.delete"],
  ["actions/report.ts", "triggerReportAction", "meetings.manage"],
  ["actions/events.ts", "createEventAction", "events.manage"],
  ["actions/events.ts", "updateEventAction", "events.manage"],
  ["actions/events.ts", "activateEventAction", "events.manage"],
  ["actions/events.ts", "closeEventAction", "events.manage"],
  ["actions/events.ts", "setSelectedOptionAction", "events.manage"],
  ["actions/events.ts", "markEventDoneAction", "events.manage"],
  ["actions/events.ts", "addOptionAction", "events.manage"],
  ["actions/events.ts", "removeOptionAction", "events.manage"],
  ["actions/events.ts", "addParticipantAction", "events.manage"],
  ["actions/events.ts", "removeParticipantAction", "events.manage"],
  ["actions/events.ts", "resendMagicLinkAction", "events.manage"],
  ["actions/events.ts", "resendAllMagicLinksAction", "events.manage"],
  ["actions/events.ts", "getParticipantLinkAction", "events.manage"],
  ["actions/events.ts", "resetParticipantTokenAction", "events.manage"],
  ["actions/events.ts", "deleteEventAction", "events.delete"],
  ["actions/timers.ts", "createTimerAction", "timers.manage"],
  ["actions/timers.ts", "deleteTimerAction", "timers.manage"],
  ["actions/timers.ts", "regenerateViewTokenAction", "timers.manage"],
  ["actions/interviews.ts", "createInterviewAction", "interviews.manage"],
  ["actions/interviews.ts", "updateInterviewLeaderAction", "interviews.manage"],
  ["actions/interviews.ts", "sendInterviewLinkAction", "interviews.manage"],
  ["actions/interviews.ts", "deleteInterviewAction", "interviews.manage"],
  ["actions/interviews.ts", "sendInterviewReportAction", "interviews.manage"],
  ["actions/interviews.ts", "sendInterviewCompareReportAction", "interviews.manage"],
  ["actions/interview-questions.ts", "createQuestionAction", "interviewQuestions.manage"],
  ["actions/interview-questions.ts", "updateQuestionAction", "interviewQuestions.manage"],
  ["actions/interview-questions.ts", "setQuestionActiveAction", "interviewQuestions.manage"],
  ["actions/interview-questions.ts", "reorderQuestionsAction", "interviewQuestions.manage"],
  ["actions/mastermind.ts", "scheduleCaseAction", "mastermind.manage"],
  ["actions/mastermind.ts", "unscheduleCaseAction", "mastermind.manage"],
  ["actions/mastermind.ts", "confirmPresentedAction", "mastermind.manage"],
  ["actions/mastermind.ts", "undoPresentedAction", "mastermind.manage"],
  ["actions/burza.ts", "recordHelpForAction", "burza.manage"],
  ["actions/burza.ts", "removeContactUseAction", "burza.manage"],
  ["actions/members.ts", "createMemberAction", "members.manage"],
  ["actions/members.ts", "generateMagicLinkAction", "members.manage"],
  ["actions/members.ts", "revokeTokenAction", "members.manage"],
  ["actions/members.ts", "sendMagicLinkEmailAction", "members.manage"],
  ["actions/members.ts", "updateMemberCompanyAction", "members.manage"],
  ["actions/members.ts", "updateMemberEmailAction", "members.manage"],
  ["actions/members.ts", "updateMemberJoinedAtAction", "members.manage"],
  ["actions/members.ts", "deleteMemberAction", "members.delete"],
  ["actions/import-members.ts", "parseXlsxAction", "members.manage"],
  ["actions/import-members.ts", "importMembersAction", "members.manage"],
  ["actions/member-access.ts", "setMemberRoleAction", "access.manage"],
  ["actions/member-access.ts", "resetMemberPasswordAction", "access.manage"],
  ["actions/member-access.ts", "resendSetPasswordLinkAction", "access.manage"],
  ["actions/member-access.ts", "issueSetPasswordLinkForCopyAction", "access.manage"],
  // T-003b
  ["actions/member-access.ts", "setMemberFunctionAction", "access.manage"],
  ["actions/member-status.ts", "deactivateMemberAction", "members.deactivate"],
  ["actions/member-status.ts", "updateDeactivationAction", "members.deactivate"],
  ["actions/member-status.ts", "reactivateMemberAction", "members.deactivate"],
];

const ROUTE_TABLE: Array<[string, string]> = [
  ["app/api/meetings/[id]/start-voting/route.ts", '"meetings.manage"'],
  ["app/api/meetings/[id]/member-links/route.ts", '"meetings.manage"'],
  ["app/api/meetings/[id]/member-links/[memberId]/regenerate/route.ts", '"meetings.manage"'],
  ["app/api/meetings/[id]/member-links/[memberId]/revoke/route.ts", '"meetings.manage"'],
  ["app/api/meetings/[id]/member-links/[memberId]/send-email/route.ts", '"meetings.manage"'],
  ["app/api/meetings/[id]/export-list/route.ts", '"meetings.manage"'],
  ["app/api/meetings/[id]/guests/reorder/route.ts", '"meetings.manage"'],
  ["app/api/meetings/[id]/import-guests/route.ts", '["meetings.manage", "guests.manage"]'],
  ["app/api/events/[eventId]/export/csv/route.ts", '"events.manage"'],
  ["app/api/status/delivery/route.ts", '"ops.view"'],
  ["app/api/members/reorder/route.ts", '"members.manage"'],
];

const PAGE_TABLE: Array<[string, string]> = [
  ["app/(app)/guests/new/page.tsx", 'permission: "guests.manage"'],
  ["app/(app)/events/page.tsx", 'permission: "events.manage"'],
  ["app/(app)/events/new/page.tsx", 'permission: "events.manage"'],
  ["app/(app)/events/[eventId]/page.tsx", 'permission: "events.manage"'],
  ["app/(app)/timers/page.tsx", 'permission: "timers.manage"'],
  ["app/(app)/interviews/page.tsx", 'permission: "interviews.manage"'],
  ["app/(app)/interviews/[id]/page.tsx", 'permission: "interviews.manage"'],
  ["app/(app)/interviews/compare/[memberId]/page.tsx", 'permission: "interviews.manage"'],
  ["app/(app)/interviews/questions/page.tsx", 'permission: "interviewQuestions.manage"'],
  ["app/(app)/status/page.tsx", 'permission: "ops.view"'],
  ["app/(app)/status/[runId]/page.tsx", 'permission: "ops.view"'],
  ["app/(app)/settings/page.tsx", "passwordSession: true"],
  ["app/(app)/burza/pomoc/page.tsx", 'permission: "burza.manage"'],
  ["app/(app)/admin/members/page.tsx", 'permission: "members.manage"'],
  ["app/(app)/admin/categories/page.tsx", 'permission: "categories.manage"'],
];

const pw = (managementRole: "admin" | "moderator" | null, functions = [] as { name: string; permissions: string[] | null }[]) =>
  permissionsFor({ authMethod: "password", managementRole, functions, attendanceManager: false });

const tests: TestCase[] = [
  {
    name: "9a. MODERATOR_ROLE_PERMISSIONS je přesně dnešní moderátor podle arch 6.1, DEFAULT_FUNCTION_PERMISSIONS k tomu přidává jen semafor.view_all (iter-041 Z7)",
    run: () => {
      assert.deepEqual([...MODERATOR_ROLE_PERMISSIONS].sort(), [...TODAY_MODERATOR].sort());
      assert.deepEqual([...DEFAULT_FUNCTION_PERMISSIONS].sort(), [...TODAY_MODERATOR, "semafor.view_all"].sort());
      // zpřísnění N5, N6 a nová práva jen pro admina (a funkce s plnou sadou)
      for (const p of [
        "categories.manage",
        "members.manage",
        "members.deactivate",
        "members.delete",
        "access.manage",
        "functions.manage",
        "guests.delete",
        "meetings.delete",
        "events.delete",
      ] as Permission[]) {
        assert.ok(!DEFAULT_FUNCTION_PERMISSIONS.includes(p), `${p} nesmí být ve výchozí sadě`);
      }
      assert.equal(new Set(PERMISSIONS).size, PERMISSIONS.length, "katalog bez duplicit");
      // iter-038: +4 práva docházky (attendance.record, view_all, audit_view, edit_history),
      // iter-040: +1 (attendance.internal_manage), iter-041: +2 (semafor.view_all, semafor.import).
      assert.equal(PERMISSIONS.length, 27);
    },
  },
  {
    name: "9b. mimo lib/auth, middleware a práci s cílovým členem se managementRole neporovnává",
    run: () => {
      const allowed = new Set([
        "actions/auth.ts", // login (role z DB při přihlášení)
        "actions/member-access.ts", // role CÍLE změny (T-003c), ne session
        "actions/members.ts", // role CÍLE (smazání člena, e-mail)
        "app/(app)/admin/members/MemberAccessControls.tsx", // zobrazení (T-003c)
        "app/(app)/admin/members/SortableMemberList.tsx", // zobrazení (T-003c)
        "app/(app)/admin/members/[id]/page.tsx", // štítek role a vlastní funkce jen adminu (server hlídá znovu)
        "lib/members/labels.ts", // text role v záhlaví
      ]);
      const bad: string[] = [];
      for (const f of allSources) {
        const rel = relative(ROOT, f).split("\\").join("/");
        if (rel.startsWith("lib/auth/") || allowed.has(rel)) continue;
        if (/managementRole\s*(===|!==)/.test(stripComments(readFileSync(f, "utf8")))) bad.push(rel);
      }
      assert.deepEqual(bad, []);
      // middleware už role admin pro /admin nehlídá (Prezident a Viceprezident mají práva admina)
      const mw = stripComments(read("middleware.ts"));
      assert.ok(!/managementRole/.test(mw), "middleware nesmí porovnávat roli");
    },
  },
  {
    name: "9c. žádné requireManagementRole, requireAdmin(, role: \"management\" ani role: \"admin\" v app, actions, components",
    run: () => {
      const bad: string[] = [];
      for (const f of allSources) {
        const rel = relative(ROOT, f).split("\\").join("/");
        const src = stripComments(readFileSync(f, "utf8"));
        if (/requireManagementRole|requireAdmin\(|requirePageSession\(\{[^}]*\brole:/.test(src)) bad.push(rel);
      }
      assert.deepEqual(bad, []);
    },
  },
  {
    name: "9d. permissionsFor: odkaz = práva člena, admin vše, role moderator a funkce se sjednocují",
    run: () => {
      const fn = (name: string, permissions: string[] | null) => ({ name, permissions });
      // přihlášení odkazem nedává nic, ani adminovi ani Prezidentovi
      for (const method of ["magic_link", "email_link"] as const) {
        assert.equal(permissionsFor({ authMethod: method, managementRole: "admin", functions: [], attendanceManager: false }).size, 0);
        assert.equal(
          permissionsFor({
            authMethod: method,
            managementRole: "moderator",
            functions: [fn("Prezident", [ADMIN_DELEGABLE_MARKER])],
            attendanceManager: false,
          }).size,
          0
        );
      }
      // admin heslem = vše (i nedelegovatelná práva)
      const DELEGABLE = [...PERMISSIONS].filter((p) => !NON_DELEGABLE.includes(p));
      assert.deepEqual([...pw("admin")].sort(), [...PERMISSIONS].sort());
      // moderátor bez funkce = dnešní moderátor
      assert.deepEqual([...pw("moderator")].sort(), [...TODAY_MODERATOR].sort());
      // Člen výboru (NULL) = výchozí sada funkce (iter-041 Z7: moderátor + přehled semaforu)
      assert.deepEqual([...pw("moderator", [fn("Člen výboru", null)])].sort(), [...TODAY_MODERATOR, "semafor.view_all"].sort());
      // Prezident a Viceprezident (značka): všechna práva admina KROMĚ nedelegovatelných
      assert.deepEqual([...pw("moderator", [fn("Prezident", [ADMIN_DELEGABLE_MARKER])])].sort(), [...DELEGABLE].sort());
      // i kdyby měla funkce v datech celý katalog, nedelegovatelná práva nedostane
      assert.deepEqual([...pw("moderator", [fn("Prezident", [...PERMISSIONS])])].sort(), [...DELEGABLE].sort());
      // sjednocení role a funkce: moderátor + funkce s jedním právem nepřijde o výchozí sadu
      const union = pw("moderator", [fn("X", ["members.manage"])]);
      assert.ok(union.has("members.manage"));
      for (const p of TODAY_MODERATOR) assert.ok(union.has(p), p);
      // neznámé klíče se zahodí
      assert.ok(!([...pw("moderator", [fn("X", ["bogus"])])] as string[]).includes("bogus"));
      // T-003b: držitel funkce BEZ role má práva funkce (heslo mu stačí), bez role i funkce nic
      assert.deepEqual([...pw(null, [fn("Prezident", [ADMIN_DELEGABLE_MARKER])])].sort(), [...DELEGABLE].sort());
      assert.deepEqual([...pw(null, [fn("Člen výboru", null)])].sort(), [...TODAY_MODERATOR, "semafor.view_all"].sort());
      // funkce bez role NEdostane výchozí sadu navíc: jen to, co funkce dává
      assert.deepEqual([...pw(null, [fn("X", ["timers.manage"])])], ["timers.manage"]);
      assert.equal(pw(null).size, 0);
      // přihlášení odkazem nedává nic ani držiteli funkce bez role
      assert.equal(
        permissionsFor({ authMethod: "email_link", managementRole: null, functions: [fn("Prezident", [ADMIN_DELEGABLE_MARKER])], attendanceManager: false }).size,
        0
      );
    },
  },
  {
    name: "9d3. M-1: NON_DELEGABLE nedostane žádná funkce, značka se počítá z aktuálního katalogu, admin vše",
    run: () => {
      assert.deepEqual([...NON_DELEGABLE].sort(), ["access.manage", "functions.manage"]);
      // značka = katalog bez nedelegovatelných (nové právo v PERMISSIONS by se tu objevilo samo)
      assert.deepEqual([...DELEGABLE_PERMISSIONS].sort(), PERMISSIONS.filter((p) => !NON_DELEGABLE.includes(p)).sort());
      assert.deepEqual(expandFunctionPermissions([ADMIN_DELEGABLE_MARKER]).sort(), [...DELEGABLE_PERMISSIONS].sort());
      // NULL = výchozí sada, prázdné pole nic, neznámé klíče nic
      assert.deepEqual(expandFunctionPermissions(null).sort(), [...DEFAULT_FUNCTION_PERMISSIONS].sort());
      assert.deepEqual(expandFunctionPermissions([]), []);
      assert.deepEqual(expandFunctionPermissions(["bogus"]), []);
      // jmenovitě zapsané nedelegovatelné právo vypadne (data nemůžou obejít kód)
      assert.deepEqual(expandFunctionPermissions(["access.manage", "functions.manage", "members.manage"]), ["members.manage"]);
      for (const raw of [null, [], [ADMIN_DELEGABLE_MARKER], [...PERMISSIONS], ["access.manage"]]) {
        const got = expandFunctionPermissions(raw);
        assert.ok(!got.includes("access.manage") && !got.includes("functions.manage"), JSON.stringify(raw));
      }
      // Prezident i Viceprezident (heslem, bez role) smí spravovat členy, ne přidělovat
      const president = permissionsFor({
        authMethod: "password",
        managementRole: null,
        functions: [{ name: "Prezident", permissions: [ADMIN_DELEGABLE_MARKER] }],
        attendanceManager: false,
      });
      for (const p of ["members.manage", "members.deactivate", "members.delete", "categories.manage", "guests.delete"] as Permission[]) {
        assert.ok(president.has(p), p);
      }
      assert.ok(!president.has("access.manage") && !president.has("functions.manage"));
      // role admin dává vše i s funkcí Prezident
      assert.deepEqual([...pw("admin", [{ name: "Prezident", permissions: [ADMIN_DELEGABLE_MARKER] }])].sort(), [...PERMISSIONS].sort());
      // funkce dává / nedává members.manage
      assert.equal(functionGrants([ADMIN_DELEGABLE_MARKER], "members.manage"), true);
      assert.equal(functionGrants([ADMIN_DELEGABLE_MARKER], "access.manage"), false);
      assert.equal(functionGrants(null, "members.manage"), false);
      assert.equal(functionGrants(null, "guests.manage"), true);
    },
  },
  {
    name: "9d4. M-1: isAdminSession (role, ne funkce, jen heslem), mayChangeMember, hasRealPassword",
    run: () => {
      assert.equal(isAdminSession({ authMethod: "password", managementRole: "admin" }), true);
      assert.equal(isAdminSession({ authMethod: "magic_link", managementRole: "admin" }), false);
      assert.equal(isAdminSession({ authMethod: "email_link", managementRole: "admin" }), false);
      assert.equal(isAdminSession({ authMethod: "password", managementRole: "moderator" }), false);
      assert.equal(isAdminSession({ authMethod: "password", managementRole: null }), false);
      assert.equal(isAdminSession({ managementRole: "admin" }), false);
      assert.equal(isAdminSession(null), false);
      assert.equal(mayChangeMember(false, "admin"), false);
      assert.equal(mayChangeMember(true, "admin"), true);
      assert.equal(mayChangeMember(false, "moderator"), true);
      assert.equal(mayChangeMember(false, null), true);
      assert.equal(mayChangeMember(false, undefined), true);
      assert.equal(ADMIN_ONLY_MESSAGE, "Účet admina může měnit jen admin.");
      // MIN-1: zámkový hash s čekajícím odkazem není heslo
      assert.equal(hasRealPassword({ hasHash: true, pendingSetPasswordLink: false }), true);
      assert.equal(hasRealPassword({ hasHash: true, pendingSetPasswordLink: true }), false);
      assert.equal(hasRealPassword({ hasHash: false, pendingSetPasswordLink: false }), false);
    },
  },
  {
    name: "9d2. can a canAny: prázdná session a chybějící pole = false",
    run: () => {
      assert.equal(can(null, "ops.view"), false);
      assert.equal(can({}, "ops.view"), false);
      assert.equal(can({ permissions: ["ops.view"] }, "ops.view"), true);
      assert.equal(canAny({ permissions: ["ops.view"] }, ["timers.manage", "ops.view"]), true);
      assert.equal(canAny({ permissions: [] }, ["timers.manage"]), false);
      assert.equal(NO_PERMISSION_MESSAGE, "Na tohle nemáš oprávnění.");
    },
  },
  {
    name: "9e. createSession neukládá permissions ani functionNames do cookie, getSession je počítá z DB",
    run: () => {
      const src = stripComments(read("lib/auth/session.ts"));
      const create = src.slice(src.indexOf("export async function createSession"));
      assert.ok(!/permissions|functionNames/.test(create.slice(0, create.indexOf("export async function destroySession"))));
      assert.ok(/getMemberAuthState\(/.test(src) && /permissionsFor\(/.test(src));
      assert.ok(src.includes("Omit<SessionData"), "NewSession vynechává vypočtená pole");
    },
  },
  {
    name: "9f. tabulka akce -> právo: každá akce volá requirePermission(právo) jako první guard",
    run: () => {
      const problems: string[] = [];
      for (const [file, action, perm] of ACTION_TABLE) {
        const body = stripComments(functionBody(read(file), action));
        const m = /await (requireAuth|requirePermission|requirePasswordSession)\(([^)]*)\)/.exec(body);
        if (!m || m[1] !== "requirePermission" || m[2].trim() !== `"${perm}"`) {
          problems.push(`${file}:${action}: očekáváno requirePermission("${perm}"), nalezeno ${m ? m[0] : "nic"}`);
        }
      }
      assert.deepEqual(problems, []);
    },
  },
  {
    name: "9g. API routes volají requirePermissionForRoute s právem z tabulky 6.6",
    run: () => {
      const problems: string[] = [];
      for (const [file, perm] of ROUTE_TABLE) {
        const src = stripComments(read(file));
        if (!src.includes(`requirePermissionForRoute(${perm}`)) problems.push(`${file}: chybí ${perm}`);
        if (/managementRole|isManagement/.test(src)) problems.push(`${file}: zbytek ruční kontroly role`);
      }
      assert.deepEqual(problems, []);
      const report = stripComments(read("app/api/report/route.ts"));
      assert.ok(report.includes('can(session, "meetings.manage")'));
    },
  },
  {
    name: "9h. stránky z tabulky 6.6 volají requirePageSession s právem, changePasswordAction chce session s heslem",
    run: () => {
      const problems: string[] = [];
      for (const [file, needle] of PAGE_TABLE) {
        const src = stripComments(read(file));
        const m = /await requirePageSession\(\{[^}]*\}\)/.exec(src);
        if (!m || !m[0].includes(needle)) problems.push(`${file}: očekáváno ${needle}`);
      }
      assert.deepEqual(problems, []);
      const body = stripComments(functionBody(read("actions/auth.ts"), "changePasswordAction"));
      assert.ok(body.includes("requirePasswordSession()"));
    },
  },
  {
    name: "9i. guards: requirePermission vrací českou hlášku, requireManagementRole a requireAdmin neexistují",
    run: () => {
      const src = stripComments(read("lib/auth/guards.ts"));
      assert.ok(src.includes("export async function requirePermission("));
      assert.ok(src.includes("NO_PERMISSION_MESSAGE"));
      assert.ok(!/Insufficient permissions/.test(src));
      assert.ok(!/requireManagementRole|requireAdmin/.test(src));
      const page = stripComments(read("lib/auth/page-guard.ts"));
      assert.ok(!/role\?:/.test(page), "volba role z page-guard zmizela");
    },
  },
  {
    name: "9j. dnešní moderátor smí totéž: každé právo výchozí sady má aspoň jeden guard v kódu, přejmenování kategorie jen admin",
    run: () => {
      const code = allSources
        .filter((f) => !relative(ROOT, f).startsWith("lib/auth/permissions"))
        .map((f) => stripComments(readFileSync(f, "utf8")))
        .join("\n");
      for (const p of PERMISSIONS) {
        if (p === "functions.manage") continue; // T-003c
        assert.ok(code.includes(`"${p}"`), `právo ${p} nemá v kódu žádný guard`);
      }
      assert.ok(!DEFAULT_FUNCTION_PERMISSIONS.includes("categories.manage"));
      assert.ok(!DEFAULT_FUNCTION_PERMISSIONS.includes("members.manage"));
    },
  },
  {
    name: "10. migrace: DO bloky bez ${ a s doslovným lock_timeout, tři funkce, člen má nejvýš jednu funkci, bez poznámky a přechodné funkce",
    run: () => {
      const raw = read("scripts/migrate-iter-037-clenove.ts");
      const src = stripComments(raw);
      const doBlocks = src.match(/DO \$\$[\s\S]*?END \$\$/g) ?? [];
      assert.ok(doBlocks.length >= 8, `DO bloků: ${doBlocks.length}`);
      for (const b of doBlocks) {
        assert.ok(!b.includes("${"), "JS interpolace uvnitř DO bloku (LL-006)");
        assert.ok(b.includes("set_config('lock_timeout', '5s', true)"));
      }
      // smoke test odpovídá skutečným krokům (stejný tvar)
      assert.ok(src.includes("PRIMARY KEY (member_id)\n    ) ON COMMIT DROP"));
      assert.ok(src.includes("PRIMARY KEY (member_id)\n    );"));
      assert.ok(!/PRIMARY KEY \(member_id, function_id\)/.test(src));
      // Z1: bez poznámky; změna zadání: bez přechodné funkce a 14 funkcí
      assert.ok(!/ADD COLUMN IF NOT EXISTS deactivation_note/.test(src));
      assert.ok(!/doplnit funkci|převod z role|TRANSITIONAL/i.test(src));
      for (const name of ["Prezident", "Viceprezident", "Člen výboru"]) {
        assert.ok(src.includes(`name: "${name}"`), name);
      }
      assert.equal((src.match(/order: \d+,/g) ?? []).length, 3);
      assert.ok(!/Visitor Host|Power Teamy|Mentor členů/.test(src));
      // nic nemění moderátory ani adminy
      assert.ok(!/UPDATE member\b/i.test(src) && !/DELETE FROM/i.test(src));
      assert.ok(!/UPDATE member_function|INSERT INTO member_function/i.test(src));
      assert.ok(src.includes("process.exit(1)"));
      assert.ok(!raw.includes(String.fromCharCode(0x2014)), "em dash v migraci");
      // Prezident a Viceprezident berou plnou sadu z katalogu práv
      // M-1 a MIN-2: značka místo snímku 20 práv, oprava starého seedu a kontrola obsahu [6e]
      assert.ok(src.includes("permissions: [ADMIN_DELEGABLE_MARKER]"));
      assert.ok(!src.includes("permissions: PERMISSIONS"), "snímek katalogu");
      assert.ok(src.includes("[5b/7]") && /UPDATE chapter_function\s+SET permissions/.test(src), "UPDATE starého seedu");
      assert.ok(src.includes("'access.manage' = ANY (permissions)") && src.includes("'functions.manage' = ANY (permissions)"));
      assert.ok(src.includes("row.first_perm !== ADMIN_DELEGABLE_MARKER") && src.includes("row.len !== 1"), "[6e] ověřuje obsah");
      assert.ok(src.includes("nějaká funkce má v permissions nedelegovatelné právo"));
      // T-003b: CHECK member_password_only_for_management se odstraňuje (idempotentně),
      // kontrola dat [6h] a rollback v hlavičce, smoke test má stejný tvar kroku
      assert.ok(
        /ALTER TABLE member DROP CONSTRAINT IF EXISTS member_password_only_for_management;/.test(src),
        "chybí DROP CONSTRAINT IF EXISTS"
      );
      assert.ok(/ALTER TABLE _iter037_member_smoke\s+DROP CONSTRAINT IF EXISTS/.test(src), "smoke bez DROP CONSTRAINT");
      assert.ok(src.includes("[6g]") && src.includes("memberConstraints.has(\"member_password_only_for_management\")"));
      assert.ok(raw.includes("hasPasswordAccess"), "hlavička migrace vysvětluje, kam pravidlo přešlo");
      assert.ok(src.includes("member_management_requires_credentials"), "CHECK role vyžaduje heslo zůstává");
    },
  },
  {
    name: "11. schema.ts: sloupce deaktivace bez poznámky, member_function s PK na member_id",
    run: () => {
      const src = stripComments(read("lib/db/schema.ts"));
      assert.ok(src.includes('"deactivated_at"') && src.includes('"inactive_until"') && src.includes('"deactivated_by"'));
      assert.ok(!src.includes("deactivation_note"));
      assert.ok(src.includes("member_inactive_until_needs_deactivation"));
      assert.ok(/primaryKey\(\{ columns: \[table\.memberId\] \}\)/.test(src));
      // T-003b: CHECK hesla jen s rolí je pryč i ze schématu (heslo smí mít držitel funkce)
      assert.ok(!/member_password_only_for_management/.test(src.replace(/\/\/.*$/gm, "")));
      assert.ok(src.includes("member_management_requires_credentials"));
    },
  },
  // ── T-003b: aktivita, deaktivace, heslo držitele funkce, pojistka účtu se správou členů ──
  {
    name: "T1. isMemberActive: bez deaktivace, do odvolání, do data včetně (dnes neaktivní, včera aktivní, zítra neaktivní)",
    run: () => {
      const today = "2026-11-30";
      assert.equal(isMemberActive({ deactivatedAt: null, inactiveUntil: null }, today), true);
      const at = new Date("2026-10-19T10:00:00Z");
      assert.equal(isMemberActive({ deactivatedAt: at, inactiveUntil: null }, today), false, "do odvolání");
      assert.equal(isMemberActive({ deactivatedAt: at, inactiveUntil: "2026-11-30" }, today), false, "dnes = poslední neaktivní den");
      assert.equal(isMemberActive({ deactivatedAt: at, inactiveUntil: "2026-11-29" }, today), true, "včera = aktivní");
      assert.equal(isMemberActive({ deactivatedAt: at, inactiveUntil: "2026-12-01" }, today), false, "zítra");
      assert.equal(deactivationLabel({ deactivatedAt: at, inactiveUntil: "2026-11-30" }, "2026-11-01", { withDate: true }), "Neaktivní do 30. 11. 2026");
      assert.equal(deactivationLabel({ deactivatedAt: at, inactiveUntil: null }, today, { withDate: true }), "Neaktivní do odvolání");
      assert.equal(deactivationLabel({ deactivatedAt: at, inactiveUntil: null }, today, { withDate: false }), "Neaktivní");
      assert.equal(deactivationLabel({ deactivatedAt: null, inactiveUntil: null }, today, { withDate: true }), null);
    },
  },
  {
    name: "T2. pragueToday na hraně dne a při přechodu času",
    run: () => {
      // 30. 11. 23:30 UTC je 1. 12. 0:30 v Praze: deaktivace do 30. 11. už neplatí
      assert.equal(pragueToday(new Date("2026-11-30T23:30:00Z")), "2026-12-01");
      assert.equal(isMemberActive({ deactivatedAt: new Date(), inactiveUntil: "2026-11-30" }, pragueToday(new Date("2026-11-30T23:30:00Z"))), true);
      assert.equal(pragueToday(new Date("2026-11-30T22:30:00Z")), "2026-11-30");
      // 25. 10. 2026 se v noci vrací čas (CEST na CET): půlnoc 26. 10. je 23:00 UTC 25. 10.
      assert.equal(pragueToday(new Date("2026-10-24T22:30:00Z")), "2026-10-25");
      assert.equal(pragueToday(new Date("2026-10-25T22:59:00Z")), "2026-10-25");
      assert.equal(pragueToday(new Date("2026-10-25T23:00:00Z")), "2026-10-26");
    },
  },
  {
    name: "T3. validateInactiveUntil: null, včera, dnes, +730, +731, špatný formát",
    run: () => {
      const today = "2026-10-19";
      assert.deepEqual(validateInactiveUntil(null, today), { ok: true, value: null });
      assert.deepEqual(validateInactiveUntil("", today), { ok: true, value: null });
      assert.deepEqual(validateInactiveUntil("2026-10-18", today), { ok: false, error: "Datum nesmí být v minulosti." });
      assert.deepEqual(validateInactiveUntil("2026-10-19", today), { ok: true, value: "2026-10-19" });
      const max = addDaysToDateString(today, 730);
      assert.deepEqual(validateInactiveUntil(max, today), { ok: true, value: max });
      assert.deepEqual(validateInactiveUntil(addDaysToDateString(today, 731), today), {
        ok: false,
        error: "Datum může být nejpozději za dva roky.",
      });
      for (const bad of ["19. 10. 2026", "2026-13-01", "2026-02-31", "abc", "2026-1-1"]) {
        assert.deepEqual(validateInactiveUntil(bad, today), { ok: false, error: DEACTIVATION_TEXTS.invalidDate }, bad);
      }
    },
  },
  {
    name: "T4. decideDeactivation: sebe, neexistující, už neaktivní, poslední aktivní účet se správou členů, prošlá deaktivace jde přepsat",
    run: () => {
      const today = "2026-10-19";
      const target = (o: Partial<{ deactivatedAt: Date | null; inactiveUntil: string | null; isActiveManager: boolean }> = {}) => ({
        id: "t1",
        deactivatedAt: null as Date | null,
        inactiveUntil: null as string | null,
        isActiveManager: false,
        ...o,
      });
      const base = { actorId: "a1", otherActiveManagers: 1, todayPrague: today };
      assert.deepEqual(decideDeactivation({ ...base, target: null }), {
        ok: false, error: "not-found", message: "Člen nebyl nalezen.",
      });
      assert.deepEqual(decideDeactivation({ ...base, target: { ...target(), id: "a1" } }), {
        ok: false, error: "self", message: "Sám sebe deaktivovat nejde.",
      });
      assert.deepEqual(decideDeactivation({ ...base, target: target({ deactivatedAt: new Date(), inactiveUntil: null }) }), {
        ok: false, error: "already-inactive", message: "Člen je už neaktivní, obnov stránku.",
      });
      assert.deepEqual(
        decideDeactivation({ ...base, otherActiveManagers: 0, target: target({ isActiveManager: true }) }),
        { ok: false, error: "last-manager", message: "Posledního aktivního admina deaktivovat nejde." }
      );
      assert.deepEqual(decideDeactivation({ ...base, otherActiveManagers: 1, target: target({ isActiveManager: true }) }), { ok: true });
      // člen bez správy členů projde, i když žádný další správce není
      assert.deepEqual(decideDeactivation({ ...base, otherActiveManagers: 0, target: target() }), { ok: true });
      // prošlá deaktivace (včera naposledy neaktivní) není „už neaktivní“
      assert.deepEqual(
        decideDeactivation({ ...base, target: target({ deactivatedAt: new Date(), inactiveUntil: "2026-10-18" }) }),
        { ok: true }
      );
    },
  },
  {
    name: "T5. checkSession: inactive u všech tří způsobů přihlášení, má přednost před verzí, neexistující člen před neaktivním",
    run: () => {
      const today = "2026-10-19";
      const at = new Date("2026-10-01T10:00:00Z");
      const cookie = (o: Partial<SessionCookieState>): SessionCookieState => ({
        memberId: "m1", managementRole: null, authMethod: "magic_link", sv: 0, ...o,
      });
      for (const [method, role] of [
        ["magic_link", null], ["email_link", null], ["password", "moderator"],
      ] as const) {
        const row = { sessionVersion: 0, managementRole: role, hasFunction: false, deactivatedAt: at, inactiveUntil: null };
        assert.deepEqual(checkSession(cookie({ authMethod: method, managementRole: role }), row, today), { valid: false, reason: "inactive" }, method);
      }
      // po datu je zase aktivní
      assert.equal(
        checkSession(cookie({}), { sessionVersion: 0, managementRole: null, deactivatedAt: at, inactiveUntil: "2026-10-18" }, today).valid,
        true
      );
      // dnes je poslední neaktivní den
      assert.deepEqual(
        checkSession(cookie({}), { sessionVersion: 0, managementRole: null, deactivatedAt: at, inactiveUntil: "2026-10-19" }, today),
        { valid: false, reason: "inactive" }
      );
      // neaktivita před verzí (deaktivace zvyšuje i verzi, obě pojistky platí)
      assert.deepEqual(
        checkSession(cookie({ sv: 0 }), { sessionVersion: 1, managementRole: null, deactivatedAt: at, inactiveUntil: null }, today),
        { valid: false, reason: "inactive" }
      );
      assert.deepEqual(checkSession(cookie({}), null, today), { valid: false, reason: "member-missing" });
    },
  },
  {
    name: "T5b. checkSession: heslo držitele funkce bez role platí, heslo bez role i bez funkce ne",
    run: () => {
      const c: SessionCookieState = { memberId: "m1", managementRole: null, authMethod: "password", sv: 2 };
      assert.equal(checkSession(c, { sessionVersion: 2, managementRole: null, hasFunction: true }, "2026-10-19").valid, true);
      assert.deepEqual(checkSession(c, { sessionVersion: 2, managementRole: null, hasFunction: false }, "2026-10-19"), {
        valid: false,
        reason: "no-password-access",
      });
      assert.deepEqual(checkSession(c, { sessionVersion: 2, managementRole: null }, "2026-10-19"), {
        valid: false,
        reason: "no-password-access",
      });
      // role v cookie musí dál sedět s DB
      const withRole: SessionCookieState = { ...c, managementRole: "admin" };
      assert.deepEqual(checkSession(withRole, { sessionVersion: 2, managementRole: null, hasFunction: true }, "2026-10-19"), {
        valid: false,
        reason: "role-mismatch",
      });
    },
  },
  {
    name: "T5c. hasPasswordAccess a hasPasswordSession: role NEBO funkce, jen session s heslem",
    run: () => {
      assert.equal(hasPasswordAccess({ managementRole: "moderator", hasFunction: false }), true);
      assert.equal(hasPasswordAccess({ managementRole: null, hasFunction: true }), true);
      assert.equal(hasPasswordAccess({ managementRole: null, hasFunction: false }), false);
      assert.equal(hasPasswordAccess({ managementRole: undefined, hasFunction: false }), false);
      assert.equal(hasPasswordSession({ authMethod: "password", managementRole: null, functionNames: ["Prezident"] }), true);
      assert.equal(hasPasswordSession({ authMethod: "password", managementRole: "admin", functionNames: [] }), true);
      assert.equal(hasPasswordSession({ authMethod: "password", managementRole: null, functionNames: [] }), false);
      assert.equal(hasPasswordSession({ authMethod: "email_link", managementRole: null, functionNames: ["Prezident"] }), false);
      assert.equal(hasPasswordSession(null), false);
    },
  },
  {
    name: "T6. planLoginLinkRequest: neaktivní = send false reason inactive, stejný message jako ostatní větve; krok 1 pustí k heslu i držitele funkce",
    run: () => {
      const member = (o: Record<string, unknown> = {}) => ({
        id: "m1", name: "Jana", email: "j@x.cz", managementRole: null as string | null, ...o,
      });
      const inactive = planLoginLinkRequest({ blocked: null, member: member({ active: false }) });
      assert.deepEqual(inactive, { send: false, reason: "inactive", message: LOGIN_LINK_RESPONSE_TEXT });
      const others = [
        planLoginLinkRequest({ blocked: null, member: null }),
        planLoginLinkRequest({ blocked: null, member: member({ email: null }) }),
        planLoginLinkRequest({ blocked: null, member: member() }),
        planLoginLinkRequest({ blocked: { key: "k", max: 1, scope: "ip" }, member: null }),
      ];
      for (const o of others) assert.equal(o.message, inactive.message);
      // aktivní s funkcí dostane větu o heslu v mailu
      const withFn = planLoginLinkRequest({ blocked: null, member: member({ hasFunction: true, active: true }) });
      assert.equal(withFn.send && withFn.isManagement, true);
      // neaktivní bez e-mailu je pořád `inactive` (rozhoduje aktivita, ne e-mail)
      assert.equal(planLoginLinkRequest({ blocked: null, member: member({ email: null, active: false }) }).reason, "inactive");
      // krok 1: heslo s rolí, s funkcí; bez obojího na odkaz
      assert.deepEqual(planLoginStart({ blocked: null, member: { email: "a@x", managementRole: null, passwordHash: "h", hasFunction: true } }), { next: "password" });
      assert.deepEqual(planLoginStart({ blocked: null, member: { email: "a@x", managementRole: "moderator", passwordHash: "h" } }), { next: "password" });
      assert.deepEqual(planLoginStart({ blocked: null, member: { email: "a@x", managementRole: null, passwordHash: "h", hasFunction: false } }), { next: "link" });
      assert.deepEqual(planLoginStart({ blocked: null, member: { email: "a@x", managementRole: null, passwordHash: null, hasFunction: true } }), { next: "link" });
    },
  },
  {
    name: "T7. planVotingDispatch: neaktivní bez e-mailu je inactive (ne no-email), neaktivní s odkazem, totalMembers jen aktivní, skippedInactive",
    run: () => {
      const m = (id: string, active: boolean, email: string | null = `${id}@x.cz`): PlanMember => ({
        memberId: id, memberName: `Clen ${id}`, memberEmail: email, active,
      });
      const members = [m("a", true), m("b", false), m("c", false, null), m("d", true, null)];
      const plan = planVotingDispatch({
        members,
        links: [{ memberId: "b", revokedAt: null, linkEmailSentAt: null }],
        mode: "start",
      });
      const byId = new Map(plan.rows.map((r) => [r.memberId, r.action]));
      assert.deepEqual(byId.get("a"), { kind: "send", createLink: true });
      assert.deepEqual(byId.get("b"), { kind: "skip", reason: "inactive" }, "neaktivní s odkazem");
      assert.deepEqual(byId.get("c"), { kind: "skip", reason: "inactive" }, "neaktivní bez e-mailu je inactive");
      assert.deepEqual(byId.get("d"), { kind: "skip", reason: "no-email" });
      assert.equal(plan.counts.totalMembers, 2, "jen aktivní");
      assert.equal(plan.counts.withEmail, 1);
      assert.equal(plan.counts.skippedInactive, 2);
      assert.equal(plan.counts.skippedNoEmail, 1);
      assert.deepEqual(plan.linksToCreate, ["a"], "neaktivnímu se odkaz nezakládá");
      assert.equal(plan.rows.length, 4, "rows drží všechny členy");
    },
  },
  {
    name: "T8. připomínky a ranní kroky berou jen aktivní členy (statická kontrola míst z arch 5.3)",
    run: () => {
      const src = (f: string) => stripComments(read(f));
      assert.ok(/getActiveMembers\(\)/.test(src("lib/meetings/reminder-run.ts")) && !/getMembers\(\)/.test(src("lib/meetings/reminder-run.ts")));
      assert.ok(/getActiveMembers\(\)/.test(src("app/api/cron/renew-tokens/route.ts")) && !/getMembers\(\)/.test(src("app/api/cron/renew-tokens/route.ts")));
      assert.ok(/getActiveMembers\(\)/.test(src("app/api/meetings/[id]/export-list/route.ts")));
      assert.ok(/getActiveMembers\(\)/.test(src("app/(app)/meetings/[id]/page.tsx")));
      assert.ok(/getActiveMembers\(\)/.test(src("app/(app)/mastermind/new/page.tsx")));
      const cron = src("app/api/cron/close-voting/route.ts");
      // obnova odkazů v ranním cronu jen aktivním, dispatch a jeho pre-check přes příznak `active`
      assert.ok(/renewExpiringTokens[\s\S]*getActiveMembers\(\)/.test(cron));
      assert.ok(/active: isMemberActive\(m, todayForPlan\)/.test(cron));
      assert.ok(cron.includes("cleanupExpiredDeactivations()"), "úklid prošlých deaktivací ve fázi 6");
      const dispatch = src("lib/meetings/voting-dispatch.ts");
      assert.ok(/active: isActive\(m\)/.test(dispatch) && /getMembers\(\)/.test(dispatch));
      assert.ok(/row\.action\.reason !== "inactive"/.test(dispatch), "o neaktivním se do ops logu nepíše");
    },
  },
  {
    name: "T10. decideFunctionChange: assign, change, remove, noop, sebe, bez e-mailu, poslední účet se správou členů",
    run: () => {
      const t = (o: Partial<{ id: string; managementRole: string | null; email: string | null; currentFunctionId: string | null; isActiveManager: boolean; hasManageFunction: boolean }> = {}) => ({
        id: "t1", managementRole: null as string | null, email: "t@x.cz", currentFunctionId: null as string | null,
        isActiveManager: false, hasManageFunction: false, ...o,
      });
      const base = {
        actorId: "a1", actorIsAdmin: true, newFunctionId: "f1", newFunctionExists: true,
        newFunctionGivesMembersManage: false, otherActiveManagers: 1,
      };
      assert.deepEqual(decideFunctionChange({ ...base, target: t() }), { ok: true, kind: "assign", clearsPassword: false });
      assert.deepEqual(decideFunctionChange({ ...base, target: t({ currentFunctionId: "f0" }) }), { ok: true, kind: "change", clearsPassword: false });
      assert.deepEqual(decideFunctionChange({ ...base, newFunctionId: null, newFunctionExists: false, target: t({ currentFunctionId: "f0" }) }), {
        ok: true, kind: "remove", clearsPassword: true,
      });
      // odebrání člena, který má i roli: heslo zůstává
      assert.deepEqual(
        decideFunctionChange({ ...base, newFunctionId: null, newFunctionExists: false, target: t({ currentFunctionId: "f0", managementRole: "moderator" }) }),
        { ok: true, kind: "remove", clearsPassword: false }
      );
      assert.deepEqual(decideFunctionChange({ ...base, target: t({ currentFunctionId: "f1" }) }), { ok: true, kind: "noop", clearsPassword: false });
      assert.deepEqual(decideFunctionChange({ ...base, newFunctionId: null, newFunctionExists: false, target: t() }), { ok: true, kind: "noop", clearsPassword: false });
      assert.deepEqual(decideFunctionChange({ ...base, target: null }), { ok: false, error: "not-found" });
      assert.deepEqual(decideFunctionChange({ ...base, newFunctionExists: false, target: t() }), { ok: false, error: "function-not-found" });
      // sebe jen admin
      assert.deepEqual(decideFunctionChange({ ...base, actorIsAdmin: false, target: t({ id: "a1" }) }), { ok: false, error: "self" });
      assert.equal(decideFunctionChange({ ...base, actorIsAdmin: true, target: t({ id: "a1" }) }).ok, true);
      // bez e-mailu nejde dát funkci (přihlašovací jméno), odebrat jde
      assert.deepEqual(decideFunctionChange({ ...base, target: t({ email: null }) }), { ok: false, error: "no-email" });
      assert.deepEqual(decideFunctionChange({ ...base, target: t({ email: "  " }) }), { ok: false, error: "no-email" });
      assert.equal(
        decideFunctionChange({ ...base, newFunctionId: null, newFunctionExists: false, target: t({ email: null, currentFunctionId: "f0" }) }).ok,
        true
      );
      // pojistka posledního účtu: Prezident (funkce s members.manage) je jediný správce
      const president = t({ currentFunctionId: "p", isActiveManager: true, hasManageFunction: true });
      assert.deepEqual(
        decideFunctionChange({ ...base, otherActiveManagers: 0, newFunctionId: null, newFunctionExists: false, target: president }),
        { ok: false, error: "last-manager" }
      );
      assert.deepEqual(
        decideFunctionChange({ ...base, otherActiveManagers: 0, newFunctionGivesMembersManage: false, target: president }),
        { ok: false, error: "last-manager" },
        "výměna za funkci bez members.manage"
      );
      assert.equal(
        decideFunctionChange({ ...base, otherActiveManagers: 0, newFunctionGivesMembersManage: true, target: president }).ok,
        true,
        "výměna za funkci s members.manage"
      );
      assert.equal(
        decideFunctionChange({ ...base, otherActiveManagers: 1, newFunctionId: null, newFunctionExists: false, target: president }).ok,
        true,
        "je další správce"
      );
      // admin s funkcí zůstává správcem přes roli
      assert.equal(
        decideFunctionChange({
          ...base, otherActiveManagers: 0, newFunctionId: null, newFunctionExists: false,
          target: t({ managementRole: "admin", currentFunctionId: "p", isActiveManager: true }),
        }).ok,
        true
      );
      assert.equal(functionChangeErrorText("self"), "Vlastní funkci měnit nejde.");
      assert.equal(functionChangeErrorText("last-manager"), "Posledního aktivního admina sesadit nejde.");
    },
  },
  {
    name: "T10b. decideRoleChange: poslední účet se správou členů drží adminCount (včetně cíle) <= 1, text podle gate",
    run: () => {
      const target = { id: "t1", managementRole: "admin", email: "t@x.cz" };
      const d = decideRoleChange({ actorId: "a1", target, newRole: "none", adminCount: 1 });
      assert.deepEqual(d, { ok: false, error: "last-admin" });
      assert.equal(decideRoleChange({ actorId: "a1", target, newRole: "none", adminCount: 2 }).ok, true);
      const src = stripComments(read("lib/auth/role-change.ts"));
      assert.ok(src.includes("Posledního aktivního admina sesadit nejde."));
      // akce počítá počet z kontextu (admin NEBO funkce s members.manage, jen aktivní), ne countAdmins
      const action = stripComments(read("actions/member-access.ts"));
      assert.ok(action.includes("getManagerContext(") && !action.includes("countAdmins"));
      assert.ok(/ctx\.otherActiveManagers \+ \(targetLosesManagement \? 1 : 2\)/.test(action));
    },
  },
  {
    name: "T11. decideMeetingTokenAccess: neaktivní člen = revoked u hlavní cesty i aliasu, po návratu zase ok, alias s jiným hashem zůstává invalid",
    run: () => {
      const NOW = new Date("2026-10-19T10:00:00Z");
      const link = (o: Record<string, unknown> = {}) => ({
        id: "l1", meetingId: "mt1", memberId: "m1", tokenHash: "h1",
        revokedAt: null, expiresAt: new Date("2026-10-30T00:00:00Z"), ...o,
      });
      assert.deepEqual(decideMeetingTokenAccess({ source: { kind: "link" }, now: NOW, link: link({ memberActive: false }) }), { status: "revoked" });
      assert.deepEqual(
        decideMeetingTokenAccess({ source: { kind: "reminder", linkTokenHash: "h1" }, now: NOW, link: link({ memberActive: false }) }),
        { status: "revoked" }
      );
      assert.equal(decideMeetingTokenAccess({ source: { kind: "link" }, now: NOW, link: link({ memberActive: true }) }).status, "ok");
      assert.equal(decideMeetingTokenAccess({ source: { kind: "link" }, now: NOW, link: link() }).status, "ok", "chybějící pole = aktivní");
      assert.deepEqual(
        decideMeetingTokenAccess({ source: { kind: "reminder", linkTokenHash: "old" }, now: NOW, link: link({ memberActive: false }) }),
        { status: "invalid" }
      );
      const src = stripComments(read("lib/auth/meeting-magic.ts"));
      assert.equal((src.match(/memberActiveSql\("member"\)/g) ?? []).length, 2, "obě větve (hlavní i alias)");
      const iv = stripComments(read("lib/auth/interview-magic.ts"));
      assert.ok(iv.includes('memberActiveSql("member")') && iv.includes("!link.leaderActive"), "vedoucí pohovoru");
    },
  },
  {
    name: "T12a. memberActiveSql se volá jen s řetězcovým literálem (alias nikdy ze vstupu)",
    run: () => {
      const bad: string[] = [];
      for (const f of allSources) {
        const rel = relative(ROOT, f).split("\\").join("/");
        if (rel === "lib/db/queries/member-active.ts") continue;
        const src = stripComments(readFileSync(f, "utf8"));
        for (const m of src.matchAll(/(memberActiveSql|memberManagesMembersSql|memberHasManageFunctionSql)\(([^)]*)\)/g)) {
          if (!/^"[a-z]+"$/.test(m[2].trim())) bad.push(`${rel}: ${m[0]}`);
        }
      }
      assert.deepEqual(bad, []);
      const decl = stripComments(read("lib/db/queries/member-active.ts"));
      assert.ok(/type MemberAlias = "[a-z"| ]+;/.test(decl), "alias je typ z pevných literálů");
      assert.ok(decl.includes("sql.raw(alias)"));
    },
  },
  {
    name: "T12b. všechna místa z arch 5.2 a 5.3 volají getActiveMembers nebo memberActiveSql",
    run: () => {
      const need: Array<[string, RegExp]> = [
        ["lib/db/queries/members.ts", /getMemberByTokenHash[\s\S]*memberActiveSql\("member"\)[\s\S]*getMemberByPreviousTokenHash[\s\S]*memberActiveSql\("member"\)/],
        ["lib/db/queries/members.ts", /async function setOwnPassword[\s\S]*memberActiveSql\("member"\)/],
        ["lib/db/queries/members.ts", /async function getManagementRecipients[\s\S]*memberActiveSql\("member"\)/],
        ["lib/db/queries/events.ts", /getEventByParticipantToken[\s\S]*memberActiveSql\("member"\)/],
        ["lib/db/queries/events.ts", /getEventParticipants[\s\S]*memberActiveSql\("member"\)/],
        ["lib/db/queries/interviews.ts", /getInterviewDueList[\s\S]*memberActiveSql\("member"\)/],
        ["lib/db/queries/mastermind.ts", /getCasesForOverview[\s\S]*memberActiveSql\("p"\)[\s\S]*memberActiveSql\("m"\)/],
        ["lib/db/queries/mastermind.ts", /async function getCaseById[\s\S]*memberActiveSql\("p"\)/],
        ["lib/db/queries/mastermind.ts", /async function getDashboardMastermindRows[\s\S]*memberActiveSql\("p"\)/],
        ["lib/db/queries/mastermind.ts", /async function getThursdayData[\s\S]*memberActiveSql\("p"\)/],
        ["lib/db/queries/mastermind.ts", /async function addInterest[\s\S]*memberActiveSql\("p"\)/],
        ["lib/db/queries/mastermind.ts", /async function countInterest[\s\S]*memberActiveSql\("m"\)/],
        ["lib/db/queries/burza.ts", /async function getOffersForOverview[\s\S]*memberActiveSql\("m"\)/],
        ["lib/db/queries/burza.ts", /async function getContactItemsForOverview[\s\S]*memberActiveSql\("m"\)/],
        ["lib/db/queries/burza.ts", /async function getMembersWithoutOffer[\s\S]*memberActiveSql\("m"\)/],
        ["lib/db/queries/burza.ts", /async function getOfferHolderNames[\s\S]*memberActiveSql\("m"\)/],
        ["lib/db/queries/burza.ts", /async function getMemberNames[\s\S]*memberActiveSql\("m"\)/],
        ["lib/db/queries/burza.ts", /async function recordHelpGuarded[\s\S]*memberActiveSql\("hm"\)/],
        ["lib/db/queries/burza.ts", /async function setContactUsedGuarded[\s\S]*memberActiveSql\("hm"\)/],
        ["app/api/meetings/[id]/member-links/route.ts", /isInactive: sql<boolean>`NOT \$\{memberActiveSql\("member"\)\}`/],
        ["actions/events.ts", /isEventParticipantAllowed\(participantId\)/],
        ["actions/participant-events.ts", /isEventParticipantAllowed\(participantId\)/],
        ["app/e/[eventId]/page.tsx", /!participant\.memberActive/],
        ["actions/interviews.ts", /Vedoucí pohovoru je neaktivní\. Vyber jiného\./],
        ["app/api/meetings/[id]/member-links/[memberId]/send-email/route.ts", /409/],
        ["app/api/meetings/[id]/member-links/[memberId]/regenerate/route.ts", /409/],
      ];
      const problems: string[] = [];
      for (const [file, re] of need) {
        if (!re.test(stripComments(read(file)))) problems.push(`${file}: ${re}`);
      }
      assert.deepEqual(problems, []);
      // Burza a Master mind: texty z gate sekce 5
      assert.ok(read("lib/burza/rules.ts").includes("Karta teď není k dispozici."));
      assert.ok(read("lib/mastermind/rules.ts").includes("Téma teď není k dispozici."));
      assert.ok(read("app/api/meetings/[id]/member-links/[memberId]/send-email/route.ts").includes("Člen je neaktivní, odkaz mu teď poslat nejde."));
    },
  },
  {
    name: "T12c. deaktivace bez poznámky (Z1): žádný deactivation_note a žádné datum deaktivace v logu",
    run: () => {
      for (const f of allSources) {
        const rel = relative(ROOT, f).split("\\").join("/");
        if (rel === "scripts/test-iter-037-members.ts") continue;
        assert.ok(!/deactivation_note|deactivationNote/.test(readFileSync(f, "utf8")), `${rel}: poznámka k deaktivaci`);
      }
      const act = stripComments(read("actions/member-status.ts"));
      const deact = functionBody(act, "deactivateMemberAction");
      const logBlock = deact.slice(deact.indexOf("safeLog"));
      assert.ok(logBlock.includes('message: "Člen deaktivován."'));
      assert.ok(!/until|detail/.test(logBlock), "do logu nejde datum ani detail");
      const react = functionBody(act, "reactivateMemberAction");
      assert.ok(react.includes('message: "Člen je zase aktivní."'));
      assert.ok(!/updateDeactivation[\s\S]*safeLog/.test(functionBody(act, "updateDeactivationAction")), "změna data se neloguje");
    },
  },
  {
    name: "T12d. stránka /magic neexistuje, /api/auth/magic zůstává (starý osobní odkaz)",
    run: () => {
      assert.throws(() => statSync(join(ROOT, "app", "(auth)", "magic")));
      assert.throws(() => statSync(join(ROOT, "scripts", "revoke-member4-link.ts")));
      statSync(join(ROOT, "app", "api", "auth", "magic", "route.ts"));
      const refs: string[] = [];
      for (const f of allSources) {
        const rel = relative(ROOT, f).split("\\").join("/");
        if (/["'`]\/magic[?"'`/]/.test(stripComments(readFileSync(f, "utf8")))) refs.push(rel);
      }
      assert.deepEqual(refs, [], "žádný odkaz na /magic");
    },
  },
  {
    name: "T13. Zneplatnit odkaz: SQL nuluje všechny čtyři sloupce tokenů, token_used = true, session_version + 1, odkazy z mailu; getMemberBy*TokenHash chce token_used = false; žádný updateTokenUsed",
    run: () => {
      const src = stripComments(read("lib/db/queries/members.ts"));
      const body = src.slice(src.indexOf("export async function revokeMagicLinkGuarded"));
      const fn = body.slice(0, body.indexOf("\n}\n"));
      for (const col of [
        "magic_token_hash = NULL",
        "token_expires_at = NULL",
        "previous_token_hash = NULL",
        "previous_token_expires_at = NULL",
        "token_used = true",
        "session_version = session_version + 1",
      ]) assert.ok(fn.includes(col), col);
      assert.ok(fn.includes("member_login_link") && fn.includes("purpose = 'login'"));
      assert.ok(!/db\.transaction|\.transaction\(/.test(fn), "bez transakce (LL-003)");
      assert.equal((src.match(/eq\(member\.tokenUsed, false\)/g) ?? []).length, 2, "obě getMemberBy*TokenHash");
      assert.ok(!/updateTokenUsed/.test(src));
      const actions = stripComments(read("actions/members.ts"));
      assert.ok(!/updateTokenUsed/.test(actions));
      const rev = functionBody(actions, "revokeTokenAction");
      assert.ok(rev.includes("revokeMagicLinkGuarded(memberId, actor.memberId)") && rev.includes("access.magic-link-revoked"));
      // žádný záložní nový odkaz: revokace nevolá generateMagicToken ani mail
      assert.ok(!/generateMagicToken|sendMagicLinkEmail/.test(rev));
      // UI: Zneplatnit odkaz místo Revokovat
      const ui = read("app/(app)/admin/members/MemberActions.tsx");
      assert.ok(ui.includes("Zneplatnit odkaz") && !/Revokovat/.test(ui));
      assert.ok(ui.includes("Osobní odkaz přestane platit hned a člen se odhlásí ze všech zařízení."));
      assert.ok(ui.includes("Odkaz už neplatí."));
    },
  },
  {
    name: "T14. deaktivace: jeden SQL příkaz (session_version + 1, odkazy z mailu, témata Master mindu, pojistky ve WHERE), bez transakce",
    run: () => {
      const src = stripComments(read("lib/db/queries/member-status.ts"));
      const body = src.slice(src.indexOf("export async function deactivateMemberGuarded"));
      const fn = body.slice(0, body.indexOf("\n}\n"));
      for (const part of [
        "deactivated_at  = now()",
        "session_version = t.session_version + 1",
        "t.id <> ${actorId}::uuid",
        "memberActiveSql(\"t\")",
        "FOR UPDATE OF m",
        "UPDATE member_login_link SET used_at = now()",
        "UPDATE mastermind_case c SET status = 'proposed'",
        "c.status = 'scheduled' AND c.internal_date >= today.d",
        "managers.id <> t.id",
      ]) assert.ok(fn.includes(part), part);
      assert.ok(!/db\.transaction|\.transaction\(/.test(src), "LL-003");
      // reaktivace nemění session ani témata
      const re = src.slice(src.indexOf("export async function reactivateMemberGuarded"));
      assert.ok(!/session_version|mastermind_case/.test(re.slice(0, re.indexOf("\n}\n"))));
      // úklid prošlých deaktivací: jen `inactive_until < dnes` v Praze
      const cl = src.slice(src.indexOf("export async function cleanupExpiredDeactivations"));
      assert.ok(cl.includes("inactive_until < (now() AT TIME ZONE 'Europe/Prague')::date"));
      // akce: guard, validace data, rozhodnutí před příkazem
      const act = stripComments(read("actions/member-status.ts"));
      const d = functionBody(act, "deactivateMemberAction");
      assert.ok(d.indexOf("requirePermission(\"members.deactivate\")") < d.indexOf("validateInactiveUntil"));
      assert.ok(d.indexOf("decideDeactivation(") < d.indexOf("deactivateMemberGuarded("));
    },
  },
  {
    name: "T15. pojistka posledního účtu se správou členů: role, funkce, deaktivace i smazání jedou přes CTE managers (aktivní, heslo, admin nebo funkce s members.manage)",
    run: () => {
      const members = stripComments(read("lib/db/queries/members.ts"));
      assert.ok(!/countAdmins/.test(members));
      assert.ok(!/management_role = 'admin' ORDER BY id FOR UPDATE/.test(members), "stará CTE admins je pryč");
      for (const name of ["setMemberRoleGuarded", "deleteMemberGuarded"]) {
        const b = members.slice(members.indexOf(`export async function ${name}`));
        const fn = b.slice(0, b.indexOf("\n}\n"));
        assert.ok(fn.includes("WITH managers AS") || fn.includes("managers AS"), `${name}: managers`);
        assert.ok(fn.includes('memberActiveSql("m")') && fn.includes('memberManagesMembersSql("m")'), `${name}: aktivní účet se správou`);
        assert.ok(fn.includes("FOR UPDATE OF m"), `${name}: zámek`);
      }
      const fns = stripComments(read("lib/db/queries/member-functions.ts"));
      assert.equal((fns.match(/managers AS \(/g) ?? []).length, 2, "přidělení i odebrání funkce");
      const decl = stripComments(read("lib/db/queries/member-active.ts"));
      assert.ok(decl.includes("password_hash IS NOT NULL"));
      assert.ok(decl.includes("management_role = 'admin'"));
      assert.ok(decl.includes('functionGrantsSql(sql`cf.permissions`, "members.manage")'), "members.manage z funkce přes značku");
      assert.ok(decl.includes("ADMIN_DELEGABLE_MARKER") && decl.includes("NON_DELEGABLE"));
      // smazání člena hlásí poslední účet dřív, než se uklidí poznámky z burzy
      const del = functionBody(stripComments(read("actions/members.ts")), "deleteMemberAction");
      assert.ok(del.indexOf("getManagerContext(") < del.indexOf("clearHelpNotesForRecipient"));
      assert.ok(del.includes("Posledního aktivního admina smazat nejde."));
    },
  },
  {
    name: "T16. heslo držitele funkce: jedno místo pravdy hasPasswordAccess, přihlášení, nastavení hesla, reset a funkce; odebrání poslední role i funkce heslo maže",
    run: () => {
      const login = functionBody(stripComments(read("actions/auth.ts")), "loginAction");
      assert.ok(login.includes("hasPasswordAccess("));
      assert.ok(login.indexOf("compare(password, usableHash)") < login.indexOf("isMemberActive("), "hláška o pozastavení až po ověření hesla");
      assert.ok(login.indexOf("isMemberActive(") < login.indexOf("createSession"), "session nevznikne");
      assert.ok(read("actions/auth.ts").includes("Přístup máš teď pozastavený. Když je to omyl, ozvi se adminovi."));
      const members = stripComments(read("lib/db/queries/members.ts"));
      const setPw = members.slice(members.indexOf("export async function setOwnPassword"));
      assert.ok(setPw.slice(0, setPw.indexOf("\n}\n")).includes("member_function"), "setOwnPassword zná funkci");
      const reset = members.slice(members.indexOf("export async function resetPasswordGuarded"));
      assert.ok(reset.slice(0, reset.indexOf("\n}\n")).includes("member_function"));
      // sesazení role: heslo smaže jen ten, kdo nemá ani funkci
      const role = members.slice(members.indexOf("export async function setMemberRoleGuarded"));
      const roleFn = role.slice(0, role.indexOf("\n}\n"));
      assert.ok(/CASE WHEN EXISTS \(SELECT 1 FROM member_function mf WHERE mf\.member_id = member\.id\)/.test(roleFn));
      const access = stripComments(read("actions/member-access.ts"));
      assert.ok(access.includes("hasPasswordAccess(") && !/target\.managementRole !== "admin" && target\.managementRole !== "moderator"/.test(access));
      // odebrání funkce člena bez role: heslo NULL, verze + 1, odkazy set-password zneplatněné
      const fns = stripComments(read("lib/db/queries/member-functions.ts"));
      const rem = fns.slice(fns.indexOf("export async function removeMemberFunctionGuarded"));
      assert.ok(/password_hash = NULL, session_version = t\.session_version \+ 1/.test(rem));
      assert.ok(rem.includes("cur.management_role IS NULL") && rem.includes("purpose = 'set-password'"));
      // první funkce člena bez hesla: zámkový hash + verze + odkaz, člen s heslem si ho nechává
      const ass = fns.slice(fns.indexOf("export async function assignMemberFunctionGuarded"), fns.indexOf("export async function removeMemberFunctionGuarded"));
      assert.ok(ass.includes("cur.password_hash IS NULL") && ass.includes("AS needs_lock") && ass.includes("ON CONFLICT (member_id) DO UPDATE"));
      // L-1: člen bez role i bez funkce dostane zámkový hash vždy, i s nějakým starým hashem
      assert.ok(/cur\.old_fn IS NULL\s+AND \(cur\.management_role IS NULL/.test(ass), "L-1: needs_lock bez role i funkce");
      // MIN-1: čekající odkaz pro heslo = zámkový hash, mail znovu
      assert.ok(ass.includes("l.purpose = 'set-password' AND l.used_at IS NULL"), "MIN-1: čekající odkaz");
      assert.ok(!/db\.transaction|\.transaction\(/.test(fns), "LL-003");
      // e-mail s odkazem jde i držiteli funkce bez role
      assert.ok(read("lib/email/resend.ts").includes('"admin" | "moderator" | "function"'));
      // cron a externí volající kontrolují jen stavový kód 401: cron routes mají vlastní CRON_SECRET a text
      for (const f of ["app/api/cron/close-voting/route.ts", "app/api/cron/renew-tokens/route.ts", "app/api/cron/events-done/route.ts"]) {
        const src = stripComments(read(f));
        assert.ok(/status: 401/.test(src) && !src.includes("requirePermissionForRoute"), f);
      }
      const g = stripComments(read("lib/auth/guards.ts"));
      assert.ok(/status: opts\?\.status \?\? 401/.test(g), "API routes dál vrací 401");
    },
  },
  {
    name: "T17. nové ops kindy: terminální, mají štítek, bez poznámky a data",
    run: () => {
      const types = stripComments(read("lib/ops/types.ts"));
      const table = read("app/(app)/status/EventTable.tsx");
      for (const [kind, label] of [
        ["access.member-deactivated", "Deaktivace člena"],
        ["access.member-reactivated", "Návrat člena"],
        ["access.magic-link-revoked", "Zneplatnění odkazu"],
        ["access.functions-changed", "Změna funkcí"],
      ]) {
        assert.equal((types.match(new RegExp(`"${kind}"`, "g")) ?? []).length, 2, `${kind}: typ a TERMINAL_KINDS`);
        assert.ok(table.includes(`"${kind}": "${label}"`), kind);
      }
    },
  },
  // ── T-003c: UI ──
  {
    name: "U1. sessionHeaderLabel: funkce a role v záhlaví, běžný člen nic",
    run: () => {
      assert.equal(sessionHeaderLabel({ managementRole: "admin", functionNames: ["Prezident"] }), "Prezident, admin");
      assert.equal(sessionHeaderLabel({ managementRole: null, functionNames: ["Člen výboru"] }), "Člen výboru");
      assert.equal(sessionHeaderLabel({ managementRole: "admin", functionNames: [] }), "admin");
      assert.equal(sessionHeaderLabel({ managementRole: "moderator", functionNames: [] }), "moderátor");
      assert.equal(sessionHeaderLabel({ managementRole: null, functionNames: [] }), null);
      assert.equal(sessionHeaderLabel({ managementRole: null }), null);
      // QA nález 1: přihlášení odkazem dává práva člena, v záhlaví jen jméno (ani funkce z DB)
      for (const authMethod of ["magic_link", "email_link"]) {
        assert.equal(sessionHeaderLabel({ managementRole: null, functionNames: ["Prezident"], authMethod }), null);
        assert.equal(sessionHeaderLabel({ managementRole: "admin", functionNames: ["Prezident"], authMethod }), null);
      }
      assert.equal(
        sessionHeaderLabel({ managementRole: "admin", functionNames: ["Prezident"], authMethod: "password" }),
        "Prezident, admin"
      );
      assert.equal(roleLabel("moderator"), "Moderátor");
      assert.equal(roleLabel("admin"), "Admin");
      assert.equal(roleLabel(null), null);
      const layout = read("app/(app)/layout.tsx");
      assert.ok(layout.includes("sessionHeaderLabel(session)"));
      assert.ok(!layout.includes("({session.managementRole})"), "surová role v záhlaví");
    },
  },
  {
    name: "U2. personalLinkState: Platný do, Zneplatněný, Žádný, Vypršel",
    run: () => {
      const now = new Date("2026-10-19T10:00:00Z");
      assert.equal(
        personalLinkState({ magicTokenHash: "h", tokenExpiresAt: new Date("2026-10-24T08:00:00Z"), tokenUsed: false }, now).label,
        "Platný do 24. 10."
      );
      assert.equal(personalLinkState({ magicTokenHash: null, tokenExpiresAt: null, tokenUsed: true }, now).label, "Zneplatněný");
      assert.equal(personalLinkState({ magicTokenHash: null, tokenExpiresAt: null, tokenUsed: false }, now).label, "Žádný");
      assert.equal(
        personalLinkState({ magicTokenHash: "h", tokenExpiresAt: new Date("2026-10-18T08:00:00Z"), tokenUsed: false }, now).kind,
        "expired"
      );
    },
  },
  {
    name: "U3. seznam členů: karty bez tabulky, nadpis s neaktivními, Upravit, DnD s id, bez tokenů v klientu",
    run: () => {
      const list = read("app/(app)/admin/members/SortableMemberList.tsx");
      const page = read("app/(app)/admin/members/page.tsx");
      assert.ok(!list.includes("<table") && !list.includes("overflow-x-auto"), "tabulka přetéká na 390 px");
      assert.ok(list.includes('id="members-dnd"'), "DndContext se stabilním id");
      assert.ok(list.includes("Upravit ›") && list.includes("/admin/members/${m.id}"));
      assert.ok(!list.includes("magicTokenHash") && !list.includes("tokenUsed"), "hash tokenu do klienta nepatří");
      assert.ok(list.includes("min-h-[44px]") && list.includes("h-11 w-11"), "cíle klepnutí 44 px");
      assert.ok(page.includes("Členové (${members.length}, z toho neaktivní: ${inactiveCount})"));
      assert.ok(page.includes("Členové (${members.length})"));
      assert.ok(!page.includes("Všichni") && !page.includes("filtr"), "bez filtru (Z3)");
      assert.ok(list.includes("5 měsíců") && list.includes("10 měsíců"));
      for (const f of [
        "app/(app)/interviews/questions/SortableQuestionList.tsx",
        "app/(app)/meetings/[id]/SortableMeetingGuestList.tsx",
      ]) {
        assert.ok(/<DndContext\s+id="/.test(read(f)), `${f}: DndContext bez id`);
      }
    },
  },
  {
    name: "U4. stránka člena: právo, sekce a jejich práva, 404 pro cizí id, přesměrování po smazání",
    run: () => {
      const src = read("app/(app)/admin/members/[id]/page.tsx");
      assert.ok(src.includes('requirePageSession({ permission: "members.manage" })'));
      assert.ok(src.includes("notFound()") && src.includes("UUID_RE"));
      for (const t of ["Údaje", "Funkce a přístup", "Stav", "Osobní odkaz", "Smazat"]) {
        assert.ok(src.includes(`>${t}</h2>`), `sekce ${t}`);
      }
      assert.ok(src.includes('can(session, "access.manage")'));
      assert.ok(src.includes('can(session, "members.deactivate")'));
      assert.ok(src.includes('can(session, "members.delete")'));
      assert.ok(src.includes('redirectTo="/admin/members"'));
      assert.ok(!src.includes("passwordHash={") && !src.includes("magicTokenHash={"), "hash do klienta");
    },
  },
  {
    name: "U5. všechny akce T-003a/b mají UI a texty z gate sedí",
    run: () => {
      const ui = [
        "app/(app)/admin/members/MemberAccessControls.tsx",
        "app/(app)/admin/members/MemberStatusControls.tsx",
        "app/(app)/admin/members/MemberActions.tsx",
        "app/(app)/admin/members/DeleteMemberButton.tsx",
      ]
        .map(read)
        .join("\n");
      for (const a of [
        "deactivateMemberAction",
        "updateDeactivationAction",
        "reactivateMemberAction",
        "setMemberFunctionAction",
        "setMemberRoleAction",
        "revokeTokenAction",
        "resetMemberPasswordAction",
        "resendSetPasswordLinkAction",
        "issueSetPasswordLinkForCopyAction",
        "generateMagicLinkAction",
        "sendMagicLinkEmailAction",
        "deleteMemberAction",
      ]) {
        assert.ok(ui.includes(a), `UI nevolá ${a}`);
      }
      for (const t of [
        "Uložit funkci",
        "Člen dostane mailem odkaz pro nastavení hesla na adresu:",
        "Heslo se smaže, člen se bude přihlašovat odkazem z mailu.",
        "Vlastní funkci měnit nejde.",
        "Odkaz pro heslo pošli, až bude zase aktivní.",
        "Deaktivovat",
        "Do odvolání",
        "Do data",
        "Neaktivní do (včetně)",
        "Další den je člen zase aktivní, nic nemusíš dělat.",
        "Člen se hned odhlásí a nepřihlásí se odkazem ani heslem.",
        "Aktivovat hned",
        "Změnit",
        "Člen je neaktivní.",
        "Člen je zase aktivní.",
        "Změna uložena.",
        "Naplánované téma v Master mindu se vrátilo do zásobníku.",
        "Sám sebe deaktivovat nejde.",
        "Vygenerovat odkaz",
        "Poslat e-mailem",
        "Zneplatnit odkaz",
        "Osobní odkaz přestane platit hned a člen se odhlásí ze všech zařízení.",
        "Odkaz už neplatí.",
        "Neaktivnímu členovi odkaz neposíláme.",
      ]) {
        assert.ok(ui.includes(t), `chybí text: ${t}`);
      }
      assert.ok(read("app/(app)/admin/members/CreateMemberForm.tsx").includes("Nový člen vzniká bez funkce. Funkci nebo admina mu dáš na jeho stránce."));
    },
  },
  {
    name: "U6. žádné tlačítko v odkazu, žádný odkaz na /admin/funkce, žádné „moderátor“ v textu o právech funkcí",
    run: () => {
      const files = [
        "app/(app)/admin/members/page.tsx",
        "app/(app)/admin/members/[id]/page.tsx",
        "app/(app)/admin/members/SortableMemberList.tsx",
        "app/(app)/admin/members/MemberAccessControls.tsx",
        "app/(app)/admin/members/MemberStatusControls.tsx",
        "app/(app)/admin/members/MemberActions.tsx",
        "app/(app)/layout.tsx",
      ];
      for (const f of files) {
        const src = read(f);
        assert.ok(!/<Link\b[^>]*>(?:(?!<\/Link>)[\s\S])*<Button\b/.test(src), `${f}: <Button> v <Link>`);
        assert.ok(!src.includes("/admin/funkce"), `${f}: stránka /admin/funkce se nedělá`);
      }
      assert.ok(!/Revokovat/.test(files.map(read).join("\n")), "Revokovat v UI");
    },
  },
  {
    name: "U7. UI správy členů má diakritiku (bez ASCII podob z dřívějška)",
    run: () => {
      const bad = [
        "Nepodarilo", "Jmeno", "clena", "Clen ", "Poradi", "Zatim", "Pridejte", "Sprava", "smazan", "pridan",
        "aktualizovan", "Ulozit", "Zrusit", "Odeslan", "vygenerovan", "Zkopirovano", "Pouzit", "Aktivni<",
      ];
      for (const f of [
        "app/(app)/admin/members/page.tsx",
        "app/(app)/admin/members/[id]/page.tsx",
        "app/(app)/admin/members/SortableMemberList.tsx",
        "app/(app)/admin/members/MemberAccessControls.tsx",
        "app/(app)/admin/members/MemberStatusControls.tsx",
        "app/(app)/admin/members/MemberActions.tsx",
        "app/(app)/admin/members/DeleteMemberButton.tsx",
        "app/(app)/admin/members/CreateMemberForm.tsx",
        "app/(app)/admin/members/EditMemberCompanyForm.tsx",
        "app/(app)/admin/members/EditMemberEmailForm.tsx",
        "app/(app)/admin/members/EditMemberJoinedAtForm.tsx",
      ]) {
        const src = read(f);
        for (const b of bad) assert.ok(!src.includes(b), `${f}: ASCII text „${b}“`);
      }
    },
  },
  {
    name: "U8. UI nepozná cizí hlášky: akce deaktivace volá jen UI s právem members.deactivate, role a funkce s access.manage",
    run: () => {
      const status = read("actions/member-status.ts");
      assert.equal((status.match(/requirePermission\("members\.deactivate"\)/g) ?? []).length, 3);
      const access = read("actions/member-access.ts");
      assert.ok(/setMemberFunctionAction[\s\S]*?requirePermission\("access\.manage"\)/.test(access));
      const page = read("app/(app)/admin/members/[id]/page.tsx");
      assert.ok(page.includes("canChangeFunction={!isSelf || viewerIsAdmin}") && page.includes("isAdminSession(session)"));
    },
  },
  {
    name: "U9. nápověda: Pro vedení, Deaktivace člena, Funkce a přístup, Zneplatnit odkaz, bez Revokovat a bez poznámky k deaktivaci",
    run: () => {
      const page = read("components/help/HelpPage.tsx");
      assert.ok(page.includes('label: "Pro vedení"'));
      const admin = read("components/help/sections/AdminHelp.tsx");
      for (const t of [
        'title="Deaktivace člena"',
        'title="Funkce a přístup"',
        "Vyberte „Do odvolání“, nebo „Do data“ a datum.",
        "Aplikace mu nic nepošle. Řekněte mu to sami.",
        "Ne. Smazání je samostatné tlačítko a vrátit nejde.",
        "Odkaz přestane platit a člen se odhlásí, přihlásit se ale může dál přes nový odkaz z přihlašovací stránky. Když se přihlásit nemá, deaktivujte ho.",
        "Člen výboru má práva moderátora.",
        "Prezident a Viceprezident mají práva admina kromě přidělování admina, funkcí a hesel, to dělá jen admin.",
        "Účet admina (roli, funkci, heslo, osobní odkaz, údaje, deaktivaci i smazání) mění jen admin.",
        "klikněte na „Uložit funkci“",
      ]) {
        assert.ok(admin.replace(/\s+/g, " ").includes(t), `AdminHelp: ${t}`);
      }
      assert.ok(!/Revokovat|Kdo uvidí poznámku|Poznámka/.test(admin), "poznámka k deaktivaci neexistuje (Z1)");
      const memberHelp = read("components/help/sections/MemberHelp.tsx");
      assert.ok(memberHelp.includes("Zkuste ji. Když nepřijde ani druhý mail, napište vedení chapteru."));
      assert.ok(!memberHelp.includes("Zkuste ji, nebo napište někomu z vedení. Když nepřijde ani druhý"), "zdvojená věta");
      assert.ok(!admin.includes("Uložit funkce"), "člen má nejvýš jednu funkci");
      assert.ok(read("components/help/sections/ModeratorHelp.tsx").includes("Přidělování admina, funkcí a hesel a změny v účtu admina dělá jen admin."));
      assert.ok(read("components/help/sections/ModeratorHelp.tsx").includes("Člen výboru a moderátor nespravují členy ani funkce"));
    },
  },
  {
    name: "U10. nové UI soubory T-003c nemají em dash",
    run: () => {
      const dash = String.fromCharCode(0x2014);
      for (const f of [
        "app/(app)/admin/members/[id]/page.tsx",
        "app/(app)/admin/members/SortableMemberList.tsx",
        "app/(app)/admin/members/MemberAccessControls.tsx",
        "app/(app)/admin/members/MemberStatusControls.tsx",
        "app/(app)/admin/members/MemberActions.tsx",
        "app/(app)/admin/members/DeleteMemberButton.tsx",
        "app/(app)/admin/members/CreateMemberForm.tsx",
        "app/(app)/admin/members/page.tsx",
        "lib/members/labels.ts",
        "components/help/sections/AdminHelp.tsx",
        "components/help/sections/ModeratorHelp.tsx",
        "components/help/HelpPage.tsx",
      ]) {
        assert.ok(!read(f).includes(dash), `${f}: em dash`);
      }
    },
  },
  // ── T-003d: opravy z review a security ──
  {
    name: "A1. M-1: každá akce zápisu do cizího člena volá adminTargetError (nebo mayChangeMember) a každý SQL zápis má actorMayChangeSql",
    run: () => {
      // [soubor, akce] kde cílem je člen z parametru. Přímé volání akce prezidentem nebo VP musí skončit hláškou.
      const ACTIONS: [string, string][] = [
        ["actions/members.ts", "generateMagicLinkAction"],
        ["actions/members.ts", "revokeTokenAction"],
        ["actions/members.ts", "sendMagicLinkEmailAction"],
        ["actions/members.ts", "updateMemberCompanyAction"],
        ["actions/members.ts", "updateMemberEmailAction"],
        ["actions/members.ts", "updateMemberJoinedAtAction"],
        ["actions/members.ts", "deleteMemberAction"],
        ["actions/member-status.ts", "deactivateMemberAction"],
        ["actions/member-status.ts", "updateDeactivationAction"],
        ["actions/member-status.ts", "reactivateMemberAction"],
        ["actions/member-access.ts", "resetMemberPasswordAction"],
        ["actions/member-access.ts", "resendSetPasswordLinkAction"],
        ["actions/member-access.ts", "issueSetPasswordLinkForCopyAction"],
        ["actions/member-access.ts", "setMemberRoleAction"],
        ["actions/member-access.ts", "setMemberFunctionAction"],
      ];
      const problems: string[] = [];
      for (const [file, name] of ACTIONS) {
        const body = stripComments(functionBody(read(file), name));
        if (!/adminTargetError\(|mayChangeMember\(/.test(body)) problems.push(`${file}:${name}: bez kontroly admina`);
        // kontrola je před prvním zápisem (po guardu práva)
        const guard = body.search(/requirePermission\(/);
        const check = body.search(/adminTargetError\(|mayChangeMember\(/);
        if (guard < 0 || check < guard) problems.push(`${file}:${name}: kontrola admina před guardem práva`);
      }
      assert.deepEqual(problems, []);
      // import členů XLSX mění obor a datum vstupu existujícím členům
      const imp = stripComments(read("actions/import-members.ts"));
      assert.ok(imp.includes("mayChangeMember(isAdminSession(auth.session), dbMember.managementRole)"));
      assert.ok(/updateMemberObor\(row\.existingMemberId, row\.xlsxObor \?\? null, auth\.session\.memberId\)/.test(imp));
      // SQL vrstva: každý zápis do člena má podmínku volajícího (UI jen skrývá, akce hlásí, SQL drží)
      const SQL_FNS: [string, string][] = [
        ["lib/db/queries/members.ts", "updateMemberCompany"],
        ["lib/db/queries/members.ts", "updateMemberEmail"],
        ["lib/db/queries/members.ts", "updateMemberJoinedAt"],
        ["lib/db/queries/members.ts", "updateMemberObor"],
        ["lib/db/queries/members.ts", "updateMagicTokenAs"],
        ["lib/db/queries/members.ts", "revokeMagicLinkGuarded"],
        ["lib/db/queries/members.ts", "setMemberRoleGuarded"],
        ["lib/db/queries/members.ts", "deleteMemberGuarded"],
        ["lib/db/queries/members.ts", "resetPasswordGuarded"],
        ["lib/db/queries/member-status.ts", "deactivateMemberGuarded"],
        ["lib/db/queries/member-status.ts", "updateDeactivationGuarded"],
        ["lib/db/queries/member-status.ts", "reactivateMemberGuarded"],
        ["lib/db/queries/member-functions.ts", "assignMemberFunctionGuarded"],
        ["lib/db/queries/member-functions.ts", "removeMemberFunctionGuarded"],
      ];
      const sqlProblems: string[] = [];
      for (const [file, name] of SQL_FNS) {
        const body = stripComments(functionBody(read(file), name));
        if (!/actorMayChangeSql\("(member|t)", (actorId|input\.actorId)\)/.test(body)) sqlProblems.push(`${file}:${name}`);
      }
      assert.deepEqual(sqlProblems, []);
      // roli admin přidělí jen admin i v SQL
      const role = stripComments(functionBody(read("lib/db/queries/members.ts"), "setMemberRoleGuarded"));
      assert.ok(role.includes("const adminOnlyCond = sql`AND ${actorIsAdminSql(actorId)}`") && role.includes("${adminOnlyCond}"));
      for (const [file, name] of [
        ["lib/db/queries/members.ts", "resetPasswordGuarded"],
        ["lib/db/queries/member-functions.ts", "assignMemberFunctionGuarded"],
        ["lib/db/queries/member-functions.ts", "removeMemberFunctionGuarded"],
      ] as const) {
        assert.ok(stripComments(functionBody(read(file), name)).includes("actorIsAdminSql(actorId)"), `${name}: jen admin přiděluje`);
      }
      // generateMagicToken bez volajícího zůstává jen systému (cron), akce vedení jedou přes generateMagicTokenAs
      const mem = stripComments(read("actions/members.ts"));
      assert.ok(!/\bgenerateMagicToken\(memberId\)/.test(mem), "ruční akce bez kontroly volajícího");
    },
  },
  {
    name: "A2. M-1: SQL helpery (actorMayChangeSql, actorIsAdminSql) čtou roli volajícího z DB, bez interpolace ze vstupu",
    run: () => {
      const src = stripComments(read("lib/db/queries/member-active.ts"));
      assert.ok(src.includes("management_role IS DISTINCT FROM 'admin' OR"));
      assert.ok(src.includes("adm.management_role = 'admin'") && src.includes("adm.id = ${actorId}::uuid"));
      assert.ok(!/sql\.raw\(actorId\)/.test(src));
      // značka a nedelegovatelná práva jdou jako bind parametry, ne jako text v SQL
      assert.ok(src.includes("${ADMIN_DELEGABLE_MARKER}::text = ANY(") && src.includes("${permission}::text = ANY("));
      const fns = stripComments(read("lib/db/queries/member-functions.ts"));
      assert.ok(!/'members\.manage' = ANY/.test(fns), "tvrdý seznam práv v SQL");
    },
  },
  {
    name: "A3. M-1: stránka člena skryje formuláře admina před ne-adminem, nápověda to říká, middleware ani guard nemění",
    run: () => {
      const page = stripComments(read("app/(app)/admin/members/[id]/page.tsx"));
      assert.ok(page.includes("mayChangeMember(viewerIsAdmin, m.managementRole)"));
      for (const c of ["EditMemberEmailForm", "EditMemberCompanyForm", "EditMemberJoinedAtForm", "MemberAccessControls", "MemberStatusControls", "MemberActions", "DeleteMemberButton"]) {
        const at = page.lastIndexOf(`<${c}`);
        assert.ok(at > 0, c);
        assert.ok(/!locked/.test(page.slice(Math.max(0, at - 400), at)), `${c} se musí skrýt při locked`);
      }
      assert.ok(page.includes("ADMIN_ONLY_MESSAGE"));
      assert.ok(!/hasPassword=\{Boolean\(m\.passwordHash\)\}/.test(page), "MIN-1: zámkový hash není heslo");
      assert.ok(page.includes("hasPendingSetPasswordLink(m.id)") && page.includes("hasRealPassword("));
      // nápověda: záložka pro správu členů, sekce přístupu podle práva
      assert.ok(read("app/(app)/help/page.tsx").includes('showAdminHelp={can(session, "members.manage")}'));
      assert.ok(read("app/(app)/help/page.tsx").includes('canManageAccess={can(session, "access.manage")}'));
    },
  },
  {
    name: "A4. MIN-1: povýšení a první funkce počítají zámkový hash jako nemá heslo, reset jde i bez skutečného hesla",
    run: () => {
      const access = stripComments(read("actions/member-access.ts"));
      assert.ok(/hasRealPassword\(\{\s*hasHash: !!target\.passwordHash,\s*pendingSetPasswordLink: await hasPendingSetPasswordLink\(target\.id\)/.test(access));
      assert.ok(!/const hadPassword = !!target\.passwordHash/.test(access));
      const ui = stripComments(read("app/(app)/admin/members/MemberAccessControls.tsx"));
      assert.ok(ui.includes("const canReset = (managementRole !== null || hasFunction) && !isSelf;"), "reset i čekajícímu na odkaz");
      assert.ok(ui.includes("!hasFunction && !hasPassword"), "mail jen k první funkci");
      const links = stripComments(read("lib/db/queries/login-links.ts"));
      assert.ok(/hasPendingSetPasswordLink[\s\S]*purpose, "set-password"[\s\S]*isNull\(memberLoginLink\.usedAt\)/.test(links));
    },
  },
  {
    name: "A5. L-2 a MIN-5: report pohovoru se neaktivnímu příjemci neposílá, seznam příjemců jen aktivní",
    run: () => {
      const src = stripComments(read("actions/interviews.ts"));
      for (const name of ["sendInterviewReportAction", "sendInterviewCompareReportAction"]) {
        const body = functionBody(src, name);
        assert.ok(body.includes("isMemberActive(recipient, pragueToday())"), name);
        assert.ok(body.includes("Příjemce je neaktivní."), name);
        assert.ok(body.indexOf("isMemberActive(recipient") < body.indexOf("sendInterviewReportEmail("), `${name}: kontrola před odesláním`);
      }
      for (const f of ["app/(app)/interviews/[id]/page.tsx", "app/(app)/interviews/compare/[memberId]/page.tsx"]) {
        const page = stripComments(read(f));
        assert.ok(/Boolean\(m\.email\) && isMemberActive\(m, pragueToday\(\)\)/.test(page), f);
      }
    },
  },
  {
    name: "A6. MIN-6: současný neaktivní vedoucí v seznamu pohovorů má štítek (neaktivní)",
    run: () => {
      const table = stripComments(read("app/(app)/interviews/InterviewListTable.tsx"));
      assert.ok(table.includes("inactiveMemberIds.includes(row.leaderId)") && table.includes('" (neaktivní)"'));
      const page = stripComments(read("app/(app)/interviews/page.tsx"));
      assert.ok(page.includes("inactiveMemberIds={memberOptions.filter((m) => m.isInactive).map((m) => m.id)}"));
    },
  },
  {
    name: "A7. L-3 a MIN-4: server odmítne zápis Master mindu a Burzy za neaktivního člena (akce česky, SQL jako druhá pojistka)",
    run: () => {
      const mmRules = read("lib/mastermind/rules.ts");
      assert.ok(mmRules.includes('memberInactive: "Člen je neaktivní, případ za něj zapsat nejde."'));
      const mm = stripComments(functionBody(read("actions/mastermind.ts"), "createCaseAction"));
      assert.ok(mm.includes("isMemberActive(target, todayInPrague())") && mm.includes("MESSAGES.memberInactive"));
      const mmq = stripComments(functionBody(read("lib/db/queries/mastermind.ts"), "createCaseWithLimit"));
      assert.ok(/EXISTS \(SELECT 1 FROM member m\s+WHERE m\.id = \$\{input\.memberId\}::uuid AND \$\{memberActiveSql\("m"\)\}\)/.test(mmq));

      const bzRules = read("lib/burza/rules.ts");
      assert.ok(bzRules.includes('memberInactive: "Člen je neaktivní, zápis za něj nejde."'));
      const bz = stripComments(read("actions/burza.ts"));
      assert.ok(functionBody(bz, "saveOfferAction").includes("inactiveTargetError(input.memberId, actor.memberId)"));
      assert.ok(functionBody(bz, "saveContactItemAction").includes("inactiveTargetError(input.memberId, actor.memberId)"));
      assert.ok(bz.includes("if (!why.recipientActive) return { success: false, error: MESSAGES.memberInactive };"));
      const bzq = stripComments(read("lib/db/queries/burza.ts"));
      for (const name of ["createOfferGuarded", "updateOfferGuarded", "createContactItemWithLimit", "updateContactItemGuarded"]) {
        assert.ok(functionBody(bzq, name).includes("targetActiveSql(args.targetId)"), name);
      }
      const help = functionBody(bzq, "recordHelpGuarded");
      assert.ok(help.includes('JOIN member rm ON rm.id = ${args.recipientId}::uuid AND ${memberActiveSql("rm")}'));
      assert.ok(bzq.includes('memberActiveSql("t")'));
    },
  },
  {
    name: "A8. L-1: assignMemberFunctionGuarded dá zámkový hash vždy členovi bez role i bez funkce",
    run: () => {
      const fns = stripComments(read("lib/db/queries/member-functions.ts"));
      const ass = fns.slice(fns.indexOf("export async function assignMemberFunctionGuarded"), fns.indexOf("export async function removeMemberFunctionGuarded"));
      const compact = ass.replace(/\s+/g, " ");
      assert.ok(
        compact.includes("cur.password_hash IS NULL OR (cur.old_fn IS NULL AND (cur.management_role IS NULL OR EXISTS"),
        "needs_lock: žádné heslo, nebo (první funkce a bez role nebo čekající odkaz)"
      );
      assert.ok(compact.includes("WHERE t.id = ${targetId}::uuid AND (${allowSelf}::boolean OR t.id <> ${actorId}::uuid) AND ${actorMayChangeSql(\"t\", actorId)}"));
    },
  },
  {
    name: "A9. NIT: zastaralé komentáře o middleware pryč, texty Uložit funkci a Vlastní funkci, (role funkce) v mailu",
    run: () => {
      assert.ok(!read("app/(app)/admin/layout.tsx").includes("zůstává v middleware"));
      assert.ok(!read("app/api/members/reorder/route.ts").includes("behind session"));
      assert.ok(!/functions\.manage/.test(read("middleware.ts")));
      const resend = read("lib/email/resend.ts");
      assert.ok(resend.includes('opts.role === "function" ? "" : ` (role ${roleLabel})`'));
      assert.ok(read("app/(app)/admin/members/[id]/page.tsx").includes("(NIT-3)"));
    },
  },
  {
    name: "12. nové soubory iter-037 neobsahují em dash",
    run: () => {
      const dash = String.fromCharCode(0x2014);
      for (const f of [
        "lib/auth/permissions.ts",
        "lib/auth/guards.ts",
        "lib/auth/page-guard.ts",
        "scripts/migrate-iter-037-clenove.ts",
        "scripts/test-iter-037-members.ts",
        // T-003b
        "lib/members/activity.ts",
        "lib/db/queries/member-active.ts",
        "lib/db/queries/member-status.ts",
        "lib/db/queries/member-functions.ts",
        "lib/auth/function-change.ts",
        "actions/member-status.ts",
        "lib/members/labels.ts",
        // T-003d
        "lib/auth/admin-protection.ts",
        "actions/member-access.ts",
        "components/help/sections/MemberHelp.tsx",
      ]) {
        assert.ok(!read(f).includes(dash), `${f}: em dash`);
      }
    },
  },
];

let failed = 0;
for (const t of tests) {
  try {
    t.run();
    console.log(`OK   ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${t.name}`);
    console.log(`     ${(err as Error).message.split("\n").join("\n     ")}`);
  }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed (of ${tests.length})`);
if (failed > 0) process.exit(1);
