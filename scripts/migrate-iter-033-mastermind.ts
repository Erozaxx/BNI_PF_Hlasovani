/**
 * Migrace pro iter-033 (T-005): zásobník případů „5 minut pro ostatní“
 * (arch iter-033 T-001, sekce 5, Z2). Zakládá DVĚ nové tabulky
 * (`mastermind_case`, `mastermind_interest`) a jejich indexy. Je aditivní a
 * idempotentní. Nesahá na žádnou existující tabulku: cizí klíče vedou jen na
 * `member` (krátký zámek na katalogu, ne přepis dat). Tabulka `meeting` se
 * nemění, mezi ní a případy není cizí klíč (U13).
 *
 * DULEŽITÉ: tenhle soubor coder (T-005) NAPSAL, NESPUSTIL. `.env.local` míří
 * na produkční Neon, dev databáze neexistuje. Nejdřív se spustí na dočasné
 * větvi Neonu (T-008, LL-010), teprve potom na PROD PŘED mergem (arch 5.3):
 * dashboard i /mastermind čtou `mastermind_case`, nový kód bez tabulek by
 * spadl na 42P01. Starý kód s přidanými tabulkami běží beze změny.
 *
 * lock_timeout (LL-006): CREATE TABLE běží v DO bloku, který nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je v každém DO $$ ... $$ bloku napsaná DOSLOVNĚ, NIKDY přes JS
 * interpolaci ${...} (LL-006 bod 1: driver převede ${...} na bind parametr
 * mimo text dotazu, ale uvnitř dollar-quoted stringu žádný placeholder není).
 *
 * Krok [0/5] je smoke test (LL-006 bod 2): PŘESNĚ stejný tvar DO bloku,
 * stejné sloupce a stejné CHECK jako krok [1/5], na jednorázové dočasné
 * tabulce (CREATE TEMPORARY TABLE ... ON COMMIT DROP) bez cizích klíčů.
 * Selže-li, runner skončí exit 1 dřív, než cokoli změní na skutečných
 * tabulkách.
 *
 * Krok [4/5] jsou kontrolní dotazy přímo v runneru, exit 1 při jakékoli
 * neshodě: sloupce obou tabulek v pořadí a typech, pojmenovaná omezení,
 * indexy včetně predikátu `mmc_one_per_date`, `confdeltype` všech cizích
 * klíčů (žádný není `a`) a počet sloupců `meeting` shodný jako před migrací.
 *
 * ROLLBACK (v tomto pořadí):
 *   1. vrátit kód (redeploy předchozího buildu ve Vercelu nebo revert merge),
 *   2. před smazáním exportovat `SELECT * FROM mastermind_case` a
 *      `mastermind_interest` do souboru MIMO repo (repo je veřejné),
 *   3. DROP TABLE IF EXISTS mastermind_interest;
 *      DROP TABLE IF EXISTS mastermind_case;
 *
 * Spuštění (nejdřív T-008 na větvi Neonu, LL-010; pak T-010 na PROD PŘED mergem):
 *   npx tsx scripts/migrate-iter-033-mastermind.ts   (načítá DATABASE_URL z .env.local)
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

const CASE_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "title", data_type: "text", is_nullable: "NO" },
  { column_name: "situation", data_type: "text", is_nullable: "NO" },
  { column_name: "path", data_type: "text", is_nullable: "YES" },
  { column_name: "takeaway", data_type: "text", is_nullable: "YES" },
  { column_name: "ask", data_type: "text", is_nullable: "YES" },
  { column_name: "status", data_type: "text", is_nullable: "NO" },
  { column_name: "internal_date", data_type: "date", is_nullable: "YES" },
  { column_name: "scheduled_at", data_type: TS, is_nullable: "YES" },
  { column_name: "scheduled_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "presented_at", data_type: TS, is_nullable: "YES" },
  { column_name: "presented_confirmed_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
  { column_name: "updated_at", data_type: TS, is_nullable: "NO" },
];

const INTEREST_COLUMNS: ColumnRow[] = [
  { column_name: "case_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
];

const CASE_NAMED_CHECKS = [
  "mmc_status_check",
  "mmc_title_len",
  "mmc_situation_len",
  "mmc_path_len",
  "mmc_takeaway_len",
  "mmc_ask_len",
  "mmc_date_by_status",
  "mmc_presented_complete",
];

// pkey + 8 CHECK + 4 FK
const CASE_CONSTRAINT_COUNT = 13;
// pkey + 2 FK
const INTEREST_CONSTRAINT_COUNT = 3;

// sloupec -> confdeltype ('c' = CASCADE, 'n' = SET NULL; žádný není 'a' = NO ACTION)
const CASE_FK_EXPECTED: Record<string, string> = {
  member_id: "c",
  scheduled_by: "n",
  created_by: "n",
  presented_confirmed_by: "n",
};
const INTEREST_FK_EXPECTED: Record<string, { del: string; referenced: string }> = {
  case_id: { del: "c", referenced: "mastermind_case" },
  member_id: { del: "c", referenced: "member" },
};

const CASE_INDEX_NAMES = [
  "mastermind_case_pkey",
  "mmc_one_per_date",
  "idx_mmc_member_status",
  "idx_mmc_status_created",
];
const INTEREST_INDEX_NAMES = ["mastermind_interest_pkey", "idx_mmi_member"];

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
      `[${label}] očekáváno ${expected.length} indexy, nalezeno ${actual.length}: ${JSON.stringify([...names])}`
    );
  }
  for (const name of expected) {
    if (!names.has(name)) fail(`[${label}] chybí index ${name}`);
  }
}

async function meetingColumnCount(): Promise<number> {
  const rows = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting'`) as { n: number }[];
  return rows[0]?.n ?? -1;
}

async function main() {
  console.log("Running iter-033 mastermind migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  const meetingColsBefore = await meetingColumnCount();
  if (meetingColsBefore < 1) fail("tabulka meeting nenalezena (špatná databáze?)");

  // [0/5] smoke test: stejný tvar DO bloku, stejné sloupce a CHECK jako krok
  // [1/5], dočasná tabulka bez cizích klíčů. Žádný fallback při selhání.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter033_mmc_smoke (
      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id              UUID        NOT NULL,
      title                  TEXT        NOT NULL,
      situation              TEXT        NOT NULL,
      path                   TEXT,
      takeaway               TEXT,
      ask                    TEXT,
      status                 TEXT        NOT NULL DEFAULT 'proposed',
      internal_date          DATE,
      scheduled_at           TIMESTAMPTZ,
      scheduled_by           UUID,
      presented_at           TIMESTAMPTZ,
      presented_confirmed_by UUID,
      created_by             UUID,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mmc_status_check CHECK (status IN ('proposed','scheduled','presented')),
      CONSTRAINT mmc_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
      CONSTRAINT mmc_situation_len CHECK (char_length(btrim(situation)) BETWEEN 1 AND 2000),
      CONSTRAINT mmc_path_len CHECK (char_length(path) <= 2000),
      CONSTRAINT mmc_takeaway_len CHECK (char_length(takeaway) <= 2000),
      CONSTRAINT mmc_ask_len CHECK (char_length(ask) <= 2000),
      CONSTRAINT mmc_date_by_status CHECK ((status = 'proposed') = (internal_date IS NULL)),
      CONSTRAINT mmc_presented_complete CHECK (status <> 'presented' OR presented_at IS NOT NULL)
    ) ON COMMIT DROP;
  END $$`;
  console.log(
    "  [0/5] smoke test OK (DO blok + set_config + CREATE TABLE, 16 sloupců, 8 CHECK, bez FK)"
  );

  // [1/5] mastermind_case (arch 4.1 po Z2: bez notified_at)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS mastermind_case (
      id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id              UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      title                  TEXT        NOT NULL,
      situation              TEXT        NOT NULL,
      path                   TEXT,
      takeaway               TEXT,
      ask                    TEXT,
      status                 TEXT        NOT NULL DEFAULT 'proposed',
      internal_date          DATE,
      scheduled_at           TIMESTAMPTZ,
      scheduled_by           UUID        REFERENCES member(id) ON DELETE SET NULL,
      presented_at           TIMESTAMPTZ,
      presented_confirmed_by UUID        REFERENCES member(id) ON DELETE SET NULL,
      created_by             UUID        REFERENCES member(id) ON DELETE SET NULL,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mmc_status_check CHECK (status IN ('proposed','scheduled','presented')),
      CONSTRAINT mmc_title_len CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
      CONSTRAINT mmc_situation_len CHECK (char_length(btrim(situation)) BETWEEN 1 AND 2000),
      CONSTRAINT mmc_path_len CHECK (char_length(path) <= 2000),
      CONSTRAINT mmc_takeaway_len CHECK (char_length(takeaway) <= 2000),
      CONSTRAINT mmc_ask_len CHECK (char_length(ask) <= 2000),
      CONSTRAINT mmc_date_by_status CHECK ((status = 'proposed') = (internal_date IS NULL)),
      CONSTRAINT mmc_presented_complete CHECK (status <> 'presented' OR presented_at IS NOT NULL)
    );
  END $$`;
  console.log("  [1/5] mastermind_case table ensured");

  // [2/5] indexy mastermind_case (prázdná tabulka, bez CONCURRENTLY jako iter-028)
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS mmc_one_per_date ON mastermind_case (internal_date) WHERE internal_date IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mmc_member_status ON mastermind_case (member_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mmc_status_created ON mastermind_case (status, created_at)`;
  console.log("  [2/5] mmc_one_per_date, idx_mmc_member_status, idx_mmc_status_created ensured");

  // [3/5] mastermind_interest (arch 4.2)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS mastermind_interest (
      case_id    UUID        NOT NULL REFERENCES mastermind_case(id) ON DELETE CASCADE,
      member_id  UUID        NOT NULL REFERENCES member(id)          ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT mastermind_interest_pkey PRIMARY KEY (case_id, member_id)
    );
  END $$`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mmi_member ON mastermind_interest (member_id)`;
  console.log("  [3/5] mastermind_interest table and idx_mmi_member ensured");

  // [4/5] kontrolní dotazy, exit 1 při jakékoli neshodě
  checkColumns("4a mastermind_case", await columnsOf("mastermind_case"), CASE_COLUMNS);
  checkColumns("4a mastermind_interest", await columnsOf("mastermind_interest"), INTEREST_COLUMNS);
  console.log("  [4a] sloupce obou tabulek v pořadí a typech OK (16 + 3)");

  const caseConstraints = await constraintsOf("mastermind_case");
  if (caseConstraints.length !== CASE_CONSTRAINT_COUNT) {
    fail(
      `[4b] mastermind_case: očekáváno ${CASE_CONSTRAINT_COUNT} omezení (pkey, 8 CHECK, 4 FK), nalezeno ${caseConstraints.length}: ${JSON.stringify(caseConstraints)}`
    );
  }
  const caseConstraintNames = new Set(caseConstraints.map((c) => c.conname));
  for (const name of CASE_NAMED_CHECKS) {
    if (!caseConstraintNames.has(name)) fail(`[4b] mastermind_case: chybí omezení ${name}`);
  }
  const interestConstraints = await constraintsOf("mastermind_interest");
  if (interestConstraints.length !== INTEREST_CONSTRAINT_COUNT) {
    fail(
      `[4b] mastermind_interest: očekáváno ${INTEREST_CONSTRAINT_COUNT} omezení (pkey, 2 FK), nalezeno ${interestConstraints.length}: ${JSON.stringify(interestConstraints)}`
    );
  }
  if (!interestConstraints.some((c) => c.conname === "mastermind_interest_pkey" && c.contype === "p")) {
    fail("[4b] mastermind_interest: chybí primární klíč mastermind_interest_pkey");
  }
  console.log("  [4b] pojmenovaná omezení OK (13 + 3)");

  const caseFks = await fksOf("mastermind_case");
  if (caseFks.length !== Object.keys(CASE_FK_EXPECTED).length) {
    fail(`[4c] mastermind_case: očekávány 4 cizí klíče, nalezeno ${caseFks.length}`);
  }
  for (const fk of caseFks) {
    const expected = CASE_FK_EXPECTED[fk.column_name];
    if (expected === undefined) fail(`[4c] mastermind_case: nečekaný FK na sloupci ${fk.column_name}`);
    if (fk.confdeltype !== expected) {
      fail(`[4c] mastermind_case.${fk.column_name}: confdeltype ${fk.confdeltype}, očekáváno ${expected}`);
    }
    if (fk.referenced !== "member") {
      fail(`[4c] mastermind_case.${fk.column_name}: odkazuje na ${fk.referenced}, očekáváno member`);
    }
  }
  const interestFks = await fksOf("mastermind_interest");
  if (interestFks.length !== Object.keys(INTEREST_FK_EXPECTED).length) {
    fail(`[4c] mastermind_interest: očekávány 2 cizí klíče, nalezeno ${interestFks.length}`);
  }
  for (const fk of interestFks) {
    const expected = INTEREST_FK_EXPECTED[fk.column_name];
    if (!expected) fail(`[4c] mastermind_interest: nečekaný FK na sloupci ${fk.column_name}`);
    if (fk.confdeltype !== expected.del) {
      fail(`[4c] mastermind_interest.${fk.column_name}: confdeltype ${fk.confdeltype}, očekáváno ${expected.del}`);
    }
    if (fk.referenced !== expected.referenced) {
      fail(`[4c] mastermind_interest.${fk.column_name}: odkazuje na ${fk.referenced}, očekáváno ${expected.referenced}`);
    }
  }
  console.log("  [4c] cizí klíče OK (confdeltype c/n, žádný není a)");

  const caseIndexes = await indexesOf("mastermind_case");
  checkIndexNames("4d mastermind_case", caseIndexes, CASE_INDEX_NAMES);
  const onePerDate = caseIndexes.find((i) => i.indexname === "mmc_one_per_date");
  if (
    !onePerDate ||
    !/CREATE UNIQUE INDEX/i.test(onePerDate.indexdef) ||
    !/WHERE \(?\(?internal_date IS NOT NULL\)?\)?/i.test(onePerDate.indexdef)
  ) {
    fail(`[4d] mmc_one_per_date není UNIQUE s predikátem internal_date IS NOT NULL: ${onePerDate?.indexdef}`);
  }
  checkIndexNames("4d mastermind_interest", await indexesOf("mastermind_interest"), INTEREST_INDEX_NAMES);
  console.log("  [4d] indexy OK (4 + 2, včetně predikátu mmc_one_per_date)");

  const meetingColsAfter = await meetingColumnCount();
  if (meetingColsAfter !== meetingColsBefore) {
    fail(`[4e] meeting má ${meetingColsAfter} sloupců, před migrací ${meetingColsBefore}`);
  }
  console.log(`  [4e] meeting beze změny (${meetingColsAfter} sloupců)`);

  // [5/5] souhrn
  const counts = (await sql`
    SELECT (SELECT count(*)::int FROM mastermind_case) AS cases,
           (SELECT count(*)::int FROM mastermind_interest) AS interests`) as {
    cases: number;
    interests: number;
  }[];
  console.log(
    `  [5/5] souhrn: mastermind_case ${counts[0]?.cases} řádků, mastermind_interest ${counts[0]?.interests} řádků`
  );
  console.log("\niter-033 mastermind migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
