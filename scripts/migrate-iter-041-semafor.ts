/**
 * Migrace pro iter-041 (semafor, arch T-001 sekce 4, gate T-002 Z7). Aditivní
 * a idempotentní:
 *
 *   - `semafor_import` (historie nahrání: měsíc, kdo, kdy, SHA-256 souboru,
 *     počty řádků),
 *   - `semafor_score` (snímek za měsíc a člena, PK (month, member_id) je klíč
 *     deduplikace, CHECK rozsahů),
 *   - `semafor_name_alias` (paměť ručně spárovaných jmen),
 *   - rozšíření CHECK `ar_status` o `'unexcused'` a `ar_source` o `'palms'`
 *     v `attendance_record` (jedním `ALTER TABLE`, jen pokud ještě nejsou).
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti projektové DB.
 * `.env.local` míří na produkční Neon, dev databáze neexistuje. Nejdřív se
 * spustí na dočasné větvi Neonu (LL-010), druhé spuštění musí projít beze
 * změny, teprve potom na PROD PŘED testováním v preview i PŘED mergem (preview
 * běží nad PROD DB, Vercel deployuje na merge). Bez migrace `/semafor` spadne
 * na 42P01 (odkaz Semafor uvidí všichni hned po nasazení) a zápis „Chyběl(a)
 * bez omluvy“ na porušení CHECK. Starý kód nové tabulky nečte a rozšířený CHECK
 * mu nevadí.
 *
 * Zámky: cizí klíče drží krátce SHARE ROW EXCLUSIVE na `member`, `ALTER TABLE
 * attendance_record` drží ACCESS EXCLUSIVE jen po dobu validace CHECK nad malou
 * tabulkou. `lock_timeout` 5 s hlídá, že migrace nečeká na cizí transakci.
 * Nespouštět ve čtvrtek ráno (zápis docházky).
 *
 * lock_timeout (LL-006): DDL běží v DO blocích, které nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je v blocích napsaná DOSLOVNĚ, UVNITŘ `$$ … $$` NENÍ ŽÁDNÁ JS
 * interpolace (LL-006 bod 1).
 *
 * Krok [0/5] je smoke test (LL-006 bod 2): PŘESNĚ stejný tvar DO bloků jako
 * kroky [2/5] a [3/5] (set_config, CREATE TABLE IF NOT EXISTS s PK, FK
 * ON DELETE CASCADE a SET NULL, CHECK s date_trunc a regexem, ALTER TABLE
 * DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT podmíněný přes pg_constraint)
 * na dočasných tabulkách. Selže-li, runner skončí exit 1 dřív, než cokoli
 * změní.
 *
 * Krok [4/5] jsou kontrolní dotazy, exit 1 při neshodě: sloupce a typy, PK,
 * FK s `confdeltype` (`c`, `n`), pojmenované CHECK, `pg_get_constraintdef`
 * obsahuje `'unexcused'` a `'palms'`. Navíc jen čtení (Z7): názvy funkcí
 * s `permissions = NULL` (dostanou přehled se jmény, čeká se Člen výboru) a
 * počet funkcí s ručním seznamem (nedostanou). Názvy funkcí nejsou osobní údaj,
 * jména členů se nevypisují.
 *
 * Kontrola hostu: skript vypíše cílovou databázi bez hesla. Když je nastavená
 * proměnná prostředí `EXPECT_DB_HOST`, host z `DATABASE_URL` ji musí
 * obsahovat, jinak exit 1.
 *
 * ROLLBACK: vrátit kód. Tabulky semaforu nechat, nebo
 *   DROP TABLE semafor_score, semafor_name_alias, semafor_import;
 * CHECK nechat rozšířený (starému kódu nevadí). Doplněná historie z PALMS jde
 * odstranit podle zdroje (viz scripts/backfill-iter-041-palms.ts, --help).
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   npx tsx scripts/migrate-iter-041-semafor.ts   (načítá DATABASE_URL z .env.local)
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

const TS = "timestamp with time zone";
const col = (column_name: string, data_type: string, nullable: boolean): ColumnRow => ({
  column_name,
  data_type,
  is_nullable: nullable ? "YES" : "NO",
});

const IMPORT_COLUMNS: ColumnRow[] = [
  col("id", "uuid", false),
  col("month", "date", false),
  col("uploaded_by", "uuid", true),
  col("uploaded_at", TS, false),
  col("file_sha256", "text", false),
  col("row_count", "integer", false),
  col("saved_count", "integer", false),
];

const SCORE_COLUMNS: ColumnRow[] = [
  col("month", "date", false),
  col("member_id", "uuid", false),
  col("import_id", "uuid", true),
  col("total_score", "numeric", false),
  col("attendance_rate", "numeric", true),
  col("attendance_score", "numeric", true),
  col("ceu_rate", "numeric", true),
  col("ceu_score", "numeric", true),
  col("one_to_one_rate", "numeric", true),
  col("one_to_one_score", "numeric", true),
  col("referrals_given_rate", "numeric", true),
  col("referrals_given_score", "numeric", true),
  col("tyfcb", "numeric", true),
  col("tyfcb_score", "numeric", true),
  col("visitors", "numeric", true),
  col("visitor_score", "numeric", true),
  col("sponsors", "numeric", true),
  col("sponsor_score", "numeric", true),
  col("updated_at", TS, false),
];

const ALIAS_COLUMNS: ColumnRow[] = [
  col("name_key", "text", false),
  col("member_id", "uuid", false),
  col("created_by", "uuid", true),
  col("created_at", TS, false),
];

const EXPECTED: Record<string, ColumnRow[]> = {
  semafor_import: IMPORT_COLUMNS,
  semafor_score: SCORE_COLUMNS,
  semafor_name_alias: ALIAS_COLUMNS,
};

const EXPECTED_INDEXES: Record<string, string[]> = {
  semafor_import: ["idx_semafor_import_month", "idx_semafor_import_sha", "semafor_import_pkey"],
  semafor_score: ["idx_semafor_score_member", "semafor_score_pkey"],
  semafor_name_alias: ["idx_semafor_alias_member", "semafor_name_alias_pkey"],
};

const EXPECTED_FKS: { table: string; column: string; confdeltype: string; referenced: string }[] = [
  { table: "semafor_import", column: "uploaded_by", confdeltype: "n", referenced: "member" },
  { table: "semafor_score", column: "member_id", confdeltype: "c", referenced: "member" },
  { table: "semafor_score", column: "import_id", confdeltype: "n", referenced: "semafor_import" },
  { table: "semafor_name_alias", column: "member_id", confdeltype: "c", referenced: "member" },
  { table: "semafor_name_alias", column: "created_by", confdeltype: "n", referenced: "member" },
];

const EXPECTED_CHECKS: { table: string; name: string }[] = [
  { table: "semafor_import", name: "semafor_import_month_first" },
  { table: "semafor_import", name: "semafor_import_sha" },
  { table: "semafor_import", name: "semafor_import_counts" },
  { table: "semafor_score", name: "semafor_score_month_first" },
  { table: "semafor_score", name: "semafor_score_total" },
  { table: "semafor_score", name: "semafor_score_attendance_rate" },
  { table: "semafor_score", name: "semafor_score_scores" },
  { table: "semafor_score", name: "semafor_score_rates" },
  { table: "semafor_score", name: "semafor_score_counts" },
  { table: "semafor_name_alias", name: "semafor_alias_key_len" },
];

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

function hostOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

async function main() {
  console.log("Running iter-041 semafor migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  const expectHost = process.env.EXPECT_DB_HOST;
  if (expectHost && !hostOf(process.env.DATABASE_URL).includes(expectHost)) {
    fail(`host databáze neobsahuje EXPECT_DB_HOST=${expectHost}, migrace se nespustí`);
  }

  // [0/5] smoke test: stejný tvar DO bloků jako kroky [2/5] a [3/5], dočasné
  // tabulky. Hodnota '5s' je doslovná, uvnitř $$ žádná interpolace (LL-006).
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter041_member_smoke (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    ) ON COMMIT DROP;
    CREATE TEMPORARY TABLE IF NOT EXISTS _iter041_import_smoke (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      month       DATE        NOT NULL,
      uploaded_by UUID        REFERENCES _iter041_member_smoke(id) ON DELETE SET NULL,
      file_sha256 TEXT        NOT NULL,
      CONSTRAINT _iter041_month_first CHECK (month = date_trunc('month', month::timestamp)::date),
      CONSTRAINT _iter041_sha CHECK (file_sha256 ~ '^[0-9a-f]{64}$')
    ) ON COMMIT DROP;
    CREATE TEMPORARY TABLE IF NOT EXISTS _iter041_score_smoke (
      month       DATE          NOT NULL,
      member_id   UUID          NOT NULL REFERENCES _iter041_member_smoke(id) ON DELETE CASCADE,
      import_id   UUID          REFERENCES _iter041_import_smoke(id) ON DELETE SET NULL,
      total_score NUMERIC(5,2)  NOT NULL,
      PRIMARY KEY (month, member_id),
      CONSTRAINT _iter041_total CHECK (total_score BETWEEN 0 AND 100)
    ) ON COMMIT DROP;
    CREATE TEMPORARY TABLE _iter041_record_smoke (
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      CONSTRAINT ar_status CHECK (status IN ('absent', 'present', 'substitute')),
      CONSTRAINT ar_source CHECK (source IN ('manager', 'auto'))
    ) ON COMMIT DROP;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ar_status' AND conrelid = '_iter041_record_smoke'::regclass
        AND pg_get_constraintdef(oid) LIKE '%unexcused%'
    ) THEN
      ALTER TABLE _iter041_record_smoke
        DROP CONSTRAINT IF EXISTS ar_status,
        ADD CONSTRAINT ar_status CHECK (status IN ('absent', 'present', 'substitute', 'unexcused')),
        DROP CONSTRAINT IF EXISTS ar_source,
        ADD CONSTRAINT ar_source CHECK (source IN ('manager', 'auto', 'palms'));
    END IF;
  END $$`;
  console.log(
    "  [0/5] smoke test OK (DO bloky: set_config, CREATE TABLE IF NOT EXISTS s PK, FK CASCADE a SET NULL, CHECK s date_trunc a regexem, podmíněný ALTER TABLE DROP/ADD CONSTRAINT)"
  );

  // [1/5] snímek před (bez hesla, jen stav)
  const memberCols = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member'`) as { n: number }[];
  if (!memberCols[0]?.n) fail("tabulka member nenalezena (špatná databáze?)");
  const recordCols = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance_record'`) as { n: number }[];
  if (!recordCols[0]?.n) fail("tabulka attendance_record nenalezena (chybí migrace iter-038)");
  const before = (await sql`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('semafor_import', 'semafor_score', 'semafor_name_alias')`) as {
    n: number;
  }[];
  console.log(`  [1/5] snímek před: tabulek semaforu už existuje ${before[0]?.n} ze 3`);

  // [2/5] tabulky (arch 4.1 až 4.3). Každá tabulka vlastní DO blok, žádná interpolace.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS semafor_import (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      month       DATE        NOT NULL,
      uploaded_by UUID        REFERENCES member(id) ON DELETE SET NULL,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      file_sha256 TEXT        NOT NULL,
      row_count   INTEGER     NOT NULL,
      saved_count INTEGER     NOT NULL,
      CONSTRAINT semafor_import_month_first CHECK (month = date_trunc('month', month::timestamp)::date),
      CONSTRAINT semafor_import_sha CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT semafor_import_counts CHECK (row_count >= 0 AND saved_count >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_semafor_import_month ON semafor_import (month, uploaded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_semafor_import_sha ON semafor_import (file_sha256);
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS semafor_score (
      month                 DATE         NOT NULL,
      member_id             UUID         NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      import_id             UUID         REFERENCES semafor_import(id) ON DELETE SET NULL,
      total_score           NUMERIC(5,2) NOT NULL,
      attendance_rate       NUMERIC(6,4),
      attendance_score      NUMERIC(5,2),
      ceu_rate              NUMERIC(8,3),
      ceu_score             NUMERIC(5,2),
      one_to_one_rate       NUMERIC(8,3),
      one_to_one_score      NUMERIC(5,2),
      referrals_given_rate  NUMERIC(8,3),
      referrals_given_score NUMERIC(5,2),
      tyfcb                 NUMERIC(14,2),
      tyfcb_score           NUMERIC(5,2),
      visitors              NUMERIC(10,3),
      visitor_score         NUMERIC(5,2),
      sponsors              NUMERIC(10,3),
      sponsor_score         NUMERIC(5,2),
      updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      PRIMARY KEY (month, member_id),
      CONSTRAINT semafor_score_month_first CHECK (month = date_trunc('month', month::timestamp)::date),
      CONSTRAINT semafor_score_total CHECK (total_score BETWEEN 0 AND 100),
      CONSTRAINT semafor_score_attendance_rate CHECK (attendance_rate IS NULL OR attendance_rate BETWEEN 0 AND 1),
      CONSTRAINT semafor_score_scores CHECK (
        (attendance_score IS NULL OR attendance_score BETWEEN 0 AND 100)
        AND (ceu_score IS NULL OR ceu_score BETWEEN 0 AND 100)
        AND (one_to_one_score IS NULL OR one_to_one_score BETWEEN 0 AND 100)
        AND (referrals_given_score IS NULL OR referrals_given_score BETWEEN 0 AND 100)
        AND (tyfcb_score IS NULL OR tyfcb_score BETWEEN 0 AND 100)
        AND (visitor_score IS NULL OR visitor_score BETWEEN 0 AND 100)
        AND (sponsor_score IS NULL OR sponsor_score BETWEEN 0 AND 100)
      ),
      CONSTRAINT semafor_score_rates CHECK (
        (ceu_rate IS NULL OR ceu_rate BETWEEN 0 AND 1000)
        AND (one_to_one_rate IS NULL OR one_to_one_rate BETWEEN 0 AND 1000)
        AND (referrals_given_rate IS NULL OR referrals_given_rate BETWEEN 0 AND 1000)
      ),
      CONSTRAINT semafor_score_counts CHECK (
        (tyfcb IS NULL OR tyfcb >= 0)
        AND (visitors IS NULL OR visitors >= 0)
        AND (sponsors IS NULL OR sponsors >= 0)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_semafor_score_member ON semafor_score (member_id, month DESC);
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS semafor_name_alias (
      name_key   TEXT        PRIMARY KEY,
      member_id  UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      created_by UUID        REFERENCES member(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT semafor_alias_key_len CHECK (char_length(name_key) BETWEEN 2 AND 120)
    );
    CREATE INDEX IF NOT EXISTS idx_semafor_alias_member ON semafor_name_alias (member_id);
  END $$`;
  console.log("  [2/5] semafor_import, semafor_score, semafor_name_alias ensured");

  // [3/5] docházka: ar_status o 'unexcused', ar_source o 'palms'. Jen když tam ještě nejsou.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ar_status' AND conrelid = 'attendance_record'::regclass
        AND pg_get_constraintdef(oid) LIKE '%unexcused%'
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'ar_source' AND conrelid = 'attendance_record'::regclass
        AND pg_get_constraintdef(oid) LIKE '%palms%'
    ) THEN
      ALTER TABLE attendance_record
        DROP CONSTRAINT IF EXISTS ar_status,
        ADD CONSTRAINT ar_status CHECK (status IN ('absent', 'present', 'substitute', 'unexcused')),
        DROP CONSTRAINT IF EXISTS ar_source,
        ADD CONSTRAINT ar_source CHECK (source IN ('manager', 'auto', 'palms'));
    END IF;
  END $$`;
  console.log("  [3/5] attendance_record: ar_status (+ unexcused), ar_source (+ palms)");

  // [4/5] kontroly
  for (const [table, expected] of Object.entries(EXPECTED)) {
    const cols = (await sql`
      SELECT column_name, data_type, is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}
      ORDER BY ordinal_position`) as ColumnRow[];
    if (cols.length !== expected.length) {
      fail(`[4a] ${table}: očekáváno ${expected.length} sloupců, nalezeno ${cols.length}`);
    }
    expected.forEach((e, i) => {
      const a = cols[i];
      if (a.column_name !== e.column_name || a.data_type !== e.data_type || a.is_nullable !== e.is_nullable) {
        fail(`[4a] ${table} sloupec #${i} nesedí: očekáváno ${JSON.stringify(e)}, nalezeno ${JSON.stringify(a)}`);
      }
    });
  }
  console.log("  [4a] sloupce a typy sedí (3 tabulky)");

  for (const [table, expected] of Object.entries(EXPECTED_INDEXES)) {
    const idx = (await sql`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = ${table}
      ORDER BY indexname`) as { indexname: string }[];
    const names = idx.map((i) => i.indexname);
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      fail(`[4b] ${table}: indexy ${JSON.stringify(names)}, očekáváno ${JSON.stringify(expected)}`);
    }
  }
  console.log("  [4b] indexy a primární klíče sedí");

  for (const e of EXPECTED_FKS) {
    const fks = (await sql`
      SELECT c.confdeltype::text AS confdeltype, c.confrelid::regclass::text AS referenced
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.conrelid = (${"public." + e.table})::regclass AND c.contype = 'f' AND a.attname = ${e.column}`) as {
      confdeltype: string;
      referenced: string;
    }[];
    if (fks.length !== 1 || fks[0].confdeltype !== e.confdeltype || fks[0].referenced !== e.referenced) {
      fail(`[4c] FK ${e.table}.${e.column} nesedí: ${JSON.stringify(fks)}`);
    }
  }
  console.log("  [4c] cizí klíče (CASCADE u member_id ve skóre a aliasu, SET NULL jinde)");

  for (const e of EXPECTED_CHECKS) {
    const rows = (await sql`
      SELECT count(*)::int AS n FROM pg_constraint
      WHERE conrelid = (${"public." + e.table})::regclass AND contype = 'c' AND conname = ${e.name}`) as {
      n: number;
    }[];
    if (rows[0]?.n !== 1) fail(`[4d] chybí CHECK ${e.table}.${e.name}`);
  }
  console.log("  [4d] pojmenované CHECK sedí");

  const defs = (await sql`
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.attendance_record'::regclass AND conname IN ('ar_status', 'ar_source')
    ORDER BY conname`) as { conname: string; def: string }[];
  const arSource = defs.find((d) => d.conname === "ar_source")?.def ?? "";
  const arStatus = defs.find((d) => d.conname === "ar_status")?.def ?? "";
  if (!arStatus.includes("'unexcused'")) fail(`[4e] ar_status neobsahuje 'unexcused': ${arStatus}`);
  if (!arSource.includes("'palms'")) fail(`[4e] ar_source neobsahuje 'palms': ${arSource}`);
  for (const keep of ["'absent'", "'present'", "'substitute'"]) {
    if (!arStatus.includes(keep)) fail(`[4e] ar_status ztratil ${keep}: ${arStatus}`);
  }
  for (const keep of ["'manager'", "'auto'"]) {
    if (!arSource.includes(keep)) fail(`[4e] ar_source ztratil ${keep}: ${arSource}`);
  }
  console.log("  [4e] ar_status obsahuje 'unexcused', ar_source obsahuje 'palms'");

  // Jen čtení (gate Z7): kdo dostane přehled semaforu se jmény.
  const withDefault = (await sql`
    SELECT name FROM chapter_function WHERE permissions IS NULL ORDER BY name`) as { name: string }[];
  const manual = (await sql`
    SELECT count(*)::int AS n FROM chapter_function
    WHERE permissions IS NOT NULL
      AND NOT ('admin-delegable' = ANY(permissions))
      AND NOT ('semafor.view_all' = ANY(permissions))`) as { n: number }[];
  console.log(
    `  [4f] funkce s výchozí sadou (dostanou semafor.view_all, čeká se jen Člen výboru): ${
      withDefault.length === 0 ? "žádné" : withDefault.map((f) => f.name).join(", ")
    }`
  );
  console.log(
    `  [4f] funkcí s ručním seznamem práv bez semafor.view_all (přehled nedostanou, admin je upraví ve správě funkcí): ${manual[0]?.n ?? 0}`
  );

  // [5/5] souhrn (jen počty)
  const summary = (await sql`
    SELECT (SELECT count(*)::int FROM semafor_import) AS imports,
           (SELECT count(*)::int FROM semafor_score) AS scores,
           (SELECT count(*)::int FROM semafor_name_alias) AS aliases`) as {
    imports: number;
    scores: number;
    aliases: number;
  }[];
  console.log(
    `  [5/5] řádků: semafor_import ${summary[0]?.imports}, semafor_score ${summary[0]?.scores}, semafor_name_alias ${summary[0]?.aliases}`
  );
  console.log("\niter-041 semafor migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
