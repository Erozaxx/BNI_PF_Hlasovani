/**
 * Testy iter-043 (T-010, část C, arch T-008 kap. 3.10, gate T-009): reset hesla
 * člena vedení i pro moderátora. Bez DATABASE_URL, bez sítě. SQL se jen
 * vyrenderuje (`PgDialect().sqlToQuery`), do DB nejde.
 *
 * Spuštění: npx tsx scripts/test-iter-043-reset-vedeni.ts
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  ADMIN_DELEGABLE_MARKER,
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  NON_DELEGABLE,
  PERMISSIONS,
  decidePasswordReset,
  permissionsFor,
  roleGrants,
  type Permission,
} from "../lib/auth/permissions";
import { actorHasPermissionSql } from "../lib/db/queries/member-active";

const ROOT = join(__dirname, "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
type TestCase = { name: string; run: () => void | Promise<void> };
const cases: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => cases.push({ name, run });

const RESET: Permission = "access.password_reset";

/** Tělo `export [async] function name` až po další `export` na začátku řádku. */
function declaration(src: string, name: string): string {
  const m = new RegExp(`export (?:async )?function ${name}\\b`).exec(src);
  assert.ok(m, `chybí funkce ${name}`);
  const rest = src.slice(m.index + 1);
  const next = rest.search(/\nexport /);
  return next < 0 ? rest : rest.slice(0, next);
}

// R1
test("R1. právo je v katalogu (29), delegovatelné, v sadě role moderátor i výchozí sadě funkce", () => {
  assert.ok(PERMISSIONS.includes(RESET));
  assert.equal(PERMISSIONS.length, 29);
  assert.ok(!NON_DELEGABLE.includes(RESET));
  assert.ok(MODERATOR_ROLE_PERMISSIONS.includes(RESET));
  assert.ok(DEFAULT_FUNCTION_PERMISSIONS.includes(RESET));
  assert.equal(roleGrants("moderator", RESET), true);
  assert.equal(roleGrants("moderator", "access.manage"), false);
  assert.ok(NON_DELEGABLE.includes("access.manage"));
});

// R2
test("R2. permissionsFor: kdo má právo a kdo ne", () => {
  const withPw = (o: Partial<Parameters<typeof permissionsFor>[0]>) =>
    permissionsFor({
      authMethod: "password",
      managementRole: null,
      functions: [],
      attendanceManager: false,
      ...o,
    });
  assert.ok(withPw({ managementRole: "admin" }).has(RESET), "admin");
  assert.ok(withPw({ managementRole: "moderator" }).has(RESET), "moderátor");
  assert.ok(withPw({ functions: [{ name: "Člen výboru", permissions: null }] }).has(RESET), "funkce NULL");
  assert.ok(
    withPw({ functions: [{ name: "Prezident", permissions: [ADMIN_DELEGABLE_MARKER] }] }).has(RESET),
    "funkce se značkou"
  );
  assert.ok(!withPw({}).has(RESET), "běžný člen");
  assert.ok(!withPw({ attendanceManager: true }).has(RESET), "příznak Správce docházky ho nedá");
  assert.ok(!withPw({ functions: [{ name: "Jiná", permissions: ["guests.manage"] }] }).has(RESET), "ruční seznam bez práva");
  for (const o of [
    { managementRole: "admin" as const },
    { managementRole: "moderator" as const },
    { functions: [{ name: "P", permissions: [ADMIN_DELEGABLE_MARKER] }] },
  ]) {
    const viaLink = permissionsFor({
      authMethod: "magic-link" as never,
      managementRole: null,
      functions: [],
      attendanceManager: false,
      ...o,
    });
    assert.ok(!viaLink.has(RESET), "přihlášení odkazem nemá právo");
  }
  // access.manage mají dál jen admin
  assert.ok(withPw({ managementRole: "admin" }).has("access.manage"));
  assert.ok(!withPw({ managementRole: "moderator" }).has("access.manage"));
  assert.ok(!withPw({ functions: [{ name: "P", permissions: [ADMIN_DELEGABLE_MARKER] }] }).has("access.manage"));
  assert.ok(!withPw({ functions: [{ name: "ČV", permissions: null }] }).has("access.manage"));
});

// R3
test("R3. decidePasswordReset: matice 5 volajících krát 5 cílů a pořadí důvodů", () => {
  type Caller = { id: string; isAdmin: boolean; mayReset: boolean };
  const callers: Record<string, Caller> = {
    admin: { id: "a", isAdmin: true, mayReset: true },
    moderator: { id: "m", isAdmin: false, mayReset: true },
    clenVyboru: { id: "c", isAdmin: false, mayReset: true },
    prezident: { id: "p", isAdmin: false, mayReset: true },
    clen: { id: "x", isAdmin: false, mayReset: false },
  };
  const targets: Record<string, { id: string; managementRole: string | null; hasPasswordAccess: boolean } | null> = {
    admin: { id: "t-admin", managementRole: "admin", hasPasswordAccess: true },
    moderator: { id: "t-mod", managementRole: "moderator", hasPasswordAccess: true },
    funkce: { id: "t-fn", managementRole: null, hasPasswordAccess: true },
    clen: { id: "t-clen", managementRole: null, hasPasswordAccess: false },
    nikdo: null,
  };
  const decide = (c: Caller, t: (typeof targets)[string]) =>
    decidePasswordReset({ actorId: c.id, actorIsAdmin: c.isAdmin, actorMayReset: c.mayReset, target: t });

  for (const [cn, c] of Object.entries(callers)) {
    for (const [tn, t] of Object.entries(targets)) {
      const r = decide(c, t);
      const label = `${cn} -> ${tn}`;
      if (!c.mayReset) {
        assert.deepEqual(r, { ok: false, reason: "no-permission" }, label);
      } else if (tn === "nikdo") {
        assert.deepEqual(r, { ok: false, reason: "not-found" }, label);
      } else if (tn === "admin" && !c.isAdmin) {
        assert.deepEqual(r, { ok: false, reason: "admin-target" }, label);
      } else if (tn === "clen") {
        assert.deepEqual(r, { ok: false, reason: "no-access" }, label);
      } else {
        assert.deepEqual(r, { ok: true }, label);
      }
    }
  }
  // sebe nikdy, ani admin
  assert.deepEqual(
    decidePasswordReset({
      actorId: "a",
      actorIsAdmin: true,
      actorMayReset: true,
      target: { id: "a", managementRole: "admin", hasPasswordAccess: true },
    }),
    { ok: false, reason: "self" }
  );
  // pořadí: právo před sebou, sebe před účtem admina, admin před přístupem k heslu
  assert.equal(
    decidePasswordReset({
      actorId: "m",
      actorIsAdmin: false,
      actorMayReset: false,
      target: { id: "m", managementRole: "admin", hasPasswordAccess: false },
    }).ok,
    false
  );
  const order = decidePasswordReset({
    actorId: "m",
    actorIsAdmin: false,
    actorMayReset: true,
    target: { id: "t", managementRole: "admin", hasPasswordAccess: false },
  });
  assert.deepEqual(order, { ok: false, reason: "admin-target" });
  const selfFirst = decidePasswordReset({
    actorId: "m",
    actorIsAdmin: false,
    actorMayReset: true,
    target: { id: "m", managementRole: "admin", hasPasswordAccess: false },
  });
  assert.deepEqual(selfFirst, { ok: false, reason: "self" });
});

// R4
test("R4. akce: reset a poslat znovu chtějí právo reset, kopírování, role a funkce dál access.manage", () => {
  const src = read("actions/member-access.ts");
  for (const fn of ["resetMemberPasswordAction", "resendSetPasswordLinkAction"]) {
    const d = declaration(src, fn);
    assert.ok(d.includes('requirePermission("access.password_reset")'), fn);
    assert.ok(!d.includes('requirePermission("access.manage")'), fn);
  }
  for (const fn of ["issueSetPasswordLinkForCopyAction", "setMemberRoleAction", "setMemberFunctionAction"]) {
    assert.ok(declaration(src, fn).includes('requirePermission("access.manage")'), fn);
  }
  const reset = declaration(src, "resetMemberPasswordAction");
  const iGuard = reset.indexOf("requirePermission(");
  const iDenied = reset.indexOf("adminTargetError(");
  const iDecide = reset.indexOf("decidePasswordReset(");
  const iWrite = reset.indexOf("resetPasswordGuarded(");
  assert.ok(iGuard >= 0 && iDenied > iGuard && iDecide > iDenied && iWrite > iDecide, "pořadí guard, admin, decide, zápis");
  assert.ok(src.includes('"Heslo mají jen členové vedení."'));
  assert.ok(src.includes('"Vlastní heslo změníš v Nastavení."'));
});

// R5
test("R5. resetPasswordGuarded: jedno getDb, SQL pojistka podle práva, ne podle role admin", () => {
  const src = read("lib/db/queries/members.ts");
  const d = declaration(src, "resetPasswordGuarded");
  assert.equal((d.match(/getDb\(\)/g) ?? []).length, 1);
  assert.ok(d.includes('actorHasPermissionSql(actorId, "access.password_reset")'));
  assert.ok(d.includes('actorMayChangeSql("member", actorId)'));
  assert.ok(d.includes("id <> "));
  assert.ok(d.includes("purpose = 'set-password'"));
  assert.ok(!d.includes("actorIsAdminSql"));
  assert.ok(!d.includes("db.transaction") && !d.includes(".transaction("), "LL-003");
});

// R6
test("R6. actorHasPermissionSql vyrenderované bez DB: větev role a funkce podle práva", () => {
  const dialect = new PgDialect();
  const reset = dialect.sqlToQuery(actorHasPermissionSql("00000000-0000-0000-0000-000000000001", RESET));
  assert.ok(reset.sql.includes("act.management_role = 'moderator'"), "větev role moderátor");
  assert.ok(reset.sql.includes("cf.permissions IS NULL"), "větev výchozí sady funkce");
  assert.ok(reset.sql.includes("act.management_role = 'admin'"), "větev admina");
  assert.ok(reset.sql.includes("member_function"), "větev funkce");
  assert.ok(reset.params.includes("00000000-0000-0000-0000-000000000001"));
  assert.ok(reset.params.includes(RESET), "právo jako bind parametr");
  assert.ok(reset.params.includes(ADMIN_DELEGABLE_MARKER), "značka admin-delegable");

  const manage = dialect.sqlToQuery(actorHasPermissionSql("00000000-0000-0000-0000-000000000001", "access.manage"));
  assert.ok(!manage.sql.includes("management_role = 'moderator'"), "access.manage: bez větve role");
  assert.ok(!manage.sql.includes("cf.permissions IS NULL"), "access.manage: bez výchozí sady funkce");
  assert.ok(manage.sql.includes("false"), "access.manage: funkce dává false");
  assert.ok(!manage.params.includes(ADMIN_DELEGABLE_MARKER), "access.manage: značka nepomůže");
});

// R7
test("R7. /admin/members: anyOf, zúžená větev bez formulářů, detail dál members.manage", () => {
  const page = read("app/(app)/admin/members/page.tsx");
  assert.ok(page.includes('anyOf: ["members.manage", "access.password_reset"]'));
  const start = page.indexOf('if (!can(session, "members.manage"))');
  const end = page.indexOf("<LeadershipPasswordList", start);
  assert.ok(start >= 0 && end > start, "větev bez members.manage");
  const branch = page.slice(start, end);
  for (const f of ["CreateMemberForm", "ImportMembersForm", "SortableMemberList", "getInterviewCountsByMember", "getInterviewDueList"]) {
    assert.ok(!branch.includes(f), `zúžená větev nesmí obsahovat ${f}`);
  }
  const rest = page.slice(end);
  for (const f of ["<CreateMemberForm", "<ImportMembersForm", "<SortableMemberList"]) {
    assert.ok(rest.includes(f), `plná stránka dál obsahuje ${f}`);
  }
  const detail = read("app/(app)/admin/members/[id]/page.tsx");
  assert.ok(detail.includes('requirePageSession({ permission: "members.manage" })'));
  assert.ok(detail.includes("PasswordResetControls"));
  assert.ok(detail.includes('can(session, "access.password_reset")') && detail.includes('!can(session, "access.manage")'));
  assert.ok(detail.includes(">Heslo</h2>"));
});

// R8
test("R8. LeadershipPasswordList: bez odkazu na detail a bez hashů a osobních údajů", () => {
  const src = read("app/(app)/admin/members/LeadershipPasswordList.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!src.includes("/admin/members/${"), "odkaz na detail");
  assert.ok(!/href=\{?[`"]\/admin\/members\//.test(src), "odkaz na detail");
  for (const banned of [/passwordHash/, /magicTokenHash/, /\bcompany\b/, /\bobor\b/, /joinedAt/, /interview/i]) {
    assert.ok(!banned.test(src), `nesmí obsahovat ${banned}`);
  }
  const page = read("app/(app)/admin/members/page.tsx");
  const start = page.indexOf('if (!can(session, "members.manage"))');
  const branch = page.slice(start, page.indexOf("<LeadershipPasswordList", start));
  assert.ok(!branch.includes("passwordHash:") && !branch.includes("passwordHash="), "hash se do řádků nepřenáší");
  assert.ok(branch.includes("managementRole !== null || functions.has(m.id)"), "jen vedení");
});

// R9
test("R9. PasswordResetControls volá reset a poslat znovu, kopírování ne", () => {
  const src = read("app/(app)/admin/members/PasswordResetControls.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(src.includes("resetMemberPasswordAction") && src.includes("resendSetPasswordLinkAction"));
  assert.ok(!src.includes("issueSetPasswordLinkForCopyAction"));
  assert.ok(!src.includes("ke zkopírování") && !src.includes("clipboard"));
  assert.ok(src.includes("Poslat odkaz pro nové heslo") && src.includes("E-mail jsem si s členem ověřil"));
  assert.ok(src.includes("router.refresh()"));
  assert.ok(src.includes('role="status"'));
});

// R10
test("R10. menu Členové pro members.manage nebo access.password_reset, nic dalšího z Admin skupiny", () => {
  const layout = read("app/(app)/layout.tsx");
  assert.ok(layout.includes('members: can(session, "members.manage") || can(session, "access.password_reset")'));
  assert.ok(layout.includes('categories: can(session, "categories.manage")'));
  assert.ok(layout.includes('chapterSettings: can(session, "chapter.settings")'));
  const nav = read("components/layout/MobileNav.tsx");
  assert.ok(nav.includes("show.members") && nav.includes("show.categories") && nav.includes("show.chapterSettings"));
  assert.ok(!nav.includes("access.password_reset") && !nav.includes("members.manage"), "MobileNav bere jen příznaky z layoutu");
  assert.ok(layout.includes("show={show}") || /<MobileNav[^>]*show/.test(layout), "layout předává show do MobileNav");
});

// R11
test("R11. samoobsluha hesla je pryč, kind reset adminem a CHECK zůstávají", () => {
  // Vzory a cesty jsou složené, aby tenhle soubor sám nebyl zásah.
  const j = (...p: string[]) => p.join("");
  for (const f of [
    j("lib/auth/password-reset", "-request.ts"),
    j("lib/auth/password-reset", ".ts"),
    j("lib/email/password-reset", "-template.ts"),
    "scripts/migrate-iter-043-heslo.ts",
    "scripts/test-iter-043-heslo.ts",
  ]) {
    assert.ok(!existsSync(join(ROOT, f)), `${f} nemá existovat`);
  }
  const patterns = [
    j("'password", "-reset'"),
    j('"password', '-reset"'),
    j("password", "-reset-requested"),
    j("PASSWORD_", "RESET_"),
    j("PASSWORD_LINK", "_PURPOSES"),
    j("requestPassword", "Reset"),
    j("pw", "-reset"),
    j("mll_one_active_", "password_reset"),
    j("password", "-reset-template"),
    j("password", "-reset-request"),
    j("upsertPassword", "ResetLink"),
    j("consumePassword", "LinkByHash"),
    j("findActivePassword", "LinkMemberId"),
    j("groupRules", "ByWindow"),
    j("passwordReset", "ThrottleRules"),
    j("planPassword", "ResetRequest"),
    j("sendPassword", "ResetEmail"),
    j("Zapomněl(a) jsem ", "heslo"),
  ];
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\n")
    .filter((f) => f && !f.startsWith(".aiworkflow/") && /\.(ts|tsx|sql|json|mjs|js|css)$/.test(f) && existsSync(join(ROOT, f)));
  const hits: string[] = [];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), "utf8");
    for (const p of patterns) {
      if (p.startsWith("Zapomněl")) {
        // otázka v nápovědě vedení zůstává, jen UI přihlášení ji mít nesmí
        if (f.startsWith("app/(auth)") && src.includes(p)) hits.push(`${f}: ${p}`);
        continue;
      }
      if (src.includes(p)) hits.push(`${f}: ${p}`);
    }
  }
  assert.deepEqual(hits, []);
  const schema = read("lib/db/schema.ts");
  assert.ok(/'login', 'set-password'/.test(schema), "CHECK na dva účely");
  assert.ok(!schema.includes(j("mll_one_active_", "password_reset")));
  assert.ok(read("lib/ops/types.ts").includes('"access.password-reset"'), "kind iter-032 zůstává");
});

// R12
test("R12. texty z gate jsou ve zdrojích a bez em dash", () => {
  const moderator = read("components/help/sections/ModeratorHelp.tsx");
  assert.ok(moderator.includes("Napište adminovi nebo moderátorovi. V menu Členové vám pošle nový odkaz pro nastavení hesla."));
  assert.ok(moderator.includes("Člen vedení zapomněl heslo."));
  assert.ok(moderator.includes("V menu Členové u něj dejte „Poslat odkaz pro nové heslo“. Jeho dosavadní heslo hned přestane platit a odhlásí se. Odkaz platí 24 hodin, může skončit ve spamu. Účet admina ani vlastní heslo tudy nezměníte."));
  assert.ok(/passwordReset\s*\?/.test(moderator), "otázka jen s právem");
  // review F-01: sekce „Co dělá jen admin“ nesmí tvrdit, že hesla (ani sekci Admin) vidí jen admin
  assert.ok(!moderator.includes("nemění cizí hesla"));
  assert.ok(!moderator.includes("přidělování admina, funkcí a hesel"));
  assert.ok(!moderator.includes("Sekci Admin s položkami Členové, Kategorie a Nastavení chapteru vidí v menu jen oni"));
  assert.ok(moderator.includes("Z hesel mohou jen členovi vedení poslat odkaz pro nové heslo."));
  assert.ok(moderator.includes("vidí moderátor a Člen výboru jen Členové, a v nich seznam Hesla vedení"));
  // review F-02: text pro Prezidenta a Viceprezidenta, bez „musí doplnit admin“
  assert.ok(moderator.includes("Prezident a Viceprezident to dělají na stránce člena, karta Heslo"));
  assert.ok(!read("app/(app)/admin/members/PasswordResetControls.tsx").includes("musí doplnit admin"));
  const admin = read("components/help/sections/AdminHelp.tsx");
  assert.ok(admin.includes("kromě přidělování admina a funkcí, to dělá jen admin. Reset hesla členovi vedení smí i moderátor a funkce Prezident, Viceprezident a Člen výboru. Odkaz ke zkopírování vidí jen admin."));
  assert.ok(!admin.includes("přidělování admina, funkcí a hesel"));
  const access = read("app/(app)/admin/members/MemberAccessControls.tsx");
  assert.ok(access.includes("jen nepřidělují admina a funkce."));
  assert.ok(read("app/(auth)/login/heslo/SetPasswordForm.tsx").includes("Odkaz už neplatí. Požádej admina nebo moderátora o nový."));
  const list = read("app/(app)/admin/members/LeadershipPasswordList.tsx").replace(/\s+/g, " ");
  assert.ok(list.includes("Hesla vedení"));
  assert.ok(list.includes("Členovi vedení, který zapomněl heslo, tady pošleš odkaz pro nové. Jeho dosavadní heslo hned přestane platit a odhlásí se."));
  assert.ok(list.includes("Vlastní heslo změníš v menu"));
  const dash = String.fromCharCode(0x2014);
  for (const f of [
    "app/(app)/admin/members/LeadershipPasswordList.tsx",
    "app/(app)/admin/members/PasswordResetControls.tsx",
    "components/help/sections/ModeratorHelp.tsx",
    "components/help/sections/AdminHelp.tsx",
    "actions/member-access.ts",
    "lib/auth/permissions.ts",
    "lib/db/queries/member-active.ts",
    "scripts/test-iter-043-reset-vedeni.ts",
  ]) {
    assert.ok(!read(f).includes(dash), `${f}: em dash`);
  }
});

// R13
test("R13. security M-2: změna e-mailu člena vedení se loguje bez e-mailů, štítek na /status", () => {
  const fn = declaration(read("actions/members.ts"), "updateMemberEmailAction");
  assert.ok(fn.includes('kind: "access.email-changed"'));
  assert.ok(/memberName: memberData\.name/.test(fn) && /actor: auth\.session\.name/.test(fn));
  const log = fn.slice(fn.indexOf("logOpsEvent("), fn.indexOf("} catch (err)", fn.indexOf("logOpsEvent(")));
  assert.ok(!/email/i.test(log.replace(/kind: "access\.email-changed"/, "").replace(/E-mail člena vedení změněn\./, "")), "žádný e-mail v logu");
  const types = read("lib/ops/types.ts");
  assert.equal((types.match(/"access\.email-changed"/g) ?? []).length, 2, "kind i TERMINAL_KINDS");
  assert.ok(read("app/(app)/status/EventTable.tsx").includes('"access.email-changed":'));
});

// R14
test("R14. security L-1: rotace odkazu ve WHERE ověřuje volajícího a cíl, jeden příkaz", () => {
  const src = read("lib/db/queries/login-links.ts");
  const fn = declaration(src, "rotateSetPasswordLink");
  assert.ok(fn.includes("actorHasPermissionSql(input.actorId, input.permission)"));
  assert.ok(fn.includes('actorMayChangeSql("t", input.actorId)'));
  assert.ok(!/transaction/.test(fn));
  const act = read("actions/member-access.ts");
  assert.ok(/allowExpired: true,\s*actorId: actor\.memberId,\s*permission: "access\.password_reset"/.test(declaration(act, "resendSetPasswordLinkAction")));
  assert.ok(/allowExpired: false,\s*actorId: actor\.memberId,\s*permission: "access\.manage"/.test(declaration(act, "issueSetPasswordLinkForCopyAction")));
});

async function main() {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.run();
      console.log(`ok   ${c.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${c.name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length}`);
  if (failed) process.exit(1);
}
main();
