/**
 * Testy iter-049, SQL: DDL z `lib/situations/ddl.ts`, skutečné dotazy z
 * `lib/db/queries/client-situations.ts` a SQL importu z
 * `lib/situations/import-sql.ts` nad PGlite in-process. Bez DATABASE_URL a bez
 * sítě. Modul se hledá v `PGLITE_MODULE_DIR` nebo v cwd, `REQUIRE_PGLITE=1`
 * z chybějícího modulu udělá chybu (npm run test:iter-049-sql).
 *
 * Číslování podle arch_iter-049_T-001 kap. 10: 19 až 26 (26 = dotaz exportu).
 * Jména jsou smyšlená.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { assembleExportData, exportItemsSql, exportMembersSql, exportSituationsSql } from "../lib/db/queries/client-situations";
import { buildSituaceJson } from "../lib/situations/export";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  addItemSql,
  removeItemSql,
  updateItemSql,
  upsertHeadSql,
  writeStateSql,
} from "../lib/db/queries/client-situations";
import {
  CLIENT_SITUATION_DDL,
  CLIENT_SITUATION_ITEM_DDL,
  CLIENT_SITUATION_SOURCE_DDL,
  doBlock,
} from "../lib/situations/ddl";
import { buildImportPlan, parseSituaceJson, planToParams } from "../lib/situations/import";
import {
  IMPORT_EMPTY_SLOTS_SQL,
  IMPORT_SITUATIONS_SQL,
  IMPORT_SOURCES_SQL,
  IMPORT_VERIFY_SQL,
} from "../lib/situations/import-sql";

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

/** Jen sloupce, které dotazy čtou, včetně CHECK z ostré DB. */
const BASE_DDL = `
CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, company text, obor text,
  password_hash text, management_role text,
  deactivated_at timestamptz, inactive_until date,
  CONSTRAINT member_inactive_until_needs_deactivation CHECK (inactive_until IS NULL OR deactivated_at IS NOT NULL)
);
CREATE TABLE chapter_function (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, area text NOT NULL,
  display_order integer NOT NULL, permissions text[]
);
CREATE TABLE member_function (
  member_id uuid PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  function_id uuid NOT NULL REFERENCES chapter_function(id) ON DELETE RESTRICT
);
`;

const dialect = new PgDialect();

async function main() {
  const PGlite = loadPglite();
  if (!PGlite) {
    const msg =
      "PGlite nenalezen (nastav PGLITE_MODULE_DIR na adresář s node_modules/@electric-sql/pglite). SQL scénáře iter-049 PŘESKOČENY.";
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

  const run = async (s: SQL) => {
    const q = dialect.sqlToQuery(s);
    try {
      return (await db.query(q.sql, q.params as unknown[])).rows;
    } catch (e) {
      console.error(`SQL selhalo:\n${q.sql}`);
      throw e;
    }
  };
  const q1 = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
  const count = async (table: string, where = "true") =>
    Number((await q1(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`))[0].n);
  const rejects = async (text: string, params: unknown[] = []) => {
    let failed = false;
    try {
      await db.query(text, params);
    } catch {
      failed = true;
    }
    return failed;
  };

  // ── 19. DDL z lib/situations/ddl.ts přes doBlock 2x ──
  for (const pass of [1, 2]) {
    for (const ddl of [CLIENT_SITUATION_DDL, CLIENT_SITUATION_ITEM_DDL, CLIENT_SITUATION_SOURCE_DDL]) {
      await db.exec(doBlock(ddl));
    }
    if (pass === 1) {
      assert.equal(await count("information_schema.tables", "table_name LIKE 'client_situation%'"), 3);
    }
  }
  ok("19. DDL z ddl.ts přes doBlock 2x, druhý běh bez chyby, tři tabulky");

  // ── členové ──
  const mk = async (name: string, opts: { hash?: boolean; role?: string; inactive?: boolean } = {}) => {
    const id = randomUUID();
    await q1(
      `INSERT INTO member (id, name, password_hash, management_role, deactivated_at) VALUES ($1, $2, $3, $4, $5)`,
      [id, name, opts.hash ? "hash" : null, opts.role ?? null, opts.inactive ? "2026-01-01T00:00:00Z" : null]
    );
    return id;
  };
  const karel = await mk("Karel Zkouška");
  const jana = await mk("Jana Pokusná");
  const moderator = await mk("Moderátor Heslo", { hash: true, role: "moderator" });
  const moderatorNoPw = await mk("Moderátor Odkaz", { role: "moderator" });
  const committee = await mk("Eva Výbor", { hash: true });
  const manual = await mk("Ruční Funkce", { hash: true });
  const admin = await mk("Admin Test", { hash: true, role: "admin" });
  const inactive = await mk("Neaktivní Člen", { inactive: true });
  const fnCommittee = randomUUID();
  const fnManual = randomUUID();
  await q1(`INSERT INTO chapter_function (id, name, area, display_order, permissions) VALUES ($1, 'Člen výboru', 'vybor', 1, NULL)`, [fnCommittee]);
  await q1(`INSERT INTO chapter_function (id, name, area, display_order, permissions) VALUES ($1, 'Ruční', 'ostatni', 2, ARRAY['guests.manage'])`, [fnManual]);
  await q1(`INSERT INTO member_function (member_id, function_id) VALUES ($1, $2)`, [committee, fnCommittee]);
  await q1(`INSERT INTO member_function (member_id, function_id) VALUES ($1, $2)`, [manual, fnManual]);

  // ── 20. CHECK a UNIQUE ──
  {
    const insSit = (slot: number, src: string | null, m = karel) =>
      q1(`INSERT INTO client_situation (member_id, slot, source_id) VALUES ($1, $2, $3)`, [m, slot, src]);
    assert.equal(await rejects(`INSERT INTO client_situation (member_id, slot) VALUES ($1, 4)`, [karel]), true, "slot 4");
    assert.equal(await rejects(`INSERT INTO client_situation (member_id, slot) VALUES ($1, 0)`, [karel]), true, "slot 0");
    await insSit(1, "S-T-1");
    assert.equal(await rejects(`INSERT INTO client_situation (member_id, slot) VALUES ($1, 1)`, [karel]), true, "UNIQUE (member_id, slot)");
    assert.equal(await rejects(`INSERT INTO client_situation (member_id, slot, source_id) VALUES ($1, 2, 'S-T-1')`, [karel]), true, "UNIQUE source_id");
    assert.equal(
      await rejects(`INSERT INTO client_situation (member_id, slot, client) VALUES ($1, 3, $2)`, [karel, "x".repeat(81)]),
      true,
      "cs_lengths"
    );
    const sit = (await q1(`SELECT id FROM client_situation WHERE member_id = $1 AND slot = 1`, [karel]))[0].id;
    assert.equal(await rejects(`INSERT INTO client_situation_item (situation_id, kind, text) VALUES ($1, 'x', 'a')`, [sit]), true, "kind x");
    assert.equal(await rejects(`INSERT INTO client_situation_item (situation_id, kind, text) VALUES ($1, 'need', '   ')`, [sit]), true, "prázdný text");
    assert.equal(await rejects(`INSERT INTO client_situation_item (situation_id, kind, text) VALUES ($1, 'need', $2)`, [sit, "a".repeat(301)]), true, "301 znaků");
    assert.equal(await rejects(`INSERT INTO client_situation_item (situation_id, kind, text) VALUES ($1, 'need', 'ok')`, [sit]), false);
    await q1(`DELETE FROM client_situation WHERE member_id = $1`, [karel]);
    assert.equal(await count("client_situation_item"), 0, "CASCADE ze situace na kartičky");
    ok("20. CHECK slot 0 a 4, kind x, prázdný a dlouhý text, UNIQUE (member_id, slot) a source_id");
  }

  // ── 21. upsert hlavičky (6.3) ──
  {
    const head = (target: string, actor: string, value: string, slot: 1 | 2 | 3 = 1, field: "client" | "title" | "description" = "client") =>
      run(upsertHeadSql({ target, slot, actor, field, value }));
    const sitCount = () => count("client_situation");
    assert.equal((await head(karel, karel, "Majitel firmy")).length, 1, "vlastník založí");
    assert.equal(await sitCount(), 1);
    assert.equal((await head(karel, jana, "Cizí", 2)).length, 0, "cizí člen bez práva");
    assert.equal(await sitCount(), 1, "nic nevzniklo");
    assert.equal((await head(karel, manual, "Ruční", 2)).length, 0, "funkce s ručním seznamem práv bez situations.manage");
    assert.equal((await head(karel, moderatorNoPw, "Bez hesla", 2)).length, 0, "moderátor bez hesla (přihlášení odkazem) ne");
    assert.equal(await sitCount(), 1);
    assert.equal((await head(karel, committee, "Výbor", 2)).length, 1, "funkce Člen výboru s heslem založí za jiného");
    assert.equal((await head(karel, moderator, "Moderátor", 3)).length, 1, "role moderátor s heslem");
    assert.equal((await head(karel, admin, "Admin", 1, "title")).length, 1, "admin");
    assert.equal((await head(inactive, committee, "Neaktivní")).length, 0, "neaktivní cíl");
    assert.equal((await head(inactive, inactive, "Sám")).length, 0, "neaktivní cíl ani sám");
    assert.equal(await sitCount(), 3);
    const row = async (m: string, slot: number) => (await q1(`SELECT client, updated_at::text AS ua, updated_by FROM client_situation WHERE member_id = $1 AND slot = $2`, [m, slot]))[0];
    const before = await row(karel, 1);
    assert.equal(before.updated_by, admin, "naposledy zapsal admin");
    assert.equal((await head(karel, jana, "Cizí přepis")).length, 0, "cizí přepis existující situace");
    assert.equal((await row(karel, 1)).client, "Majitel firmy");
    assert.equal((await head(karel, karel, "Majitel firmy")).length, 0, "stejná hodnota nezapíše nic");
    const after = await row(karel, 1);
    assert.equal(after.ua, before.ua, "updated_at beze změny");
    assert.equal(after.updated_by, before.updated_by, "updated_by beze změny");
    assert.equal((await head(karel, committee, "Majitel firmy")).length, 0, "stejná hodnota od vedení také nic");
    assert.equal((await row(karel, 1)).updated_by, admin);
    assert.equal((await head(karel, committee, "Nový klient")).length, 1);
    assert.equal((await row(karel, 1)).updated_by, committee, "updated_by = vedení");
    // stav pro rozhodnutí o 0 řádcích
    const st = (await run(writeStateSql({ target: karel, actor: jana, slot: 1, head: { field: "client", value: "Nový klient" } })))[0];
    assert.equal(st.allowed, false);
    assert.equal(st.active, true);
    assert.equal(st.head_unchanged, true);
    const stOwn = (await run(writeStateSql({ target: karel, actor: karel })))[0];
    assert.equal(stOwn.allowed, true);
    const stInactive = (await run(writeStateSql({ target: inactive, actor: committee })))[0];
    assert.equal(stInactive.active, false);
    await q1(`DELETE FROM client_situation`);
    ok("21. upsert situace: vlastník ano, cizí a ruční funkce a moderátor bez hesla ne, vedení s heslem ano, stejná hodnota nic");
  }

  // ── 22. updateItem a removeItem ──
  {
    const add = (target: string, actor: string, itemId: string, text: string, kind: "need" | "fear" | "desire" | "related" | "trait" = "need", slot: 1 | 2 | 3 = 1) =>
      run(addItemSql({ target, slot, actor, itemId, kind, text }));
    const itemRow = async (id: string) => (await q1(`SELECT text, updated_by, imported_text FROM client_situation_item WHERE id = $1`, [id]))[0];
    const upd = (target: string, actor: string, itemId: string, text: string, kind: "need" | "fear" = "need") =>
      run(updateItemSql({ target, actor, itemId, kind, text }));
    const rem = async (target: string, actor: string, itemId: string) =>
      Number((await run(removeItemSql({ target, actor, itemId })))[0].n);

    const a = randomUUID();
    assert.equal((await add(karel, karel, a, "Původní")).length, 1);
    assert.equal((await upd(karel, karel, a, "Upravená")).length, 1, "vlastník");
    assert.equal((await itemRow(a)).text, "Upravená");
    assert.equal((await itemRow(a)).updated_by, karel);
    assert.equal((await upd(karel, jana, a, "Cizí")).length, 0, "cizí bez práva");
    assert.equal((await upd(jana, jana, a, "IDOR")).length, 0, "cizí itemId s vlastním memberId (IDOR)");
    assert.equal((await itemRow(a)).text, "Upravená", "text nepřepsán");
    assert.equal((await upd(karel, committee, a, "Od vedení")).length, 1, "vedení ano");
    assert.equal((await itemRow(a)).updated_by, committee);
    assert.equal((await upd(karel, karel, a, "Od vedení", "fear")).length, 0, "jiný typ než uložený");
    assert.equal((await rem(jana, jana, a)), 0, "IDOR u smazání");
    assert.equal((await rem(karel, jana, a)), 0, "cizí bez práva u smazání");
    assert.equal(await count("client_situation_item", `id = '${a}'`), 1);
    assert.equal((await rem(karel, committee, a)), 1, "vedení smaže");
    assert.equal((await rem(karel, committee, a)), 0, "druhé smazání nic");

    // neaktivní cíl
    const inactiveSit = randomUUID();
    const inactiveItem = randomUUID();
    await q1(`INSERT INTO client_situation (id, member_id, slot) VALUES ($1, $2, 1)`, [inactiveSit, inactive]);
    await q1(`INSERT INTO client_situation_item (id, situation_id, kind, text) VALUES ($1, $2, 'need', 'Dávný')`, [inactiveItem, inactiveSit]);
    assert.equal((await upd(inactive, committee, inactiveItem, "Změna")).length, 0, "neaktivní cíl");
    assert.equal(await rem(inactive, committee, inactiveItem), 0);
    assert.equal((await itemRow(inactiveItem)).text, "Dávný");

    // stejný text nic nezmění, updated_by zůstane NULL (kartička z importu)
    const importedSit = randomUUID();
    const importedItem = randomUUID();
    await q1(`INSERT INTO client_situation (id, member_id, slot) VALUES ($1, $2, 2)`, [importedSit, karel]);
    await q1(`INSERT INTO client_situation_item (id, situation_id, kind, text, imported_text) VALUES ($1, $2, 'fear', 'Z workshopu', 'Z workshopu')`, [importedItem, importedSit]);
    assert.equal((await upd(karel, karel, importedItem, "Z workshopu", "fear")).length, 0, "stejný text");
    assert.equal((await itemRow(importedItem)).updated_by, null);
    assert.equal((await q1(`SELECT updated_by FROM client_situation WHERE id = $1`, [importedSit]))[0].updated_by, null, "situace nedotčena");
    assert.equal((await upd(karel, karel, importedItem, "Upraveno", "fear")).length, 1);
    assert.equal((await itemRow(importedItem)).imported_text, "Z workshopu", "imported_text zůstává");
    assert.equal((await q1(`SELECT updated_by FROM client_situation WHERE id = $1`, [importedSit]))[0].updated_by, karel, "situace dotčena ve stejném příkazu");
    const state = (await run(writeStateSql({ target: karel, actor: karel, itemId: importedItem })))[0];
    assert.equal(state.item_text, "Upraveno");
    const foreign = (await run(writeStateSql({ target: jana, actor: jana, itemId: importedItem })))[0];
    assert.equal(foreign.item_id, null, "cizí kartička se přes cizí memberId nenajde");
    await q1(`DELETE FROM client_situation`);
    ok("22. updateItem a removeItem: vlastník, vedení ano, cizí a IDOR 0 řádků, neaktivní cíl 0, stejný text nic");
  }

  // ── 23. addItem ──
  {
    const add = (target: string, actor: string, itemId: string, text: string, kind: "need" | "trait" = "need", slot: 1 | 2 | 3 = 1) =>
      run(addItemSql({ target, slot, actor, itemId, kind, text }));
    const dup = randomUUID();
    assert.equal((await add(karel, karel, dup, "Jednou")).length, 1);
    assert.equal((await add(karel, karel, dup, "Jednou")).length, 0, "druhé volání se stejným itemId");
    assert.equal(await count("client_situation_item"), 1, "vložena jedna kartička");
    assert.equal((await add(jana, jana, dup, "Přepis")).length, 0, "cizí existující itemId nic nepřepíše");
    assert.equal((await q1(`SELECT text FROM client_situation_item WHERE id = $1`, [dup]))[0].text, "Jednou");
    assert.equal((await add(karel, jana, randomUUID(), "Cizí", "need", 2)).length, 0, "bez práva");
    assert.equal(await count("client_situation", `member_id = '${karel}' AND slot = 2`), 0, "bez práva nevznikne ani situace");
    assert.equal((await add(inactive, committee, randomUUID(), "Neaktivní")).length, 0, "neaktivní cíl");
    const stDup = (await run(writeStateSql({ target: karel, actor: karel, slot: 1, kind: "need", itemId: dup })))[0];
    assert.equal(stDup.item_id, dup, "stav vrátí existující kartičku");
    assert.equal(stDup.kind_count, 1);
    // limit 30 na sloupec (need), 12 lístečků
    for (let i = 1; i < 30; i++) assert.equal((await add(karel, karel, randomUUID(), `Potřeba ${i}`)).length, 1);
    assert.equal(await count("client_situation_item", `kind = 'need'`), 30);
    assert.equal((await add(karel, karel, randomUUID(), "Jedna navíc")).length, 0, "nad limit 30 nic");
    assert.equal((await add(karel, karel, randomUUID(), "Jiný slot", "need", 2)).length, 1, "limit je na situaci, jiný slot volný");
    for (let i = 0; i < 12; i++) assert.equal((await add(karel, karel, randomUUID(), `B${i}`, "trait")).length, 1);
    assert.equal((await add(karel, karel, randomUUID(), "B12", "trait")).length, 0, "nad limit 12 lístečků");
    // pořadí
    const ordered = (await q1(`SELECT text FROM client_situation_item i JOIN client_situation s ON s.id = i.situation_id WHERE s.member_id = $1 AND s.slot = 1 AND i.kind = 'need' ORDER BY i.created_at, i.id`, [karel])).map((r) => String(r.text));
    assert.equal(ordered.length, 30);
    assert.equal(ordered[0], "Jednou");
    await q1(`DELETE FROM client_situation`);
    ok("23. addItem: dvojí odeslání vloží jednu, cizí itemId nic nepřepíše, bez práva ani situace, limit 30 a 12");
  }

  // ── 24. import ──
  {
    const source = JSON.stringify({
      situace: [
        { id: "S-5-1", clen: "Karel Zkouška", nazev: "Majitel firmy", puvodni_q1: "Q1", puvodni_q2: "Q2", problem: "Popis", cil: "Klid", obavy: ["O1", "O2", "O3"], navazne_potreby: ["R1"] },
        { id: "S-5-2", clen: "Karel Zkouška", nazev: "Nečitelná situace", puvodni_q1: "[nečitelné]", puvodni_q2: "", problem: "", cil: "", obavy: [], navazne_potreby: [] },
        { id: "S-6-3", clen: "Jana Pokusná", nazev: "Eshop", puvodni_q1: "Q", puvodni_q2: "", problem: "Jiný", cil: "", obavy: ["JO"], navazne_potreby: [] },
      ],
      clenove: [
        { jmeno: "Karel Zkouška", firma: "x", obor: "y", vyplnil_formular: true, situace: ["S-5-1", "S-5-2"], kompetence: [{ kompetence: "web", zdroj: "karel" }] },
        { jmeno: "Jana Pokusná", firma: "x", obor: "y", vyplnil_formular: true, situace: ["S-6-3"], kompetence: [] },
        { jmeno: "Neaktivní Člen", firma: "", obor: "", vyplnil_formular: false, situace: [], kompetence: [] },
      ],
    });
    const memberRows = (await q1(`SELECT id, name, (deactivated_at IS NULL) AS active FROM member`)).map((r) => ({
      id: String(r.id),
      name: String(r.name),
      active: Boolean(r.active),
    }));
    const plan = buildImportPlan(parseSituaceJson(source), memberRows, new Map());
    assert.deepEqual(plan.errors, []);
    assert.deepEqual(plan.unmatched, []);
    const params = planToParams(plan);
    const now = "2026-11-24T10:00:00.000Z";

    // Předem: prázdný řádek založený v preview (člen už stihl napsat popis), a situace s jiným importem.
    await q1(`INSERT INTO client_situation (member_id, slot, description, updated_by) VALUES ($1, 1, 'Moje poznámka', $1)`, [karel]);
    await q1(`INSERT INTO client_situation (member_id, slot, source_id, original) VALUES ($1, 3, 'S-JINY', '{"x":1}'::jsonb)`, [jana]);

    const first = (await q1(IMPORT_SITUATIONS_SQL, [params.situations, params.items, now]))[0];
    assert.equal(Number(first.situations), 2, "S-5-1 (převzatý prázdný řádek) a S-5-2; S-6-3 narazí na jiný import");
    assert.equal(Number(first.items), 5, "3 obavy, 1 touha, 1 související u S-5-1");
    const s1 = (await q1(`SELECT source_id, title, description, original->>'puvodni_q1' AS q1, updated_by FROM client_situation WHERE member_id = $1 AND slot = 1`, [karel]))[0];
    assert.equal(s1.source_id, "S-5-1");
    assert.equal(s1.q1, "Q1", "prázdný řádek dostal original");
    assert.equal(s1.description, "Moje poznámka", "text, který člen mezitím napsal, zůstal");
    assert.equal(s1.title, "Majitel firmy", "prázdný title se doplnil");
    assert.equal(s1.updated_by, karel);
    const s2 = (await q1(`SELECT title, original IS NOT NULL AS has_original FROM client_situation WHERE source_id = 'S-5-2'`))[0];
    assert.equal(s2.title, "", "nečitelná: prázdný title");
    assert.equal(s2.has_original, true);
    const foreign = (await q1(`SELECT original->>'x' AS x FROM client_situation WHERE member_id = $1 AND slot = 3`, [jana]))[0];
    assert.equal(foreign.x, "1", "situace s jiným original zůstala netknutá");
    assert.equal(await count("client_situation_item", `situation_id IN (SELECT id FROM client_situation WHERE member_id = '${jana}')`), 0, "kartičky k netknuté situaci nepřibyly");
    const fears = (await q1(`SELECT i.text, i.imported_text, i.updated_by FROM client_situation_item i JOIN client_situation s ON s.id = i.situation_id WHERE s.source_id = 'S-5-1' AND i.kind = 'fear' ORDER BY i.created_at, i.id`)).map((r) => [r.text, r.imported_text, r.updated_by]);
    assert.deepEqual(fears, [["O1", "O1", null], ["O2", "O2", null], ["O3", "O3", null]], "pořadí z pole, imported_text, updated_by NULL");

    const second = (await q1(IMPORT_SITUATIONS_SQL, [params.situations, params.items, now]))[0];
    assert.equal(Number(second.situations), 0, "druhý běh: 0 nových situací");
    assert.equal(Number(second.items), 0, "druhý běh: 0 nových kartiček");
    assert.equal(await count("client_situation_item"), 5);

    const src1 = await q1(IMPORT_SOURCES_SQL, [params.sources]);
    assert.equal(src1.length, 3, "zdroj pro všechny spárované členy (i bez situací)");
    assert.equal((await q1(IMPORT_SOURCES_SQL, [params.sources])).length, 0, "podruhé nic");
    assert.deepEqual((await q1(`SELECT competences FROM client_situation_source WHERE member_id = $1`, [karel]))[0].competences, [{ kompetence: "web", zdroj: "karel" }]);

    const slots1 = await q1(IMPORT_EMPTY_SLOTS_SQL);
    const activeMembers = await count("member", "deactivated_at IS NULL");
    assert.equal(await count("client_situation"), activeMembers * 3 + 0, "3 sloty pro každého aktivního člena");
    assert.equal(await count("client_situation", `member_id = '${inactive}'`), 0, "neaktivní člen sloty nedostane");
    assert.ok(slots1.length > 0);
    assert.equal((await q1(IMPORT_EMPTY_SLOTS_SQL)).length, 0, "podruhé nic");

    const verify = (await q1(IMPORT_VERIFY_SQL, [["S-5-1", "S-5-2"]]))[0];
    assert.equal(Number(verify.situations), 2);
    assert.equal(Number(verify.items), 5);
    // original je po importu neměnný pro všechny běžné zápisy z aplikace
    const before = (await q1(`SELECT original::text AS o FROM client_situation WHERE source_id = 'S-5-1'`))[0].o;
    await run(upsertHeadSql({ target: karel, slot: 1, actor: karel, field: "client", value: "Přepis" }));
    await run(upsertHeadSql({ target: karel, slot: 1, actor: committee, field: "description", value: "Přepis 2" }));
    assert.equal((await q1(`SELECT original::text AS o FROM client_situation WHERE source_id = 'S-5-1'`))[0].o, before, "original nedotčen");
    ok("24. import: druhý běh 0 nových, prázdný řádek dostane original bez přepisu textu člena, cizí original netknutý, sloty jen pro aktivní");
  }

  // ── 25. smazání člena ──
  {
    const target = await mk("Smazaný Člen");
    const helper = await mk("Pomocník Vedení", { hash: true, role: "moderator" });
    await run(upsertHeadSql({ target, slot: 1, actor: target, field: "client", value: "Klient" }));
    await run(addItemSql({ target, slot: 1, actor: helper, itemId: randomUUID(), kind: "need", text: "Potřeba" }));
    await q1(`INSERT INTO client_situation_source (member_id, source_name, filled_form) VALUES ($1, 'Smazaný Člen', true)`, [target]);
    await run(upsertHeadSql({ target: jana, slot: 2, actor: helper, field: "client", value: "Od pomocníka" }));
    assert.equal((await q1(`SELECT updated_by FROM client_situation WHERE member_id = $1 AND slot = 2`, [jana]))[0].updated_by, helper);
    await q1(`DELETE FROM member WHERE id = $1`, [target]);
    assert.equal(await count("client_situation", `member_id = '${target}'`), 0);
    assert.equal(await count("client_situation_source", `member_id = '${target}'`), 0);
    assert.equal(await count("client_situation_item", `text = 'Potřeba'`), 0, "kartičky smazány");
    await q1(`DELETE FROM member WHERE id = $1`, [helper]);
    assert.equal((await q1(`SELECT updated_by FROM client_situation WHERE member_id = $1 AND slot = 2`, [jana]))[0].updated_by, null, "updated_by jiného člena se vynuluje");
    assert.equal(await count("client_situation", `member_id = '${jana}' AND slot = 2`), 1, "situace zůstala");
    ok("25. smazání člena smaže situace, kartičky a zdroj (CASCADE), updated_by jiného člena se vynuluje");
  }


  // ── 26. dotaz exportu ──
  {
    const withSrc = await mk("Neaktivní Se Zdrojem", { inactive: true });
    const without = await mk("Neaktivní Bez Zdroje", { inactive: true });
    await q1(`UPDATE member SET company = 'Firma Export', obor = 'Obor Export' WHERE id = $1`, [withSrc]);
    await q1(`INSERT INTO client_situation_source (member_id, source_name, filled_form, competences) VALUES ($1, 'Zdrojové Jméno', true, '[{"kompetence":"k","zdroj":"z"}]'::jsonb)`, [withSrc]);
    await q1(`INSERT INTO client_situation (member_id, slot, source_id, title, original) VALUES ($1, 1, 'S-26-1', 'Z workshopu', '{"nazev":"Z workshopu","puvodni_q1":"Q"}'::jsonb)`, [withSrc]);
    await q1(`INSERT INTO client_situation (member_id, slot, title) VALUES ($1, 1, 'Nemá být v exportu')`, [without]);
    const sitId = (await q1(`SELECT id FROM client_situation WHERE source_id = 'S-26-1'`))[0].id as string;
    // kartičky s vynuceným created_at, vložené v opačném pořadí
    for (const [text, at] of [["Třetí", "2026-11-20T10:00:00.003Z"], ["První", "2026-11-20T10:00:00.001Z"], ["Druhá", "2026-11-20T10:00:00.002Z"]]) {
      await q1(`INSERT INTO client_situation_item (situation_id, kind, text, created_at) VALUES ($1, 'need', $2, $3)`, [sitId, text, at]);
    }
    const members = await run(exportMembersSql());
    const names = members.map((r) => String(r.name));
    assert.ok(names.includes("Neaktivní Se Zdrojem"), "neaktivní člen se zdrojem je v exportu");
    assert.ok(!names.includes("Neaktivní Bez Zdroje"), "neaktivní člen bez zdroje v exportu není");
    assert.ok(names.includes("Karel Zkouška"), "aktivní člen je v exportu");
    const srcRow = members.find((r) => r.name === "Neaktivní Se Zdrojem");
    assert.equal(srcRow?.active, false);
    assert.equal(srcRow?.company, "Firma Export");
    const sits = await run(exportSituationsSql());
    assert.ok(!sits.some((r) => r.title === "Nemá být v exportu"), "situace neaktivního bez zdroje chybí");
    const items = await run(exportItemsSql());
    const ordered = items.filter((r) => r.situation_id === sitId).map((r) => String(r.text));
    assert.deepEqual(ordered, ["První", "Druhá", "Třetí"], "kartičky v pořadí created_at, id");
    const data = assembleExportData(members as never, sits as never, items as never);
    const json = buildSituaceJson(data, new Date("2026-11-23T12:00:00Z"));
    const src = json.situace.find((x) => x.id === "S-26-1");
    assert.ok(src, "situace z workshopu neaktivního člena je v JSON");
    assert.equal(src.clen, "Zdrojové Jméno");
    assert.deepEqual(src.potreby, ["První", "Druhá", "Třetí"]);
    assert.deepEqual(json.clenove.find((c) => c.jmeno === "Zdrojové Jméno")?.kompetence, [{ kompetence: "k", zdroj: "z" }]);
    assert.ok(!json.clenove.some((c) => c.jmeno === "Neaktivní Bez Zdroje"));
    ok("26. dotaz exportu: neaktivní se zdrojem je, bez zdroje není, kartičky podle created_at, id, JSON z výsledku sedí");
  }

  await db.close();
  console.log(`\n${n}/${n} testů prošlo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
