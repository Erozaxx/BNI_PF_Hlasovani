/**
 * Migrace pro iter-042 (Nastavení chapteru, arch T-001 sekce B5 a B6, gate
 * T-002). Aditivní a idempotentní, jediná změna je nová tabulka:
 *
 *   - `chapter_settings` (jediný řádek `id = 1`): přepínače Master mind, Burza
 *     a Interní semafor, den a začátek pravidelné schůzky, `updated_at` a
 *     `updated_by` s FK na `member` ON DELETE SET NULL. Výchozí hodnoty jsou
 *     dnešní chování (čtvrtek 7:30, vše zapnuto). Řádek se zakládá
 *     `INSERT ... ON CONFLICT (id) DO NOTHING`, opakovaný běh ho nepřepíše.
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti projektové DB.
 * `.env.local` míří na produkční Neon, dev databáze neexistuje. Nejdřív se
 * spustí na dočasné větvi Neonu (LL-010), druhé spuštění musí projít beze
 * změny, teprve potom na PROD PŘED testováním v preview i PŘED mergem (preview
 * běží nad PROD DB, Vercel deployuje na merge). Čtení nastavení při chybějící
 * tabulce (42P01) spadne na výchozí hodnoty, ale uložení nastavení bez migrace
 * selže. Starý kód tabulku nečte, migrace mu nevadí.
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
 * krok [2/4] (set_config, CREATE TABLE IF NOT EXISTS s PK, třemi CHECK a inline
 * FK ON DELETE SET NULL) na dočasných tabulkách. Selže-li, runner skončí
 * exit 1 dřív, než cokoli změní.
 *
 * Krok [4/4] jsou kontrolní dotazy, exit 1 při neshodě: sloupce a typy,
 * `chapter_settings_pkey`, tři CHECK podle názvu a definice, FK `updated_by`
 * s `confdeltype = 'n'`, právě jeden řádek (u prvního běhu s výchozími
 * hodnotami, u opakovaného jen kontrola, že řádek existuje a splňuje CHECK).
 * Navíc jen čtení: výpis funkcí s explicitním seznamem práv, které nové právo
 * `chapter.settings` nedostanou (jen názvy funkcí).
 *
 * Kontrola hostu: skript vypíše cílovou databázi bez hesla. Proměnná prostředí
 * `EXPECT_DB_HOST` je POVINNÁ (aspoň 6 znaků) a musí se rovnat celému hostu
 * z `DATABASE_URL` nebo jeho prvnímu DNS labelu (`ep-…`, ne podřetězec, ne doména
 * `neon.tech`), jinak exit 1. Stejná kontrola jako PALMS v iter-041
 * (`assertApplyAllowed` v `lib/attendance/palms.ts`). Chybějící proměnná
 * zastaví skript dřív, než se načte `.env.local` (PROD).
 *
 * ROLLBACK: vrátit kód; tabulku nechat (starý kód ji nečte), nebo ručně
 *   DROP TABLE chapter_settings;
 * (zaniknou jen uložené přepínače a čas schůzky, aplikace se vrátí ke
 * čtvrtku 7:30 a všem částem zapnutým).
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   npx tsx scripts/migrate-iter-042-nastaveni.ts   (načítá DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { assertApplyAllowed, assertExpectHostGiven, hostOfUrl } from "../lib/attendance/palms";

// L-2 (security iter-042): bez EXPECT_DB_HOST se nesmí sáhnout ani na .env.local.
try {
  assertExpectHostGiven(true, process.env.EXPECT_DB_HOST);
} catch (err) {
  console.error(`FATAL: ${(err as Error).message}`);
  process.exit(1);
}

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
}

const TS = "timestamp with time zone";

/** Očekávané sloupce (pořadí jako v CREATE TABLE). Default se kontroluje jen u těch, kde na něm záleží. */
const SETTINGS_COLUMNS: (Omit<ColumnRow, "column_default"> & { default_includes: string | null })[] = [
  { column_name: "id", data_type: "smallint", is_nullable: "NO", default_includes: "1" },
  { column_name: "mastermind_enabled", data_type: "boolean", is_nullable: "NO", default_includes: "true" },
  { column_name: "burza_enabled", data_type: "boolean", is_nullable: "NO", default_includes: "true" },
  { column_name: "semafor_enabled", data_type: "boolean", is_nullable: "NO", default_includes: "true" },
  { column_name: "meeting_weekday", data_type: "smallint", is_nullable: "NO", default_includes: "4" },
  { column_name: "meeting_time", data_type: "time without time zone", is_nullable: "NO", default_includes: "07:30" },
  { column_name: "updated_at", data_type: TS, is_nullable: "NO", default_includes: "now()" },
  { column_name: "updated_by", data_type: "uuid", is_nullable: "YES", default_includes: null },
];

const EXPECTED_CHECKS = [
  { name: "chapter_settings_singleton", includes: ["id", "1"] },
  { name: "chapter_settings_weekday", includes: ["meeting_weekday", "0", "6"] },
  { name: "chapter_settings_time", includes: ["meeting_time", "07:00", "11:00"] },
];

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

async function main() {
  console.log("Running iter-042 nastavení chapteru migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  try {
    assertApplyAllowed(true, process.env.EXPECT_DB_HOST, hostOfUrl(process.env.DATABASE_URL));
  } catch (err) {
    fail(`${(err as Error).message} Migrace se nespustí.`);
  }

  // [0/4] smoke test: stejný tvar DO bloku jako krok [2/4], dočasné tabulky.
  // Hodnota '5s' je doslovná, uvnitř $$ žádná interpolace (LL-006).
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter042_member_smoke (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    ) ON COMMIT DROP;
    CREATE TEMPORARY TABLE IF NOT EXISTS _iter042_settings_smoke (
      id                 SMALLINT    PRIMARY KEY DEFAULT 1,
      mastermind_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
      burza_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
      semafor_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
      meeting_weekday    SMALLINT    NOT NULL DEFAULT 4,
      meeting_time       TIME        NOT NULL DEFAULT '07:30',
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         UUID        REFERENCES _iter042_member_smoke(id) ON DELETE SET NULL,
      CONSTRAINT iter042_smoke_singleton CHECK (id = 1),
      CONSTRAINT iter042_smoke_weekday CHECK (meeting_weekday BETWEEN 0 AND 6),
      CONSTRAINT iter042_smoke_time CHECK (meeting_time BETWEEN TIME '07:00' AND TIME '11:00')
    ) ON COMMIT DROP;
  END $$`;
  console.log("  [0/4] smoke test OK (DO blok: set_config, CREATE TABLE IF NOT EXISTS s PK, třemi CHECK a inline FK ON DELETE SET NULL)");

  // [1/4] snímek před (bez hesla, jen stav)
  const memberCols = (await sql`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member'`) as { n: number }[];
  if (!memberCols[0]?.n) fail("tabulka member nenalezena (špatná databáze?)");
  const before = (await sql`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chapter_settings'`) as { n: number }[];
  console.log(`  [1/4] snímek před: tabulka chapter_settings ${before[0]?.n ? "už existuje" : "chybí"}`);

  // [2/4] tabulka (arch B5)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS chapter_settings (
      id                 SMALLINT    PRIMARY KEY DEFAULT 1,
      mastermind_enabled BOOLEAN     NOT NULL DEFAULT TRUE,
      burza_enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
      semafor_enabled    BOOLEAN     NOT NULL DEFAULT TRUE,
      meeting_weekday    SMALLINT    NOT NULL DEFAULT 4,
      meeting_time       TIME        NOT NULL DEFAULT '07:30',
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by         UUID        REFERENCES member(id) ON DELETE SET NULL,
      CONSTRAINT chapter_settings_singleton CHECK (id = 1),
      CONSTRAINT chapter_settings_weekday CHECK (meeting_weekday BETWEEN 0 AND 6),
      CONSTRAINT chapter_settings_time CHECK (meeting_time BETWEEN TIME '07:00' AND TIME '11:00')
    );
  END $$`;
  console.log("  [2/4] chapter_settings ensured");

  // [3/4] jediný řádek s výchozími hodnotami, existující se nepřepisuje
  const inserted = (await sql`
    INSERT INTO chapter_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING RETURNING id`) as { id: number }[];
  console.log(`  [3/4] řádek nastavení ${inserted.length > 0 ? "založen s výchozími hodnotami" : "už existoval, beze změny"}`);

  // [4/4] kontroly
  const cols = (await sql`
    SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chapter_settings'
    ORDER BY ordinal_position`) as ColumnRow[];
  if (cols.length !== SETTINGS_COLUMNS.length) {
    fail(`[4a] očekáváno ${SETTINGS_COLUMNS.length} sloupců, nalezeno ${cols.length}`);
  }
  SETTINGS_COLUMNS.forEach((e, i) => {
    const a = cols[i];
    if (a.column_name !== e.column_name || a.data_type !== e.data_type || a.is_nullable !== e.is_nullable) {
      fail(`[4a] sloupec #${i} nesedí: očekáváno ${JSON.stringify(e)}, nalezeno ${JSON.stringify(a)}`);
    }
    if (e.default_includes !== null && !(a.column_default ?? "").includes(e.default_includes)) {
      fail(`[4a] výchozí hodnota sloupce ${e.column_name} nesedí: očekáváno obsahuje ${e.default_includes}, nalezeno ${a.column_default}`);
    }
  });
  console.log("  [4a] sloupce, typy a výchozí hodnoty sedí");

  const pk = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'chapter_settings'`) as { indexname: string }[];
  if (pk.length !== 1 || pk[0].indexname !== "chapter_settings_pkey") {
    fail(`[4b] očekáván jediný index chapter_settings_pkey, nalezeno ${JSON.stringify(pk)}`);
  }
  console.log("  [4b] index chapter_settings_pkey");

  const checks = (await sql`
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.chapter_settings'::regclass AND contype = 'c'
    ORDER BY conname`) as { conname: string; def: string }[];
  if (checks.length !== EXPECTED_CHECKS.length) {
    fail(`[4c] očekávány ${EXPECTED_CHECKS.length} CHECK, nalezeno ${JSON.stringify(checks)}`);
  }
  for (const e of EXPECTED_CHECKS) {
    const found = checks.find((c) => c.conname === e.name);
    if (!found || !e.includes.every((part) => found.def.includes(part))) {
      fail(`[4c] CHECK ${e.name} nesedí: ${JSON.stringify(found)}`);
    }
  }
  console.log("  [4c] CHECK singleton, weekday, time");

  const fks = (await sql`
    SELECT a.attname AS column_name, c.confdeltype::text AS confdeltype,
           c.confrelid::regclass::text AS referenced
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.chapter_settings'::regclass AND c.contype = 'f'`) as {
    column_name: string;
    confdeltype: string;
    referenced: string;
  }[];
  if (
    fks.length !== 1 ||
    fks[0].column_name !== "updated_by" ||
    fks[0].confdeltype !== "n" ||
    fks[0].referenced !== "member"
  ) {
    fail(`[4d] FK updated_by -> member ON DELETE SET NULL nesedí: ${JSON.stringify(fks)}`);
  }
  console.log("  [4d] FK updated_by -> member, ON DELETE SET NULL");

  const rows = (await sql`
    SELECT id, mastermind_enabled, burza_enabled, semafor_enabled, meeting_weekday,
           to_char(meeting_time, 'HH24:MI') AS meeting_time
    FROM chapter_settings`) as {
    id: number;
    mastermind_enabled: boolean;
    burza_enabled: boolean;
    semafor_enabled: boolean;
    meeting_weekday: number;
    meeting_time: string;
  }[];
  if (rows.length !== 1 || rows[0].id !== 1) {
    fail(`[4e] očekáván právě jeden řádek s id = 1, nalezeno ${JSON.stringify(rows)}`);
  }
  if (inserted.length > 0) {
    const r = rows[0];
    if (!r.mastermind_enabled || !r.burza_enabled || !r.semafor_enabled || r.meeting_weekday !== 4 || r.meeting_time !== "07:30") {
      fail(`[4e] čerstvě založený řádek nemá výchozí hodnoty: ${JSON.stringify(r)}`);
    }
  }
  console.log(
    `  [4e] právě jeden řádek (${inserted.length > 0 ? "výchozí hodnoty ověřeny" : "existující, hodnoty se nekontrolují"})`
  );

  // Jen čtení: funkce s explicitním seznamem práv nové právo nedostanou samy.
  const functions = (await sql`
    SELECT name FROM chapter_function
    WHERE permissions IS NOT NULL
      AND NOT ('admin-delegable' = ANY(permissions))
      AND NOT ('chapter.settings' = ANY(permissions))
    ORDER BY name`) as { name: string }[];
  console.log(
    `  [4f] funkce s ručně upraveným seznamem práv bez chapter.settings: ${
      functions.length === 0 ? "žádné" : functions.map((f) => f.name).join(", ")
    }`
  );

  console.log("\niter-042 nastavení chapteru migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
