/**
 * Migrace pro iter-049 (klientské situace, arch T-001 kap. 4). Aditivní a
 * idempotentní: tři `CREATE TABLE IF NOT EXISTS` (`client_situation`,
 * `client_situation_item`, `client_situation_source`) a index.
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti žádné DB. `.env.local`
 * míří na produkční Neon, dev databáze neexistuje. Nejdřív dočasná větev Neonu
 * (LL-010), druhé spuštění musí projít beze změny, teprve potom PROD PŘED
 * mergem (preview běží nad PROD DB). Bez migrace padá stránka /situace na 42P01.
 *
 * lock_timeout (LL-006): DDL běží v DO blocích, které nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je napsaná DOSLOVNĚ, UVNITŘ `$$ ... $$` NENÍ ŽÁDNÁ JS interpolace.
 * Bez db.transaction() (LL-003).
 *
 * DDL žije v lib/situations/ddl.ts, stejný text čte PGlite test
 * (scripts/test-iter-049-sql.ts, test 19), který tím nahrazuje smoke test na
 * dočasných tabulkách. Vědomá odchylka od iter-046: jsou to jen tři
 * `CREATE TABLE IF NOT EXISTS` bez ALTER, smoke s přejmenováním tabulek regexem
 * by byl rizikovější než to, co hlídá. Krok [4] jsou kontroly, exit 1 při neshodě.
 *
 * Kontrola hostu (security L-2): `EXPECT_DB_HOST` je POVINNÁ (aspoň 6 znaků) a
 * porovnává se přesně s hostem z `DATABASE_URL` (celý host, nebo jeho první
 * label, ne podřetězec), stejně jako u importního skriptu. Bez ní nebo při
 * neshodě skript skončí s exit 1 dřív, než pošle první příkaz do DB.
 *
 * ROLLBACK: vrátit kód, tabulky nechat (starý kód je nečte). Data nemazat.
 *
 * Spuštění: EXPECT_DB_HOST=<host nebo první label> npx tsx scripts/migrate-iter-049-situace.ts   (DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { PalmsError, assertApplyAllowed, hostOfUrl } from "../lib/attendance/palms";
import {
  CLIENT_SITUATION_DDL,
  CLIENT_SITUATION_ITEM_DDL,
  CLIENT_SITUATION_SOURCE_DDL,
  doBlock,
} from "../lib/situations/ddl";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

interface ColExpect {
  table: string;
  column: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

const EXPECTED_COLUMNS: ColExpect[] = [
  { table: "client_situation", column: "member_id", data_type: "uuid", is_nullable: "NO" },
  { table: "client_situation", column: "slot", data_type: "smallint", is_nullable: "NO" },
  { table: "client_situation", column: "source_id", data_type: "text", is_nullable: "YES" },
  { table: "client_situation", column: "client", data_type: "text", is_nullable: "NO" },
  { table: "client_situation", column: "title", data_type: "text", is_nullable: "NO" },
  { table: "client_situation", column: "description", data_type: "text", is_nullable: "NO" },
  { table: "client_situation", column: "original", data_type: "jsonb", is_nullable: "YES" },
  { table: "client_situation", column: "updated_by", data_type: "uuid", is_nullable: "YES" },
  { table: "client_situation_item", column: "situation_id", data_type: "uuid", is_nullable: "NO" },
  { table: "client_situation_item", column: "kind", data_type: "text", is_nullable: "NO" },
  { table: "client_situation_item", column: "text", data_type: "text", is_nullable: "NO" },
  { table: "client_situation_item", column: "imported_text", data_type: "text", is_nullable: "YES" },
  { table: "client_situation_item", column: "updated_by", data_type: "uuid", is_nullable: "YES" },
  { table: "client_situation_source", column: "member_id", data_type: "uuid", is_nullable: "NO" },
  { table: "client_situation_source", column: "source_name", data_type: "text", is_nullable: "NO" },
  { table: "client_situation_source", column: "filled_form", data_type: "boolean", is_nullable: "NO" },
  { table: "client_situation_source", column: "competences", data_type: "jsonb", is_nullable: "NO" },
];

/** [tabulka, název omezení, typ `pg_constraint.contype`, kus definice, který musí obsahovat]. */
const EXPECTED_CONSTRAINTS: [string, string, string, string][] = [
  ["client_situation", "cs_slot", "c", "slot >= 1"],
  ["client_situation", "cs_member_slot", "u", "member_id, slot"],
  ["client_situation", "cs_source_id", "u", "source_id"],
  ["client_situation", "cs_lengths", "c", "char_length"],
  ["client_situation_item", "csi_kind", "c", "'related'"],
  ["client_situation_item", "csi_text", "c", "btrim"],
];

async function main() {
  console.log("Running iter-049 situace migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  // Povinná a přesná kontrola hostu PŘED prvním dotazem (security L-2).
  try {
    assertApplyAllowed(true, process.env.EXPECT_DB_HOST, hostOfUrl(process.env.DATABASE_URL));
  } catch (err) {
    if (err instanceof PalmsError) fail(err.message);
    throw err;
  }

  const m = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member'`) as { n: number }[];
  if (!m[0]?.n) fail("tabulka member nenalezena (špatná databáze)");

  await sql(doBlock(CLIENT_SITUATION_DDL));
  console.log("  [1/3] client_situation");
  await sql(doBlock(CLIENT_SITUATION_ITEM_DDL));
  console.log("  [2/3] client_situation_item + index csi_situation_kind_created");
  await sql(doBlock(CLIENT_SITUATION_SOURCE_DDL));
  console.log("  [3/3] client_situation_source");

  // [4] kontroly
  for (const e of EXPECTED_COLUMNS) {
    const rows = (await sql`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${e.table} AND column_name = ${e.column}`) as {
      data_type: string;
      is_nullable: string;
    }[];
    const a = rows[0];
    if (!a || a.data_type !== e.data_type || a.is_nullable !== e.is_nullable) {
      fail(`[4a] ${e.table}.${e.column} nesedí: ${JSON.stringify(a)}`);
    }
  }
  console.log("  [4a] sloupce a typy sedí");

  for (const [table, name, contype, needle] of EXPECTED_CONSTRAINTS) {
    const rows = (await sql`
      SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
      WHERE c.conrelid = ('public.' || ${table})::regclass AND c.conname = ${name} AND c.contype = ${contype}`) as {
      def: string;
    }[];
    if (rows.length !== 1 || !rows[0].def.includes(needle)) {
      fail(`[4b] omezení ${table}.${name} nesedí: ${JSON.stringify(rows)}`);
    }
  }
  console.log("  [4b] CHECK a UNIQUE (cs_slot, cs_member_slot, cs_source_id, cs_lengths, csi_kind, csi_text) sedí");

  const fks = (await sql`
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, c.confdeltype::text AS del
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f' AND c.conrelid IN (
      'public.client_situation'::regclass, 'public.client_situation_item'::regclass,
      'public.client_situation_source'::regclass)
    ORDER BY 1, 2`) as { tbl: string; col: string; del: string }[];
  const expectFk: [string, string, string][] = [
    ["client_situation", "member_id", "c"],
    ["client_situation", "updated_by", "n"],
    ["client_situation_item", "situation_id", "c"],
    ["client_situation_item", "updated_by", "n"],
    ["client_situation_source", "member_id", "c"],
  ];
  for (const [tbl, col, del] of expectFk) {
    const hit = fks.find((f) => f.tbl === tbl && f.col === col);
    if (!hit || hit.del !== del) fail(`[4c] FK ${tbl}.${col} nesedí (čekáno ON DELETE ${del === "c" ? "CASCADE" : "SET NULL"}): ${JSON.stringify(hit)}`);
  }
  console.log("  [4c] FK (CASCADE na member a situaci, SET NULL u updated_by) sedí");

  const idx = (await sql`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'csi_situation_kind_created'`) as { indexdef: string }[];
  if (idx.length !== 1 || !idx[0].indexdef.includes("situation_id, kind, created_at, id")) {
    fail(`[4d] index csi_situation_kind_created nesedí: ${JSON.stringify(idx)}`);
  }
  console.log("  [4d] index csi_situation_kind_created sedí");

  console.log("\niter-049 situace migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
