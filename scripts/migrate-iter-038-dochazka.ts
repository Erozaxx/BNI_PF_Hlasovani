/**
 * Migrace pro iter-038 (docházka, arch T-001 sekce 4, gate T-002 Z3). Celá
 * migrace iterace v JEDNOM skriptu, aditivní a idempotentní (T-003a, T-003b a
 * T-003c ji nerozšiřují):
 *
 *   - `member`: sloupce `attendance_manager_since` (timestamptz) a
 *     `attendance_manager_by` (uuid, FK `member_attendance_manager_by_fk`,
 *     ON DELETE SET NULL). Příznak Správce docházky. `getMemberAuthState`
 *     čte `attendance_manager_since` v každém požadavku.
 *   - `member_absence` (ohlášená nepřítomnost člena, PK member_id + datum),
 *     `attendance_record` (zápis správce, PK datum + člen, verze řádku),
 *     `member_substitute_name` (paměť jmen, unikát na lower(name)),
 *     `attendance_day` (uzavření dne), `attendance_link` (ranní odkaz, jen
 *     hash), `attendance_report_mail` (jeden mail na příjemce a den),
 *     `attendance_audit` (zpětné opravy, append-only).
 *   - `attendance_audit` je append-only na úrovni DB: funkce
 *     `attendance_audit_immutable()` a dva triggery (BEFORE UPDATE OR DELETE
 *     na řádku, BEFORE TRUNCATE na příkazu) vyhodí výjimku. Tabulka záměrně
 *     NEMÁ cizí klíče na `member` (ON DELETE SET NULL by byl UPDATE a trigger
 *     by zablokoval mazání člena), jména jsou snímky, audit přežije smazání
 *     člena (K15). `DROP TABLE` trigger nehlídá, je to vědomě ruční zásah.
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti projektové DB.
 * `.env.local` míří na produkční Neon, dev databáze neexistuje. Nejdřív se
 * spustí na dočasné větvi Neonu (LL-010, e-maily členů přepsat a bez
 * RESEND_API_KEY), druhé spuštění musí projít beze změny, teprve potom na PROD
 * PŘED testováním v preview i PŘED mergem (preview běží nad PROD DB, R6, R10).
 * Nový `getMemberAuthState` čte `attendance_manager_since`. Bez migrace
 * spadne `getSession()` na 42703 a fail closed odhlásí všechny. Starý kód nové
 * sloupce ani tabulky nečte, migrace mu nevadí.
 *
 * Zámek na `member`: nullable sloupce bez defaultu jsou jen změna metadat,
 * přidání cizího klíče drží krátce SHARE ROW EXCLUSIVE. `lock_timeout` 5 s
 * hlídá, že migrace nečeká na cizí transakci. Tabulka `member` má kolem 30
 * řádků.
 *
 * lock_timeout (LL-006): veškeré DDL běží v DO blocích, které nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je v každém DO bloku napsaná DOSLOVNĚ, UVNITŘ `$$ … $$` NENÍ
 * ŽÁDNÁ JS interpolace (LL-006 bod 1). Funkce triggeru používá vnořený tag
 * `$f$`, také bez interpolace.
 *
 * Krok [0/8] je smoke test (LL-006 bod 2): PŘESNĚ stejný tvar DO bloků jako
 * kroky [2/8] až [5/8] (set_config, CREATE TABLE s pojmenovanými CHECKy, ADD
 * COLUMN IF NOT EXISTS, FK přes kontrolu v pg_constraint, unikátní index na
 * lower(name), IDENTITY sloupec, funkce a triggery) na dočasných tabulkách.
 * Smoke test navíc OVĚŘÍ chování triggeru: UPDATE, DELETE i TRUNCATE nad
 * dočasnou kopií audit tabulky musí selhat. Na ostré tabulce se to nezkouší
 * (řádek by už nešel smazat a identita by měla mezeru), ostrý test je v QA S1
 * (`UPDATE attendance_audit` na větvi selže textem triggeru). Selže-li smoke
 * test, runner skončí exit 1 dřív, než cokoli změní.
 *
 * Krok [6/8] jsou kontrolní dotazy v runneru, exit 1 při neshodě: sloupce a
 * typy, pojmenovaná omezení, `confdeltype` cizích klíčů (`c` u `member_id`,
 * `n` u `*_by`), audit bez cizích klíčů, oba triggery existují a jsou zapnuté,
 * indexy.
 *
 * Kontrola hostu: skript vypíše cílovou databázi bez hesla. Když je nastavená
 * proměnná prostředí `EXPECT_DB_HOST`, host z `DATABASE_URL` ji musí
 * obsahovat, jinak exit 1 (pojistka proti spuštění proti omylem špatné DB).
 *
 * ROLLBACK (v tomto pořadí):
 *   1. vrátit kód (redeploy předchozího buildu ve Vercelu nebo revert merge),
 *      starý kód s novými sloupci a tabulkami běží beze změny, crony zmizí
 *      s nasazením,
 *   2. tabulky a sloupce nechat, nebo ručně (jen ručně, ne z tohoto skriptu):
 *      před smazáním exportovat docházku a audit do souboru MIMO repo
 *      (`SELECT * FROM attendance_record`, `attendance_audit`), pak
 *      DROP TABLE attendance_report_mail, attendance_link, attendance_day,
 *        attendance_record, member_absence, member_substitute_name,
 *        attendance_audit;
 *      DROP FUNCTION attendance_audit_immutable();
 *      ALTER TABLE member DROP COLUMN attendance_manager_by,
 *        DROP COLUMN attendance_manager_since;
 *      (cizí klíč zanikne se sloupcem). Audit se maže jen ručně, trigger
 *      `DROP TABLE` nehlídá.
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   npx tsx scripts/migrate-iter-038-dochazka.ts   (načítá DATABASE_URL z .env.local)
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

// Nové sloupce `member` (arch 4.1).
const MEMBER_NEW_COLUMNS: ColumnRow[] = [
  { column_name: "attendance_manager_since", data_type: TS, is_nullable: "YES" },
  { column_name: "attendance_manager_by", data_type: "uuid", is_nullable: "YES" },
];

const ABSENCE_COLUMNS: ColumnRow[] = [
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "absence_date", data_type: "date", is_nullable: "NO" },
  { column_name: "substitute_name", data_type: "text", is_nullable: "YES" },
  { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "updated_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
  { column_name: "updated_at", data_type: TS, is_nullable: "NO" },
];

const RECORD_COLUMNS: ColumnRow[] = [
  { column_name: "attendance_date", data_type: "date", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "status", data_type: "text", is_nullable: "NO" },
  { column_name: "substitute_name", data_type: "text", is_nullable: "YES" },
  { column_name: "source", data_type: "text", is_nullable: "NO" },
  { column_name: "version", data_type: "integer", is_nullable: "NO" },
  { column_name: "updated_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "updated_at", data_type: TS, is_nullable: "NO" },
];

const SUBSTITUTE_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "name", data_type: "text", is_nullable: "NO" },
  { column_name: "last_used_at", data_type: TS, is_nullable: "NO" },
];

const DAY_COLUMNS: ColumnRow[] = [
  { column_name: "attendance_date", data_type: "date", is_nullable: "NO" },
  { column_name: "finalized_at", data_type: TS, is_nullable: "YES" },
  { column_name: "mode", data_type: "text", is_nullable: "YES" },
  { column_name: "report_late", data_type: "boolean", is_nullable: "NO" },
];

const LINK_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "attendance_date", data_type: "date", is_nullable: "NO" },
  { column_name: "token_hash", data_type: "text", is_nullable: "YES" },
  { column_name: "expires_at", data_type: TS, is_nullable: "YES" },
  { column_name: "claimed_at", data_type: TS, is_nullable: "YES" },
  { column_name: "sent_at", data_type: TS, is_nullable: "YES" },
  { column_name: "revoked_at", data_type: TS, is_nullable: "YES" },
  { column_name: "last_used_at", data_type: TS, is_nullable: "YES" },
  { column_name: "resend_email_id", data_type: "text", is_nullable: "YES" },
];

const REPORT_MAIL_COLUMNS: ColumnRow[] = [
  { column_name: "attendance_date", data_type: "date", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "claimed_at", data_type: TS, is_nullable: "NO" },
  { column_name: "sent_at", data_type: TS, is_nullable: "YES" },
  { column_name: "resend_email_id", data_type: "text", is_nullable: "YES" },
];

const AUDIT_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "bigint", is_nullable: "NO" },
  { column_name: "at", data_type: TS, is_nullable: "NO" },
  { column_name: "actor_id", data_type: "uuid", is_nullable: "YES" },
  { column_name: "actor_name", data_type: "text", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "YES" },
  { column_name: "member_name", data_type: "text", is_nullable: "NO" },
  { column_name: "attendance_date", data_type: "date", is_nullable: "NO" },
  { column_name: "field", data_type: "text", is_nullable: "NO" },
  { column_name: "old_value", data_type: "text", is_nullable: "YES" },
  { column_name: "new_value", data_type: "text", is_nullable: "YES" },
];

// Omezení (p = primary key, c = check, f = foreign key, u = unique) a jejich počty.
const ABSENCE_CHECKS = ["ma_sub_len"];
const RECORD_CHECKS = ["ar_status", "ar_source", "ar_sub", "ar_sub_len"];
const SUBSTITUTE_CHECKS = ["msn_name_len"];
const DAY_CHECKS = ["ad_mode"];
const LINK_UNIQUES = ["attendance_link_token_hash_unique", "attendance_link_member_date_unique"];
const AUDIT_CHECKS = ["aa_field"];

// pkey + 3 FK + 1 CHECK
const ABSENCE_CONSTRAINT_COUNT = 5;
// pkey + 2 FK + 4 CHECK
const RECORD_CONSTRAINT_COUNT = 7;
// pkey + 1 FK + 1 CHECK
const SUBSTITUTE_CONSTRAINT_COUNT = 3;
// pkey + 1 CHECK
const DAY_CONSTRAINT_COUNT = 2;
// pkey + 1 FK + 2 UNIQUE
const LINK_CONSTRAINT_COUNT = 4;
// pkey + 1 FK
const REPORT_MAIL_CONSTRAINT_COUNT = 2;
// pkey + 1 CHECK, žádný FK (záměrně)
const AUDIT_CONSTRAINT_COUNT = 2;

// sloupec -> confdeltype ('c' = CASCADE, 'n' = SET NULL)
const ABSENCE_FK_EXPECTED: Record<string, string> = { member_id: "c", created_by: "n", updated_by: "n" };
const RECORD_FK_EXPECTED: Record<string, string> = { member_id: "c", updated_by: "n" };
const MEMBER_ONLY_CASCADE: Record<string, string> = { member_id: "c" };

const ABSENCE_INDEX_NAMES = ["member_absence_pkey", "idx_member_absence_date"];
const RECORD_INDEX_NAMES = ["attendance_record_pkey", "idx_attendance_record_member"];
const SUBSTITUTE_INDEX_NAMES = ["member_substitute_name_pkey", "msn_member_name"];
const DAY_INDEX_NAMES = ["attendance_day_pkey"];
const LINK_INDEX_NAMES = [
  "attendance_link_pkey",
  "attendance_link_token_hash_unique",
  "attendance_link_member_date_unique",
];
const REPORT_MAIL_INDEX_NAMES = ["attendance_report_mail_pkey"];
const AUDIT_INDEX_NAMES = [
  "attendance_audit_pkey",
  "idx_attendance_audit_date",
  "idx_attendance_audit_member",
];

const TRIGGER_ROW = "attendance_audit_no_update_delete";
const TRIGGER_TRUNCATE = "attendance_audit_no_truncate";

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

function checkFks(label: string, actual: FkRow[], expected: Record<string, string>): void {
  if (actual.length !== Object.keys(expected).length) {
    fail(`[${label}] očekáváno ${Object.keys(expected).length} cizích klíčů, nalezeno ${actual.length}`);
  }
  for (const fk of actual) {
    const del = expected[fk.column_name];
    if (del === undefined) fail(`[${label}] nečekaný FK na sloupci ${fk.column_name}`);
    if (fk.confdeltype !== del) {
      fail(`[${label}.${fk.column_name}] confdeltype ${fk.confdeltype}, očekáváno ${del}`);
    }
    if (fk.referenced !== "member") {
      fail(`[${label}.${fk.column_name}] odkazuje na ${fk.referenced}, očekáváno member`);
    }
  }
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
  console.log("Running iter-038 docházka migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  // Pojistka hostu (LL-019: ve skriptu, ne jednořádkovým case v shellu).
  const expectHost = process.env.EXPECT_DB_HOST;
  if (expectHost && !hostOf(process.env.DATABASE_URL).includes(expectHost)) {
    fail(`host databáze neobsahuje EXPECT_DB_HOST=${expectHost}, migrace se nespustí`);
  }

  const memberColsBefore = (await columnsOf("member")).length;
  if (memberColsBefore < 1) fail("tabulka member nenalezena (špatná databáze?)");

  // [0/8] smoke test: stejný tvar DO bloků jako kroky [2/8] až [5/8], dočasné
  // tabulky. Žádný fallback při selhání. Hodnota '5s' je doslovná (LL-006).
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter038_member_smoke (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    ) ON COMMIT DROP;
    ALTER TABLE _iter038_member_smoke ADD COLUMN IF NOT EXISTS attendance_manager_since TIMESTAMPTZ;
    ALTER TABLE _iter038_member_smoke ADD COLUMN IF NOT EXISTS attendance_manager_by UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'member_attendance_manager_by_fk_smoke'
        AND conrelid = '_iter038_member_smoke'::regclass
    ) THEN
      ALTER TABLE _iter038_member_smoke
        ADD CONSTRAINT member_attendance_manager_by_fk_smoke
        FOREIGN KEY (attendance_manager_by) REFERENCES _iter038_member_smoke(id) ON DELETE SET NULL;
    END IF;
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter038_record_smoke (
      attendance_date DATE        NOT NULL,
      member_id       UUID        NOT NULL,
      status          TEXT        NOT NULL,
      substitute_name TEXT,
      source          TEXT        NOT NULL DEFAULT 'manager',
      version         INTEGER     NOT NULL DEFAULT 1,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (attendance_date, member_id),
      CONSTRAINT ar_status_smoke CHECK (status IN ('absent', 'present', 'substitute')),
      CONSTRAINT ar_sub_smoke CHECK ((status = 'substitute') = (substitute_name IS NOT NULL)),
      CONSTRAINT ar_sub_len_smoke CHECK (
        substitute_name IS NULL OR char_length(btrim(substitute_name)) BETWEEN 2 AND 80
      )
    ) ON COMMIT DROP;
    CREATE TEMPORARY TABLE _iter038_name_smoke (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id    UUID        NOT NULL,
      name         TEXT        NOT NULL,
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT msn_name_len_smoke CHECK (char_length(btrim(name)) BETWEEN 2 AND 80)
    ) ON COMMIT DROP;
    CREATE UNIQUE INDEX IF NOT EXISTS msn_member_name_smoke
      ON _iter038_name_smoke (member_id, lower(name));
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter038_audit_smoke (
      id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor_name      TEXT        NOT NULL,
      attendance_date DATE        NOT NULL,
      field           TEXT        NOT NULL,
      new_value       TEXT,
      CONSTRAINT aa_field_smoke CHECK (field IN ('presence', 'absence'))
    ) ON COMMIT DROP;
    CREATE OR REPLACE FUNCTION pg_temp._iter038_immutable_smoke() RETURNS trigger
    LANGUAGE plpgsql AS $f$
    BEGIN
      RAISE EXCEPTION 'attendance_audit je jen pro zápis';
    END
    $f$;
    CREATE TRIGGER _iter038_no_update_delete_smoke
      BEFORE UPDATE OR DELETE ON _iter038_audit_smoke
      FOR EACH ROW EXECUTE FUNCTION pg_temp._iter038_immutable_smoke();
    CREATE TRIGGER _iter038_no_truncate_smoke
      BEFORE TRUNCATE ON _iter038_audit_smoke
      FOR EACH STATEMENT EXECUTE FUNCTION pg_temp._iter038_immutable_smoke();
    INSERT INTO _iter038_audit_smoke (actor_name, attendance_date, field, new_value)
      VALUES ('smoke', DATE '2026-01-01', 'presence', 'present');
    BEGIN
      UPDATE _iter038_audit_smoke SET new_value = 'x';
      RAISE EXCEPTION 'smoke: UPDATE prošel';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'smoke:%' THEN RAISE; END IF;
    END;
    BEGIN
      DELETE FROM _iter038_audit_smoke;
      RAISE EXCEPTION 'smoke: DELETE prošel';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'smoke:%' THEN RAISE; END IF;
    END;
    BEGIN
      TRUNCATE _iter038_audit_smoke;
      RAISE EXCEPTION 'smoke: TRUNCATE prošel';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM LIKE 'smoke:%' THEN RAISE; END IF;
    END;
  END $$`;
  console.log(
    "  [0/8] smoke test OK (3 DO bloky: set_config, CREATE TABLE s CHECK, ADD COLUMN, FK přes pg_constraint, unikát na lower(name), IDENTITY, trigger zablokoval UPDATE, DELETE i TRUNCATE)"
  );

  // [1/8] snímek před (pro výpis na konci)
  const managersBefore = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member'
      AND column_name = 'attendance_manager_since'`) as { n: number }[];
  console.log(
    `  [1/8] snímek před: sloupců member ${memberColsBefore}, sloupec attendance_manager_since ${
      managersBefore[0]?.n ? "už existuje" : "chybí"
    }`
  );

  // [2/8] member: příznak správce docházky + FK (arch 4.1)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE member ADD COLUMN IF NOT EXISTS attendance_manager_since TIMESTAMPTZ;
    ALTER TABLE member ADD COLUMN IF NOT EXISTS attendance_manager_by UUID;
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'member_attendance_manager_by_fk'
        AND conrelid = 'public.member'::regclass
    ) THEN
      ALTER TABLE member ADD CONSTRAINT member_attendance_manager_by_fk
        FOREIGN KEY (attendance_manager_by) REFERENCES member(id) ON DELETE SET NULL;
    END IF;
  END $$`;
  console.log("  [2/8] member: attendance_manager_since, attendance_manager_by, FK member_attendance_manager_by_fk ensured");

  // [3/8] member_absence, attendance_record, member_substitute_name (arch 4.2)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS member_absence (
      member_id       UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      absence_date    DATE        NOT NULL,
      substitute_name TEXT,
      created_by      UUID        REFERENCES member(id) ON DELETE SET NULL,
      updated_by      UUID        REFERENCES member(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (member_id, absence_date),
      CONSTRAINT ma_sub_len CHECK (
        substitute_name IS NULL OR char_length(btrim(substitute_name)) BETWEEN 2 AND 80
      )
    );
  END $$`;
  await sql`CREATE INDEX IF NOT EXISTS idx_member_absence_date ON member_absence (absence_date)`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS attendance_record (
      attendance_date DATE        NOT NULL,
      member_id       UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      status          TEXT        NOT NULL,
      substitute_name TEXT,
      source          TEXT        NOT NULL DEFAULT 'manager',
      version         INTEGER     NOT NULL DEFAULT 1,
      updated_by      UUID        REFERENCES member(id) ON DELETE SET NULL,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (attendance_date, member_id),
      CONSTRAINT ar_status CHECK (status IN ('absent', 'present', 'substitute')),
      CONSTRAINT ar_source CHECK (source IN ('manager', 'auto')),
      CONSTRAINT ar_sub CHECK ((status = 'substitute') = (substitute_name IS NOT NULL)),
      CONSTRAINT ar_sub_len CHECK (
        substitute_name IS NULL OR char_length(btrim(substitute_name)) BETWEEN 2 AND 80
      )
    );
  END $$`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attendance_record_member
            ON attendance_record (member_id, attendance_date)`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS member_substitute_name (
      id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id    UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      name         TEXT        NOT NULL,
      last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT msn_name_len CHECK (char_length(btrim(name)) BETWEEN 2 AND 80)
    );
  END $$`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS msn_member_name
            ON member_substitute_name (member_id, lower(name))`;
  console.log("  [3/8] member_absence, attendance_record, member_substitute_name + indexy ensured");

  // [4/8] attendance_day, attendance_link, attendance_report_mail, attendance_audit
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS attendance_day (
      attendance_date DATE        PRIMARY KEY,
      finalized_at    TIMESTAMPTZ,
      mode            TEXT,
      report_late     BOOLEAN     NOT NULL DEFAULT FALSE,
      CONSTRAINT ad_mode CHECK (mode IS NULL OR mode IN ('recorded', 'unrecorded'))
    );
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS attendance_link (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id       UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      attendance_date DATE        NOT NULL,
      token_hash      TEXT,
      expires_at      TIMESTAMPTZ,
      claimed_at      TIMESTAMPTZ,
      sent_at         TIMESTAMPTZ,
      revoked_at      TIMESTAMPTZ,
      last_used_at    TIMESTAMPTZ,
      resend_email_id TEXT,
      CONSTRAINT attendance_link_token_hash_unique UNIQUE (token_hash),
      CONSTRAINT attendance_link_member_date_unique UNIQUE (member_id, attendance_date)
    );
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS attendance_report_mail (
      attendance_date DATE        NOT NULL,
      member_id       UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      claimed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at         TIMESTAMPTZ,
      resend_email_id TEXT,
      PRIMARY KEY (attendance_date, member_id)
    );
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS attendance_audit (
      id              BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      actor_id        UUID,
      actor_name      TEXT        NOT NULL,
      member_id       UUID,
      member_name     TEXT        NOT NULL,
      attendance_date DATE        NOT NULL,
      field           TEXT        NOT NULL,
      old_value       TEXT,
      new_value       TEXT,
      CONSTRAINT aa_field CHECK (field IN ('presence', 'absence'))
    );
  END $$`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attendance_audit_date
            ON attendance_audit (attendance_date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_attendance_audit_member
            ON attendance_audit (member_id, attendance_date)`;
  console.log("  [4/8] attendance_day, attendance_link, attendance_report_mail, attendance_audit + indexy ensured");

  // [5/8] append-only audit: funkce a dva triggery (arch 13.2). Vytvořit jen
  // když ještě nejsou, druhý běh nic nemění.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE OR REPLACE FUNCTION attendance_audit_immutable() RETURNS trigger
    LANGUAGE plpgsql AS $f$
    BEGIN
      RAISE EXCEPTION 'attendance_audit je jen pro zápis';
    END
    $f$;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'attendance_audit_no_update_delete'
        AND tgrelid = 'public.attendance_audit'::regclass
    ) THEN
      CREATE TRIGGER attendance_audit_no_update_delete
        BEFORE UPDATE OR DELETE ON attendance_audit
        FOR EACH ROW EXECUTE FUNCTION attendance_audit_immutable();
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'attendance_audit_no_truncate'
        AND tgrelid = 'public.attendance_audit'::regclass
    ) THEN
      CREATE TRIGGER attendance_audit_no_truncate
        BEFORE TRUNCATE ON attendance_audit
        FOR EACH STATEMENT EXECUTE FUNCTION attendance_audit_immutable();
    END IF;
  END $$`;
  console.log("  [5/8] attendance_audit_immutable() + triggery attendance_audit_no_update_delete, attendance_audit_no_truncate ensured");

  // [6/8] kontrolní dotazy, exit 1 při jakékoli neshodě
  const memberCols = await columnsOf("member");
  for (const expected of MEMBER_NEW_COLUMNS) {
    const actual = memberCols.find((c) => c.column_name === expected.column_name);
    if (!actual) fail(`[6a] member nemá sloupec ${expected.column_name}`);
    if (actual.data_type !== expected.data_type || actual.is_nullable !== expected.is_nullable) {
      fail(`[6a] member.${expected.column_name} nesedí: ${JSON.stringify(actual)}`);
    }
  }
  checkColumns("6a member_absence", await columnsOf("member_absence"), ABSENCE_COLUMNS);
  checkColumns("6a attendance_record", await columnsOf("attendance_record"), RECORD_COLUMNS);
  checkColumns("6a member_substitute_name", await columnsOf("member_substitute_name"), SUBSTITUTE_COLUMNS);
  checkColumns("6a attendance_day", await columnsOf("attendance_day"), DAY_COLUMNS);
  checkColumns("6a attendance_link", await columnsOf("attendance_link"), LINK_COLUMNS);
  checkColumns("6a attendance_report_mail", await columnsOf("attendance_report_mail"), REPORT_MAIL_COLUMNS);
  checkColumns("6a attendance_audit", await columnsOf("attendance_audit"), AUDIT_COLUMNS);
  console.log("  [6a] sloupce member (2 nové), member_absence (7), attendance_record (8), member_substitute_name (4), attendance_day (4), attendance_link (10), attendance_report_mail (5), attendance_audit (10) OK");

  checkConstraints("6b member_absence", await constraintsOf("member_absence"), ABSENCE_CONSTRAINT_COUNT, ABSENCE_CHECKS);
  checkConstraints("6b attendance_record", await constraintsOf("attendance_record"), RECORD_CONSTRAINT_COUNT, RECORD_CHECKS);
  checkConstraints("6b member_substitute_name", await constraintsOf("member_substitute_name"), SUBSTITUTE_CONSTRAINT_COUNT, SUBSTITUTE_CHECKS);
  checkConstraints("6b attendance_day", await constraintsOf("attendance_day"), DAY_CONSTRAINT_COUNT, DAY_CHECKS);
  checkConstraints("6b attendance_link", await constraintsOf("attendance_link"), LINK_CONSTRAINT_COUNT, LINK_UNIQUES);
  checkConstraints("6b attendance_report_mail", await constraintsOf("attendance_report_mail"), REPORT_MAIL_CONSTRAINT_COUNT, []);
  checkConstraints("6b attendance_audit", await constraintsOf("attendance_audit"), AUDIT_CONSTRAINT_COUNT, AUDIT_CHECKS);
  console.log("  [6b] omezení OK (absence 5, record 7, substitute 3, day 2, link 4, report_mail 2, audit 2)");

  checkFks("6c member_absence", await fksOf("member_absence"), ABSENCE_FK_EXPECTED);
  checkFks("6c attendance_record", await fksOf("attendance_record"), RECORD_FK_EXPECTED);
  checkFks("6c member_substitute_name", await fksOf("member_substitute_name"), MEMBER_ONLY_CASCADE);
  checkFks("6c attendance_link", await fksOf("attendance_link"), MEMBER_ONLY_CASCADE);
  checkFks("6c attendance_report_mail", await fksOf("attendance_report_mail"), MEMBER_ONLY_CASCADE);
  checkFks("6c attendance_day", await fksOf("attendance_day"), {});
  // Audit záměrně bez cizích klíčů: ON DELETE SET NULL by byl UPDATE a trigger by zablokoval mazání člena.
  checkFks("6c attendance_audit (bez FK)", await fksOf("attendance_audit"), {});
  const managerFk = (await fksOf("member")).find((f) => f.column_name === "attendance_manager_by");
  if (!managerFk || managerFk.confdeltype !== "n" || managerFk.referenced !== "member") {
    fail(`[6c] member.attendance_manager_by FK nesedí: ${JSON.stringify(managerFk)}`);
  }
  console.log("  [6c] cizí klíče OK (member_id c, *_by n, audit bez FK, attendance_manager_by n)");

  checkIndexNames("6d member_absence", await indexesOf("member_absence"), ABSENCE_INDEX_NAMES);
  checkIndexNames("6d attendance_record", await indexesOf("attendance_record"), RECORD_INDEX_NAMES);
  checkIndexNames("6d member_substitute_name", await indexesOf("member_substitute_name"), SUBSTITUTE_INDEX_NAMES);
  checkIndexNames("6d attendance_day", await indexesOf("attendance_day"), DAY_INDEX_NAMES);
  checkIndexNames("6d attendance_link", await indexesOf("attendance_link"), LINK_INDEX_NAMES);
  checkIndexNames("6d attendance_report_mail", await indexesOf("attendance_report_mail"), REPORT_MAIL_INDEX_NAMES);
  checkIndexNames("6d attendance_audit", await indexesOf("attendance_audit"), AUDIT_INDEX_NAMES);
  const nameIdx = (await indexesOf("member_substitute_name")).find((i) => i.indexname === "msn_member_name");
  if (!nameIdx || !/UNIQUE/i.test(nameIdx.indexdef) || !/lower\(/i.test(nameIdx.indexdef)) {
    fail(`[6d] msn_member_name musí být UNIQUE na (member_id, lower(name)): ${nameIdx?.indexdef}`);
  }
  console.log("  [6d] indexy OK (2 + 2 + 2 + 1 + 3 + 1 + 3, msn_member_name unikátní na lower(name))");

  // [6e] append-only audit: oba triggery existují a jsou zapnuté, funkce vyhazuje výjimku.
  const triggers = (await sql`
    SELECT t.tgname, t.tgenabled::text AS enabled, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.attendance_audit'::regclass AND NOT t.tgisinternal
    ORDER BY t.tgname`) as { tgname: string; enabled: string; def: string }[];
  const rowTrigger = triggers.find((t) => t.tgname === TRIGGER_ROW);
  const truncTrigger = triggers.find((t) => t.tgname === TRIGGER_TRUNCATE);
  if (triggers.length !== 2 || !rowTrigger || !truncTrigger) {
    fail(`[6e] attendance_audit má mít přesně triggery ${TRIGGER_ROW} a ${TRIGGER_TRUNCATE}: ${JSON.stringify(triggers.map((t) => t.tgname))}`);
  }
  if (rowTrigger.enabled !== "O" || truncTrigger.enabled !== "O") {
    fail(`[6e] trigger není zapnutý: ${JSON.stringify(triggers)}`);
  }
  // Postgres vypisuje události v pořadí DELETE OR UPDATE, oba tvary jsou stejný trigger.
  if (!/BEFORE (UPDATE OR DELETE|DELETE OR UPDATE) ON/i.test(rowTrigger.def) || !/FOR EACH ROW/i.test(rowTrigger.def)) {
    fail(`[6e] ${TRIGGER_ROW} má špatný tvar: ${rowTrigger.def}`);
  }
  if (!/BEFORE TRUNCATE ON/i.test(truncTrigger.def) || !/FOR EACH STATEMENT/i.test(truncTrigger.def)) {
    fail(`[6e] ${TRIGGER_TRUNCATE} má špatný tvar: ${truncTrigger.def}`);
  }
  const fn = (await sql`
    SELECT prosrc FROM pg_proc
    WHERE proname = 'attendance_audit_immutable' AND pronamespace = 'public'::regnamespace`) as { prosrc: string }[];
  if (fn.length !== 1 || !/RAISE EXCEPTION/i.test(fn[0].prosrc)) {
    fail("[6e] funkce attendance_audit_immutable() chybí nebo nevyhazuje výjimku");
  }
  console.log("  [6e] audit append-only: triggery attendance_audit_no_update_delete (řádek) a attendance_audit_no_truncate (příkaz) zapnuté, funkce vyhazuje výjimku");

  const managers = (await sql`
    SELECT count(*)::int AS n FROM member WHERE attendance_manager_since IS NOT NULL`) as { n: number }[];
  console.log(
    `  [6f] správců docházky: ${managers[0]?.n} (při prvním běhu musí být 0, při opakování jen výpis)`
  );

  // [7/8] souhrn (jen počty)
  const summary = (await sql`
    SELECT
      (SELECT count(*)::int FROM member_absence) AS absences,
      (SELECT count(*)::int FROM attendance_record) AS records,
      (SELECT count(*)::int FROM member_substitute_name) AS names,
      (SELECT count(*)::int FROM attendance_day) AS days,
      (SELECT count(*)::int FROM attendance_link) AS links,
      (SELECT count(*)::int FROM attendance_report_mail) AS report_mails,
      (SELECT count(*)::int FROM attendance_audit) AS audit`) as Record<string, number>[];
  console.log(`  [7/8] počty řádků: ${JSON.stringify(summary[0])}`);

  // [8/8] member po migraci
  console.log(
    `  [8/8] sloupců member ${memberCols.length} (před ${memberColsBefore})`
  );
  console.log("\niter-038 docházka migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
