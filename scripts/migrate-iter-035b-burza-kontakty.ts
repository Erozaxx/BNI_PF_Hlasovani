/**
 * Migrace pro iter-035 doplnění (T-013): kontakty v Burze pomoci (arch T-011
 * sekce 3 a 4, gate T-012 Z9). Zakládá DVĚ nové tabulky (`burza_contact`,
 * `burza_contact_use`) a jejich indexy. Je aditivní a idempotentní. Nesahá na
 * žádnou existující tabulku: cizí klíče vedou na `member` a na novou
 * `burza_contact`. Žádný UPDATE ani backfill, nové tabulky začínají prázdné.
 *
 * DŮLEŽITÉ: tenhle soubor coder (T-013) NAPSAL, NESPUSTIL. `.env.local` míří
 * na produkční Neon, dev databáze neexistuje. Nejdřív se spustí na dočasné
 * větvi Neonu (LL-010), druhé spuštění musí projít beze změny, teprve potom
 * na PROD PŘED mergem (arch 4.3): `/burza/kontakty` a `/burza/pomoc` čtou nové
 * tabulky, nový kód bez nich by spadl na 42P01. Záložka Pomoc (`/burza`) a
 * dashboard nové tabulky nečtou. Starý kód s přidanými tabulkami běží beze změny.
 *
 * Zámek na `member`: SHARE ROW EXCLUSIVE po dobu zakládání každého cizího
 * klíče (blokuje zápisy do `member`, čtení ne). U prázdných tabulek jde o
 * milisekundy a `lock_timeout` 5 s hlídá, že migrace nečeká na cizí transakci.
 *
 * lock_timeout (LL-006): CREATE TABLE běží v DO bloku, který nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je v každém DO bloku napsaná DOSLOVNĚ, NIKDY přes JS
 * interpolaci (LL-006 bod 1).
 *
 * Krok [0/5] je smoke test (LL-006 bod 2): PŘESNĚ stejný tvar DO bloku,
 * stejné sloupce, CHECK a UNIQUE jako kroky [1/5] a [2/5], na dočasných
 * tabulkách (CREATE TEMPORARY TABLE ... ON COMMIT DROP) bez cizích klíčů.
 * Selže-li, runner skončí exit 1 dřív, než cokoli změní.
 *
 * Krok [4/5] jsou kontrolní dotazy v runneru, exit 1 při neshodě: sloupce
 * obou tabulek, pojmenovaná omezení, indexy, `confdeltype` cizích klíčů a že
 * `burza_offer` a `burza_help` mají stejné sloupce a omezení jako po
 * iter-035 a `member` stejný počet sloupců.
 *
 * ROLLBACK (v tomto pořadí):
 *   1. vrátit kód (redeploy předchozího buildu ve Vercelu nebo revert merge),
 *   2. před smazáním exportovat `SELECT * FROM burza_contact` a
 *      `burza_contact_use` do souboru MIMO repo (repo je veřejné),
 *   3. smazat tabulky: nejdřív `burza_contact_use`, potom `burza_contact`
 *      (příkaz DROP TABLE IF EXISTS na každou, jen ručně, ne z tohoto skriptu).
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   npx tsx scripts/migrate-iter-035b-burza-kontakty.ts   (načítá DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

interface ConstraintRow {
  conname: string;
  contype: string;
}

interface FkRow {
  column_name: string;
  confdeltype: string;
  referenced: string;
}

interface IndexRow {
  indexname: string;
  indexdef: string;
}

const TS = "timestamp with time zone";

const CONTACT_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "label", data_type: "text", is_nullable: "NO" },
  { column_name: "updated_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
  { column_name: "updated_at", data_type: TS, is_nullable: "NO" },
];

const USE_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "contact_id", data_type: "uuid", is_nullable: "YES" },
  { column_name: "helper_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "recipient_id", data_type: "uuid", is_nullable: "YES" },
  { column_name: "used_on", data_type: "date", is_nullable: "NO" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
];

// Stav po iter-035 (migrate-iter-035-burza.ts), musí zůstat beze změny.
const OFFER_COLUMNS: ColumnRow[] = [
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "offer", data_type: "text", is_nullable: "NO" },
  { column_name: "contact", data_type: "text", is_nullable: "YES" },
  { column_name: "note", data_type: "text", is_nullable: "YES" },
  { column_name: "updated_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "confirmed_at", data_type: TS, is_nullable: "NO" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
  { column_name: "updated_at", data_type: TS, is_nullable: "NO" },
];

const HELP_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "helper_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "recipient_id", data_type: "uuid", is_nullable: "YES" },
  { column_name: "used_on", data_type: "date", is_nullable: "NO" },
  { column_name: "used_month", data_type: "date", is_nullable: "NO" },
  { column_name: "note", data_type: "text", is_nullable: "YES" },
  { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
];

const OFFER_NAMED = ["bo_offer_len", "bo_contact_len", "bo_note_len"];
const HELP_NAMED = ["bh_not_self", "bh_month", "bh_note_len", "bh_once_per_month"];
const CONTACT_NAMED = ["bc_label_len"];
const USE_NAMED = ["bcu_not_self", "bcu_once"];

// pkey + 3 CHECK + 2 FK
const OFFER_CONSTRAINT_COUNT = 6;
// pkey + 3 CHECK + 1 UNIQUE + 3 FK
const HELP_CONSTRAINT_COUNT = 8;
// pkey + 1 CHECK + 2 FK
const CONTACT_CONSTRAINT_COUNT = 4;
// pkey + 1 CHECK + 1 UNIQUE + 3 FK
const USE_CONSTRAINT_COUNT = 6;

// sloupec -> confdeltype ('c' = CASCADE, 'n' = SET NULL; žádný není 'a' = NO ACTION)
const OFFER_FK_EXPECTED: Record<string, string> = { member_id: "c", updated_by: "n" };
const HELP_FK_EXPECTED: Record<string, string> = {
  helper_id: "c",
  recipient_id: "n",
  created_by: "n",
};
const CONTACT_FK_EXPECTED: Record<string, string> = { member_id: "c", updated_by: "n" };
const USE_FK_EXPECTED: Record<string, string> = {
  contact_id: "n",
  helper_id: "c",
  recipient_id: "n",
};

const OFFER_INDEX_NAMES = ["burza_offer_pkey"];
const HELP_INDEX_NAMES = [
  "burza_help_pkey",
  "bh_once_per_month",
  "idx_bh_helper_used",
  "idx_bh_recipient",
];
const CONTACT_INDEX_NAMES = ["burza_contact_pkey", "idx_bc_member"];
const USE_INDEX_NAMES = [
  "burza_contact_use_pkey",
  "bcu_once",
  "idx_bcu_helper_used",
  "idx_bcu_recipient",
];

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

async function columnsOf(table: string): Promise<ColumnRow[]> {
  return (await sql`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position`) as ColumnRow[];
}

function checkColumns(label: string, actual: ColumnRow[], expected: ColumnRow[]): void {
  if (actual.length !== expected.length) {
    fail(`[${label}] očekáváno ${expected.length} sloupců, nalezeno ${actual.length}`);
  }
  for (let i = 0; i < expected.length; i++) {
    const a = actual[i];
    const e = expected[i];
    if (
      a.column_name !== e.column_name ||
      a.data_type !== e.data_type ||
      a.is_nullable !== e.is_nullable
    ) {
      fail(
        `[${label}] sloupec #${i} nesedí: očekáváno ${JSON.stringify(e)}, nalezeno ${JSON.stringify(a)}`
      );
    }
  }
}

async function constraintsOf(table: string): Promise<ConstraintRow[]> {
  return (await sql`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid = ${"public." + table}::regclass AND contype IN ('p', 'c', 'f', 'u')
    ORDER BY conname`) as ConstraintRow[];
}

async function fksOf(table: string): Promise<FkRow[]> {
  return (await sql`
    SELECT a.attname AS column_name, c.confdeltype::text AS confdeltype,
           c.confrelid::regclass::text AS referenced
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = ${"public." + table}::regclass AND c.contype = 'f'
    ORDER BY a.attname`) as FkRow[];
}

async function indexesOf(table: string): Promise<IndexRow[]> {
  return (await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = ${table}`) as IndexRow[];
}

function checkIndexNames(label: string, actual: IndexRow[], expected: string[]): void {
  const names = new Set(actual.map((i) => i.indexname));
  if (actual.length !== expected.length) {
    fail(
      `[${label}] očekáváno ${expected.length} indexů, nalezeno ${actual.length}: ${JSON.stringify([...names])}`
    );
  }
  for (const name of expected) {
    if (!names.has(name)) fail(`[${label}] chybí index ${name}`);
  }
}

function checkConstraints(
  label: string,
  actual: ConstraintRow[],
  expectedCount: number,
  expectedNames: string[]
): void {
  if (actual.length !== expectedCount) {
    fail(
      `[${label}] očekáváno ${expectedCount} omezení, nalezeno ${actual.length}: ${JSON.stringify(actual)}`
    );
  }
  const names = new Set(actual.map((c) => c.conname));
  for (const name of expectedNames) {
    if (!names.has(name)) fail(`[${label}] chybí omezení ${name}`);
  }
}

function checkFks(
  label: string,
  actual: FkRow[],
  expected: Record<string, string>,
  referencedOverride: Record<string, string> = {}
): void {
  if (actual.length !== Object.keys(expected).length) {
    fail(`[${label}] očekáváno ${Object.keys(expected).length} cizích klíčů, nalezeno ${actual.length}`);
  }
  for (const fk of actual) {
    const del = expected[fk.column_name];
    if (del === undefined) fail(`[${label}] nečekaný FK na sloupci ${fk.column_name}`);
    if (fk.confdeltype !== del) {
      fail(`[${label}.${fk.column_name}] confdeltype ${fk.confdeltype}, očekáváno ${del}`);
    }
    const target = referencedOverride[fk.column_name] ?? "member";
    if (fk.referenced !== target) {
      fail(`[${label}.${fk.column_name}] odkazuje na ${fk.referenced}, očekáváno ${target}`);
    }
  }
}

async function memberColumnCount(): Promise<number> {
  const rows = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member'`) as { n: number }[];
  return rows[0]?.n ?? -1;
}

async function main() {
  console.log("Running iter-035 burza kontakty migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  const memberColsBefore = await memberColumnCount();
  if (memberColsBefore < 1) fail("tabulka member nenalezena (špatná databáze?)");

  // Předpoklad: migrace iter-035 už proběhla (burza_offer, burza_help existují a sedí).
  checkColumns("0 burza_offer", await columnsOf("burza_offer"), OFFER_COLUMNS);
  checkColumns("0 burza_help", await columnsOf("burza_help"), HELP_COLUMNS);
  const offerNamedBefore = JSON.stringify((await constraintsOf("burza_offer")).map((c) => c.conname));
  const helpNamedBefore = JSON.stringify((await constraintsOf("burza_help")).map((c) => c.conname));

  // [0/5] smoke test: stejný tvar DO bloku, stejné sloupce, CHECK a UNIQUE jako
  // kroky [1/5] a [2/5], dočasné tabulky bez cizích klíčů. Žádný fallback při selhání.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter035b_bc_smoke (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id  UUID        NOT NULL,
      label      TEXT        NOT NULL,
      updated_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT bc_label_len CHECK (char_length(btrim(label)) BETWEEN 1 AND 400)
    ) ON COMMIT DROP;
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter035b_bcu_smoke (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      contact_id   UUID,
      helper_id    UUID        NOT NULL,
      recipient_id UUID,
      used_on      DATE        NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT bcu_not_self CHECK (recipient_id IS NULL OR recipient_id <> helper_id),
      CONSTRAINT bcu_once UNIQUE (contact_id, recipient_id)
    ) ON COMMIT DROP;
  END $$`;
  console.log("  [0/5] smoke test OK (2 DO bloky + set_config + CREATE TABLE, 6 + 6 sloupců, bez FK)");

  // [1/5] burza_contact (arch 3.1)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS burza_contact (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id  UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      label      TEXT        NOT NULL,
      updated_by UUID        REFERENCES member(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT bc_label_len CHECK (char_length(btrim(label)) BETWEEN 1 AND 400)
    );
  END $$`;
  console.log("  [1/5] burza_contact table ensured");

  // [2/5] burza_contact_use (arch 3.2 po gate Z9: bez created_by)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS burza_contact_use (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      contact_id   UUID        REFERENCES burza_contact(id) ON DELETE SET NULL,
      helper_id    UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      recipient_id UUID        REFERENCES member(id) ON DELETE SET NULL,
      used_on      DATE        NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT bcu_not_self CHECK (recipient_id IS NULL OR recipient_id <> helper_id),
      CONSTRAINT bcu_once UNIQUE (contact_id, recipient_id)
    );
  END $$`;
  console.log("  [2/5] burza_contact_use table ensured");

  // [3/5] indexy (prázdné tabulky, bez CONCURRENTLY jako iter-028)
  await sql`CREATE INDEX IF NOT EXISTS idx_bc_member ON burza_contact (member_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bcu_helper_used ON burza_contact_use (helper_id, used_on)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bcu_recipient ON burza_contact_use (recipient_id)`;
  console.log("  [3/5] idx_bc_member, idx_bcu_helper_used, idx_bcu_recipient ensured");

  // [4/5] kontrolní dotazy, exit 1 při jakékoli neshodě
  checkColumns("4a burza_contact", await columnsOf("burza_contact"), CONTACT_COLUMNS);
  checkColumns("4a burza_contact_use", await columnsOf("burza_contact_use"), USE_COLUMNS);
  console.log("  [4a] sloupce nových tabulek v pořadí, typech a nullabilitě OK (6 + 6)");

  checkConstraints(
    "4b burza_contact",
    await constraintsOf("burza_contact"),
    CONTACT_CONSTRAINT_COUNT,
    CONTACT_NAMED
  );
  checkConstraints(
    "4b burza_contact_use",
    await constraintsOf("burza_contact_use"),
    USE_CONSTRAINT_COUNT,
    USE_NAMED
  );
  console.log("  [4b] pojmenovaná omezení OK (4 + 6)");

  checkFks("4c burza_contact", await fksOf("burza_contact"), CONTACT_FK_EXPECTED);
  checkFks("4c burza_contact_use", await fksOf("burza_contact_use"), USE_FK_EXPECTED, {
    contact_id: "burza_contact",
  });
  console.log("  [4c] cizí klíče OK (confdeltype c/n, žádný není a)");

  checkIndexNames("4d burza_contact", await indexesOf("burza_contact"), CONTACT_INDEX_NAMES);
  checkIndexNames("4d burza_contact_use", await indexesOf("burza_contact_use"), USE_INDEX_NAMES);
  console.log("  [4d] indexy OK (2 + 4)");

  // burza_offer a burza_help zůstaly beze změny (sloupce, omezení, FK, indexy).
  checkColumns("4e burza_offer", await columnsOf("burza_offer"), OFFER_COLUMNS);
  checkColumns("4e burza_help", await columnsOf("burza_help"), HELP_COLUMNS);
  checkConstraints("4e burza_offer", await constraintsOf("burza_offer"), OFFER_CONSTRAINT_COUNT, OFFER_NAMED);
  checkConstraints("4e burza_help", await constraintsOf("burza_help"), HELP_CONSTRAINT_COUNT, HELP_NAMED);
  if (JSON.stringify((await constraintsOf("burza_offer")).map((c) => c.conname)) !== offerNamedBefore) {
    fail("[4e] omezení burza_offer se změnila");
  }
  if (JSON.stringify((await constraintsOf("burza_help")).map((c) => c.conname)) !== helpNamedBefore) {
    fail("[4e] omezení burza_help se změnila");
  }
  checkFks("4e burza_offer", await fksOf("burza_offer"), OFFER_FK_EXPECTED);
  checkFks("4e burza_help", await fksOf("burza_help"), HELP_FK_EXPECTED);
  checkIndexNames("4e burza_offer", await indexesOf("burza_offer"), OFFER_INDEX_NAMES);
  checkIndexNames("4e burza_help", await indexesOf("burza_help"), HELP_INDEX_NAMES);
  console.log("  [4e] burza_offer a burza_help beze změny");

  const memberColsAfter = await memberColumnCount();
  if (memberColsAfter !== memberColsBefore) {
    fail(`[4f] member má ${memberColsAfter} sloupců, před migrací ${memberColsBefore}`);
  }
  console.log(`  [4f] member beze změny (${memberColsAfter} sloupců)`);

  // [5/5] souhrn (jen počty, žádný obsah)
  const counts = (await sql`
    SELECT (SELECT count(*)::int FROM burza_offer) AS offers,
           (SELECT count(*)::int FROM burza_help) AS helps,
           (SELECT count(*)::int FROM burza_contact) AS contacts,
           (SELECT count(*)::int FROM burza_contact_use) AS uses`) as {
    offers: number;
    helps: number;
    contacts: number;
    uses: number;
  }[];
  console.log(
    `  [5/5] souhrn: burza_offer ${counts[0]?.offers}, burza_help ${counts[0]?.helps}, burza_contact ${counts[0]?.contacts}, burza_contact_use ${counts[0]?.uses} řádků`
  );
  console.log("\niter-035 burza kontakty migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
