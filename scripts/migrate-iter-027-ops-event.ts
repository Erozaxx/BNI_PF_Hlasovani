/**
 * Migration for iter-027 (T-005): "ops_event — historie běhů" (arch
 * iter-027 T-001, sekce 11). Zakládá JEDNU novou tabulku a čtyři indexy.
 * Nesahá na žádnou existující tabulku, sloupec ani constraint — jediný
 * dotyk existujících tabulek jsou dva cizí klíče do meeting a member (krátký
 * zámek na katalogu, ne přepis dat). Tohle je záměrně méně rizikové než
 * iter-021 (ta měnila existující, zaplněné tabulky).
 *
 * DULEZITE — tenhle soubor NENI soucasti T-005 spusteni. Coder (T-005) ho
 * NAPSAL, NESPUSTIL. `.env.local` v tomto repu miri na produkcni Neon —
 * zadna dev DB neexistuje. Spusteni je samostatny task (T-009, drzitel
 * produkcniho DATABASE_URL), a smi probehnout KDYKOLI vuci mergi PR (11.5):
 *   - Migrace ano, merge ne: tabulka existuje, nasazeny kod o ni nevi. Nulovy
 *     dopad.
 *   - Merge ano, migrace ne: kazdy INSERT do ops_event skonci 42P01
 *     undefined_table. logOpsEvent (lib/ops/event-log.ts, D2) to spolkne a
 *     vypise "[ops-log]" do konzole — hlasovani se rozesle normalne, cron
 *     dobehne, maily odejdou. Migrace se pusti dodatecne.
 * Na rozdil od iter-021 tady NEZALEZI na presnem poradi vuci mergi — obe
 * poradi jsou bez dopadu na bezici hlasovani.
 *
 * lock_timeout (11.2): CREATE TABLE bezi v DO bloku, ktery nejdriv nastavi
 * transakcne-lokalni lock_timeout pres set_config('lock_timeout', '5s',
 * true) (ekvivalent SET LOCAL) — nutne kvuli neon-http driveru (zadna
 * session kontinuita mezi volanimi, kazde `await sql\`...\`` je samostatny
 * HTTP pozadavek / samostatna implicitni transakce). LOCK_TIMEOUT je
 * compile-time konstanta, psana DOSLOVA — NIKDY pres JS template
 * interpolaci ${...} uvnitr DO $$ ... $$ bloku (LL-006 bod 1:
 * @neondatabase/serverless prevadi ${...} v sql`...` na bind parametr mimo
 * text dotazu, ale Postgres lexer cte obsah dollar-quoted stringu jako
 * doslovny text — bind by selhal na "bind message supplies 1 parameters,
 * but prepared statement requires 0").
 *
 * CREATE INDEX, ne CREATE INDEX CONCURRENTLY: CONCURRENTLY nesmi bezet
 * uvnitr transakcniho bloku a neon-http kazdy prikaz zabali do implicitni
 * transakce. Na cerstve prazdne tabulce je bezny CREATE INDEX okamzity,
 * proto indexy (kroky 2-5) NEJSOU v DO bloku — IF NOT EXISTS je pro CREATE
 * INDEX nativni syntaxe, zadny lock_timeout obchod neni potreba.
 *
 * severity CHECK bez NOT VALID + VALIDATE (na rozdil od iter-021): tabulka
 * je v okamziku kroku 6 zarucene prazdna (vznikla v TOMTEZ behu runneru,
 * pred mergem do ni nikdo nemuze zapisovat) — plna validace prazdne tabulky
 * je okamzita, dvoufazovy NOT VALID/VALIDATE postup by tu byl zbytecna
 * ceremonie. kind CHECK vedome NENI — autoritou je TS union OpsEventKind
 * (lib/ops/types.ts, arch 3.2): databaze nepohlida preklep v kind,
 * TypeScript ano, a chybny kind v logu nikomu neublizi.
 *
 * Krok [0/7] — smoke test (LL-006 bod 2): overuje PRESNE ten tvar SQL, ktery
 * pouziva krok [1/7] (DO blok + set_config s doslovnou hodnotou + CREATE
 * TABLE), na jednorazove teplotni tabulce (CREATE TEMPORARY TABLE ... ON
 * COMMIT DROP), aby se nesahalo na realne schema. Kdyz tenhle statement
 * selze, runner skonci exit 1 drive, nez cokoli zmeni na realne tabulce.
 *
 * ROLLBACK: `DROP TABLE IF EXISTS ops_event;`. Nic na ni neodkazuje (zadny
 * jiny kod v repu ops_event nectte/nezapisuje mimo lib/ops a
 * lib/db/queries/ops-events.ts).
 *
 * Run (PROD, jen T-009, ne T-005): npx tsx scripts/migrate-iter-027-ops-event.ts
 *   (nacita DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

// LOCK_TIMEOUT je '5s' napsane DOSLOVNE v kazdem DO $$ ... $$ bloku nize
// (kroky [0/7] a [1/7], [6/7]), NIKDY pres JS template interpolaci ${...}.
// Duvod viz hlavickovy komentar (LL-006 bod 1).

async function main() {
  console.log("Running iter-027 ops_event migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  // [0/7] smoke test — presne tvar DO blok + set_config + CREATE TABLE jako
  // krok [1/7], na jednorazove teplotni tabulce. Zadny fallback pri selhani.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter027_smoke_test (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      note TEXT NOT NULL
    ) ON COMMIT DROP;
  END $$`;
  console.log("  [0/7] smoke test OK (DO blok + set_config + CREATE TABLE prosel neon-http driverem)");

  // [1/7] CREATE TABLE ops_event
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS ops_event (
      id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      run_id              UUID        NOT NULL,
      seq                 INTEGER     NOT NULL DEFAULT 0,
      occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source              TEXT        NOT NULL,
      kind                TEXT        NOT NULL,
      severity            TEXT        NOT NULL,
      actor               TEXT,
      meeting_id          UUID        REFERENCES meeting(id) ON DELETE SET NULL,
      meeting_date        DATE,
      member_id           UUID        REFERENCES member(id) ON DELETE SET NULL,
      member_name         TEXT,
      email               TEXT,
      code                TEXT,
      message             TEXT        NOT NULL,
      detail              JSONB,
      resend_email_id     TEXT,
      resend_message_id   TEXT,
      delivery_status     TEXT,
      delivery_checked_at TIMESTAMPTZ
    );
  END $$`;
  console.log("  [1/7] ops_event table ensured");

  // [2/7] výpis + retence
  await sql`CREATE INDEX IF NOT EXISTS idx_ops_event_occurred_at ON ops_event (occurred_at DESC)`;
  console.log("  [2/7] idx_ops_event_occurred_at ensured");

  // [3/7] detail běhu
  await sql`CREATE INDEX IF NOT EXISTS idx_ops_event_run_id ON ops_event (run_id, seq)`;
  console.log("  [3/7] idx_ops_event_run_id ensured");

  // [4/7] případ Kateřiny — historie člena
  await sql`CREATE INDEX IF NOT EXISTS idx_ops_event_member_id ON ops_event (member_id, occurred_at DESC)`;
  console.log("  [4/7] idx_ops_event_member_id ensured");

  // [5/7] filtr na schůzku
  await sql`CREATE INDEX IF NOT EXISTS idx_ops_event_meeting_id ON ops_event (meeting_id, occurred_at DESC)`;
  console.log("  [5/7] idx_ops_event_meeting_id ensured");

  // [6/7] CHECK na severity — idempotentní přes podmínku na pg_constraint
  const c1 = await sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ops_event_severity_check'
      AND conrelid = 'ops_event'::regclass`;
  if (c1.length === 0) {
    await sql`DO $$ BEGIN
      PERFORM set_config('lock_timeout', '5s', true);
      ALTER TABLE ops_event
        ADD CONSTRAINT ops_event_severity_check
        CHECK (severity IN ('info', 'warn', 'error'));
    END $$`;
    console.log("  [6/7] ops_event_severity_check added");
  } else {
    console.log("  [6/7] ops_event_severity_check already exists, skipped");
  }

  // [7/7] důkaz, že tabulka přijímá zápisy — a zároveň první záznam, který
  // uvidí status stránka (T-006). NENÍ idempotence-guardované: opakované
  // spuštění runneru přidá další řádek, a to je v logu v pořádku (11.3) —
  // je to záznam, že migrace běžela podruhé.
  await sql`
    INSERT INTO ops_event (run_id, seq, source, kind, severity, message)
    VALUES (gen_random_uuid(), 0, 'system', 'migration.applied', 'info',
            'Migrace iter-027 (ops_event) provedena.')`;
  console.log("  [7/7] migration.applied event written");

  console.log("\niter-027 ops_event migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * ============================================================
 * T-009 VERIFICATION QUERIES (arch iter-027 T-001, sekce 11.4)
 * Spustit RUCNE po migraci na PROD. Posledni dva dotazy dokazuji, ze
 * migrace na bezici hlasovani nesahla — bez nich je "nesaha na existujici
 * tabulky" tvrzeni, ne zjisteni.
 * ============================================================
 *
 * -- PŘED spuštěním (musí sedět všechny čtyři):
 * SELECT current_database(), current_user;
 * SELECT to_regclass('public.ops_event');                     -- MUSI byt NULL
 * SELECT count(*) FROM meeting_member_link;                   -- baseline, zapsat si
 * SELECT count(*) FROM meeting WHERE status = 'voting';       -- baseline, zapsat si
 *
 * -- PO spuštění:
 * SELECT to_regclass('public.ops_event');                     -- NOT NULL
 * SELECT count(*) FROM information_schema.columns
 *   WHERE table_name = 'ops_event';                           -- 20
 * SELECT indexname FROM pg_indexes WHERE tablename = 'ops_event';   -- 5 (pkey + 4)
 * SELECT conname FROM pg_constraint
 *   WHERE conrelid = 'ops_event'::regclass;                   -- pkey, 2x FK, 1x CHECK
 * SELECT count(*) FROM ops_event;                             -- 1 (migration.applied)
 * SELECT kind, message FROM ops_event;                        -- vidim ten radek
 * SELECT count(*) FROM meeting_member_link;                   -- STEJNE jako pred
 * SELECT count(*) FROM meeting WHERE status = 'voting';       -- STEJNE jako pred
 */
