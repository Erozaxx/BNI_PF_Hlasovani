/**
 * Migrace pro iter-043 (část B, samoobsluha „Zapomněl(a) jsem heslo", arch
 * T-001b bod 4, gate T-002). Aditivní a idempotentní:
 *
 *   - CHECK `mll_purpose_check` na `member_login_link` se rozšíří o třetí
 *     účel: `purpose IN ('login', 'set-password', 'password-reset')`. Jeden
 *     příkaz `DROP CONSTRAINT IF EXISTS ..., ADD CONSTRAINT ...`, tabulka má
 *     desítky řádků.
 *   - částečný unikátní index `mll_one_active_password_reset` (nejvýš jeden
 *     nepoužitý `password-reset` na člena), nad ním běží UPSERT žádosti.
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti projektové DB.
 * `.env.local` míří na produkční Neon, dev databáze neexistuje. Nejdřív se
 * spustí na dočasné větvi Neonu (LL-010), druhé spuštění musí projít beze
 * změny, teprve potom na PROD PŘED testováním v preview i PŘED mergem (preview
 * běží nad PROD DB, Vercel deployuje na merge). Starý kód s novým CHECK funguje
 * (nadmnožina hodnot). Nový kód bez migrace: UPSERT spadne (23514 nebo 42P10),
 * chyba se chytí, odpověď na /login je stejná, mail neodejde.
 *
 * lock_timeout (LL-006): DDL běží v DO blocích, které nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je v blocích napsaná DOSLOVNĚ, UVNITŘ `$$ … $$` NENÍ ŽÁDNÁ JS
 * interpolace (LL-006 bod 1).
 *
 * Krok [0/4] je smoke test (LL-006 bod 2): PŘESNĚ stejný tvar DO bloků jako
 * kroky [2/4] a [3/4] (set_config, DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT
 * CHECK v jednom ALTER, CREATE UNIQUE INDEX IF NOT EXISTS s predikátem) na
 * dočasné tabulce. Selže-li, runner skončí exit 1 dřív, než cokoli změní.
 *
 * Krok [4/4] jsou kontrolní dotazy, exit 1 při neshodě: CHECK obsahuje tři
 * hodnoty, index existuje s predikátem a je unikátní, původní omezení zůstala,
 * žádný řádek s jiným účelem než ze tří hodnot.
 *
 * Kontrola hostu: skript vypíše cílovou databázi bez hesla. Proměnná prostředí
 * `EXPECT_DB_HOST` je POVINNÁ (aspoň 6 znaků) a musí se rovnat celému hostu
 * z `DATABASE_URL` nebo jeho prvnímu DNS labelu (`ep-…`, ne podřetězec, ne doména
 * `neon.tech`), jinak exit 1. Chybějící proměnná zastaví skript dřív, než se
 * načte `.env.local` (PROD).
 *
 * ROLLBACK: vrátit kód; CHECK i index nechat (starý kód `password-reset` nečte,
 * jeho odkaz skončí jako „Odkaz už neplatí“). Úplný návrat:
 *   DELETE FROM member_login_link WHERE purpose = 'password-reset';
 *   a vrátit CHECK na dvě hodnoty, DROP INDEX mll_one_active_password_reset;
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   EXPECT_DB_HOST=ep-... npx tsx scripts/migrate-iter-043-heslo.ts   (načítá DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { assertApplyAllowed, assertExpectHostGiven, hostOfUrl } from "../lib/attendance/palms";

// Bez EXPECT_DB_HOST se nesmí sáhnout ani na .env.local.
try {
  assertExpectHostGiven(true, process.env.EXPECT_DB_HOST);
} catch (err) {
  console.error(`FATAL: ${(err as Error).message}`);
  process.exit(1);
}

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

async function main() {
  console.log("Running iter-043 heslo (password-reset) migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  try {
    assertApplyAllowed(true, process.env.EXPECT_DB_HOST, hostOfUrl(process.env.DATABASE_URL));
  } catch (err) {
    fail(`${(err as Error).message} Migrace se nespustí.`);
  }

  // [0/4] smoke test: stejný tvar DO bloků jako kroky [2/4] a [3/4], dočasná
  // tabulka. Hodnota '5s' je doslovná, uvnitř $$ žádná interpolace (LL-006).
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter043_mll_smoke (
      id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id UUID NOT NULL,
      purpose   TEXT NOT NULL,
      used_at   TIMESTAMPTZ,
      CONSTRAINT iter043_smoke_purpose_check CHECK (purpose IN ('login', 'set-password'))
    ) ON COMMIT DROP;
    ALTER TABLE _iter043_mll_smoke
      DROP CONSTRAINT IF EXISTS iter043_smoke_purpose_check,
      ADD CONSTRAINT iter043_smoke_purpose_check CHECK (purpose IN ('login', 'set-password', 'password-reset'));
    CREATE UNIQUE INDEX IF NOT EXISTS iter043_smoke_one_active_password_reset
      ON _iter043_mll_smoke (member_id) WHERE purpose = 'password-reset' AND used_at IS NULL;
  END $$`;
  console.log("  [0/4] smoke test OK (DO blok: set_config, DROP + ADD CHECK v jednom ALTER, CREATE UNIQUE INDEX IF NOT EXISTS s predikátem)");

  // [1/4] snímek před (bez hesla a tokenů, jen stav)
  const tableRows = (await sql`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'member_login_link'`) as { n: number }[];
  if (!tableRows[0]?.n) fail("tabulka member_login_link nenalezena (špatná databáze, chybí migrace iter-032?)");
  const beforeDef = (await sql`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.member_login_link'::regclass AND conname = 'mll_purpose_check'`) as { def: string }[];
  const beforeIdx = (await sql`
    SELECT count(*)::int AS n FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'member_login_link'
      AND indexname = 'mll_one_active_password_reset'`) as { n: number }[];
  console.log(
    `  [1/4] snímek před: CHECK ${beforeDef[0] ? "existuje" : "chybí"}, index mll_one_active_password_reset ${beforeIdx[0]?.n ? "už existuje" : "chybí"}`
  );

  // [2/4] CHECK na tři hodnoty (jeden příkaz)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE member_login_link
      DROP CONSTRAINT IF EXISTS mll_purpose_check,
      ADD CONSTRAINT mll_purpose_check CHECK (purpose IN ('login', 'set-password', 'password-reset'));
  END $$`;
  console.log("  [2/4] mll_purpose_check rozšířen o 'password-reset'");

  // [3/4] částečný unikátní index
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE UNIQUE INDEX IF NOT EXISTS mll_one_active_password_reset
      ON member_login_link (member_id) WHERE purpose = 'password-reset' AND used_at IS NULL;
  END $$`;
  console.log("  [3/4] mll_one_active_password_reset ensured");

  // [4/4] kontroly
  const def = (await sql`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE conrelid = 'public.member_login_link'::regclass AND conname = 'mll_purpose_check'`) as { def: string }[];
  if (def.length !== 1 || !["login", "set-password", "password-reset"].every((v) => def[0].def.includes(`'${v}'`))) {
    fail(`[4a] mll_purpose_check nemá tři hodnoty: ${JSON.stringify(def)}`);
  }
  console.log("  [4a] CHECK mll_purpose_check obsahuje login, set-password, password-reset");

  const idx = (await sql`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'member_login_link'
      AND indexname = 'mll_one_active_password_reset'`) as { indexdef: string }[];
  const d = idx[0]?.indexdef ?? "";
  if (
    idx.length !== 1 ||
    !d.includes("UNIQUE") ||
    !d.includes("(member_id)") ||
    !d.includes("password-reset") ||
    !d.includes("used_at IS NULL")
  ) {
    fail(`[4b] index mll_one_active_password_reset nesedí: ${JSON.stringify(idx)}`);
  }
  console.log("  [4b] index mll_one_active_password_reset je unikátní, predikát purpose a used_at IS NULL");

  const others = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'member_login_link'
      AND indexname IN ('mll_one_active_set_password', 'idx_mll_member_id', 'mll_token_hash_unique')`) as {
    indexname: string;
  }[];
  if (others.length !== 3) {
    fail(`[4c] původní indexy member_login_link nejsou kompletní: ${JSON.stringify(others)}`);
  }
  console.log("  [4c] původní indexy zůstaly");

  const bad = (await sql`
    SELECT count(*)::int AS n FROM member_login_link
    WHERE purpose NOT IN ('login', 'set-password', 'password-reset')`) as { n: number }[];
  if (bad[0]?.n !== 0) fail(`[4d] řádky s neznámým účelem: ${bad[0]?.n}`);
  console.log("  [4d] žádný řádek s neznámým účelem");

  console.log("\niter-043 heslo (password-reset) migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
