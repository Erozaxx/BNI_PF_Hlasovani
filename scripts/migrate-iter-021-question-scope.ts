/**
 * Migration for iter-021 (T-005): "Priznaky platnosti otazky" (5/10 mesicu) —
 * delta k iter-020 pohovorum. Pridava applies_month_5 / applies_month_10 na
 * interview_question I interview_question_snapshot (NOT NULL DEFAULT TRUE) +
 * CHECK "aspon jeden true" na obou tabulkach.
 *
 * DULEZITE — tenhle soubor NENI soucasti T-005 spusteni. Coder ho podle
 * gate rozhodnuti (decision_iter-021_T-004.md, delta D-1) NAPSAL, ale
 * NESPUSTIL. `.env.local` v tomto repu miri na stejny produkcni Neon
 * endpoint jako `.env.production.local` — zadna dev DB neexistuje. Spusteni
 * je samostatny task T-013, dela ho drzitel produkcniho DATABASE_URL
 * (Tomas), a MUSI probehnout PRED mergem PR do main (Vercel deployuje na
 * merge; opacne poradi = 42703 undefined_column na kazdem cteni otazek).
 *
 * Poradi nasazeni (arch T-001 sekce 3.5, nezmeneno gate rozhodnutim):
 *   1. Tento runner na PROD Neon.
 *   2. Verifikace (viz "T-013 VERIFICATION QUERIES" na konci souboru).
 *   3. Teprve pak deploy kodu iter-021 (merge PR).
 *
 * lock_timeout (arch T-003 MAJOR-3): runner bezi pres @neondatabase/serverless
 * neon-http driver, ktery nema session kontinuitu — kazde `await sql\`...\``
 * je samostatny HTTP request / samostatna implicitni transakce. Samostatny
 * `SET lock_timeout` pred ALTERem by proto NEMEL zaruceny vliv na ten ALTER.
 * Misto toho kazdy DDL krok bezi v DO bloku, ktery nejdriv nastavi
 * transakcne-lokalni lock_timeout pres set_config('lock_timeout', '5s', true)
 * (ekvivalent SET LOCAL) a hned nato provede DDL — jeden statement, jedna
 * implicitni transakce, timeout prokazatelne plati. Neni to db.transaction()
 * ani vicoprikazova transakce (LL-003 zustava dodrzena).
 *
 * Krok [0/8] — smoke test (D-2): vzor "DO blok + set_config + ALTER TABLE
 * ADD COLUMN IF NOT EXISTS" je v tomto repu novy (migrate-iter-020-interviews.ts
 * posilal holé ALTERy bez lock_timeout). Pred prvnim DDL statementem se proto
 * neskodne overi, ze presne TENTO tvar SQL (DO blok, set_config s doslovnou
 * hodnotou, ALTER TABLE ... ADD COLUMN IF NOT EXISTS ... boolean NOT NULL
 * DEFAULT TRUE uvnitr tehoz bloku) projde neon-http driverem — na jednorazove
 * teplotni tabulce (CREATE TEMPORARY TABLE ... ON COMMIT DROP), aby se
 * nesahalo na realne schema. Puvodni verze testu (jen PERFORM set_config bez
 * zadneho ALTERu) byla jedinym krokem bez ${JS} interpolace a bez ALTERu vubec
 * — testovala jiny SQL tvar nez kroky 1-8, proto prosla vzdy a bind-parameter
 * chybu (BLOCKER-1, review T-009) nezachytila. Kdyz tenhle statement selze,
 * runner skonci exit 1 drive, nez cokoli zmeni. Fallback na holé ALTERy bez
 * lock_timeout se NEIMPLEMENTUJE automaticky — nahlasi se a rozhodne se
 * o nem zvlast.
 *
 * CHECK jako NOT VALID + samostatny VALIDATE CONSTRAINT (MINOR-2): ADD
 * CONSTRAINT ... NOT VALID je cisty katalogovy zapis pod ACCESS EXCLUSIVE
 * (milisekundy); nasledny VALIDATE CONSTRAINT dela full-scan pod SHARE
 * UPDATE EXCLUSIVE, ktery neblokuje cteni ani zapisy fill-formu. Idempotentni:
 * VALIDATE na uz validnim constraintu je no-op (Postgres validuje jen pri
 * convalidated = false), takze se vola nepodmineny.
 *
 * Chovani pri selhani — SQLSTATE 55P03 (canceling statement due to lock
 * timeout), D-6:
 *   - Runner spadne do main().catch → non-zero exit, zadny castecny
 *     poskozeny stav (vsechny kroky jsou idempotentni — re-run pokracuje
 *     od selhavsiho kroku, uz aplikovane kroky jsou no-op).
 *   - Pokud selhava OPAKOVANE, drzi zamek dlouha transakce. Najit:
 *       SELECT pid, state, xact_start, query FROM pg_stat_activity
 *       WHERE state <> 'idle' ORDER BY xact_start;
 *     Pockat na jeji konec, nebo ji ukoncit:
 *       SELECT pg_terminate_backend(pid);
 *     Pak spustit runner znovu.
 *
 * ROLLBACK (D-6): rollback iter-021 = revert kodu. Sloupce a constrainty na
 * DB ZUSTAVAJI — vsechny hodnoty jsou true/true, takze chovani je identicke
 * se stavem pred iter-021 (zadna otazka nikdy nemela jiny stav nez
 * true/true, dokud kod iter-021 nezacal nabizet checkboxy v editoru).
 * Down-migrace se NEPISE a DROP COLUMN se na zive DB NESPOUSTI — improvizace
 * nad ostrymi daty ve chvili, kdy neco hori, je presne to, cemu se tim
 * predchazi.
 *
 * Run (PROD, jen T-013, ne T-005): npx tsx scripts/migrate-iter-021-question-scope.ts
 *   (nacita DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

// LOCK_TIMEOUT (MAJOR-3, viz hlavickovy komentar vyse) je '5s' napsane
// DOSLOVNE v kazdem DO $$ ... $$ bloku nize (kroky [0/8] az [8/8]), NIKDY
// pres JS template interpolaci ${...}. Duvod (BLOCKER-1, review T-009):
// @neondatabase/serverless prevadi ${...} uvnitr sql`...` na bind parametr
// ($1) posilany mimo text dotazu extended query protokolem, ale Postgres
// lexer cte obsah dollar-quoted stringu (DO $$ ... $$) jako doslovny text —
// $1 uvnitr neni rozpoznano jako placeholder, DO prikaz ma tedy z pohledu
// parseru nula parametru, zatimco driver jeden posila ("bind message
// supplies 1 parameters, but prepared statement requires 0"). LOCK_TIMEOUT
// je compile-time konstanta (ne uzivatelsky vstup), takze doslovny zapis je
// bezpecny i citelny — zadna promenna proto neni potreba drzet.

async function main() {
  console.log("Running iter-021 question-scope migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  // [0/8] smoke test (D-2) — overi, ze PRESNE stejny SQL tvar jako kroky
  // 1-8 (DO blok, set_config s doslovnou hodnotou, ALTER TABLE ... ADD
  // COLUMN IF NOT EXISTS ... boolean NOT NULL DEFAULT TRUE) projde
  // neon-http driverem, drive nez cokoli zmeni na realnem schematu. Bezi na
  // jednorazove teplotni tabulce (ON COMMIT DROP se postara o uklizeni v
  // ramci tehoz statementu/implicitni transakce, bez dopadu na realne
  // schema). Zadny fallback pri selhani.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter021_smoke_test (id int) ON COMMIT DROP;
    ALTER TABLE _iter021_smoke_test
      ADD COLUMN IF NOT EXISTS smoke_flag BOOLEAN NOT NULL DEFAULT TRUE;
  END $$`;
  console.log("  [0/8] smoke test OK (DO blok + set_config + ALTER TABLE ADD COLUMN prosel neon-http driverem)");

  // [1/8] interview_question.applies_month_5 (metadata-only, PG11+ = backfill zdarma)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question
      ADD COLUMN IF NOT EXISTS applies_month_5 BOOLEAN NOT NULL DEFAULT TRUE;
  END $$`;
  console.log("  [1/8] interview_question.applies_month_5 ensured");

  // [2/8] interview_question.applies_month_10
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question
      ADD COLUMN IF NOT EXISTS applies_month_10 BOOLEAN NOT NULL DEFAULT TRUE;
  END $$`;
  console.log("  [2/8] interview_question.applies_month_10 ensured");

  // [3/8] interview_question_snapshot.applies_month_5
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question_snapshot
      ADD COLUMN IF NOT EXISTS applies_month_5 BOOLEAN NOT NULL DEFAULT TRUE;
  END $$`;
  console.log("  [3/8] interview_question_snapshot.applies_month_5 ensured");

  // [4/8] interview_question_snapshot.applies_month_10
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question_snapshot
      ADD COLUMN IF NOT EXISTS applies_month_10 BOOLEAN NOT NULL DEFAULT TRUE;
  END $$`;
  console.log("  [4/8] interview_question_snapshot.applies_month_10 ensured");

  // [5/8] CHECK na interview_question — NOT VALID (metadata-only), idempotentni
  // pres podminku na pg_constraint (ADD CONSTRAINT nema IF NOT EXISTS)
  const c1 = await sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'interview_question_applies_check'
      AND conrelid = 'interview_question'::regclass`;
  if (c1.length === 0) {
    await sql`DO $$ BEGIN
      PERFORM set_config('lock_timeout', '5s', true);
      ALTER TABLE interview_question
        ADD CONSTRAINT interview_question_applies_check
        CHECK (applies_month_5 OR applies_month_10) NOT VALID;
    END $$`;
    console.log("  [5/8] interview_question_applies_check added (NOT VALID)");
  } else {
    console.log("  [5/8] interview_question_applies_check already exists, skipped");
  }

  // [6/8] VALIDATE — SHARE UPDATE EXCLUSIVE scan; na jiz validnim constraintu no-op
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question
      VALIDATE CONSTRAINT interview_question_applies_check;
  END $$`;
  console.log("  [6/8] interview_question_applies_check validated");

  // [7/8] CHECK na interview_question_snapshot — NOT VALID, idempotentni
  const c2 = await sql`
    SELECT 1 FROM pg_constraint
    WHERE conname = 'iqs_applies_check'
      AND conrelid = 'interview_question_snapshot'::regclass`;
  if (c2.length === 0) {
    await sql`DO $$ BEGIN
      PERFORM set_config('lock_timeout', '5s', true);
      ALTER TABLE interview_question_snapshot
        ADD CONSTRAINT iqs_applies_check
        CHECK (applies_month_5 OR applies_month_10) NOT VALID;
    END $$`;
    console.log("  [7/8] iqs_applies_check added (NOT VALID)");
  } else {
    console.log("  [7/8] iqs_applies_check already exists, skipped");
  }

  // [8/8] VALIDATE
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE interview_question_snapshot
      VALIDATE CONSTRAINT iqs_applies_check;
  END $$`;
  console.log("  [8/8] iqs_applies_check validated");

  console.log("\niter-021 question-scope migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * ============================================================
 * T-013 VERIFICATION QUERIES (arch T-001 sekce 3.4 + T-003 sekce 4.5)
 * Spustit RUCNE po migraci na PROD, jako soucast T-013 — vysledek se
 * dokumentuje v outputu tasku (D-3: "migrace probehla OK" jako jediny dukaz
 * nestaci). Tenhle blok se nikdy neprovadi automaticky.
 * ============================================================
 *
 * -- 1. Sloupce existuji se spravnym typem/defaultem/NOT NULL (ocekavano: 4 radky)
 * SELECT table_name, column_name, data_type, column_default, is_nullable
 * FROM information_schema.columns
 * WHERE table_name IN ('interview_question', 'interview_question_snapshot')
 *   AND column_name IN ('applies_month_5', 'applies_month_10')
 * ORDER BY table_name, column_name;
 * -- ocekavani: data_type = 'boolean', column_default = 'true', is_nullable = 'NO'
 *
 * -- 2. CHECK constrainty existuji A JSOU VALIDOVANE (ocekavano: 2 radky,
 * --    convalidated = true u obou, definice BEZ sufixu NOT VALID)
 * SELECT conrelid::regclass AS table_name, conname, convalidated,
 *        pg_get_constraintdef(oid)
 * FROM pg_constraint
 * WHERE conname IN ('interview_question_applies_check', 'iqs_applies_check');
 *
 * -- 3. Backfill: bezprostredne po migraci nema zadny radek nic jineho nez true/true
 * SELECT
 *   (SELECT COUNT(*) FROM interview_question
 *      WHERE NOT (applies_month_5 AND applies_month_10)) AS iq_non_default,
 *   (SELECT COUNT(*) FROM interview_question_snapshot
 *      WHERE NOT (applies_month_5 AND applies_month_10)) AS iqs_non_default;
 * -- ocekavani ihned po migraci: 0, 0 (tenhle dotaz je point-in-time — po prvnim
 * -- odskrtnuti checkboxu v editoru prestane platit; dotazy 1 a 2 plati trvale)
 */
