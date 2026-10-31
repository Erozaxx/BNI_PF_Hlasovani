/**
 * Testy iter-044 (vlastní body semaforu), SQL část: DDL z `lib/semafor/points-ddl.ts`
 * (stejný text jako v migraci) a skutečné dotazy z `lib/db/queries/semafor-points.ts`
 * nad PGlite in-process. Bez DATABASE_URL a bez sítě, žádný host. Modul se hledá
 * v `PGLITE_MODULE_DIR` nebo v cwd; bez něj se test přeskočí s hlasitou hláškou,
 * `REQUIRE_PGLITE=1` z toho udělá chybu (npm run test:iter-044-sql).
 *
 * Číslování podle arch_iter-044_T-001 sekce 11: 12 až 16, 18, 19b, 23.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  activityOutcomeFromRow,
  addActivityMembersSql,
  deleteActivitySql,
  deleteOwnThanksSql,
  deletePointSql,
  functionEventsSql,
  insertActivitySql,
  insertPointSql,
  insertThanksSql,
  pointEventsSql,
  writeOutcomeFromRow,
  type FlagsRow,
} from "../lib/db/queries/semafor-points";
import { ALL_POINTS_DDL, doBlock, smokeDdl } from "../lib/semafor/points-ddl";
import { verifyPointsSchema, type PointsQuery } from "../lib/semafor/points-verify";
import { bonusForMonth, type BonusEvent } from "../lib/semafor/mine";
import { computeBonus, type BonusCategory } from "../lib/semafor/bonus";

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
      const req = createRequire(path.join(dir, "noop.js"));
      const mod = req("@electric-sql/pglite") as { PGlite: new () => PgLite };
      return mod.PGlite;
    } catch {
      /* zkusit další */
    }
  }
  return null;
}

let n = 0;
const ok = (m: string) => console.log(`ok ${++n}. ${m}`);

/** Minimální schéma, které dotazy čtou (sloupce a CHECK jako v schema.ts, bez ostatních tabulek). */
const BASE_DDL = `
CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  password_hash text, management_role text,
  deactivated_at timestamptz, inactive_until date,
  CONSTRAINT member_inactive_until_needs_deactivation CHECK (inactive_until IS NULL OR deactivated_at IS NOT NULL)
);
CREATE TABLE chapter_function (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, area text NOT NULL,
  display_order integer NOT NULL, permissions text[],
  CONSTRAINT chapter_function_area_check CHECK (area IN ('vedeni', 'leadership', 'vybor', 'ostatni'))
);
CREATE TABLE member_function (
  member_id uuid PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  function_id uuid NOT NULL REFERENCES chapter_function(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(), assigned_by uuid REFERENCES member(id) ON DELETE SET NULL
);
`;

const TODAY = "2026-10-31";
const dialect = new PgDialect();

async function main() {
  const PGlite = loadPglite();
  if (!PGlite) {
    const msg = "PGlite nenalezen (nastav PGLITE_MODULE_DIR na adresář s node_modules/@electric-sql/pglite). SQL scénáře iter-044 PŘESKOČENY.";
    if (process.env.REQUIRE_PGLITE === "1") {
      console.error(msg);
      process.exit(1);
    }
    console.log(`UPOZORNĚNÍ: ${msg}`);
    return;
  }
  const db = new PGlite();
  await db.waitReady;
  await db.exec(BASE_DDL);

  const run = async (q: SQL) => {
    const c = dialect.sqlToQuery(q);
    return (await db.query(c.sql, c.params as unknown[])).rows;
  };
  const rows = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
  const count = async (table: string, where = "true") =>
    Number((await rows(`SELECT count(*)::int AS c FROM ${table} WHERE ${where}`))[0].c);
  const throwsDb = async (text: string, params: unknown[], label: string) => {
    await assert.rejects(() => db.query(text, params), /./, label);
  };

  // ── 12. DDL dvakrát (idempotence) a smoke ───────────────────
  await db.exec(ALL_POINTS_DDL);
  await db.exec(ALL_POINTS_DDL);
  ok("12. DDL z points-ddl.ts projde dvakrát (CREATE … IF NOT EXISTS)");
  await db.exec(doBlock(smokeDdl()));
  await db.exec(doBlock(smokeDdl()));
  assert.equal(await count("information_schema.tables", "table_name LIKE '%smoke%'"), 0, "smoke po sobě uklidí");
  ok("12b. smoke test (stejný tvar na dočasných tabulkách) projde dvakrát a po sobě uklidí");
  await db.exec(doBlock(ALL_POINTS_DDL));
  ok("12c. DDL zabalené v DO bloku s lock_timeout (tvar z migrace) také projde");

  // F-01: kontroly [4a] až [4d] z migrace (sdílený kód) nad stejným DDL, dvakrát po sobě.
  const verifyQuery: PointsQuery = async (text, params) => (await db.query(text, params ?? [])).rows;
  for (const round of [1, 2]) {
    if (round === 2) await db.exec(doBlock(ALL_POINTS_DDL));
    const steps = await verifyPointsSchema(verifyQuery);
    assert.deepEqual(steps.map((x) => x.step), ["4a", "4b", "4c", "4d"]);
    for (const st of steps) assert.deepEqual(st.errors, [], `kontrola ${st.step} (kolo ${round}): ${st.errors.join("; ")}`);
  }
  // kontrola není slepá: vyprázdněný CHECK a chybějící index se musí chytit
  await db.exec("ALTER TABLE semafor_point DROP CONSTRAINT sp_points");
  await db.exec("ALTER TABLE semafor_point ADD CONSTRAINT sp_points CHECK (points IS NULL OR points >= 1)");
  const broken = await verifyPointsSchema(verifyQuery);
  assert.ok(broken.find((x) => x.step === "4c")!.errors.some((e) => e.includes("sp_points")), "poškozený sp_points se chytí");
  await db.exec("ALTER TABLE semafor_point DROP CONSTRAINT sp_points");
  await db.exec(
    "ALTER TABLE semafor_point ADD CONSTRAINT sp_points CHECK ((category = 'work' AND points IS NOT NULL AND points BETWEEN 1 AND 20) OR (category <> 'work' AND points IS NULL))"
  );
  await db.exec("DROP INDEX uq_sa_dup");
  assert.ok((await verifyPointsSchema(verifyQuery)).find((x) => x.step === "4d")!.errors.length > 0, "chybějící uq_sa_dup se chytí");
  await db.exec(doBlock(ALL_POINTS_DDL));
  for (const st of await verifyPointsSchema(verifyQuery)) assert.deepEqual(st.errors, [], `po obnově ${st.step}`);
  ok("12d. kontroly schématu z migrace ([4a] až [4d], CHECK_LITERALS, indexy) projdou nad DDL dvakrát po sobě; poškozený CHECK a chybějící uq_sa_dup se chytí");

  // ── seed ────────────────────────────────────────────────────
  const ids: Record<string, string> = {};
  const mk = async (key: string, opts: { password?: boolean; role?: string; joined?: string; deactivated?: boolean } = {}) => {
    const r = await rows(
      `INSERT INTO member (name, joined_at, password_hash, management_role, deactivated_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
      [key, opts.joined ?? "2020-01-01", opts.password ? "hash" : null, opts.role ?? null, opts.deactivated ? new Date("2026-01-01") : null]
    );
    ids[key] = String(r[0].id);
  };
  const fnIds: Record<string, string> = {};
  const mkFn = async (key: string, area: string, order: number, permissions: string[] | null) => {
    const r = await rows(
      `INSERT INTO chapter_function (name, area, display_order, permissions) VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
      [key, area, order, permissions]
    );
    fnIds[key] = String(r[0].id);
  };
  const give = (member: string, fn: string, assignedAt = "2026-01-10T10:00:00+01:00") =>
    rows(`INSERT INTO member_function (member_id, function_id, assigned_at) VALUES ($1, $2, $3)`, [ids[member], fnIds[fn], assignedAt]);

  // Funkce jako seed v migrate-iter-037-clenove.ts: P a VP značka `admin-delegable`, Člen výboru NULL.
  await mkFn("Prezident", "vedeni", 1, ["admin-delegable"]);
  await mkFn("Viceprezident", "vedeni", 2, ["admin-delegable"]);
  await mkFn("Člen výboru", "vybor", 3, null);
  await mkFn("Vlastní výbor", "vybor", 4, ["guests.manage"]);

  for (const k of ["pres", "vp", "vyborA", "vyborB", "adminPlain", "adminVybor", "moder", "ruzny", "vlastni", "bezHesla"]) {
    await mk(k, { password: k !== "bezHesla" && k !== "ruzny" });
  }
  await rows(`UPDATE member SET management_role = 'admin' WHERE name IN ('adminPlain', 'adminVybor')`);
  await rows(`UPDATE member SET management_role = 'moderator' WHERE name = 'moder'`);
  await mk("bezHesla2");
  await mk("cil1");
  await mk("cil2");
  await mk("neaktivni", { deactivated: true });
  await mk("novy", { joined: "2026-09-01" });
  await mk("novyStary", { joined: "2025-01-01" });
  await give("pres", "Prezident");
  await give("vp", "Viceprezident");
  await give("vyborA", "Člen výboru");
  await give("vyborB", "Člen výboru");
  await give("adminVybor", "Člen výboru");
  await give("vlastni", "Vlastní výbor");

  const outcome = (r: Record<string, unknown>[], o: { withPerm?: boolean; withCommittee?: boolean; dup?: "errDuplicate" | "errWorkDuplicate" | "errThanksDuplicate" } = {}) =>
    writeOutcomeFromRow(r[0] as FlagsRow | undefined, {
      withPerm: o.withPerm ?? true,
      withCommittee: o.withCommittee ?? false,
      duplicateKey: o.dup,
    });

  // ── 13. CHECK ───────────────────────────────────────────────
  const ins = (cols: string, vals: unknown[]) =>
    db.query(`INSERT INTO semafor_point (${cols}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")})`, vals);
  const base = ["member_id", "category", "earned_on", "earned_month", "created_by"];
  const baseVals = (cat: string, cb: string | null = ids.vyborA) => [ids.cil1, cat, "2026-10-10", "2026-10-01", cb];
  await throwsDb(
    "INSERT INTO semafor_point (member_id, category, earned_on, earned_month, created_by, note) VALUES ($1,'thanks','2026-10-10','2026-10-01',$1,'Díky moc')",
    [ids.cil1],
    "sám sobě"
  );
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}) VALUES ($1,'host_member',$3,$4,$5)`, baseVals("host_member"), "host_member bez ref_member_id");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, points, note) VALUES ($1,'work',$3,$4,$5, NULL, 'Popis práce')`, baseVals("work"), "work bez bodů (points NULL, R-02)");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, points, note) VALUES ($1,'work',$3,$4,$5, 0, 'Popis práce')`, baseVals("work"), "work s 0 body");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, points, note) VALUES ($1,'work',$3,$4,$5, 21, 'Popis práce')`, baseVals("work"), "work s 21 body");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, points, note) VALUES ($1,'thanks',$3,$4,$5, 3, 'Díky moc')`, baseVals("thanks"), "thanks s body");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, note) VALUES ($1,'thanks',$3,'2026-09-01',$5, 'Díky moc')`, baseVals("thanks"), "earned_month nesedí");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, points, note) VALUES ($1,'work',$3,$4,$5, 5, 'ab')`, baseVals("work"), "poznámka 2 znaky u work");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, note) VALUES ($1,'bonus',$3,$4,$5, 'Popis práce')`, baseVals("bonus"), "kategorie mimo výčet");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, note) VALUES ($1,'activity',$3,$4,$5, NULL)`, baseVals("activity"), "activity bez activity_id");
  await throwsDb(`INSERT INTO semafor_point (${base.join(",")}, ref_member_id) VALUES ($1,'host_member',$3,$4,$5,$1)`, baseVals("host_member"), "nový člen = kdo přivedl");
  assert.equal(await count("semafor_point"), 0, "žádný z odmítnutých řádků nevznikl");
  await ins(`${base.join(",")}, points, note`, [...baseVals("work"), 10, "Organizace akce"]);
  assert.equal(await count("semafor_point"), 1, "platný řádek projde");
  await rows("TRUNCATE semafor_point CASCADE");
  ok("13. CHECK: sám sobě, host_member bez ref, work bez bodů (NULL), 0 a 21 body, thanks s body, earned_month, krátká poznámka, kategorie, activity bez akce, ref = sám");

  // ── 14. UNIQUE ──────────────────────────────────────────────
  await ins(`${base.join(",")}, note`, [ids.cil1, "thanks", "2026-10-05", "2026-10-01", ids.vyborA, "První díky"]);
  await throwsDb(
    `INSERT INTO semafor_point (${base.join(",")}, note) VALUES ($1,'thanks','2026-10-20','2026-10-01',$2,'Druhé díky')`,
    [ids.cil1, ids.vyborA],
    "druhé poděkování stejné dvojici v měsíci"
  );
  await ins(`${base.join(",")}, note`, [ids.cil1, "thanks", "2026-11-02", "2026-11-01", ids.vyborA, "Další měsíc"]);
  await ins(`${base.join(",")}, note`, [ids.cil1, "thanks", "2026-10-06", "2026-10-01", ids.vyborB, "Jiný autor"]);
  await ins(`${base.join(",")}, ref_member_id`, [ids.cil1, "host_member", "2026-09-01", "2026-09-01", ids.vyborA, ids.novy]);
  await throwsDb(
    `INSERT INTO semafor_point (${base.join(",")}, ref_member_id) VALUES ($1,'host_member','2026-09-01','2026-09-01',$2,$3)`,
    [ids.cil2, ids.vyborA, ids.novy],
    "druhý host_member pro stejného nového člena"
  );
  await rows("TRUNCATE semafor_point CASCADE");
  ok("14. UNIQUE: druhé poděkování dvojici v měsíci odmítnuto, další měsíc a jiný autor projdou; druhý host_member pro téhož nového člena odmítnut");

  // ── 15. kaskády ─────────────────────────────────────────────
  const act = await rows(`INSERT INTO semafor_activity (title, held_on, created_by) VALUES ('Letní grilování', '2026-09-20', $1) RETURNING id::text AS id`, [ids.vyborA]);
  const actId = String(act[0].id);
  await db.query(
    `INSERT INTO semafor_point (member_id, category, earned_on, earned_month, activity_id, created_by) VALUES ($1,'activity','2026-09-20','2026-09-01',$2,$3), ($4,'activity','2026-09-20','2026-09-01',$2,$3)`,
    [ids.cil1, actId, ids.vyborA, ids.cil2]
  );
  await rows(`DELETE FROM semafor_activity WHERE id = $1`, [actId]);
  assert.equal(await count("semafor_point", "category = 'activity'"), 0, "smazání akce smaže body");
  await ins(`${base.join(",")}, note`, [ids.cil1, "thanks", "2026-10-05", "2026-10-01", ids.vyborA, "Díky za pomoc"]);
  await rows(`DELETE FROM member WHERE id = $1`, [ids.vyborA]);
  const orphan = await rows(`SELECT created_by FROM semafor_point WHERE category = 'thanks'`);
  assert.equal(orphan.length, 1, "smazání autora nechá body");
  assert.equal(orphan[0].created_by, null, "created_by SET NULL");
  await rows(`DELETE FROM member WHERE id = $1`, [ids.cil1]);
  assert.equal(await count("semafor_point"), 0, "smazání příjemce smaže body (CASCADE)");
  await mk("vyborA", { password: true });
  await give("vyborA", "Člen výboru");
  await mk("cil1");
  await db.query(
    `INSERT INTO semafor_point (member_id, category, earned_on, earned_month, ref_member_id, created_by) VALUES ($1,'host_member','2026-09-01','2026-09-01',$2,$3)`,
    [ids.cil2, ids.novy, ids.vyborB]
  );
  await rows(`DELETE FROM member WHERE id = $1`, [ids.novy]);
  assert.equal(await count("semafor_point", "category = 'host_member'"), 0, "smazání nového člena smaže host_member");
  await mk("novy", { joined: "2026-09-01" });
  ok("15. kaskády: akce → body, autor → created_by NULL, příjemce → body, nový člen → host_member");

  // ── 16. insertThanks, insertPoint (training), insertActivity ─
  let r = await run(insertThanksSql({ actorId: ids.vyborB, recipientId: ids.neaktivni, text: "Díky", today: TODAY }));
  assert.equal(outcome(r, { withPerm: false, dup: "errThanksDuplicate" }), "errInactive", "neaktivní příjemce");
  assert.equal(await count("semafor_point"), 0);
  r = await run(insertThanksSql({ actorId: ids.vyborB, recipientId: ids.vyborB, text: "Díky sobě", today: TODAY }));
  assert.equal(outcome(r, { withPerm: false }), "errSelf");
  r = await run(insertThanksSql({ actorId: ids.bezHesla, recipientId: ids.cil1, text: "Díky za radu", today: TODAY }));
  assert.equal(outcome(r, { withPerm: false, dup: "errThanksDuplicate" }), "ok", "poděkovat smí kdokoli aktivní, i bez hesla");
  r = await run(insertThanksSql({ actorId: ids.bezHesla, recipientId: ids.cil1, text: "Ještě jednou", today: TODAY }));
  assert.equal(outcome(r, { withPerm: false, dup: "errThanksDuplicate" }), "errThanksDuplicate", "stejná dvojice v měsíci");
  r = await run(insertThanksSql({ actorId: ids.neaktivni, recipientId: ids.cil2, text: "Díky", today: TODAY }));
  assert.equal(outcome(r, { withPerm: false }), "errInactive", "neaktivní autor");
  assert.equal(await count("semafor_point", "category = 'thanks'"), 1);

  const training = (actor: string, rec: string, over: Record<string, unknown> = {}) =>
    insertPointSql({ category: "training", actorId: ids[actor], recipientId: ids[rec], earnedOn: "2026-10-15", note: "Workshop o prodeji", today: TODAY, ...over } as Parameters<typeof insertPointSql>[0]);
  assert.equal(outcome(await run(training("ruzny", "cil1"))), "errNoPermission", "člen bez práva (aktér bez hesla) = 0");
  assert.equal(outcome(await run(training("moder", "cil1"))), "errNoPermission", "moderátor bez funkce nemá semafor.points");
  assert.equal(outcome(await run(training("vyborB", "cil1"))), "ok", "funkce NULL (Člen výboru) = 1");
  assert.equal(outcome(await run(training("vyborB", "vyborB"))), "errSelf");
  assert.equal(outcome(await run(training("vyborB", "cil1"))), "errDuplicate", "stejný člen a den");
  assert.equal(outcome(await run(training("vyborB", "cil2", { earnedOn: "2026-11-01" }))), "errDuplicate", "datum po dnešku se do tabulky nedostane");
  assert.equal(outcome(await run(training("vyborB", "cil2", { earnedOn: "2026-04-30" }))), "errDuplicate", "hranice okna (dnes - 6 měsíců) je mimo");
  assert.equal(outcome(await run(training("vyborB", "cil2", { earnedOn: "2026-05-01" }))), "ok", "den po hranici okna projde");
  assert.equal(outcome(await run(training("pres", "cil2", { earnedOn: "2026-10-16" }))), "ok", "Prezident (značka) školení zapíše");
  assert.equal(outcome(await run(training("adminPlain", "cil2", { earnedOn: "2026-10-17" }))), "ok", "admin školení zapíše");
  assert.equal(outcome(await run(training("vlastni", "cil2", { earnedOn: "2026-10-18" }))), "errNoPermission", "funkce s ručním seznamem bez semafor.points");
  await rows("DELETE FROM semafor_point WHERE category = 'training'");

  // insertActivity: aktér mezi účastníky vypadne, neaktivní vypadne
  let a = await run(
    insertActivitySql({
      actorId: ids.vyborB,
      title: "Podzimní sraz",
      heldOn: "2026-10-12",
      memberIds: [ids.vyborB, ids.cil1, ids.cil2, ids.neaktivni],
      today: TODAY,
    })
  );
  assert.deepEqual([a[0].perm, Number(a[0].activities), Number(a[0].written)], [true, 1, 2], "akce a body jen aktivním kromě aktéra");
  assert.equal(await count("semafor_point", `category = 'activity' AND member_id = '${ids.vyborB}'`), 0, "zapisující se nezaškrtne");
  a = await run(insertActivitySql({ actorId: ids.ruzny, title: "Bez práva", heldOn: "2026-10-12", memberIds: [ids.cil1], today: TODAY }));
  assert.deepEqual([a[0].perm, Number(a[0].activities), Number(a[0].written)], [false, 0, 0], "bez práva se nezapíše nic");
  a = await run(insertActivitySql({ actorId: ids.vyborB, title: "Z budoucnosti", heldOn: "2026-11-05", memberIds: [ids.cil1], today: TODAY }));
  assert.deepEqual([Number(a[0].activities), Number(a[0].written)], [0, 0], "datum po dnešku");
  assert.equal(await count("semafor_activity"), 1);
  const aid = String((await rows("SELECT id::text AS id FROM semafor_activity"))[0].id);
  a = await run(addActivityMembersSql({ actorId: ids.vyborB, activityId: aid, memberIds: [ids.cil1, ids.vyborA] }));
  assert.equal(Number(a[0].written), 1, "doplnění: cil1 už zapsaný (UNIQUE), vyborA přibyl");
  a = await run(addActivityMembersSql({ actorId: ids.ruzny, activityId: aid, memberIds: [ids.vyborB] }));
  assert.equal(Number(a[0].written), 0, "doplnění bez práva");
  ok("16. dotazy z semafor-points.ts nad PGlite: poděkování (neaktivní, sám sobě, duplicita), školení (práva, okno), akce (aktér a neaktivní vypadnou, doplnění)");

  // ── 16d. akce: duplicita (F-02), bez účastníka (F-03), smazání posledního účastníka ──
  const actRow = async (over: Partial<Parameters<typeof insertActivitySql>[0]> = {}) => {
    const input = { actorId: ids.vyborB, title: "Vánoční večírek", heldOn: "2026-10-10", memberIds: [ids.cil1, ids.cil2], today: TODAY, ...over };
    const rr = await run(insertActivitySql(input));
    return activityOutcomeFromRow(rr[0] as Parameters<typeof activityOutcomeFromRow>[0], input.memberIds.length);
  };
  assert.deepEqual(await actRow(), { outcome: "ok", written: 2, skipped: 0 });
  assert.equal((await actRow()).outcome, "errActivityDuplicate", "stejná akce podruhé");
  assert.equal((await actRow({ title: "  vánoční VEČÍREK " })).outcome, "errActivityDuplicate", "velikost písmen a mezery na krajích");
  assert.equal((await actRow({ actorId: ids.vyborA, memberIds: [ids.cil1] })).outcome, "errActivityDuplicate", "jiný zapisující, stejná akce");
  assert.equal((await actRow({ heldOn: "2026-10-11" })).outcome, "ok", "jiné datum je jiná akce");
  assert.equal((await actRow({ title: "Jiný název" })).outcome, "ok", "jiný název je jiná akce");
  assert.equal(await count("semafor_activity", "title ILIKE '%večírek%' AND held_on = '2026-10-10'"), 1, "duplicitní akce nevznikla");
  assert.equal(await count("semafor_point", "category = 'activity' AND member_id = '" + ids.cil1 + "' AND activity_id IN (SELECT id FROM semafor_activity WHERE title ILIKE '%večírek%' AND held_on = '2026-10-10')"), 1, "účastník nemá dva řádky");
  const actsBefore = await count("semafor_activity");
  assert.equal((await actRow({ title: "Jen neaktivní", memberIds: [ids.neaktivni] })).outcome, "errNoMembers", "jen neaktivní účastník");
  assert.equal((await actRow({ title: "Jen aktér", memberIds: [ids.vyborB] })).outcome, "errNoMembers", "jen aktér");
  assert.equal((await actRow({ title: "Cizí UUID", memberIds: ["00000000-0000-4000-8000-000000000000"] })).outcome, "errNoMembers", "neexistující člen");
  assert.equal((await actRow({ title: "Bez práva", actorId: ids.ruzny })).outcome, "errNoPermission");
  assert.equal((await actRow({ title: "Budoucí", heldOn: "2026-11-05" })).outcome, "errDate");
  assert.equal(await count("semafor_activity"), actsBefore, "žádná osiřelá akce nevznikla");
  assert.equal(await count("semafor_activity a", "NOT EXISTS (SELECT 1 FROM semafor_point p WHERE p.activity_id = a.id)"), 0, "každá akce má účastníka");
  // smazání jednotlivých účastníků: poslední smaže i akci
  const aidD = String((await rows("SELECT id::text AS id FROM semafor_activity WHERE title = 'Vánoční večírek'"))[0].id);
  const parts = await rows("SELECT id::text AS id FROM semafor_point WHERE activity_id = $1 ORDER BY id", [aidD]);
  assert.equal(parts.length, 2);
  let dd = await run(deletePointSql({ actorId: ids.vyborB, pointId: String(parts[0].id) }));
  assert.deepEqual([dd.length, dd[0].category], [1, "activity"]);
  assert.equal(await count("semafor_activity", `id = '${aidD}'`), 1, "s jedním účastníkem akce zůstává");
  dd = await run(deletePointSql({ actorId: ids.vyborB, pointId: String(parts[1].id) }));
  assert.equal(dd.length, 1);
  assert.equal(await count("semafor_activity", `id = '${aidD}'`), 0, "smazání posledního účastníka smaže i akci");
  assert.equal((await run(deletePointSql({ actorId: ids.ruzny, pointId: String(parts[1].id) }))).length, 0);
  // bez práva se akce nesmaže ani přes poslední bod
  assert.equal((await actRow({ title: "Vánoční večírek" })).outcome, "ok", "po smazání lze stejnou akci zapsat znovu");
  const aidE = String((await rows("SELECT id::text AS id FROM semafor_activity WHERE title = 'Vánoční večírek'"))[0].id);
  const pE = await rows("SELECT id::text AS id FROM semafor_point WHERE activity_id = $1 LIMIT 1", [aidE]);
  await run(deletePointSql({ actorId: ids.ruzny, pointId: String(pE[0].id) }));
  assert.equal(await count("semafor_activity", `id = '${aidE}'`), 1, "bez práva akce zůstane");
  // doplnění k neexistující akci
  const miss = await run(addActivityMembersSql({ actorId: ids.vyborB, activityId: "00000000-0000-4000-8000-000000000000", memberIds: [ids.cil1] }));
  assert.equal(miss[0].found, false);
  ok("16d. akce: duplicita (datum a název bez ohledu na písmena a mezery) = errActivityDuplicate; bez způsobilého účastníka (neaktivní, aktér, neexistující) se akce nezaloží; smazání posledního účastníka smaže akci");

  // ── 18. ostatní práce (R-01) ────────────────────────────────
  const work = (actor: string, rec: string, over: Record<string, unknown> = {}) =>
    insertPointSql({ category: "work", actorId: ids[actor], recipientId: ids[rec], earnedOn: "2026-10-14", note: "Příprava prostor", points: 5, today: TODAY, ...over } as Parameters<typeof insertPointSql>[0]);
  const workOut = async (actor: string, rec: string, over: Record<string, unknown> = {}) => {
    const rr = await run(work(actor, rec, over));
    return { outcome: outcome(rr, { withCommittee: true, dup: "errWorkDuplicate" }), committee: rr[0].committee, perm: rr[0].perm };
  };
  let w = await workOut("pres", "cil1");
  assert.deepEqual([w.outcome, w.committee], ["errNotCommittee", false], "Prezident (area vedeni, značka) neudělí");
  w = await workOut("vp", "cil1");
  assert.deepEqual([w.outcome, w.committee], ["errNotCommittee", false], "Viceprezident neudělí");
  w = await workOut("adminPlain", "cil1");
  assert.deepEqual([w.outcome, w.committee], ["errNotCommittee", false], "admin bez funkce neudělí");
  w = await workOut("adminVybor", "cil1");
  assert.deepEqual([w.outcome, w.committee], ["ok", true], "admin s funkcí Člen výboru udělí");
  w = await workOut("vyborA", "cil2");
  assert.equal(w.outcome, "ok", "Člen výboru (permissions NULL, area vybor) udělí");
  w = await workOut("vyborA", "vyborA");
  assert.equal(w.outcome, "errSelf", "Člen výboru sám sobě");
  await mk("vyborBezHesla");
  await give("vyborBezHesla", "Člen výboru");
  w = await workOut("vyborBezHesla", "cil1");
  assert.equal(w.perm, false, "Člen výboru bez hesla nemá právo");
  assert.equal(w.outcome, "errNoPermission");
  w = await workOut("vlastni", "cil1");
  assert.equal(w.perm, false, "funkce area vybor s ručním seznamem bez semafor.points");
  assert.equal(w.outcome, "errNoPermission");
  w = await workOut("vyborB", "cil1", { points: 11 });
  assert.equal(w.outcome, "errWorkDuplicate", "body nad 10 SQL nevloží (TS je odmítne dřív; výsledek je jako duplicita)");
  w = await workOut("vyborB", "neaktivni");
  assert.equal(w.outcome, "errInactive");
  assert.equal(await count("semafor_point", "category = 'work'"), 2, "zapsány jen dvě platné práce");
  // body se uložily přesně
  const pts = await rows("SELECT points::int AS p FROM semafor_point WHERE category = 'work' ORDER BY created_at");
  assert.deepEqual(pts.map((x) => Number(x.p)), [5, 5]);
  ok("18. ostatní práce: P, VP a admin bez funkce neudělí (committee=false), Člen výboru a admin s funkcí ano, sám sobě ne, bez hesla a bez práva ne, body 1 až 10");

  // ── 23. uq_sp_work (R-11) ───────────────────────────────────
  await rows("TRUNCATE semafor_point CASCADE");
  assert.equal((await workOut("vyborA", "cil1", { note: "Úklid po akci", earnedOn: "2026-10-20" })).outcome, "ok");
  assert.equal((await workOut("vyborA", "cil1", { note: "  úklid PO akci ", earnedOn: "2026-10-20" })).outcome, "errWorkDuplicate", "velikost písmen a mezery na krajích");
  assert.equal((await workOut("vyborA", "cil1", { note: "Jiná práce", earnedOn: "2026-10-20" })).outcome, "ok", "jiný popis týž den");
  assert.equal((await workOut("vyborB", "cil1", { note: "Úklid po akci", earnedOn: "2026-10-20" })).outcome, "ok", "jiný udělující");
  assert.equal(await count("semafor_point", "category = 'work'"), 3);
  ok("23. uq_sp_work: stejný příjemce, udělující, den a popis (jen velikost písmen a mezery) = errWorkDuplicate; jiný popis nebo jiný udělující projde");

  // ── 19b. mazání ─────────────────────────────────────────────
  await rows("TRUNCATE semafor_point CASCADE");
  await run(insertThanksSql({ actorId: ids.cil2, recipientId: ids.cil1, text: "Díky za pomoc", today: TODAY }));
  await run(training("vyborB", "cil1"));
  const thanksId = String((await rows("SELECT id::text AS id FROM semafor_point WHERE category = 'thanks'"))[0].id);
  const trainingId = String((await rows("SELECT id::text AS id FROM semafor_point WHERE category = 'training'"))[0].id);
  // deleteOwnThanks: cizí poděkování nesmaže ani držitel práva, cizí školení také ne, vlastní ano
  assert.equal((await run(deleteOwnThanksSql({ actorId: ids.vyborB, pointId: thanksId }))).length, 0, "cizí poděkování (držitel semafor.points)");
  assert.equal((await run(deleteOwnThanksSql({ actorId: ids.adminPlain, pointId: thanksId }))).length, 0, "cizí poděkování (admin)");
  assert.equal((await run(deleteOwnThanksSql({ actorId: ids.cil2, pointId: trainingId }))).length, 0, "školení deleteOwnThanks nesmaže");
  assert.equal((await run(deleteOwnThanksSql({ actorId: ids.cil1, pointId: thanksId }))).length, 0, "příjemce poděkování nesmaže");
  // deletePoint: bez práva 0, s právem 1 (cizí poděkování i školení)
  assert.equal((await run(deletePointSql({ actorId: ids.ruzny, pointId: thanksId }))).length, 0, "bez práva");
  assert.equal((await run(deletePointSql({ actorId: ids.moder, pointId: thanksId }))).length, 0, "moderátor bez funkce");
  const del = await run(deletePointSql({ actorId: ids.pres, pointId: thanksId }));
  assert.deepEqual([del.length, del[0].category, del[0].own], [1, "thanks", false], "Prezident smaže cizí poděkování, own = false");
  assert.equal((await run(deletePointSql({ actorId: ids.vyborB, pointId: trainingId }))).length, 1, "držitel práva smaže školení");
  await run(insertThanksSql({ actorId: ids.cil2, recipientId: ids.cil1, text: "Díky za pomoc", today: TODAY }));
  const ownId = String((await rows("SELECT id::text AS id FROM semafor_point WHERE category = 'thanks'"))[0].id);
  assert.equal((await run(deleteOwnThanksSql({ actorId: ids.cil2, pointId: ownId }))).length, 1, "vlastní poděkování");
  // ostatní práci smaže P, VP i admin bez funkce (Q5 A)
  await run(work("vyborA", "cil1"));
  const workId = String((await rows("SELECT id::text AS id FROM semafor_point WHERE category = 'work'"))[0].id);
  assert.deepEqual((await run(deletePointSql({ actorId: ids.vp, pointId: workId }))).map((x) => x.category), ["work"], "VP smaže ostatní práci");
  // smazání akce počítá účastníky před smazáním a respektuje právo
  const act2 = await run(insertActivitySql({ actorId: ids.vyborB, title: "Sraz", heldOn: "2026-10-12", memberIds: [ids.cil1, ids.cil2], today: TODAY }));
  assert.equal(Number(act2[0].written), 2);
  const aid2 = String((await rows("SELECT id::text AS id FROM semafor_activity ORDER BY created_at DESC LIMIT 1"))[0].id);
  let d = await run(deleteActivitySql({ actorId: ids.ruzny, activityId: aid2 }));
  assert.deepEqual([Number(d[0].deleted), Number(d[0].participants)], [0, 2], "bez práva akce zůstane");
  d = await run(deleteActivitySql({ actorId: ids.vyborB, activityId: aid2 }));
  assert.deepEqual([Number(d[0].deleted), Number(d[0].participants)], [1, 2], "s právem se smaže akce, účastníci se spočítají předem");
  assert.equal(await count("semafor_point", "category = 'activity' AND activity_id = '" + aid2 + "'"), 0);
  ok("19b. deleteOwnThanks (bez větve práva): cizí poděkování 0 řádků i pro držitele práva a admina, školení 0; deletePoint: bez práva 0, s právem 1; smazání akce spočítá účastníky");

  // ── host_member ─────────────────────────────────────────────
  await rows("TRUNCATE semafor_point CASCADE");
  const host = (actor: string, rec: string, ref: string) =>
    insertPointSql({ category: "host_member", actorId: ids[actor], recipientId: ids[rec], refMemberId: ids[ref], today: TODAY });
  assert.equal(outcome(await run(host("ruzny", "cil1", "novy"))), "errNoPermission");
  assert.equal(outcome(await run(host("vyborB", "cil1", "novy"))), "ok");
  const hostRow = await rows("SELECT earned_on::text AS d, earned_month::text AS m FROM semafor_point WHERE category = 'host_member'");
  assert.deepEqual([hostRow[0].d, hostRow[0].m], ["2026-09-01", "2026-09-01"], "datum je joined_at nového člena z DB");
  assert.equal(outcome(await run(host("vyborB", "cil2", "novy"))), "errDuplicate", "jeden záznam na nového člena");
  assert.equal(outcome(await run(host("vyborB", "cil1", "novyStary"))), "errNewMember", "nový člen starší než 6 měsíců");
  assert.equal(outcome(await run(host("vyborB", "novy", "novy"))), "errNewMember", "příjemce = nový člen (TS odmítne dřív jako errSelf)");
  assert.equal(outcome(await run(host("vyborB", "vyborB", "novy"))), "errSelf");
  ok("16b. přivedený host: datum z joined_at, jeden na nového člena, starý člen = errNewMember, sám sobě ne");

  // ── bonusové události a pravidlo funkce ─────────────────────
  await rows("TRUNCATE semafor_point CASCADE");
  await run(insertThanksSql({ actorId: ids.cil2, recipientId: ids.cil1, text: "Díky za pomoc", today: TODAY }));
  await run(work("vyborA", "cil1", { points: 7, earnedOn: "2026-10-01" }));
  await run(training("vyborB", "cil1", { earnedOn: "2026-09-10" }));
  const ev = await run(pointEventsSql({ after: "2026-04-30", to: "2026-10-31", memberId: ids.cil1 }));
  assert.equal(ev.length, 3);
  assert.equal(ev.filter((x) => x.category === "work").map((x) => Number(x.points))[0], 7);
  const toEvent = (x: Record<string, unknown>): BonusEvent => ({
    memberId: String(x.member_id),
    category: x.category as BonusCategory,
    date: String(x.d),
    ...(x.points === null || x.points === undefined ? {} : { points: Number(x.points) }),
  });
  const bonus = bonusForMonth("2026-10-01", ids.cil1, ev.map(toEvent));
  assert.equal(bonus.bonus, 1 + 7 + 7, "poděkování 1 + ostatní práce 7 + školení 7");
  assert.equal(computeBonus({ thanks: 1, work: 1, training: 1 }, 7).bonus, 15);
  const fe = await run(functionEventsSql({ to: "2026-10-31" }));
  assert.equal(fe.length, 7, "sedm držitelů funkce (včetně vyborBezHesla)");
  const feOne = await run(functionEventsSql({ to: "2026-10-31", memberId: ids.pres }));
  assert.deepEqual([feOne.length, feOne[0].category, feOne[0].d], [1, "function", "2026-01-10"], "den přidělení v Praze");
  assert.equal((await run(functionEventsSql({ to: "2026-01-09" }))).length, 0, "přidělená po konci měsíce se nepočítá");
  // Q10 A: změna funkce nesmí přepsat assigned_at (SQL z member-functions.ts je jen statický kontrakt, viz test 19c v body testu)
  ok("16c. bonusové události: ruční body s body ostatní práce, funkce s datem přidělení v Praze a bez spodní meze okna");

  await db.close();
}

main()
  .then(() => {
    console.log(`\nVšech ${n} kontrol prošlo.`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
