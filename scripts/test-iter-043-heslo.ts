/**
 * Testy iter-043 (T-003b, arch T-001b bod 10, gate K5 až K9, Z1): samoobsluha
 * „Zapomněl(a) jsem heslo". Bez DATABASE_URL, bez sítě. Čisté moduly se
 * importují, DB vrstva se čte jako text.
 *
 * Spuštění: npx tsx scripts/test-iter-043-heslo.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIN_RESPONSE_MS,
  PASSWORD_LINK_PURPOSES,
  PASSWORD_RESET_DAY_WINDOW_MINUTES,
  PASSWORD_RESET_FRESH_LINK_MINUTES,
  PASSWORD_RESET_RESPONSE_TEXT,
  SET_PASSWORD_LINK_TTL_HOURS,
  THROTTLE_LIMITS,
  THROTTLE_WINDOW_MINUTES,
  buildLinkUrl,
  groupRulesByWindow,
  hashEmailForKey,
  linkExpiresAt,
  linkRequestThrottleRules,
  loginStartThrottleRules,
  passwordLoginThrottleRules,
  passwordResetThrottleRules,
  planPasswordResetRequest,
  type LoginLinkMemberMatch,
} from "../lib/auth/login-link-core";
import {
  PASSWORD_RESET_INVALID_EMAIL_TEXT,
  runPasswordResetRequest,
  type PasswordResetRequestDeps,
} from "../lib/auth/password-reset-request";
import { passwordResetEmailContent } from "../lib/email/password-reset-template";
import { TERMINAL_KINDS, type OpsEventInput } from "../lib/ops/types";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
type TestCase = { name: string; run: () => void | Promise<void> };
const cases: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => cases.push({ name, run });

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Tělo deklarace od `export (async) function name` do dalšího `\nexport `. */
function declaration(src: string, name: string): string {
  const m = new RegExp(`export (?:async )?function ${name}\\b`).exec(src);
  assert.ok(m, `deklarace ${name} nenalezena`);
  const rest = src.slice(m.index + 1);
  const next = rest.search(/\n(?:export |\/\*\*)/);
  return next === -1 ? rest : rest.slice(0, next);
}

const member = (p: Partial<LoginLinkMemberMatch> = {}): LoginLinkMemberMatch => ({
  id: "m1",
  name: "Jan Novák",
  email: "jan@example.cz",
  managementRole: "moderator",
  hasFunction: false,
  active: true,
  ...p,
});

// 1. planPasswordResetRequest
test("1. plán: všech 7 větví, message identický", () => {
  const rule = (scope: "email" | "ip") => ({ key: "k", max: 3, scope });
  const results = [
    planPasswordResetRequest({ blocked: rule("email"), member: member() }),
    planPasswordResetRequest({ blocked: rule("ip"), member: member() }),
    planPasswordResetRequest({ blocked: null, member: null }),
    planPasswordResetRequest({ blocked: null, member: member({ managementRole: null, hasFunction: false }) }),
    planPasswordResetRequest({ blocked: null, member: member({ active: false }) }),
    planPasswordResetRequest({ blocked: null, member: member({ email: null }) }),
    planPasswordResetRequest({ blocked: null, member: member() }),
  ];
  assert.deepEqual(
    results.map((r) => r.reason),
    ["email-blocked", "ip-blocked", "no-member", "no-access", "inactive", "no-email", "send"]
  );
  assert.deepEqual(results.map((r) => r.send), [false, false, false, false, false, false, true]);
  assert.equal(new Set(results.map((r) => r.message)).size, 1);
  assert.equal(results[0].message, PASSWORD_RESET_RESPONSE_TEXT);
});
test("1b. plán: admin, držitel funkce bez role a člen se zámkovým hashem dostanou odkaz", () => {
  for (const m of [
    member({ managementRole: "admin" }),
    member({ managementRole: null, hasFunction: true }),
  ]) {
    const p = planPasswordResetRequest({ blocked: null, member: m });
    assert.equal(p.send, true);
    if (p.send) assert.deepEqual([p.memberId, p.email, p.memberName], ["m1", "jan@example.cz", "Jan Novák"]);
  }
  // passwordHash se v plánu nezkoumá: LoginLinkMemberMatch ho vůbec nemá.
  assert.ok(!declaration(readSrc("lib/auth/login-link-core.ts"), "planPasswordResetRequest").includes("passwordHash"));
});
test("1c. plán: při blokaci se člen nehledá (blokace má přednost před členem)", () => {
  const p = planPasswordResetRequest({ blocked: { key: "k", max: 3, scope: "ip" }, member: member() });
  assert.equal(p.send, false);
});

// 2. throttle klíče
test("2. throttle: prefixy, žádný e-mail v klíči, limity 3 a 10, bez IP jen e-mail", () => {
  const rules = passwordResetThrottleRules("jan@example.cz", "1.2.3.4");
  assert.deepEqual(rules.map((r) => r.key), [
    "pw-reset-ip:1.2.3.4",
    `pw-reset-email:${hashEmailForKey("jan@example.cz")}`,
    `pw-reset-email-day:${hashEmailForKey("jan@example.cz")}`,
  ]);
  assert.deepEqual(rules.map((r) => r.max), [10, 3, 5]);
  assert.equal(THROTTLE_LIMITS.pwResetEmail, 3);
  assert.equal(THROTTLE_LIMITS.pwResetIp, 10);
  for (const r of rules) assert.ok(!r.key.includes("@") && !r.key.includes("jan"));
  const noIp = passwordResetThrottleRules("jan@example.cz", "unknown");
  assert.equal(noIp.length, 2);
  assert.ok(noIp.every((r) => r.key.startsWith("pw-reset-email")));
});
test("2b. throttle: klíče se nekryjí s link-req, login-start ani pw-login", () => {
  const mine = passwordResetThrottleRules("jan@example.cz", "1.2.3.4").map((r) => r.key);
  const others = [
    ...linkRequestThrottleRules("jan@example.cz", "1.2.3.4"),
    ...loginStartThrottleRules("jan@example.cz", "1.2.3.4"),
    ...passwordLoginThrottleRules("jan@example.cz", "1.2.3.4"),
  ].map((r) => r.key);
  for (const k of mine) assert.ok(!others.includes(k), k);
});

// 3. platnost a URL
test("2c. M-1a: denní strop 5 za 24 h má vlastní klíč a okno, ostatní zůstávají na 10 min", () => {
  assert.equal(THROTTLE_LIMITS.pwResetEmailDay, 5);
  assert.equal(PASSWORD_RESET_DAY_WINDOW_MINUTES, 24 * 60);
  const rules = passwordResetThrottleRules("jan@example.cz", "1.2.3.4");
  const day = rules.filter((r) => r.windowMinutes === PASSWORD_RESET_DAY_WINDOW_MINUTES);
  assert.equal(day.length, 1);
  assert.ok(day[0].key.startsWith("pw-reset-email-day:") && !day[0].key.includes("@"));
  assert.ok(rules.filter((r) => r !== day[0]).every((r) => r.windowMinutes === undefined));
  const groups = groupRulesByWindow(rules);
  assert.deepEqual(groups.map((g) => g.windowMinutes), [THROTTLE_WINDOW_MINUTES, PASSWORD_RESET_DAY_WINDOW_MINUTES]);
  assert.equal(groups[0].keys.length, 2);
  assert.deepEqual(groups[1].keys, [day[0].key]);
  assert.notEqual(rules[1].key, rules[2].key);
});
test("2d. M-1a: runner volá throttleHit zvlášť pro 10min a 24h okno", async () => {
  const seen: [number, string[]][] = [];
  const h = harness({
    throttleHit: async (keys, w) => {
      seen.push([w, keys]);
      return keys.map((key) => ({ key, count: 1 }));
    },
  });
  await run(h);
  assert.deepEqual(seen.map(([w]) => w), [THROTTLE_WINDOW_MINUTES, PASSWORD_RESET_DAY_WINDOW_MINUTES]);
});
test("2e. M-1a: 5. žádost za 24 h projde, 6. je blokovaná (bez hledání, UPSERTu a mailu), odpověď stejná", async () => {
  for (const [count, sends] of [[5, true], [6, false]] as const) {
    const h = harness({
      throttleHit: async (keys, w) =>
        keys.map((key) => ({ key, count: w === PASSWORD_RESET_DAY_WINDOW_MINUTES ? count : 1 })),
    });
    const r = await run(h);
    assert.deepEqual(r, { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT });
    assert.equal(h.calls.includes("upsert"), sends);
    assert.equal(h.calls.includes("find"), sends);
    assert.deepEqual(h.sleeps, [MIN_RESPONSE_MS]);
    await Promise.all(h.scheduled);
    assert.equal(h.mails.length, sends ? 1 : 0);
  }
});

test("3. linkExpiresAt: password-reset 24 h (Z1), set-password dál 24 h, login 15 min", () => {
  const now = new Date("2026-10-28T10:00:00Z");
  assert.equal(linkExpiresAt("password-reset", now).getTime() - now.getTime(), 24 * 3600 * 1000);
  assert.equal(
    linkExpiresAt("password-reset", now).getTime(),
    linkExpiresAt("set-password", now).getTime()
  );
  assert.equal(SET_PASSWORD_LINK_TTL_HOURS, 24);
  assert.equal(linkExpiresAt("login", now).getTime() - now.getTime(), 15 * 60 * 1000);
});
test("3b. buildLinkUrl: password-reset vede na /login/heslo", () => {
  assert.equal(buildLinkUrl("https://x.cz/", "password-reset", "abc"), "https://x.cz/login/heslo?t=abc");
  assert.equal(buildLinkUrl("https://x.cz", "login", "abc"), "https://x.cz/login/odkaz?t=abc");
  assert.deepEqual([...PASSWORD_LINK_PURPOSES], ["set-password", "password-reset"]);
});
test("3c. odpověď zmiňuje 24 hodin a spam, ne 60 minut", () => {
  assert.ok(PASSWORD_RESET_RESPONSE_TEXT.includes("Platí 24 hodin."));
  assert.ok(PASSWORD_RESET_RESPONSE_TEXT.includes("spamu"));
  assert.ok(!PASSWORD_RESET_RESPONSE_TEXT.includes("60 minut"));
  assert.ok(!PASSWORD_RESET_RESPONSE_TEXT.includes(EM_DASH));
});

// 4. runner
interface Harness {
  deps: PasswordResetRequestDeps;
  calls: string[];
  scheduled: Promise<void>[];
  logged: OpsEventInput[];
  sleeps: number[];
  upserts: { memberId: string; tokenHash: string; expiresAt: Date; freshMinutes: number }[];
  mails: { to: string; url: string }[];
}
function harness(over: Partial<PasswordResetRequestDeps> = {}, o: { counts?: number; fresh?: boolean } = {}): Harness {
  const h: Harness = { calls: [], scheduled: [], logged: [], sleeps: [], upserts: [], mails: [], deps: null as never };
  h.deps = {
    throttleHit: async (keys) => {
      h.calls.push("throttle");
      return keys.map((key) => ({ key, count: o.counts ?? 1 }));
    },
    findMember: async () => {
      h.calls.push("find");
      return member();
    },
    upsertLink: async (i) => {
      h.calls.push("upsert");
      h.upserts.push(i);
      return !o.fresh;
    },
    sendMail: async (i) => {
      h.calls.push("mail");
      h.mails.push({ to: i.to, url: i.url });
      return { success: true };
    },
    logEvent: async (e) => {
      h.calls.push("log");
      h.logged.push(e);
    },
    schedule: (t) => {
      h.calls.push("schedule");
      h.scheduled.push(t);
    },
    sleep: async (ms) => {
      h.calls.push("sleep");
      h.sleeps.push(ms);
    },
    now: () => 1000,
    appUrl: () => "https://app.example",
    ...over,
  };
  return h;
}
const run = (h: Harness, email: unknown = "Jan@Example.cz ") =>
  runPasswordResetRequest(h.deps, { email, ip: "1.2.3.4", startedAt: 1000 });

test("4a. runner: throttle před hledáním, pořadí kroků, sleep doplní na 2,5 s", async () => {
  const h = harness();
  const r = await run(h);
  assert.deepEqual(r, { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT });
  // Mail a záznam startují až po doplnění doby (AC: mail a log po odpovědi).
  assert.deepEqual(h.calls.slice(0, 6), ["throttle", "throttle", "find", "upsert", "sleep", "mail"]);
  assert.ok(h.calls.includes("schedule"));
  await Promise.all(h.scheduled);
  assert.equal(h.calls[h.calls.length - 1], "log");
  assert.deepEqual(h.sleeps, [MIN_RESPONSE_MS]);
});
test("4b. runner: UPSERT dostane hash (64 hex, ne token) a expiraci +24 h, mail dostane URL s tokenem", async () => {
  const h = harness();
  await run(h);
  await Promise.all(h.scheduled);
  assert.equal(h.upserts.length, 1);
  assert.match(h.upserts[0].tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(h.upserts[0].expiresAt.getTime(), 1000 + 24 * 3600 * 1000);
  assert.equal(h.upserts[0].freshMinutes, PASSWORD_RESET_FRESH_LINK_MINUTES);
  assert.equal(h.mails.length, 1);
  assert.equal(h.mails[0].to, "jan@example.cz");
  const m = h.mails[0].url.match(/^https:\/\/app\.example\/login\/heslo\?t=([A-Za-z0-9_-]{43})$/);
  assert.ok(m, h.mails[0].url);
  assert.notEqual(m![1], h.upserts[0].tokenHash);
});
test("4c. runner: blokace nevolá hledání, UPSERT ani plánování, odpověď stejná", async () => {
  const h = harness({}, { counts: 99 });
  const r = await run(h);
  assert.deepEqual(h.calls, ["throttle", "throttle", "sleep"]);
  assert.deepEqual(r, { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT });
});
test("4d. runner: neexistující e-mail, běžný člen a neaktivní nic nevystaví, odpověď stejná", async () => {
  for (const found of [null, member({ managementRole: null }), member({ active: false })]) {
    const h = harness({ findMember: async () => found });
    const r = await run(h);
    assert.deepEqual(r, { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT });
    assert.ok(!h.calls.includes("upsert") && !h.calls.includes("schedule"));
    assert.deepEqual(h.sleeps, [MIN_RESPONSE_MS]);
  }
});
test("4e. runner: mail se nikdy nevyřeší, funkce přesto vrátí výsledek", async () => {
  const h = harness({ sendMail: () => new Promise(() => {}) });
  const r = await run(h);
  assert.equal(r.ok, true);
  assert.equal(h.scheduled.length, 1);
});
test("4f. runner: výjimka v hledání i v UPSERTu = stejný text a sleep proběhne", async () => {
  for (const over of [
    { findMember: async () => { throw new Error("db"); } },
    { upsertLink: async () => { throw new Error("23514"); } },
    { throttleHit: async () => { throw new Error("db"); } },
  ] as Partial<PasswordResetRequestDeps>[]) {
    const h = harness(over);
    const r = await run(h);
    assert.deepEqual(r, { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT });
    assert.deepEqual(h.sleeps, [MIN_RESPONSE_MS]);
    assert.ok(!h.calls.includes("schedule"), "po selhání UPSERTu mail neodejde");
  }
});
test("4j. M-1b: čerstvý odkaz (UPSERT vrátí false) = žádný mail, žádný záznam, stejná odpověď a doba", async () => {
  const fresh = harness({}, { fresh: true });
  const sent = harness();
  const [rf, rs] = [await run(fresh), await run(sent)];
  await Promise.all([...fresh.scheduled, ...sent.scheduled]);
  assert.deepEqual(rf, rs);
  assert.deepEqual(rf, { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT });
  assert.deepEqual(fresh.sleeps, sent.sleeps);
  assert.deepEqual(fresh.sleeps, [MIN_RESPONSE_MS]);
  assert.ok(fresh.calls.includes("upsert"));
  assert.ok(!fresh.calls.includes("schedule") && !fresh.calls.includes("mail") && !fresh.calls.includes("log"));
  assert.equal(fresh.mails.length, 0);
  assert.equal(fresh.logged.length, 0);
  assert.equal(sent.mails.length, 1);
});
test("4k. M-1b: prahy 5 minut a statická kontrola, že UPSERT je podmíněný a atomický", () => {
  assert.equal(PASSWORD_RESET_FRESH_LINK_MINUTES, 5);
  const q = declaration(readSrc("lib/db/queries/login-links.ts"), "upsertPasswordResetLink");
  assert.ok(/DO UPDATE SET[\s\S]*WHERE member_login_link\.created_at < now\(\) - make_interval\(mins => \$\{input\.freshMinutes\}::int\)[\s\S]*RETURNING member_id/.test(q));
  assert.ok(q.includes("rows.length > 0"));
  // žádná migrace navíc: created_at už existuje a UPSERT ho obnovuje
  assert.ok(/created_at = now\(\)/.test(q));
});
test("4l. M-2: demote, role-clear i odebrání funkce zneplatní i password-reset", () => {
  const members = readSrc("lib/db/queries/members.ts");
  const start = members.indexOf("export async function setMemberRoleGuarded");
  assert.ok(start > 0);
  const body = members.slice(start);
  const revokes = body.match(/UPDATE member_login_link SET used_at = now\(\)[\s\S]*?used_at IS NULL/g) ?? [];
  assert.ok(revokes.length >= 2, "clear a demote");
  for (const r of revokes.slice(0, 2)) assert.ok(r.includes("purpose IN ('set-password', 'password-reset')"), r);
  const fns = readSrc("lib/db/queries/member-functions.ts");
  const rem = fns.slice(fns.indexOf("export async function removeMemberFunctionGuarded"));
  assert.ok(/UPDATE member_login_link SET used_at = now\(\)[\s\S]*purpose IN \('set-password', 'password-reset'\)/.test(rem));
});
test("4g. runner: nevalidní e-mail = jediná odlišná odpověď, bez throttle", async () => {
  for (const bad of ["", "nema-zavinac", 42, null]) {
    const h = harness();
    const r = await run(h, bad);
    assert.deepEqual(r, { ok: false, error: PASSWORD_RESET_INVALID_EMAIL_TEXT });
    assert.deepEqual(h.calls, []);
  }
});
test("4h. runner: schedule vyhodí = odpověď stejná", async () => {
  const h = harness({ schedule: () => { throw new Error("no ctx"); } });
  const r = await run(h);
  assert.deepEqual(r, { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT });
});
test("4i. runner: dlouhé zpracování zkracuje čekání, po 2,5 s se nečeká", async () => {
  const h = harness({ now: () => 1000 + MIN_RESPONSE_MS + 5 });
  await run(h);
  assert.deepEqual(h.sleeps, []);
});

// 5. naplánovaná úloha
test("5. úloha: úspěch mailu = info, neúspěch nebo výjimka = warn, výjimka v logu se spolkne", async () => {
  const cases2: [Partial<PasswordResetRequestDeps>, string][] = [
    [{}, "info"],
    [{ sendMail: async () => ({ success: false }) }, "warn"],
    [{ sendMail: async () => { throw new Error("resend"); } }, "warn"],
  ];
  for (const [over, severity] of cases2) {
    const h = harness(over);
    await run(h);
    await Promise.all(h.scheduled);
    assert.equal(h.logged.length, 1);
    const e = h.logged[0];
    assert.equal(e.kind, "access.password-reset-requested");
    assert.equal(e.severity, severity);
    assert.equal(e.source, "gui");
    assert.equal(e.actor, null);
    assert.equal(e.memberId, "m1");
    assert.ok(!/[@]|http/.test(e.message + JSON.stringify(e.detail ?? {})));
    assert.equal(e.email ?? null, null);
  }
  const h = harness({ logEvent: async () => { throw new Error("ops"); } });
  await run(h);
  await Promise.all(h.scheduled);
});
test("5b. úloha: jiné větve nic nelogují", async () => {
  const h = harness({ findMember: async () => null });
  await run(h);
  await Promise.all(h.scheduled);
  assert.equal(h.logged.length, 0);
});

// 6. mail
test("6. mail: tyká, 24 hodin, nežádal(a), platí dál, URL jen v text, bez em dash", () => {
  const c = passwordResetEmailContent({
    name: "Jan Novák",
    to: "jan@example.cz",
    url: "https://app.example/login/heslo?t=TOKEN",
    appUrl: "https://app.example/",
  });
  const joined = [c.subject, ...c.lines, ...c.footer, c.buttonLabel].join("\n");
  assert.ok(joined.includes("nežádal(a)"));
  assert.ok(joined.includes("platí dál"));
  assert.ok(c.lines.some((l) => l.includes("24 hodin")));
  assert.ok(!joined.includes("60 minut"));
  assert.ok(!joined.includes("TOKEN"));
  assert.ok(c.text.includes("Nastavit nové heslo: https://app.example/login/heslo?t=TOKEN"));
  assert.ok(c.lines[0].startsWith("Ahoj Jan Novák,"));
  assert.ok(c.lines.some((l) => l.includes("jan@example.cz") && l.includes("https://app.example/login")));
  assert.ok(!c.text.includes(EM_DASH));
  assert.equal(c.subject, "BNI Plzeň: odkaz na nové heslo");
});

// 7. statické: login vs. heslo
test("7. statické: consumeSetPasswordLink používá obě nové query, consumeLoginLink jen 'login'", () => {
  const src = readSrc("lib/auth/login-link.ts");
  const setPw = declaration(src, "consumeSetPasswordLink");
  assert.ok(setPw.includes("findActivePasswordLinkMemberId(") && setPw.includes("consumePasswordLinkByHash("));
  assert.ok(!setPw.includes('"login"'));
  const login = declaration(src, "consumeLoginLink");
  assert.ok(login.includes('consumeLinkByHash(hashLinkToken(token), "login")'));
  assert.ok(!login.includes("consumePasswordLinkByHash"));
  const q = readSrc("lib/db/queries/login-links.ts");
  for (const name of ["consumePasswordLinkByHash", "findActivePasswordLinkMemberId"]) {
    const body = declaration(q, name);
    assert.ok(body.includes("PASSWORD_LINK_PURPOSES"), name);
    assert.ok(!body.includes('"login"'), name);
  }
});

// 8. statické: revoke
test("8. statické: setOwnPassword jedním příkazem s revoke obou účelů, resetPasswordGuarded taky (K5)", () => {
  const src = readSrc("lib/db/queries/members.ts");
  const own = declaration(src, "setOwnPassword");
  assert.equal((own.match(/getDb\(\)/g) ?? []).length, 1);
  assert.ok(own.includes('memberActiveSql("member")'));
  assert.ok(/UPDATE member_login_link SET used_at = now\(\)[\s\S]*purpose IN \('set-password', 'password-reset'\)[\s\S]*used_at IS NULL/.test(own));
  assert.ok(!own.includes("db.transaction") && !own.includes(".transaction("));
  const reset = declaration(src, "resetPasswordGuarded");
  assert.equal((reset.match(/getDb\(\)/g) ?? []).length, 1);
  assert.ok(/UPDATE member_login_link SET used_at = now\(\)[\s\S]*purpose IN \('set-password', 'password-reset'\)/.test(reset));
});

// 9. statické: UPSERT, schéma, migrace
test("9. statické: UPSERT, schéma s CHECK a indexem, migrace bez ${ uvnitř $$ (LL-006)", () => {
  const upsert = declaration(readSrc("lib/db/queries/login-links.ts"), "upsertPasswordResetLink");
  assert.ok(upsert.includes("ON CONFLICT (member_id) WHERE purpose = 'password-reset' AND used_at IS NULL"));
  const schema = readSrc("lib/db/schema.ts");
  assert.ok(schema.includes("IN ('login', 'set-password', 'password-reset')"));
  assert.ok(schema.includes('uniqueIndex("mll_one_active_password_reset")'));
  const mig = readSrc("scripts/migrate-iter-043-heslo.ts");
  assert.ok(/CHECK \(purpose IN \('login', 'set-password', 'password-reset'\)\)/.test(mig));
  assert.ok(/CREATE UNIQUE INDEX IF NOT EXISTS mll_one_active_password_reset\s+ON member_login_link \(member_id\) WHERE purpose = 'password-reset' AND used_at IS NULL/.test(mig));
  assert.ok(mig.includes("EXPECT_DB_HOST") && mig.includes("set_config('lock_timeout', '5s', true)"));
  const code = mig.replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = code.match(/DO \$\$[\s\S]*?END \$\$/g) ?? [];
  assert.equal(blocks.length, 3, "smoke test a dva DDL bloky");
  for (const block of blocks) {
    assert.ok(!block.includes("${"), "JS interpolace uvnitř $$ (LL-006)");
  }
  assert.ok(!mig.includes("db.transaction"));
});

// 10. ops
test("10. access.password-reset-requested je v TERMINAL_KINDS a má štítek", () => {
  assert.ok(TERMINAL_KINDS.includes("access.password-reset-requested"));
  assert.ok(readSrc("app/(app)/status/EventTable.tsx").includes('"access.password-reset-requested": "Žádost o nové heslo"'));
});

// 11. UI
test("11. UI: tlačítko jen v kroku hesla a volá akci, mrtvý odkaz už neodkazuje jen na admina", () => {
  const page = readSrc("app/(auth)/login/page.tsx");
  const occurrences = page.match(/Zapomněl\(a\) jsem heslo/g) ?? [];
  assert.ok(occurrences.length >= 1);
  const start = page.indexOf('step === "password" && (');
  const end = page.indexOf('step === "link" && (');
  assert.ok(start > 0 && end > start);
  assert.ok(page.slice(start, end).includes("onClick={handleForgotPassword}"));
  assert.ok(page.slice(start, end).includes('"Zapomněl(a) jsem heslo"'));
  assert.ok(!page.slice(0, start).includes('"Zapomněl(a) jsem heslo"'));
  assert.ok(page.includes("requestPasswordResetAction(email)"));
  assert.ok(!page.slice(start, end).includes("Heslo ještě nemáš? Nastav si ho odkazem z mailu"));
  const form = readSrc("app/(auth)/login/heslo/SetPasswordForm.tsx");
  assert.ok(!form.includes("Požádej admina o nový."));
  assert.ok(form.includes("Zapomněl(a) jsem heslo"));
  const action = readSrc("actions/login-link.ts");
  assert.ok(declaration(action, "requestPasswordResetAction").includes("requestPasswordReset("));
});

// 12. nápověda a em dash
test("12. nápověda: moderátor i admin, 24 hodin, bez em dash v nových souborech", () => {
  const mod = readSrc("components/help/sections/ModeratorHelp.tsx");
  assert.ok(mod.includes("klikněte na „Zapomněl(a) jsem heslo“. Přijde mail s odkazem, platí 24 hodin."));
  assert.ok(readSrc("components/help/sections/AdminHelp.tsx").includes("Člen si může odkaz poslat sám"));
  for (const f of [
    "lib/auth/password-reset-request.ts",
    "lib/auth/password-reset.ts",
    "lib/email/password-reset-template.ts",
    "scripts/migrate-iter-043-heslo.ts",
    "scripts/test-iter-043-heslo.ts",
  ]) {
    assert.ok(!readSrc(f).includes(EM_DASH), f);
  }
});
test("13. řetěz test:iter-043 obsahuje heslo a iter-042", () => {
  const pkg = JSON.parse(readSrc("package.json"));
  assert.equal(pkg.scripts["test:iter-043-heslo"], "tsx scripts/test-iter-043-heslo.ts");
  assert.equal(
    pkg.scripts["test:iter-043"],
    "npm run test:iter-043-export-omluvy && npm run test:iter-043-heslo && npm run test:iter-042"
  );
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
