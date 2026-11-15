/**
 * Testy iter-045 (čekající body), SQL část: skutečné dotazy `pendingAutoSql`
 * a `managementPointsSql` proti dotazům bonusu (`bonusEventsSql`,
 * `functionEventsSql`, `pointEventsSql` + `eventsAfterSnapshot`) nad PGlite
 * in-process. Bez DATABASE_URL a bez sítě. Modul se hledá v `PGLITE_MODULE_DIR`
 * nebo v cwd; bez něj se test přeskočí s hlasitou hláškou, `REQUIRE_PGLITE=1`
 * z toho udělá chybu (npm run test:iter-045-sql).
 *
 * Číslování podle arch_iter-045_T-001 sekce 6: testy 7 a 8. Jména jsou smyšlená.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { bonusEventsSql, pendingAutoSql } from "../lib/db/queries/semafor";
import {
  functionEventsSql,
  managementPointsSql,
  pointEventsSql,
  toManagedPointRow,
  type ManagementPointDbRow,
} from "../lib/db/queries/semafor-points";
import { ALL_POINTS_DDL } from "../lib/semafor/points-ddl";
import { eventsAfterSnapshot } from "../lib/semafor/mine";
import { pendingRange, toPendingRows, type PendingAutoDbRow } from "../lib/semafor/pending";
import { pendingWhatText, POINT_TEXTS } from "../lib/semafor/texts";
import type { BonusCategory } from "../lib/semafor/bonus";

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

/** Minimální schéma, které dotazy čtou (sloupce a cizí klíče jako v schema.ts). */
const BASE_DDL = `
CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  deactivated_at timestamptz, inactive_until date
);
CREATE TABLE chapter_function (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, area text NOT NULL,
  display_order integer NOT NULL, permissions text[]
);
CREATE TABLE member_function (
  member_id uuid PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  function_id uuid NOT NULL REFERENCES chapter_function(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(), assigned_by uuid REFERENCES member(id) ON DELETE SET NULL
);
CREATE TABLE mastermind_case (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  title text NOT NULL, status text NOT NULL, internal_date date,
  presented_confirmed_by uuid REFERENCES member(id) ON DELETE SET NULL
);
CREATE TABLE burza_help (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES member(id) ON DELETE SET NULL,
  used_on date NOT NULL,
  created_by uuid REFERENCES member(id) ON DELETE SET NULL
);
CREATE TABLE burza_contact_use (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid,
  helper_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES member(id) ON DELETE SET NULL,
  used_on date NOT NULL
);
`;

const LATEST = "2026-09-01";
const TODAY = "2026-10-31";
const dialect = new PgDialect();

async function main() {
  const PGlite = loadPglite();
  if (!PGlite) {
    const msg = "PGlite nenalezen (nastav PGLITE_MODULE_DIR na adresář s node_modules/@electric-sql/pglite). SQL scénáře iter-045 PŘESKOČENY.";
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
  await db.exec(ALL_POINTS_DDL);

  const run = async <T>(q: SQL) => {
    const c = dialect.sqlToQuery(q);
    return (await db.query(c.sql, c.params as unknown[])).rows as T[];
  };
  const one = async (text: string, params: unknown[] = []) => String((await db.query(text, params)).rows[0].id);

  // ── seed (smyšlená jména) ──────────────────────────────────
  const id: Record<string, string> = {};
  for (const k of ["Alfa", "Beta", "Gama", "Delta", "Epsilon", "Nový"]) {
    id[k] = await one("INSERT INTO member (name, joined_at) VALUES ($1, $2) RETURNING id::text AS id", [
      `Člen ${k}`,
      k === "Nový" ? "2026-10-02" : "2020-01-01",
    ]);
  }
  await db.query("UPDATE member SET deactivated_at = '2026-10-20T10:00:00+02:00' WHERE id = $1", [id.Gama]);
  const fn = await one("INSERT INTO chapter_function (name, area, display_order) VALUES ('Funkce Test', 'vybor', 1) RETURNING id::text AS id");
  const give = (m: string, at: string, by: string | null) =>
    db.query("INSERT INTO member_function (member_id, function_id, assigned_at, assigned_by) VALUES ($1, $2, $3, $4)", [id[m], fn, at, by ? id[by] : null]);
  await give("Alfa", "2026-08-01T10:00:00+02:00", "Beta"); // před hranicí: už se započítává, nečeká
  await give("Beta", "2026-10-01T00:30:00+02:00", "Gama"); // po hranici: čeká
  await give("Gama", "2026-09-30T23:30:00+00:00", "Alfa"); // v Praze už 1. 10.: čeká
  await give("Epsilon", "2026-09-30T21:00:00+00:00", "Alfa"); // v Praze 30. 9. 23:00: nečeká

  const mm = (m: string, title: string, status: string, d: string | null, by: string | null) =>
    db.query("INSERT INTO mastermind_case (member_id, title, status, internal_date, presented_confirmed_by) VALUES ($1, $2, $3, $4, $5)", [
      id[m],
      title,
      status,
      d,
      by ? id[by] : null,
    ]);
  await mm("Alfa", "Jak na ceník", "presented", "2026-10-08", "Beta");
  await mm("Alfa", "Starší případ", "presented", "2026-09-20", "Beta"); // v nahraném měsíci
  await mm("Alfa", "Naplánovaný", "scheduled", "2026-10-15", null);
  await mm("Gama", "Druhý případ", "presented", "2026-10-10", "Delta"); // Delta se smaže

  const help = (h: string, r: string | null, d: string, by: string | null) =>
    db.query("INSERT INTO burza_help (helper_id, recipient_id, used_on, created_by) VALUES ($1, $2, $3, $4)", [id[h], r ? id[r] : null, d, by ? id[by] : null]);
  await help("Beta", "Alfa", "2026-10-05", "Alfa");
  await help("Gama", null, "2026-10-06", "Beta");
  await help("Beta", "Gama", "2026-09-29", "Gama"); // v nahraném měsíci

  const contact = (h: string, r: string, d: string) =>
    db.query("INSERT INTO burza_contact_use (contact_id, helper_id, recipient_id, used_on) VALUES (gen_random_uuid(), $1, $2, $3)", [id[h], id[r], d]);
  await contact("Alfa", "Gama", "2026-10-02");
  await contact("Alfa", "Gama", "2026-10-12"); // druhé využití v měsíci: neukáže se
  await contact("Alfa", "Gama", "2026-09-28");
  await contact("Beta", "Gama", "2026-09-29");
  await contact("Beta", "Gama", "2026-10-03"); // první v říjnu: čeká

  const activity = await one("INSERT INTO semafor_activity (title, held_on, created_by) VALUES ('Úklid sálu', '2026-10-04', $1) RETURNING id::text AS id", [id.Alfa]);
  const point = (cols: Record<string, unknown>) => {
    const keys = Object.keys(cols);
    return db.query(
      `INSERT INTO semafor_point (${keys.join(", ")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(", ")})`,
      keys.map((k) => cols[k])
    );
  };
  await point({ member_id: id.Alfa, category: "thanks", earned_on: "2026-10-10", earned_month: "2026-10-01", note: "Díky za pomoc", created_by: id.Beta });
  await point({ member_id: id.Gama, category: "work", earned_on: "2026-10-11", earned_month: "2026-10-01", points: 12, note: "Web chapteru", created_by: id.Alfa });
  await point({ member_id: id.Beta, category: "activity", earned_on: "2026-10-04", earned_month: "2026-10-01", activity_id: activity, created_by: id.Alfa });
  await point({ member_id: id.Alfa, category: "host_member", earned_on: "2026-10-02", earned_month: "2026-10-01", ref_member_id: id["Nový"], created_by: id.Beta });
  await point({ member_id: id.Beta, category: "training", earned_on: "2026-09-15", earned_month: "2026-09-01", note: "Školení BNI", created_by: id.Alfa });

  const range = pendingRange(LATEST, TODAY);
  assert.ok(range);
  assert.equal(range.after, "2026-09-30");

  const loadPending = async () => {
    const auto = await run<PendingAutoDbRow>(pendingAutoSql(range));
    const manual = (await run<ManagementPointDbRow>(managementPointsSql(range.after, range.to))).map(toManagedPointRow);
    return { auto, rows: toPendingRows(auto, manual) };
  };

  // ── 7. shoda s cestou bonusu ─────────────────────────────────
  {
    const { rows } = await loadPending();
    const bonus = [
      ...(await run<{ member_id: string; category: BonusCategory; d: string }>(bonusEventsSql(range))),
      ...(await run<{ member_id: string; category: BonusCategory; d: string }>(functionEventsSql({ to: range.to }))),
      ...(await run<{ member_id: string; category: BonusCategory; d: string }>(pointEventsSql(range))),
    ].map((x) => ({ memberId: x.member_id, category: x.category, date: x.d }));
    const expected = eventsAfterSnapshot(bonus, range.after);
    const key = (x: { memberId: string; category: string; date: string }) => `${x.memberId}|${x.category}|${x.date}`;
    assert.deepEqual(rows.map(key).sort(), expected.map(key).sort(), "multimnožina (člen, kategorie, datum) sedí s bonusem");
    assert.equal(rows.length, 12, "4 automatické skupiny + 4 ruční záznamy, nic navíc");

    const fnRows = rows.filter((r) => r.category === "function");
    assert.deepEqual(fnRows.map((r) => r.memberId).sort(), [id.Beta, id.Gama].sort(), "funkce před hranicí nečeká, po hranici (i podle Prahy) čeká");
    assert.ok(fnRows.every((r) => r.date === "2026-10-01"));
    const contacts = rows.filter((r) => r.key.startsWith("bc:"));
    assert.deepEqual(contacts.map((r) => `${r.memberId}|${r.date}`).sort(), [`${id.Alfa}|2026-10-02`, `${id.Beta}|2026-10-03`].sort(), "druhé využití kontaktu v měsíci se neukáže");
    assert.ok(!rows.some((r) => r.date <= range.after), "nic z nahraného měsíce");
    assert.ok(!rows.some((r) => r.detail === "Naplánovaný"), "jen odprezentovaný Master mind");
  }
  ok("7. pendingAutoSql + ruční body = bonusEventsSql ∪ functionEventsSql ∪ pointEventsSql po eventsAfterSnapshot; funkce podle Prahy, kontakt jednou za měsíc");

  // ── 8. Od koho, Za co, neaktivní, smazaný člen ───────────────
  {
    const { rows } = await loadPending();
    const by = (pred: (r: (typeof rows)[number]) => boolean) => {
      const hit = rows.filter(pred);
      assert.equal(hit.length, 1);
      return hit[0];
    };
    const mmA = by((r) => r.category === "mastermind" && r.memberId === id.Alfa);
    assert.equal(mmA.fromName, "Člen Beta", "Master mind: potvrdil");
    assert.equal(pendingWhatText(mmA.category, mmA.detail), "Master mind: Jak na ceník");
    assert.equal(mmA.points, 7);
    const helpB = by((r) => r.key.startsWith("bh:") && r.memberId === id.Beta);
    assert.equal(helpB.fromName, "Člen Alfa", "pomoc: využil/a (recipient_id)");
    assert.equal(pendingWhatText(helpB.category, helpB.detail), "Burza pomoci: pomoc");
    const helpG = by((r) => r.key.startsWith("bh:") && r.memberId === id.Gama);
    assert.equal(helpG.fromName, "Člen Beta", "pomoc bez příjemce: created_by");
    const contactA = by((r) => r.key.startsWith("bc:") && r.memberId === id.Alfa);
    assert.equal(contactA.fromName, "Člen Gama", "kontakt: využil/a");
    assert.equal(pendingWhatText(contactA.category, contactA.detail), "Burza pomoci: kontakt");
    const fnB = by((r) => r.category === "function" && r.memberId === id.Beta);
    assert.equal(fnB.fromName, "Člen Gama", "funkce: přidělil");
    assert.equal(pendingWhatText(fnB.category, fnB.detail), "Funkce v chapteru: Funkce Test");
    const act = by((r) => r.category === "activity");
    assert.equal(pendingWhatText(act.category, act.detail), "Akce chapteru: Úklid sálu");
    assert.equal(act.fromName, "Člen Alfa");
    const host = by((r) => r.category === "host_member");
    assert.equal(pendingWhatText(host.category, host.detail), "Přivedený host, který se stal členem: Člen Nový");
    const thanks = by((r) => r.category === "thanks");
    assert.equal(pendingWhatText(thanks.category, thanks.detail), "Poděkování", "text poděkování se nevypisuje");
    assert.equal(thanks.fromName, "Člen Beta");
    const work = by((r) => r.category === "work");
    assert.equal(work.points, 10, "ostatní práce ořez na 10");
    assert.equal(pendingWhatText(work.category, work.detail), "Ostatní práce", "popis práce se nevypisuje");
    assert.equal(work.active, false, "neaktivní člen zůstává s příznakem");
    for (const r of rows) {
      assert.ok(!("note" in r), "PendingRow nemá pole note");
      assert.ok(!JSON.stringify(r).includes("Díky za pomoc") && !JSON.stringify(r).includes("Web chapteru"), "volný text nikde v řádku");
    }

    // smazaný člen: Od koho NULL
    await db.query("DELETE FROM member WHERE id = $1", [id.Delta]);
    const after = await loadPending();
    const mmG = after.rows.find((r) => r.category === "mastermind" && r.memberId === id.Gama);
    assert.ok(mmG);
    assert.equal(mmG.fromName, null, "smazaný potvrzovatel = NULL");
    await db.query("DELETE FROM member WHERE id = $1", [id.Beta]);
    const after2 = await loadPending();
    assert.equal(after2.rows.find((r) => r.category === "thanks")?.fromName, POINT_TEXTS.formerMember, "smazaný autor poděkování = bývalý člen");
    assert.equal(after2.rows.find((r) => r.category === "function" && r.memberId === id.Gama)?.fromName, "Člen Alfa");
    assert.ok(!after2.rows.some((r) => r.memberId === id.Beta), "smazaný příjemce zmizí (CASCADE)");
  }
  ok("8. Od koho (potvrdil, využil/a, přidělil, zapsal), Za co s kategorií, ořez ostatní práce, neaktivní, smazaný člen (automatické NULL, ruční bývalý člen), bez volných textů");

  await db.close();
  console.log(`\n${n} SQL scénářů iter-045 prošlo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
