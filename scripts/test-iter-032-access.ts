/**
 * Testy iter-032 (T-005): role, odkaz pro heslo, přihlášení člena odkazem
 * (arch iter-032 T-001, sekce 11.1 body 1 až 9; gate T-004 U1, U3).
 * T-006r: body 10 až 13 (security M-1, M-2, L-1, L-4, L-5, review F-02,
 * F-05, F-07 a NIT k ops_event). SQL pojistky bez DB ověřit nejdou, body 11
 * a 12 proto jen staticky hlídají jejich tvar, chování ověří QA na větvi
 * Neonu (report T-006r).
 *
 * Bez DATABASE_URL, bez sítě. Testované moduly jsou čisté (žádný import
 * drizzle-orm, next ani DB). Statické kontroly čtou zdrojáky z disku.
 * Spuštění: npm run test:iter-032-access (součást npm run test:iter-032)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { decideRoleChange, type RoleChangeTarget } from "../lib/auth/role-change";
import { checkSession, type SessionCookieState } from "../lib/auth/session-check";
import {
  LINK_INVALID_TEXT,
  LOGIN_LINK_RESPONSE_TEXT,
  LOGIN_LINK_TTL_MINUTES,
  MIN_RESPONSE_MS,
  SET_PASSWORD_LINK_TTL_HOURS,
  THROTTLE_BLOCKED_TEXT,
  THROTTLE_LIMITS,
  THROTTLE_WINDOW_MINUTES,
  buildLinkUrl,
  findBlockedRule,
  generateLinkToken,
  hashEmailForKey,
  hashLinkToken,
  isValidLinkTokenFormat,
  linkExpiresAt,
  linkRequestThrottleRules,
  linkUseThrottleKey,
  normalizeEmail,
  normalizeEmailForStorage,
  passwordLoginPairKey,
  passwordLoginThrottleRules,
  planLoginLinkRequest,
  planLoginStart,
  loginStartThrottleRules,
  remainingPaddingMs,
  type LoginLinkMemberMatch,
} from "../lib/auth/login-link-core";
import { runSetPasswordConsume, type SetPasswordConsumeDeps } from "../lib/auth/set-password-consume";
import { deriveRunStatus } from "../lib/ops/run-status";
import { TERMINAL_KINDS, type OpsEventKind } from "../lib/ops/types";

const ROOT = join(__dirname, "..");
const NOW = new Date("2026-10-15T10:00:00Z");

type TestCase = { name: string; run: () => void | Promise<void> };

function target(overrides: Partial<RoleChangeTarget> = {}): RoleChangeTarget {
  return { id: "m-target", managementRole: null, email: "clen@firma.cz", ...overrides };
}

function cookie(overrides: Partial<SessionCookieState> = {}): SessionCookieState {
  return { memberId: "m1", managementRole: null, authMethod: "magic_link", ...overrides };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Argumenty volání od pozice za `(` po odpovídající `)`, počítá jen hloubku závorek. */
function callArgs(src: string, openParenIdx: number): string {
  let depth = 0;
  for (let i = openParenIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return src.slice(openParenIdx + 1, i);
    }
  }
  throw new Error("neuzavřené volání");
}

function hasTopLevelComma(args: string): boolean {
  let depth = 0;
  for (const ch of args) {
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === "," && depth === 0) return true;
  }
  return false;
}

/**
 * Zdroják bez komentářů (review F-05): blokové i řádkové. Řádkový komentář
 * se bere jen za začátkem řádku nebo mezerou, aby `https://` v řetězci zůstal.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function readSrc(rel: string): string {
  return stripComments(readFileSync(join(ROOT, rel), "utf8"));
}

/** Text deklarace `function name(` až po další deklaraci na začátku řádku. */
function declaration(src: string, name: string): string {
  const start = src.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`funkce ${name} nenalezena`);
  const rest = src.slice(start + 1);
  const next = rest.search(/\n(export |async function |function |const |type |interface )/);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

/** Objektový literál, uvnitř kterého leží pozice `idx` (nejbližší neuzavřená `{`). */
function enclosingObject(src: string, idx: number): string {
  let depth = 0;
  for (let i = idx; i >= 0; i--) {
    const ch = src[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) return "(" + callArgs(src, i) + ")";
      depth--;
    }
  }
  throw new Error("objekt nenalezen");
}

type FakeLog = string[];

function fakeDeps(
  log: FakeLog,
  overrides: Partial<SetPasswordConsumeDeps> = {}
): SetPasswordConsumeDeps {
  return {
    isBlocked: async () => {
      log.push("blocked?");
      return false;
    },
    recordFailure: async () => {
      log.push("fail");
    },
    findActiveLink: async () => {
      log.push("find");
      return "m1";
    },
    hashPassword: async () => {
      log.push("bcrypt");
      return "hash";
    },
    consumeLink: async () => {
      log.push("consume");
      return "m1";
    },
    setPassword: async () => {
      log.push("set");
      return { sessionVersion: 4, managementRole: "moderator", name: "Jana" };
    },
    ...overrides,
  };
}

const VALID_TOKEN = "A".repeat(43);

const member: LoginLinkMemberMatch = {
  id: "m1",
  name: "Jana",
  email: "jana@firma.cz",
  managementRole: null,
};

const cases: TestCase[] = [
  // ── 1. decideRoleChange ──
  {
    name: "1a. žádná na moderátora = promote",
    run: () => {
      const d = decideRoleChange({ actorId: "a1", target: target(), newRole: "moderator", adminCount: 1 });
      assert.deepEqual(d, { ok: true, kind: "promote", oldRole: null, newRole: "moderator" });
    },
  },
  {
    name: "1b. moderátor na admina = switch",
    run: () => {
      const d = decideRoleChange({
        actorId: "a1",
        target: target({ managementRole: "moderator" }),
        newRole: "admin",
        adminCount: 1,
      });
      assert.deepEqual(d, { ok: true, kind: "switch", oldRole: "moderator", newRole: "admin" });
    },
  },
  {
    name: "1c. admin na žádnou se 2 adminy = demote",
    run: () => {
      const d = decideRoleChange({
        actorId: "a1",
        target: target({ managementRole: "admin" }),
        newRole: "none",
        adminCount: 2,
      });
      assert.deepEqual(d, { ok: true, kind: "demote", oldRole: "admin", newRole: null });
    },
  },
  {
    name: "1d. admin na žádnou s 1 adminem = last-admin, admin na moderátora taky",
    run: () => {
      for (const newRole of ["none", "moderator"] as const) {
        const d = decideRoleChange({
          actorId: "a1",
          target: target({ managementRole: "admin" }),
          newRole,
          adminCount: 1,
        });
        assert.deepEqual(d, { ok: false, error: "last-admin" });
      }
    },
  },
  {
    name: "1e. cíl = volající = self (i když by šlo o noop)",
    run: () => {
      const d = decideRoleChange({
        actorId: "m-target",
        target: target({ managementRole: "admin" }),
        newRole: "admin",
        adminCount: 3,
      });
      assert.deepEqual(d, { ok: false, error: "self" });
    },
  },
  {
    name: "1f. promote bez e-mailu (null, prázdný, mezery) = no-email",
    run: () => {
      for (const email of [null, "", "   "]) {
        const d = decideRoleChange({ actorId: "a1", target: target({ email }), newRole: "admin", adminCount: 1 });
        assert.deepEqual(d, { ok: false, error: "no-email" });
      }
    },
  },
  {
    name: "1g. stejná role = noop, neexistující cíl = not-found",
    run: () => {
      const d = decideRoleChange({
        actorId: "a1",
        target: target({ managementRole: "moderator" }),
        newRole: "moderator",
        adminCount: 1,
      });
      assert.equal(d.ok && d.kind, "noop");
      const n = decideRoleChange({ actorId: "a1", target: null, newRole: "admin", adminCount: 1 });
      assert.deepEqual(n, { ok: false, error: "not-found" });
    },
  },

  // ── 2. checkSession ──
  {
    name: "2a. shoda verze platí, neshoda neplatí",
    run: () => {
      assert.deepEqual(checkSession(cookie({ sv: 3 }), { sessionVersion: 3, managementRole: null }), { valid: true });
      assert.deepEqual(checkSession(cookie({ sv: 3 }), { sessionVersion: 4, managementRole: null }), {
        valid: false,
        reason: "version-mismatch",
      });
    },
  },
  {
    name: "2b. chybějící sv vs. DB 0 platí, vs. DB 1 neplatí",
    run: () => {
      assert.equal(checkSession(cookie(), { sessionVersion: 0, managementRole: null }).valid, true);
      assert.equal(checkSession(cookie(), { sessionVersion: 1, managementRole: null }).valid, false);
    },
  },
  {
    name: "2c. smazaný člen neplatí",
    run: () => {
      assert.deepEqual(checkSession(cookie({ sv: 0 }), null), { valid: false, reason: "member-missing" });
    },
  },
  {
    name: "2d. password s rolí odlišnou od DB neplatí, se shodnou platí",
    run: () => {
      const c = cookie({ authMethod: "password", managementRole: "admin", sv: 1 });
      assert.deepEqual(checkSession(c, { sessionVersion: 1, managementRole: "moderator" }), {
        valid: false,
        reason: "role-mismatch",
      });
      assert.equal(checkSession(c, { sessionVersion: 1, managementRole: null }).valid, false);
      assert.equal(checkSession(c, { sessionVersion: 1, managementRole: "admin" }).valid, true);
    },
  },
  {
    name: "2e. email_link s rolí neplatí, magic_link bez role platí",
    run: () => {
      assert.deepEqual(
        checkSession(cookie({ authMethod: "email_link", managementRole: "moderator", sv: 0 }), {
          sessionVersion: 0,
          managementRole: "moderator",
        }),
        { valid: false, reason: "link-with-role" }
      );
      assert.equal(
        checkSession(cookie({ authMethod: "magic_link", sv: 0 }), { sessionVersion: 0, managementRole: "admin" }).valid,
        true
      );
    },
  },

  // ── 3. F1: session s verzí > 0 ──
  {
    name: "3. F1: magic_link, email_link i password s sv=2 vs. DB 2 platí",
    run: () => {
      assert.equal(checkSession(cookie({ authMethod: "magic_link", sv: 2 }), { sessionVersion: 2, managementRole: null }).valid, true);
      assert.equal(checkSession(cookie({ authMethod: "email_link", sv: 2 }), { sessionVersion: 2, managementRole: "admin" }).valid, true);
      assert.equal(
        checkSession(cookie({ authMethod: "password", managementRole: "moderator", sv: 2 }), {
          sessionVersion: 2,
          managementRole: "moderator",
        }).valid,
        true
      );
    },
  },

  // ── 4. login-link-core ──
  {
    name: "4a. token: 43 znaků base64url, formát, hash deterministický a jiný než token",
    run: () => {
      const t = generateLinkToken();
      assert.equal(t.length, 43);
      assert.ok(isValidLinkTokenFormat(t));
      assert.notEqual(generateLinkToken(), t);
      assert.equal(hashLinkToken(t), hashLinkToken(t));
      assert.match(hashLinkToken(t), /^[0-9a-f]{64}$/);
      for (const bad of ["", "abc", `${t}x`, `${t.slice(0, 42)}=`, `${t.slice(0, 42)}+`, null, 42]) {
        assert.equal(isValidLinkTokenFormat(bad), false, String(bad));
      }
    },
  },
  {
    name: "4b. expirace: login = teď + 15 min, set-password = teď + 24 h",
    run: () => {
      assert.equal(LOGIN_LINK_TTL_MINUTES, 15);
      assert.equal(SET_PASSWORD_LINK_TTL_HOURS, 24);
      assert.equal(linkExpiresAt("login", NOW).getTime() - NOW.getTime(), 15 * 60 * 1000);
      assert.equal(linkExpiresAt("set-password", NOW).getTime() - NOW.getTime(), 24 * 3600 * 1000);
    },
  },
  {
    name: "4c. URL bez dvojitého lomítka, správná cesta podle purpose",
    run: () => {
      const t = "A".repeat(43);
      assert.equal(buildLinkUrl("https://x.cz/", "login", t), `https://x.cz/login/odkaz?t=${t}`);
      assert.equal(buildLinkUrl("https://x.cz", "set-password", t), `https://x.cz/login/heslo?t=${t}`);
      assert.ok(!buildLinkUrl("https://x.cz//", "login", t).includes("cz//"));
    },
  },
  {
    name: "4d. normalizace e-mailu: velká písmena, mezery; U3: \"\" a \"  \" na NULL",
    run: () => {
      assert.equal(normalizeEmail("  Jana.Novak@Firma.CZ "), "jana.novak@firma.cz");
      assert.equal(normalizeEmailForStorage("  Jana@Firma.cz "), "jana@firma.cz");
      assert.equal(normalizeEmailForStorage(""), null);
      assert.equal(normalizeEmailForStorage("   "), null);
      assert.equal(normalizeEmailForStorage(null), null);
      assert.equal(normalizeEmailForStorage(undefined), null);
    },
  },

  // ── 5. planLoginLinkRequest ──
  {
    name: "5. plán: blokace IP, blokace e-mailu, 0 shod, shoda bez e-mailu, shoda; text vždy stejný",
    run: () => {
      const rules = linkRequestThrottleRules("jana@firma.cz", "1.2.3.4");
      const ipRule = rules.find((r) => r.scope === "ip")!;
      const emailRule = rules.find((r) => r.scope === "email")!;
      const plans = [
        planLoginLinkRequest({ blocked: ipRule, member: null }),
        planLoginLinkRequest({ blocked: emailRule, member: null }),
        planLoginLinkRequest({ blocked: null, member: null }),
        planLoginLinkRequest({ blocked: null, member: { ...member, email: null } }),
        planLoginLinkRequest({ blocked: null, member }),
      ];
      assert.deepEqual(
        plans.map((p) => p.reason),
        ["ip-blocked", "email-blocked", "no-member", "no-email", "send"]
      );
      assert.deepEqual(plans.map((p) => p.send), [false, false, false, false, true]);
      for (const p of plans) assert.equal(p.message, LOGIN_LINK_RESPONSE_TEXT);
      assert.equal(MIN_RESPONSE_MS, 2500);
      const sendPlan = plans[4];
      assert.ok(sendPlan.send && sendPlan.memberId === "m1" && !sendPlan.isManagement);
      const mgmt = planLoginLinkRequest({ blocked: null, member: { ...member, managementRole: "admin" } });
      assert.ok(mgmt.send && mgmt.isManagement);
    },
  },
  {
    name: "5b. padding: zbytek do 2 500 ms, nikdy záporný",
    run: () => {
      assert.equal(remainingPaddingMs(1000, 1000), 2500);
      assert.equal(remainingPaddingMs(1000, 2000), 1500);
      assert.equal(remainingPaddingMs(1000, 9000), 0);
    },
  },

  // ── 6. Throttle klíče a rozhodnutí ──
  {
    name: "6a. klíče nesou hash e-mailu, ne e-mail; dvojice e-mail a IP; limity K11",
    run: () => {
      const email = "jana@firma.cz";
      const h = hashEmailForKey(email);
      const pw = passwordLoginThrottleRules(email, "1.2.3.4");
      assert.deepEqual(
        pw.map((r) => [r.key, r.max]),
        [
          [`pw-login-pair:${h}:1.2.3.4`, 10],
          [`pw-login-email:${h}`, 50],
          ["pw-login-ip:1.2.3.4", 20],
        ]
      );
      const link = linkRequestThrottleRules(email, "1.2.3.4");
      assert.deepEqual(
        link.map((r) => [r.key, r.max]),
        [
          ["link-req-ip:1.2.3.4", 10],
          [`link-req-email:${h}`, 3],
        ]
      );
      for (const r of [...pw, ...link]) assert.ok(!r.key.includes(email), r.key);
      assert.equal(passwordLoginPairKey(email, "1.2.3.4"), `pw-login-pair:${h}:1.2.3.4`);
      assert.equal(linkUseThrottleKey("1.2.3.4"), "link-use-ip:1.2.3.4");
      assert.equal(THROTTLE_LIMITS.linkUseIp, 20);
    },
  },
  {
    name: "6b. IP unknown se do klíčů nedává",
    run: () => {
      const pw = passwordLoginThrottleRules("jana@firma.cz", "unknown");
      assert.deepEqual(pw.map((r) => r.scope), ["email"]);
      const link = linkRequestThrottleRules("jana@firma.cz", "unknown");
      assert.deepEqual(link.map((r) => r.scope), ["email"]);
      assert.equal(passwordLoginPairKey("jana@firma.cz", "unknown"), null);
      assert.equal(linkUseThrottleKey("unknown"), null);
      assert.equal(linkUseThrottleKey(""), null);
    },
  },
  {
    name: "6c. blokace je count > max z vrácených počtů",
    run: () => {
      const rules = linkRequestThrottleRules("jana@firma.cz", "1.2.3.4");
      const [ipKey, emailKey] = rules.map((r) => r.key);
      assert.equal(findBlockedRule(rules, [{ key: ipKey, count: 10 }, { key: emailKey, count: 3 }]), null);
      assert.equal(findBlockedRule(rules, [{ key: ipKey, count: 1 }, { key: emailKey, count: 4 }])?.scope, "email");
      assert.equal(findBlockedRule(rules, [{ key: ipKey, count: 11 }, { key: emailKey, count: 1 }])?.scope, "ip");
      assert.equal(findBlockedRule(rules, []), null);
    },
  },

  // ── 7. deriveRunStatus pro access.* (U1: včetně password-link-copied) ──
  {
    name: "7. každý access.* (9 druhů) je terminální, vrátí ok i po 2 hodinách a má štítek na /status",
    run: () => {
      const kinds: OpsEventKind[] = [
        "access.role-changed",
        "access.password-reset",
        "access.password-set",
        "access.password-link-copied",
        "access.password-link-resent",
        "access.functions-changed",
        "access.magic-link-revoked",
        "access.member-deactivated",
        "access.member-reactivated",
      ];
      for (const kind of kinds) {
        assert.ok(TERMINAL_KINDS.includes(kind), kind);
        const at = new Date(NOW.getTime() - 2 * 3600 * 1000);
        const status = deriveRunStatus([{ kind, message: "x", detail: null, occurredAt: at }], NOW);
        assert.equal(status.state, "ok", kind);
      }
      const table = readSrc("app/(app)/status/EventTable.tsx");
      for (const kind of kinds) assert.ok(table.includes(`"${kind}":`), `štítek ${kind}`);
    },
  },

  // ── 8. Statická kontrola: každá page.tsx pod app/(app) volá requirePageSession ──
  {
    name: "8a. každý page.tsx pod app/(app) volá await requirePageSession( mimo komentář",
    run: () => {
      const pages = walk(join(ROOT, "app", "(app)")).filter((f) => f.endsWith("page.tsx"));
      assert.ok(pages.length >= 21, `nalezeno jen ${pages.length} stránek`);
      const missing = pages.filter(
        (f) => !/await requirePageSession\(/.test(stripComments(readFileSync(f, "utf8")))
      );
      assert.deepEqual(missing.map((f) => relative(ROOT, f)), [], `z ${pages.length} stránek chybí guard`);
    },
  },
  {
    name: "8b. stránky pod app/(app)/admin volají requirePageSession({ permission })",
    run: () => {
      const pages = walk(join(ROOT, "app", "(app)", "admin")).filter((f) => f.endsWith("page.tsx"));
      assert.ok(pages.length >= 2, `nalezeno jen ${pages.length} admin stránek`);
      const weak = pages.filter(
        (f) =>
          !/await requirePageSession\(\s*\{[^}]*permission:\s*"/.test(stripComments(readFileSync(f, "utf8")))
      );
      assert.deepEqual(weak.map((f) => relative(ROOT, f)), []);
      // NIT-4: nejen jakékoli právo, ale právo odpovídající stránce
      const EXPECTED: Record<string, string> = {
        "admin/categories/page.tsx": "categories.manage",
        "admin/members/page.tsx": "members.manage",
        "admin/members/[id]/page.tsx": "members.manage",
      };
      for (const f of pages) {
        const rel = relative(join(ROOT, "app", "(app)"), f).split("\\").join("/");
        const perm = EXPECTED[rel];
        assert.ok(perm, `stránka ${rel} nemá očekávané právo v tabulce`);
        assert.ok(
          new RegExp(`await requirePageSession\\(\\s*\\{[^}]*permission:\\s*"${perm.replace(".", "\\.")}"`).test(
            stripComments(readFileSync(f, "utf8"))
          ),
          `${rel}: očekáváno ${perm}`
        );
      }
    },
  },
  {
    name: "8c. stripComments: guard jen v komentáři neprojde",
    run: () => {
      const src = `// await requirePageSession()\n/* await requirePageSession() */\nconst u = "https://x.cz";`;
      assert.ok(!/await requirePageSession\(/.test(stripComments(src)));
      assert.ok(stripComments(src).includes("https://x.cz"));
    },
  },

  // ── 9. Statická kontrola: createSession má vždy verzi, middleware cesty ──
  {
    name: "9a. každé volání createSession( v repu má druhý argument",
    run: () => {
      const files = ["app", "lib", "actions", "components", "scripts"]
        .flatMap((d) => walk(join(ROOT, d)))
        .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith("test-iter-032-access.ts"));
      let calls = 0;
      const bad: string[] = [];
      for (const f of files) {
        const src = readFileSync(f, "utf8");
        const re = /createSession\(/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          const before = src.slice(Math.max(0, m.index - 30), m.index);
          if (/function\s+$/.test(before)) continue; // definice
          const args = callArgs(src, m.index + "createSession".length);
          calls++;
          if (!hasTopLevelComma(args)) bad.push(`${relative(ROOT, f)}@${m.index}`);
        }
      }
      assert.ok(calls >= 5, `nalezeno jen ${calls} volání`);
      assert.deepEqual(bad, []);
    },
  },
  {
    name: "9b. middleware.ts obsahuje \"/login/odkaz\" a \"/login/heslo\"",
    run: () => {
      const src = readFileSync(join(ROOT, "middleware.ts"), "utf8");
      assert.ok(src.includes('"/login/odkaz"'));
      assert.ok(src.includes('"/login/heslo"'));
    },
  },

  // ── 10. L-1: pořadí při nastavení hesla odkazem (runSetPasswordConsume) ──
  {
    name: "10a. L-1: neexistující nebo prošlý odkaz: bez bcrypt, bez spotřebování, započítá neúspěch",
    run: async () => {
      const log: FakeLog = [];
      const r = await runSetPasswordConsume(
        fakeDeps(log, {
          findActiveLink: async () => {
            log.push("find");
            return null;
          },
        }),
        { token: VALID_TOKEN, password: "dlouheheslo", confirm: "dlouheheslo" }
      );
      assert.deepEqual(r, { ok: false, error: LINK_INVALID_TEXT });
      assert.deepEqual(log, ["blocked?", "find", "fail"]);
    },
  },
  {
    name: "10b. L-1: platný odkaz: find, bcrypt, consume, set v tomto pořadí; výsledek nese verzi a roli",
    run: async () => {
      const log: FakeLog = [];
      const r = await runSetPasswordConsume(fakeDeps(log), {
        token: VALID_TOKEN,
        password: "dlouheheslo",
        confirm: "dlouheheslo",
      });
      assert.deepEqual(log, ["blocked?", "find", "bcrypt", "consume", "set"]);
      assert.deepEqual(r, { ok: true, memberId: "m1", name: "Jana", managementRole: "moderator", sessionVersion: 4 });
    },
  },
  {
    name: "10c. nevalidní heslo odkaz nespálí a bcrypt nepočítá; špatný formát tokenu nic nehledá",
    run: async () => {
      for (const [password, confirm] of [["", ""], ["kratke", "kratke"], ["dlouheheslo", "jineheslo1"]]) {
        const log: FakeLog = [];
        const r = await runSetPasswordConsume(fakeDeps(log), { token: VALID_TOKEN, password, confirm });
        assert.equal(r.ok, false);
        assert.deepEqual(log, ["blocked?", "find"], `${password}/${confirm}`);
      }
      const log: FakeLog = [];
      const r = await runSetPasswordConsume(fakeDeps(log), { token: "abc", password: "dlouheheslo", confirm: "dlouheheslo" });
      assert.deepEqual(r, { ok: false, error: LINK_INVALID_TEXT });
      assert.deepEqual(log, ["blocked?", "fail"]);
    },
  },
  {
    name: "10d. blokace IP: nic dalšího; souběžně spotřebovaný odkaz: neúspěch bez uložení hesla",
    run: async () => {
      const log: FakeLog = [];
      const blocked = await runSetPasswordConsume(
        fakeDeps(log, {
          isBlocked: async () => {
            log.push("blocked?");
            return true;
          },
        }),
        { token: VALID_TOKEN, password: "dlouheheslo", confirm: "dlouheheslo" }
      );
      assert.deepEqual(blocked, { ok: false, error: THROTTLE_BLOCKED_TEXT });
      assert.deepEqual(log, ["blocked?"]);

      const log2: FakeLog = [];
      const raced = await runSetPasswordConsume(
        fakeDeps(log2, {
          consumeLink: async () => {
            log2.push("consume");
            return null;
          },
        }),
        { token: VALID_TOKEN, password: "dlouheheslo", confirm: "dlouheheslo" }
      );
      assert.deepEqual(raced, { ok: false, error: LINK_INVALID_TEXT });
      assert.deepEqual(log2, ["blocked?", "find", "bcrypt", "consume", "fail"]);
    },
  },
  {
    name: "10e. login-link.ts: consumeSetPasswordLink jde přes runSetPasswordConsume, bcrypt jinde ne",
    run: () => {
      const src = readSrc("lib/auth/login-link.ts");
      const body = declaration(src, "consumeSetPasswordLink");
      assert.ok(body.includes("runSetPasswordConsume("));
      assert.ok(body.includes("findActiveLinkMemberId("));
      assert.equal((src.match(/\bhash\(/g) ?? []).length, 1, "hash( jen v deps");
    },
  },

  // ── 11. Tvar SQL pojistek (M-1, L-4, L-5), chování ověří QA na větvi Neonu ──
  {
    name: "11a. M-1: updateMemberEmail zneplatní nepoužité odkazy (oba účely) v tomtéž příkazu jen při změně",
    run: () => {
      const body = declaration(readSrc("lib/db/queries/members.ts"), "updateMemberEmail");
      assert.equal((body.match(/getDb\(\)/g) ?? []).length, 1, "jeden příkaz");
      assert.ok(/UPDATE member_login_link SET used_at = now\(\)/.test(body));
      assert.ok(/WHERE changed\)/.test(body), "jen při skutečné změně");
      assert.ok(!/purpose/.test(body), "oba účely, bez filtru purpose");
      assert.ok(/IS DISTINCT FROM/.test(body));
    },
  },
  {
    name: "11b. L-5: reset i povýšení/sesazení zneplatní odkazy set-password v tomtéž příkazu, přepnutí role ne",
    run: () => {
      const src = readSrc("lib/db/queries/members.ts");
      const reset = declaration(src, "resetPasswordGuarded");
      assert.equal((reset.match(/getDb\(\)/g) ?? []).length, 1);
      assert.ok(/UPDATE member_login_link SET used_at = now\(\)[\s\S]*purpose = 'set-password'/.test(reset));
      const role = declaration(src, "setMemberRoleGuarded");
      assert.equal((role.match(/getDb\(\)/g) ?? []).length, 1);
      assert.ok(/password\.mode === "keep"\s*\?\s*sql``/.test(role), "keep bez zneplatnění");
      assert.ok(/UPDATE member_login_link SET used_at = now\(\)[\s\S]*purpose = 'set-password'/.test(role));
    },
  },
  {
    name: "11c. L-4: vystavení odkazu je jeden UPSERT nad částečným unikátním indexem, index je ve schématu i migraci",
    run: () => {
      const q = readSrc("lib/db/queries/login-links.ts");
      const upsert = declaration(q, "upsertSetPasswordLink");
      assert.ok(/ON CONFLICT \(member_id\) WHERE purpose = 'set-password' AND used_at IS NULL/.test(upsert));
      assert.ok(!/supersedeSetPasswordLinks/.test(q), "samostatné supersede už není");
      const issue = declaration(readSrc("lib/auth/login-link.ts"), "issueSetPasswordLink");
      assert.ok(issue.includes("upsertSetPasswordLink(") && !issue.includes("insertLoginLink("));
      assert.ok(readSrc("lib/db/schema.ts").includes('uniqueIndex("mll_one_active_set_password")'));
      const mig = readSrc("scripts/migrate-iter-032-access.ts");
      assert.ok(
        /CREATE UNIQUE INDEX IF NOT EXISTS mll_one_active_set_password\s+ON member_login_link \(member_id\) WHERE purpose = 'set-password' AND used_at IS NULL/.test(mig)
      );
    },
  },
  {
    name: "11d. F-06: migrace [6/6c] počítá jen omezení p, u, c, f",
    run: () => {
      const mig = readSrc("scripts/migrate-iter-032-access.ts");
      assert.ok(/conrelid = 'public\.member_login_link'::regclass\s+AND contype IN \('p', 'u', 'c', 'f'\)/.test(mig));
    },
  },

  // ── 12. M-2 a review F-02: odkaz ke zkopírování a „Poslat znovu" ──
  {
    name: "12a. M-2: odkaz ke zkopírování jen výměnou tokenu nepoužitého neprošlého odkazu, jinak chyba",
    run: () => {
      const src = readSrc("actions/member-access.ts");
      const copy = declaration(src, "issueSetPasswordLinkForCopyAction");
      assert.ok(copy.includes('requirePermission("access.manage")'));
      assert.ok(/rotateSetPasswordLinkUrl\(target\.id, \{ allowExpired: false \}\)/.test(copy));
      assert.ok(/if \(!url\) return \{ success: false/.test(copy));
      assert.ok(!copy.includes("issueSetPasswordLink("), "nový odkaz bez povýšení nebo resetu nevzniká");
      const rotate = declaration(readSrc("lib/db/queries/login-links.ts"), "rotateSetPasswordLink");
      assert.ok(/isNull\(memberLoginLink\.usedAt\)/.test(rotate));
      assert.ok(/allowExpired \? undefined : sql`\$\{memberLoginLink\.expiresAt\} > now\(\)`/.test(rotate));
      assert.ok(!/\.insert\(/.test(rotate), "rotace nikdy nevkládá");
    },
  },
  {
    name: "12b. F-02: „Poslat znovu“ nemění heslo ani verzi session, bez odkazu nabídne vědomý reset",
    run: () => {
      const src = readSrc("actions/member-access.ts");
      const resend = declaration(src, "resendSetPasswordLinkAction");
      assert.ok(resend.includes('requirePermission("access.manage")'));
      assert.ok(/rotateSetPasswordLinkUrl\(target\.id, \{ allowExpired: true \}\)/.test(resend));
      for (const forbidden of ["lockHash(", "resetPasswordGuarded(", "setMemberRoleGuarded(", "issueSetPasswordLink("]) {
        assert.ok(!resend.includes(forbidden), forbidden);
      }
      assert.ok(resend.includes('outcome: "no-active-link"'));
      const ui = readSrc("app/(app)/admin/members/MemberAccessControls.tsx");
      assert.ok(/onClick=\{handleResend\}[^<]*>\s*Poslat znovu/.test(ui), "Poslat znovu volá handleResend");
      assert.ok(!/onClick=\{handleReset\}[^<]*>\s*Poslat znovu/.test(ui));
      assert.ok(declaration(ui, "handleResend").includes("resendSetPasswordLinkAction("));
      assert.ok(ui.includes("startConfirmReset"), "vědomý reset přes potvrzení adresy");
    },
  },

  // ── 13. Drobnosti z review (F-07, NIT k ops_event) ──
  {
    name: "13a. F-07: okno throttle je jediná konstanta, throttle.ts ji importuje a hláška ji používá",
    run: () => {
      const throttle = readSrc("lib/auth/throttle.ts");
      assert.ok(!/const THROTTLE_WINDOW_MINUTES\s*=/.test(throttle), "vlastní definice v throttle.ts");
      assert.ok(/import \{ THROTTLE_WINDOW_MINUTES \} from "@\/lib\/auth\/login-link-core"/.test(throttle));
      assert.ok(THROTTLE_BLOCKED_TEXT.includes(`${THROTTLE_WINDOW_MINUTES} minut`));
    },
  },
  {
    name: "13b. události access.* neodkazují na URL, token ani heslo",
    run: () => {
      let found = 0;
      for (const rel of ["actions/member-access.ts", "actions/login-link.ts"]) {
        const src = readSrc(rel);
        const re = /kind: "access\./g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src))) {
          found++;
          const obj = enclosingObject(src, m.index).replace(/kind: "access\.[a-z-]+"/, "");
          assert.ok(!/\b(url|token|password|passwordHash|http)\b/i.test(obj), `${rel}: ${obj.slice(0, 80)}`);
        }
      }
      // iter-037 (T-003b): šestý zápis je `access.functions-changed` (setMemberFunctionAction).
      assert.equal(found, 6, "6 zápisů access.*");
    },
  },
  {
    name: "14a. N-5: žádný loading.tsx nad stavovými stránkami (router.refresh by znovu připojil celý strom)",
    run: () => {
      // Next 14.2: segment s loading.tsx obalí děti do Suspense a každé
      // router.refresh() / revalidatePath() pak znovu připojí vše pod ním,
      // takže zmizí stav klientských komponent (panel v MemberAccessControls,
      // hláška v EditMemberEmailForm). Soubor proto nesmí být v `app/`,
      // `app/(app)/` ani v `app/(app)/admin/members/`.
      for (const rel of [
        "app/loading.tsx",
        "app/(app)/loading.tsx",
        "app/(app)/admin/loading.tsx",
        "app/(app)/admin/members/loading.tsx",
      ]) {
        assert.throws(() => statSync(join(ROOT, rel)), `${rel} nesmí existovat`);
      }
    },
  },
  {
    name: "14b. N-6: pole přihlášení a nastavení hesla mají min-h-[44px]",
    run: () => {
      for (const rel of ["app/(auth)/login/page.tsx", "app/(auth)/login/heslo/SetPasswordForm.tsx"]) {
        const src = readSrc(rel);
        const inputs = src.match(/<input\b[\s\S]*?\/>/g) ?? [];
        assert.ok(inputs.length > 0, `${rel}: žádný input`);
        for (const tag of inputs) {
          // T-011: stránka /login drží třídy v konstantě INPUT_CLASS.
          const ok = tag.includes("min-h-[44px]") || (tag.includes("INPUT_CLASS") && /INPUT_CLASS =\s*"[^"]*min-h-\[44px\]/.test(src));
          assert.ok(ok, `${rel}: ${tag.slice(0, 60)}`);
        }
      }
    },
  },
  {
    name: "15a. T-011: planLoginStart, blokace, žádný člen, bez e-mailu, bez role, role bez hesla, role s heslem",
    run: () => {
      const rule = { key: "login-start-ip:1.2.3.4", max: 20, scope: "ip" as const };
      const b = planLoginStart({ blocked: rule, member: null });
      assert.deepEqual(b, { next: "blocked", message: THROTTLE_BLOCKED_TEXT });
      // Při blokaci rozhoduje blokace i kdyby člen měl heslo.
      assert.equal(
        planLoginStart({ blocked: rule, member: { email: "a@b.cz", managementRole: "admin", passwordHash: "h" } }).next,
        "blocked"
      );
      assert.deepEqual(planLoginStart({ blocked: null, member: null }), { next: "link" });
      assert.deepEqual(
        planLoginStart({ blocked: null, member: { email: null, managementRole: null, passwordHash: null } }),
        { next: "link" }
      );
      assert.deepEqual(
        planLoginStart({ blocked: null, member: { email: "a@b.cz", managementRole: null, passwordHash: null } }),
        { next: "link" }
      );
      // Heslo bez role (zbytek po odebrání role) nesmí vést na pole hesla.
      assert.deepEqual(
        planLoginStart({ blocked: null, member: { email: "a@b.cz", managementRole: null, passwordHash: "h" } }),
        { next: "link" }
      );
      assert.deepEqual(
        planLoginStart({ blocked: null, member: { email: "a@b.cz", managementRole: "moderator", passwordHash: null } }),
        { next: "link" }
      );
      assert.deepEqual(
        planLoginStart({ blocked: null, member: { email: "a@b.cz", managementRole: "admin", passwordHash: "h" } }),
        { next: "password" }
      );
    },
  },
  {
    name: "15b. T-011: throttle klíče kroku 1 mají vlastní prefix, limity dvojice 10, IP 20, e-mail 50",
    run: () => {
      const email = "jana@firma.cz";
      const h = hashEmailForKey(email);
      const rules = loginStartThrottleRules(email, "1.2.3.4");
      assert.deepEqual(
        rules.map((r) => [r.key, r.max]),
        [
          [`login-start-pair:${h}:1.2.3.4`, 10],
          [`login-start-email:${h}`, 50],
          [`login-start-ip:1.2.3.4`, 20],
        ]
      );
      assert.equal(THROTTLE_LIMITS.loginStartIp, 20);
      assert.equal(THROTTLE_LIMITS.loginStartPair, 10);
      assert.equal(THROTTLE_LIMITS.loginStartEmail, 50);
      assert.deepEqual(
        rules.map((r) => r.scope),
        ["pair", "email", "ip"]
      );
      assert.ok(!rules.some((r) => r.key.includes(email)));
      const others = [...passwordLoginThrottleRules(email, "1.2.3.4"), ...linkRequestThrottleRules(email, "1.2.3.4")];
      for (const r of rules) assert.ok(!others.some((o) => o.key === r.key), r.key);
      // Bez známé IP jen klíč e-mailu.
      assert.equal(loginStartThrottleRules(email, "unknown").length, 1);
      assert.ok(rules.every((r) => r.key.startsWith("login-start-")));
    },
  },
  {
    name: "15c. T-011: větev odkazu je pro neexistující e-mail, člena bez role i roli bez hesla stejná",
    run: () => {
      const members: (LoginLinkMemberMatch | null)[] = [
        null,
        { id: "1", name: "A", email: "a@b.cz", managementRole: null },
        { id: "2", name: "B", email: "b@b.cz", managementRole: "admin" },
      ];
      for (const m of members) {
        assert.equal(planLoginLinkRequest({ blocked: null, member: m }).message, LOGIN_LINK_RESPONSE_TEXT);
      }
      // Padding 2,5 s i pro okamžitou odpověď (neexistující e-mail).
      assert.equal(remainingPaddingMs(5000, 5000), MIN_RESPONSE_MS);
      const src = readSrc("lib/auth/login-link.ts");
      const body = declaration(src, "requestLoginLink");
      assert.ok(body.includes("remainingPaddingMs") && body.includes("await sleep(wait)"));
    },
  },
  {
    name: "15d. T-011: /login v kroku 1 nemá pole hesla, má Pokračovat a texty s diakritikou",
    run: () => {
      const src = readSrc("app/(auth)/login/page.tsx");
      const a = src.indexOf('step === "email" &&');
      const b = src.indexOf('step === "password" &&');
      assert.ok(a > 0 && b > a);
      const stepOne = src.slice(a, b);
      assert.ok(!/type="password"/.test(stepOne), "krok 1 nesmí mít pole hesla");
      assert.ok(stepOne.includes("Pokračovat") && stepOne.includes('autoComplete="username"'));
      assert.ok(src.includes('useState<Step>("email")'));
      // Dnešní dva bloky pod sebou jsou pryč.
      assert.ok(!src.includes("Člen: přihlášení odkazem") && !src.includes("Vedení: e-mail a heslo"));
      assert.ok(src.includes("Poslat odkaz místo hesla") && src.includes("Změnit e-mail"));
      const authSrc = readSrc("actions/auth.ts");
      for (const bad of ["Prihlas", "Nacitani", "Neplatne", "povinne", "vyprs", "Odesilam"]) {
        assert.ok(!src.includes(bad), `login/page.tsx: ${bad}`);
        assert.ok(!authSrc.includes(bad), `actions/auth.ts: ${bad}`);
      }
      assert.ok(!/\bEmail\b/.test(src) && !/Email a heslo/.test(authSrc));
      // Všechna tlačítka a pole min 44 px.
      assert.ok(/PRIMARY_BUTTON =\s*"[^"]*min-h-\[44px\]/.test(src));
      assert.ok(/SECONDARY_BUTTON =\s*"[^"]*min-h-\[44px\]/.test(src));
      assert.ok(/LINK_BUTTON =\s*"[^"]*min-h-\[44px\]/.test(src));
    },
  },
  {
    name: "15f. T-012r: /login drží fokus a obsah polí, name, hlášky se nepřebíjejí, undefined z loginAction, nápověda",
    run: () => {
      const src = readSrc("app/(auth)/login/page.tsx");
      const inputs = src.match(/<input\b[\s\S]*?\/>/g) ?? [];
      assert.equal(inputs.length, 3);
      for (const tag of inputs) {
        assert.ok(!/\bdisabled=/.test(tag), "input nesmí být disabled (ztráta fokusu)");
        assert.ok(/\bname="(email|password)"/.test(tag), "input bez name");
      }
      assert.ok(/name="password"/.test(src) && (src.match(/name="email"/g) ?? []).length === 2);
      assert.ok(src.includes("readOnly={isPending}"));
      assert.ok(src.includes('focusAfterError("email")') && src.includes('focusAfterError("password")'));
      // M-4: undefined z loginAction není chyba.
      assert.ok(src.includes("result?.success === false"));
      assert.ok(!/if \(!result\.success\) setFormError/.test(src));
      // M-2: odeslání hesla maže hlášku o odkazu, odkaz maže chybu hesla.
      const pw = declaration(src, "handlePassword");
      assert.ok(pw.includes("setMessage(null)") && pw.includes("setFormError(null)"));
      const link = declaration(src, "handleSendLink");
      assert.ok(link.includes("setMessage(null)") && link.includes("setFormError(null)"));
      // L-2: nápověda pod heslem.
      assert.ok(src.includes("Heslo ještě nemáš? Nastav si ho odkazem z mailu"));
      // iter-037 (T-003b): stránka /magic je smazaná (mrtvá, nic na ni nevedlo),
      // test 12d v test-iter-037-members.ts hlídá, že neexistuje.
    },
  },
  {
    name: "15e. T-011: startLoginAction throttluje před hledáním člena, chyba vede na odkaz, nic se neloguje",
    run: () => {
      const body = declaration(readSrc("actions/login-link.ts"), "startLoginAction");
      assert.ok(body.indexOf("throttleHit") > 0 && body.indexOf("throttleHit") < body.indexOf("getMemberByEmail"));
      assert.ok(body.includes("requestLoginLink(normalized, ip)"));
      assert.ok(!/console\.\w+\([^)]*(email|normalized|token)/i.test(body));
    },
  },
];

let passed = 0;
let failed = 0;

async function main() {
  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`OK   ${testCase.name}`);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${testCase.name}`);
      console.error(`     ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);
  if (failed > 0) process.exitCode = 1;
}

void main();
