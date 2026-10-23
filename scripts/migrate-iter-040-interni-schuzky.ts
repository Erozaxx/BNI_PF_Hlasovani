/**
 * Migrace pro iter-040 (interní schůzka v docházce, arch T-001 sekce 11, gate
 * T-002). Aditivní a idempotentní, jediná změna je nová tabulka:
 *
 *   - `attendance_internal_day` (PK `attendance_date`, `created_by` s FK na
 *     `member` ON DELETE SET NULL, `created_at`). Řádek = interní schůzka na
 *     ten den, zrušení = DELETE. Do `meeting` se nic nezapisuje.
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti projektové DB.
 * `.env.local` míří na produkční Neon, dev databáze neexistuje. Nejdřív se
 * spustí na dočasné větvi Neonu (LL-010), druhé spuštění musí projít beze
 * změny, teprve potom na PROD PŘED testováním v preview i PŘED mergem (preview
 * běží nad PROD DB, Vercel deployuje na merge). Nový `getCloseState` čte novou
 * tabulku, bez migrace spadne večerní cron i `/dochazka` na 42P01. Starý kód
 * tabulku nečte, migrace mu nevadí.
 *
 * Zámek na `member`: cizí klíč drží krátce SHARE ROW EXCLUSIVE, `member` má
 * kolem 30 řádků. `lock_timeout` 5 s hlídá, že migrace nečeká na cizí
 * transakci.
 *
 * lock_timeout (LL-006): DDL běží v DO bloku, který nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je v bloku napsaná DOSLOVNĚ, UVNITŘ `$$ … $$` NENÍ ŽÁDNÁ JS
 * interpolace (LL-006 bod 1).
 *
 * Krok [0/4] je smoke test (LL-006 bod 2): PŘESNĚ stejný tvar DO bloku jako
 * krok [2/4] (set_config, CREATE TABLE IF NOT EXISTS s PK a inline FK
 * ON DELETE SET NULL) na dočasných tabulkách. Selže-li, runner skončí exit 1
 * dřív, než cokoli změní.
 *
 * Krok [3/4] jsou kontrolní dotazy, exit 1 při neshodě: sloupce a typy,
 * `attendance_internal_day_pkey`, FK `created_by` s `confdeltype = 'n'`.
 * Navíc jen čtení: výpis funkcí s explicitním seznamem práv, které nové právo
 * `attendance.internal_manage` nedostanou (jen názvy funkcí).
 *
 * Kontrola hostu: skript vypíše cílovou databázi bez hesla. Když je nastavená
 * proměnná prostředí `EXPECT_DB_HOST`, host z `DATABASE_URL` ji musí
 * obsahovat, jinak exit 1.
 *
 * ROLLBACK: vrátit kód; tabulku nechat, nebo ručně
 *   DROP TABLE attendance_internal_day;
 * (zaniknou jen naplánované interní dny, smazané omluvy rollback nevrátí).
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   npx tsx scripts/migrate-iter-040-interni-schuzky.ts   (načítá DATABASE_URL z .env.local)
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

const INTERNAL_COLUMNS: ColumnRow[] = [
  { column_name: "attendance_date", data_type: "date", is_nullable: "NO" },
  { column_name: "created_by", data_type: "uuid", is_nullable: "YES" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
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
  console.log("Running iter-040 interní schůzka migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  const expectHost = process.env.EXPECT_DB_HOST;
  if (expectHost && !hostOf(process.env.DATABASE_URL).includes(expectHost)) {
    fail(`host databáze neobsahuje EXPECT_DB_HOST=${expectHost}, migrace se nespustí`);
  }

  // [0/4] smoke test: stejný tvar DO bloku jako krok [2/4], dočasné tabulky.
  // Hodnota '5s' je doslovná, uvnitř $$ žádná interpolace (LL-006).
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter040_member_smoke (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    ) ON COMMIT DROP;
    CREATE TEMPORARY TABLE IF NOT EXISTS _iter040_internal_smoke (
      attendance_date DATE        PRIMARY KEY,
      created_by      UUID        REFERENCES _iter040_member_smoke(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ) ON COMMIT DROP;
  END $$`;
  console.log("  [0/4] smoke test OK (DO blok: set_config, CREATE TABLE IF NOT EXISTS s PK a inline FK ON DELETE SET NULL)");

  // [1/4] snímek před (bez hesla, jen stav)
  const memberCols = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member'`) as { n: number }[];
  if (!memberCols[0]?.n) fail("tabulka member nenalezena (špatná databáze?)");
  const before = (await sql`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'attendance_internal_day'`) as { n: number }[];
  console.log(`  [1/4] snímek před: tabulka attendance_internal_day ${before[0]?.n ? "už existuje" : "chybí"}`);

  // [2/4] tabulka (arch 3.1)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS attendance_internal_day (
      attendance_date DATE        PRIMARY KEY,
      created_by      UUID        REFERENCES member(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END $$`;
  console.log("  [2/4] attendance_internal_day ensured");

  // [3/4] kontroly
  const cols = (await sql`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'attendance_internal_day'
    ORDER BY ordinal_position`) as ColumnRow[];
  if (cols.length !== INTERNAL_COLUMNS.length) {
    fail(`[3a] očekáváno ${INTERNAL_COLUMNS.length} sloupců, nalezeno ${cols.length}`);
  }
  INTERNAL_COLUMNS.forEach((e, i) => {
    const a = cols[i];
    if (a.column_name !== e.column_name || a.data_type !== e.data_type || a.is_nullable !== e.is_nullable) {
      fail(`[3a] sloupec #${i} nesedí: očekáváno ${JSON.stringify(e)}, nalezeno ${JSON.stringify(a)}`);
    }
  });
  console.log("  [3a] sloupce a typy sedí");

  const pk = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'attendance_internal_day'`) as { indexname: string }[];
  if (pk.length !== 1 || pk[0].indexname !== "attendance_internal_day_pkey") {
    fail(`[3b] očekáván jediný index attendance_internal_day_pkey, nalezeno ${JSON.stringify(pk)}`);
  }
  console.log("  [3b] index attendance_internal_day_pkey");

  const fks = (await sql`
    SELECT a.attname AS column_name, c.confdeltype::text AS confdeltype,
           c.confrelid::regclass::text AS referenced
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.attendance_internal_day'::regclass AND c.contype = 'f'`) as {
    column_name: string;
    confdeltype: string;
    referenced: string;
  }[];
  if (
    fks.length !== 1 ||
    fks[0].column_name !== "created_by" ||
    fks[0].confdeltype !== "n" ||
    fks[0].referenced !== "member"
  ) {
    fail(`[3c] FK created_by -> member ON DELETE SET NULL nesedí: ${JSON.stringify(fks)}`);
  }
  console.log("  [3c] FK created_by -> member, ON DELETE SET NULL");

  // Jen čtení: funkce s explicitním seznamem práv nové právo nedostanou samy.
  const functions = (await sql`
    SELECT name FROM chapter_function
    WHERE permissions IS NOT NULL
      AND NOT ('admin-delegable' = ANY(permissions))
      AND NOT ('attendance.internal_manage' = ANY(permissions))
    ORDER BY name`) as { name: string }[];
  console.log(
    `  [3d] funkce s ručně upraveným seznamem práv bez attendance.internal_manage: ${
      functions.length === 0 ? "žádné" : functions.map((f) => f.name).join(", ")
    }`
  );

  // [4/4] souhrn (jen počet)
  const summary = (await sql`SELECT count(*)::int AS n FROM attendance_internal_day`) as { n: number }[];
  console.log(`  [4/4] počet řádků attendance_internal_day: ${summary[0]?.n}`);
  console.log("\niter-040 interní schůzka migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
