/**
 * Migrace pro iter-028 (T-006): "Evidence připomínek a migrace" (arch
 * iter-028 T-001, sekce 6). Zakládá JEDNU novou tabulku
 * (`meeting_member_reminder`) a jeden index. Nesahá na žádný existující
 * sloupec ani řádek — jediný dotyk existujících tabulek jsou dva cizí klíče
 * do meeting a member (krátký zámek na katalogu, ne přepis dat), stejně jako
 * u iter-027.
 *
 * DULEZITE — tenhle soubor NENI soucasti T-006 spusteni. Coder (T-006) ho
 * NAPSAL, NESPUSTIL. `.env.local` v tomto repu miri na produkcni Neon —
 * zadna dev DB neexistuje. Nejdriv se novy SQL vzor overi na docasne vetvi
 * Neonu v T-008 (LL-010, Docker v teto WSL distribuci neni), teprve pak na
 * produkci v T-009 — PRED mergem (arch 6.5, 12): pri obracenem poradi (merge
 * pred migraci) fáze 8 cronu padne na 42P01 v kroku 3 (ctni pripomínek),
 * PRED prvnim mailem, zapise `cron.phase-failed` (`phase-8-reminders`) a
 * souhrn behu ukaze `partial` (arch 7.1) — faze 1 az 7 (vc. odlozeneho
 * rozeslani z T-005) bezi normalne, hlasovani samotne se nerozbije. Ověření
 * tokenu z připomínky (D4 C, 4.5) při chybějící tabulce vrátí `invalid`
 * (42P01 → invalid), hlavní ověření (token nalezený v meeting_member_link)
 * funguje beze změny.
 *
 * lock_timeout (LL-006): CREATE TABLE bezi v DO bloku, ktery nejdriv nastavi
 * transakcne-lokalni lock_timeout pres set_config('lock_timeout', '5s',
 * true) — nutne kvuli neon-http driveru (zadna session kontinuita mezi
 * volanimi). LOCK_TIMEOUT je compile-time konstanta, psana DOSLOVA — NIKDY
 * pres JS template interpolaci ${...} uvnitr DO $$ ... $$ bloku (LL-006 bod
 * 1: @neondatabase/serverless prevadi ${...} v sql`...` na bind parametr
 * mimo text dotazu, ale Postgres lexer cte obsah dollar-quoted stringu jako
 * doslovny text — bind by selhal na "bind message supplies 1 parameters, but
 * prepared statement requires 0").
 *
 * CREATE INDEX, ne CREATE INDEX CONCURRENTLY: stejne zdovodneni jako
 * iter-027 — na cerstve prazdne tabulce je bezny CREATE INDEX okamzity a
 * CONCURRENTLY nesmi bezet uvnitr implicitni transakce neon-http.
 *
 * Krok [0/4] — smoke test (LL-006 bod 2, arch 6.3): overuje PRESNE ten SQL
 * tvar jako krok [1/4] (DO blok + set_config s doslovnou hodnotou + CREATE
 * TABLE), STEJNYCH 8 SLOUPCU, CHECK a OBOU UNIQUE jako realna tabulka — na
 * jednorazove teplotni tabulce (CREATE TEMPORARY TABLE ... ON COMMIT DROP)
 * BEZ cizich klicu (docasna tabulka nesmi odkazovat na trvalou). Kdyz tenhle
 * statement selze, runner skonci exit 1 drive, nez cokoli zmeni na realne
 * tabulce.
 *
 * Krok [3/4] — kontrolni dotazy (arch 6.4 a az d) bezi PRIMO v runneru (na
 * rozdil od iter-027, kde byly jen komentar pro rucni T-009 overeni) —
 * runner skonci exit 1 pri jakekoli neshode: 8 sloupcu ve spravnem poradi a
 * typech, 6 omezeni (pkey, CHECK, 2x UNIQUE, 2x FK), 4 indexy (pkey + obe
 * UNIQUE + idx_mmr_member_id), a prazdna tabulka (0 radku).
 *
 * ROLLBACK: `DROP TABLE IF EXISTS meeting_member_reminder;`. Nic jineho na ni
 * neodkazuje. S nasazenym kodem T-006 to znamena jen konec pripominek (6.5)
 * — hlavni hlasovani a odlozene rozeslani (T-005) na ni nesahaji.
 *
 * Run (nejdriv T-008 na vetvi Neonu, LL-010; pak T-009 na PROD, PRED mergem):
 *   npx tsx scripts/migrate-iter-028-reminders.ts   (nacita DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

// LOCK_TIMEOUT je '5s' napsane DOSLOVNE v kazdem DO $$ ... $$ bloku nize
// (kroky [0/4] a [1/4]), NIKDY pres JS template interpolaci ${...}. Duvod viz
// hlavickovy komentar (LL-006 bod 1).

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

interface ConstraintRow {
  conname: string;
  contype: string;
}

interface IndexRow {
  indexname: string;
}

const EXPECTED_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "meeting_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "round", data_type: "smallint", is_nullable: "NO" },
  {
    column_name: "claimed_at",
    data_type: "timestamp with time zone",
    is_nullable: "NO",
  },
  {
    column_name: "sent_at",
    data_type: "timestamp with time zone",
    is_nullable: "YES",
  },
  { column_name: "token_hash", data_type: "text", is_nullable: "YES" },
  { column_name: "link_token_hash", data_type: "text", is_nullable: "YES" },
];

const EXPECTED_NAMED_CONSTRAINTS = [
  "mmr_round_check",
  "mmr_meeting_member_round_unique",
  "mmr_token_hash_unique",
];

const EXPECTED_INDEX_NAMES = [
  "meeting_member_reminder_pkey",
  "mmr_meeting_member_round_unique",
  "mmr_token_hash_unique",
  "idx_mmr_member_id",
];

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

async function main() {
  console.log("Running iter-028 meeting_member_reminder migration...");
  console.log(
    `Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`
  );

  // [0/4] smoke test — presne tvar DO blok + set_config + CREATE TABLE jako
  // krok [1/4], stejnych 8 sloupcu, CHECK a obou UNIQUE, na jednorazove
  // teplotni tabulce, BEZ cizich klicu. Zadny fallback pri selhani.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter028_mmr_smoke (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id      UUID        NOT NULL,
      member_id       UUID        NOT NULL,
      round           SMALLINT    NOT NULL,
      claimed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at         TIMESTAMPTZ,
      token_hash      TEXT,
      link_token_hash TEXT,
      CONSTRAINT mmr_smoke_round_check CHECK (round BETWEEN 1 AND 3),
      CONSTRAINT mmr_smoke_meeting_member_round_unique UNIQUE (meeting_id, member_id, round),
      CONSTRAINT mmr_smoke_token_hash_unique UNIQUE (token_hash)
    ) ON COMMIT DROP;
  END $$`;
  console.log(
    "  [0/4] smoke test OK (DO blok + set_config + CREATE TABLE, 8 sloupcu, CHECK, obe UNIQUE, bez FK)"
  );

  // [1/4] CREATE TABLE meeting_member_reminder (arch 6.2, doslovne)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS meeting_member_reminder (
      id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      meeting_id      UUID        NOT NULL REFERENCES meeting(id) ON DELETE CASCADE,
      member_id       UUID        NOT NULL REFERENCES member(id)  ON DELETE CASCADE,
      round           SMALLINT    NOT NULL,
      claimed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at         TIMESTAMPTZ,
      token_hash      TEXT,
      link_token_hash TEXT,
      CONSTRAINT mmr_round_check CHECK (round BETWEEN 1 AND 3),
      CONSTRAINT mmr_meeting_member_round_unique UNIQUE (meeting_id, member_id, round),
      CONSTRAINT mmr_token_hash_unique UNIQUE (token_hash)
    );
  END $$`;
  console.log("  [1/4] meeting_member_reminder table ensured");

  // [2/4] idx_mmr_member_id — mimo DO blok, prazdna tabulka
  await sql`CREATE INDEX IF NOT EXISTS idx_mmr_member_id ON meeting_member_reminder (member_id)`;
  console.log("  [2/4] idx_mmr_member_id ensured");

  // [3/4] kontrolni dotazy (arch 6.4 a az d) — exit 1 pri jakekoli neshode.
  // `sql` (tagovana sablona z @neondatabase/serverless) nema generiku pro
  // tvar radku (jen pro ArrayMode/FullResults) — vysledek se dotypuje az po
  // navratu, stejny vzor jako getRecentRunIds v lib/db/queries/ops-events.ts.
  const columnsResult = (await sql`
    SELECT column_name, data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meeting_member_reminder'
    ORDER BY ordinal_position`) as ColumnRow[];
  if (columnsResult.length !== EXPECTED_COLUMNS.length) {
    fail(
      `[3/4a] ocekavano ${EXPECTED_COLUMNS.length} sloupcu, nalezeno ${columnsResult.length}`
    );
  }
  for (let i = 0; i < EXPECTED_COLUMNS.length; i++) {
    const actual = columnsResult[i];
    const expected = EXPECTED_COLUMNS[i];
    if (
      actual.column_name !== expected.column_name ||
      actual.data_type !== expected.data_type ||
      actual.is_nullable !== expected.is_nullable
    ) {
      fail(
        `[3/4a] sloupec #${i} nesedi: ocekavano ${JSON.stringify(expected)}, nalezeno ${JSON.stringify(actual)}`
      );
    }
  }
  console.log("  [3/4a] 8 sloupcu ve spravnem poradi a typech OK");

  const constraintsResult = (await sql`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid = 'public.meeting_member_reminder'::regclass ORDER BY conname`) as ConstraintRow[];
  if (constraintsResult.length !== 6) {
    fail(
      `[3/4b] ocekavano 6 omezeni (pkey, CHECK, 2x UNIQUE, 2x FK), nalezeno ${constraintsResult.length}: ${JSON.stringify(constraintsResult)}`
    );
  }
  const constraintNames = new Set(constraintsResult.map((c) => c.conname));
  for (const name of EXPECTED_NAMED_CONSTRAINTS) {
    if (!constraintNames.has(name)) {
      fail(`[3/4b] chybi ocekavane omezeni ${name}`);
    }
  }
  const fkCount = constraintsResult.filter((c) => c.contype === "f").length;
  const pkCount = constraintsResult.filter((c) => c.contype === "p").length;
  if (fkCount !== 2 || pkCount !== 1) {
    fail(
      `[3/4b] ocekavano 2 cizi klice a 1 primarni klic, nalezeno fk=${fkCount} pk=${pkCount}`
    );
  }
  console.log("  [3/4b] 6 omezeni (pkey, CHECK, 2x UNIQUE, 2x FK) OK");

  const indexesResult = (await sql`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'meeting_member_reminder'`) as IndexRow[];
  const indexNames = new Set(indexesResult.map((i) => i.indexname));
  if (indexesResult.length !== EXPECTED_INDEX_NAMES.length) {
    fail(
      `[3/4c] ocekavano ${EXPECTED_INDEX_NAMES.length} indexy, nalezeno ${indexesResult.length}: ${JSON.stringify([...indexNames])}`
    );
  }
  for (const name of EXPECTED_INDEX_NAMES) {
    if (!indexNames.has(name)) {
      fail(`[3/4c] chybi ocekavany index ${name}`);
    }
  }
  console.log("  [3/4c] 4 indexy (pkey + obe UNIQUE + idx_mmr_member_id) OK");

  const countResult = (await sql`
    SELECT count(*) FROM meeting_member_reminder`) as { count: string }[];
  const rowCount = Number(countResult[0]?.count ?? "-1");
  if (rowCount !== 0) {
    fail(`[3/4d] ocekavano 0 radku, nalezeno ${rowCount}`);
  }
  console.log("  [3/4d] tabulka je prazdna OK");

  // [4/4] dukaz, ze tabulka prijima zapisy (jako iter-027)
  await sql`
    INSERT INTO ops_event (run_id, seq, source, kind, severity, message)
    VALUES (gen_random_uuid(), 0, 'system', 'migration.applied', 'info',
            'Migrace iter-028 (meeting_member_reminder) provedena.')`;
  console.log("  [4/4] migration.applied event written");

  console.log("\niter-028 meeting_member_reminder migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * ============================================================
 * T-009 VERIFICATION QUERIES (arch iter-028 T-001, sekce 6.4) — pro rucni
 * kontrolu na PROD po behu runneru. Kroky [3/4a-d] uz tyhle dotazy overuji
 * automaticky (exit 1 pri neshode) — tenhle blok je jen pro rucni dohledani,
 * stejne jako u iter-027.
 * ============================================================
 *
 * -- PŘED (T-009): očekávám NULL; běžící hlasování jen zapsat, migraci neblokuje
 * SELECT to_regclass('public.meeting_member_reminder');
 * SELECT id, date, status, voting_closes_at FROM meeting WHERE status = 'voting';
 *
 * -- PO:
 * SELECT column_name, data_type, is_nullable FROM information_schema.columns
 *   WHERE table_schema = 'public' AND table_name = 'meeting_member_reminder'
 *   ORDER BY ordinal_position;                                  -- 8 sloupcu
 * SELECT conname, contype FROM pg_constraint
 *   WHERE conrelid = 'public.meeting_member_reminder'::regclass
 *   ORDER BY conname;                                           -- 6 omezeni
 * SELECT indexname FROM pg_indexes
 *   WHERE schemaname = 'public' AND tablename = 'meeting_member_reminder';  -- 4 indexy
 * SELECT count(*) FROM meeting_member_reminder;                 -- 0
 * -- dukaz, ze bezici hlasovani migrace neovlivnila:
 * SELECT id, date, status, voting_closes_at FROM meeting WHERE status = 'voting';  -- STEJNE jako pred
 */
