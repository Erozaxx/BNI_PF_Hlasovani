/**
 * Migrace pro iter-032 (T-005): role, hesla vedení, přihlášení člena odkazem
 * (arch iter-032 T-001, sekce 8, 15; gate T-004 U2). Varianta B (K12 B):
 * sloupec `password_must_change` z varianty A se NEZAKLÁDÁ, kroky jsou
 * [0/6] až [6/6] (U2), kontrolní dotazy jsou poslední krok.
 *
 * DULEZITE: coder (T-005) skript NAPSAL, NESPUSTIL. `.env.local` v tomto repu
 * miri na produkcni Neon, dev DB neexistuje. Poradi (arch 8.3):
 *   1. tester ho pusti na docasne vetvi Neonu (LL-010) DVAKRAT po sobe,
 *   2. QA proti te vetvi,
 *   3. operator ho pusti na PROD a potvrdi vystup kroku [6/6],
 *   4. teprve pak merge (Vercel nasadi).
 * Opacne poradi nejde: novy getSession() cte session_version pri kazdem
 * pozadavku, bez sloupce padne 42703 a s nim vsechny stranky v app/(app).
 * Nahled vetve ve Vercelu se sdilenou PROD DB pred migraci neotevirat.
 *
 * Kroky:
 *   [0/6] smoke test: stejny tvar jako [2/6] (DO blok + set_config s doslovnou
 *         hodnotou + CREATE TABLE se stejnymi 7 sloupci, CHECKy a UNIQUE) na
 *         CREATE TEMPORARY TABLE ... ON COMMIT DROP, bez FK. Kroky [4/6] a
 *         [5/6] maji jiny tvar, pokryje je dvoji beh na vetvi Neonu (N-e).
 *   [1/6] member.session_version INTEGER NOT NULL DEFAULT 0
 *   [2/6] tabulka member_login_link
 *   [3/6] index idx_mll_member_id a castecny unikatni index
 *         mll_one_active_set_password ON member_login_link (member_id)
 *         WHERE purpose = 'set-password' AND used_at IS NULL (T-006r,
 *         security L-4: nejvys jeden nepouzity odkaz pro heslo na clena).
 *         Predem pocet clenu s vic nepouzitymi odkazy, vic nez 0 = exit 1
 *         (na PROD je tabulka nova a prazdna, nastat to muze jen na vetvi
 *         Neonu, kde uz bezela aplikace z T-005).
 *   [4/6] CHECK member_password_only_for_management (K5). Predem pocet hashu
 *         bez role. Vic nez 0 = exit 1 se zpravou o poctu (bez jmen a
 *         e-mailu, repo je verejne). Smazat je smi jen beh s prepinacem
 *         --clear-orphan-hashes (F7). Na PROD je pocet 0 (13.2).
 *   [5/6] unikatni index member_email_lower_unique ON member (lower(email))
 *         (K13). Predem duplicity po lower(email) a pocet e-mailu, ktere se
 *         lisi od lower(trim(email)). Cokoli nenuloveho = exit 1. Mimo DO blok.
 *   [6/6] kontrolni dotazy JEN nad schematem (exit 1 pri neshode). Omezeni
 *         se pocitaji jen typu p, u, c, f (review F-06: PostgreSQL 18 vede v
 *         pg_constraint i NOT NULL jako contype 'n'). Kontroly
 *         obsahu tu nejsou, protoze by selhaly pri kazdem opakovani po prvnim
 *         pouziti aplikace. Druhe spusteni tak projde beze zmen.
 *
 * Kdyz kontrola v [3/6], [4/6] nebo [5/6] skonci exit 1, predchozi kroky
 * uz probehly. Jsou aditivni a idempotentni, nic neni napul: po oprave dat
 * staci skript pustit znovu (review T-006).
 *
 * lock_timeout (LL-006): DDL bezi v DO blocich s
 * set_config('lock_timeout', '5s', true) psanym DOSLOVA. Uvnitr DO $$ ... $$
 * nikdy JS interpolace ${...}.
 *
 * ADD COLUMN s konstantni vychozi hodnotou tabulku neprepisuje (Postgres 11+).
 * CREATE UNIQUE INDEX bez CONCURRENTLY: member ma desitky radku, zamek je
 * okamzity, a CONCURRENTLY nesmi bezet uvnitr implicitni transakce neon-http.
 *
 * ROLLBACK (arch 8.4, jen kdyz je to opravdu potreba; kod se vraci Instant
 * Rollbackem ve Vercelu a schema muze zustat):
 *   DROP INDEX IF EXISTS member_email_lower_unique;
 *   DROP INDEX IF EXISTS mll_one_active_set_password;
 *   ALTER TABLE member DROP CONSTRAINT IF EXISTS member_password_only_for_management;
 *   DROP TABLE IF EXISTS member_login_link;
 *   ALTER TABLE member DROP COLUMN IF EXISTS session_version;
 *
 * Run (nejdriv vetev Neonu, pak PROD pred mergem):
 *   npx tsx scripts/migrate-iter-032-access.ts                         (nacita DATABASE_URL z .env.local)
 *   npx tsx scripts/migrate-iter-032-access.ts --clear-orphan-hashes   (jen kdyz [4/6] skoncil exit 1)
 *
 * Operator pri behu na PROD navic jednim dotazem potvrdi, ze testovaci ucet
 * z create-test-accounts-iter-011.ts neexistuje (arch 8.3):
 *   SELECT count(*) FROM member WHERE email ILIKE '%bni-test.local%';   -- 0
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

const CLEAR_ORPHAN_HASHES = process.argv.includes("--clear-orphan-hashes");

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
}

interface ConstraintRow {
  conname: string;
  contype: string;
}

interface IndexRow {
  indexname: string;
  indexdef: string;
}

const EXPECTED_MLL_COLUMNS: Omit<ColumnRow, "column_default">[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "purpose", data_type: "text", is_nullable: "NO" },
  { column_name: "token_hash", data_type: "text", is_nullable: "NO" },
  { column_name: "created_at", data_type: "timestamp with time zone", is_nullable: "NO" },
  { column_name: "expires_at", data_type: "timestamp with time zone", is_nullable: "NO" },
  { column_name: "used_at", data_type: "timestamp with time zone", is_nullable: "YES" },
];

const EXPECTED_MLL_NAMED_CONSTRAINTS = [
  "member_login_link_pkey",
  "mll_purpose_check",
  "mll_token_hash_unique",
  "mll_expires_after_created",
];

const EXPECTED_MLL_INDEXES = [
  "member_login_link_pkey",
  "mll_token_hash_unique",
  "idx_mll_member_id",
  "mll_one_active_set_password",
];

function fail(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

async function main() {
  console.log("Running iter-032 access migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);
  if (CLEAR_ORPHAN_HASHES) {
    console.log("  Prepinac --clear-orphan-hashes je zapnuty.");
  }

  // [0/6] smoke test: presne tvar kroku [2/6], docasna tabulka bez FK.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter032_mll_smoke (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id   UUID        NOT NULL,
      purpose     TEXT        NOT NULL,
      token_hash  TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      CONSTRAINT mll_smoke_purpose_check CHECK (purpose IN ('login', 'set-password')),
      CONSTRAINT mll_smoke_token_hash_unique UNIQUE (token_hash),
      CONSTRAINT mll_smoke_expires_after_created CHECK (expires_at > created_at)
    ) ON COMMIT DROP;
  END $$`;
  console.log("  [0/6] smoke test OK (DO blok + set_config + CREATE TABLE, 7 sloupcu, 2x CHECK, UNIQUE, bez FK)");

  // [1/6] member.session_version
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE member ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
  END $$`;
  console.log("  [1/6] member.session_version ensured");

  // [2/6] member_login_link (arch 8.1, doslovne)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS member_login_link (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id   UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      purpose     TEXT        NOT NULL,
      token_hash  TEXT        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at  TIMESTAMPTZ NOT NULL,
      used_at     TIMESTAMPTZ,
      CONSTRAINT mll_purpose_check CHECK (purpose IN ('login', 'set-password')),
      CONSTRAINT mll_token_hash_unique UNIQUE (token_hash),
      CONSTRAINT mll_expires_after_created CHECK (expires_at > created_at)
    );
  END $$`;
  console.log("  [2/6] member_login_link table ensured");

  // [3/6] index podle member_id (mazani clena, zneplatneni odkazu) a nejvys
  // jeden nepouzity odkaz pro heslo na clena (T-006r, security L-4)
  await sql`CREATE INDEX IF NOT EXISTS idx_mll_member_id ON member_login_link (member_id)`;
  console.log("  [3/6] idx_mll_member_id ensured");
  const activeDupRows = (await sql`
    SELECT count(*)::int AS n FROM (
      SELECT member_id FROM member_login_link
      WHERE purpose = 'set-password' AND used_at IS NULL
      GROUP BY member_id HAVING count(*) > 1
    ) d`) as { n: number }[];
  const activeDupCount = Number(activeDupRows[0]?.n ?? -1);
  if (activeDupCount !== 0) {
    fail(
      `[3/6] ${activeDupCount} clenu ma vic nepouzitych odkazu pro heslo. Nic dalsiho se nezmenilo. ` +
        `Starsi zneplatni: UPDATE member_login_link l SET used_at = now() WHERE purpose = 'set-password' ` +
        `AND used_at IS NULL AND EXISTS (SELECT 1 FROM member_login_link n WHERE n.member_id = l.member_id ` +
        `AND n.purpose = 'set-password' AND n.used_at IS NULL AND n.created_at > l.created_at);`
    );
  }
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS mll_one_active_set_password
    ON member_login_link (member_id) WHERE purpose = 'set-password' AND used_at IS NULL`;
  console.log("  [3/6] mll_one_active_set_password ensured");

  // [4/6] CHECK heslo jen u vedeni (K5, F7)
  const orphanRows = (await sql`
    SELECT count(*)::int AS n FROM member
    WHERE password_hash IS NOT NULL AND management_role IS NULL`) as { n: number }[];
  const orphanCount = Number(orphanRows[0]?.n ?? -1);
  if (orphanCount > 0) {
    if (!CLEAR_ORPHAN_HASHES) {
      fail(
        `[4/6] ${orphanCount} clenu ma heslo bez role. Nic se nezmenilo. ` +
          `Hashe bez role nejdou pouzit k prihlaseni. Smazat je smi jen spusteni s --clear-orphan-hashes.`
      );
    }
    const cleared = (await sql`
      UPDATE member SET password_hash = NULL
      WHERE password_hash IS NOT NULL AND management_role IS NULL
      RETURNING id`) as { id: string }[];
    console.log(`  [4/6] --clear-orphan-hashes: smazano ${cleared.length} hashu bez role`);
  } else if (orphanCount < 0) {
    fail("[4/6] nepodarilo se spocitat hashe bez role");
  }
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'member_password_only_for_management'
        AND conrelid = 'public.member'::regclass
    ) THEN
      ALTER TABLE member ADD CONSTRAINT member_password_only_for_management
        CHECK (password_hash IS NULL OR management_role IS NOT NULL);
    END IF;
  END $$`;
  console.log("  [4/6] CHECK member_password_only_for_management ensured");

  // [5/6] unikatni index lower(email) (K13)
  const dupRows = (await sql`
    SELECT count(*)::int AS n FROM (
      SELECT lower(email) FROM member WHERE email IS NOT NULL
      GROUP BY 1 HAVING count(*) > 1
    ) d`) as { n: number }[];
  const dupCount = Number(dupRows[0]?.n ?? -1);
  const unnormalizedRows = (await sql`
    SELECT count(*)::int AS n FROM member
    WHERE email IS NOT NULL AND email <> lower(trim(email))`) as { n: number }[];
  const unnormalizedCount = Number(unnormalizedRows[0]?.n ?? -1);
  if (dupCount !== 0 || unnormalizedCount !== 0) {
    fail(
      `[5/6] e-maily nejsou pripravene na index: duplicit po lower(email) ${dupCount}, ` +
        `nenormalizovanych adres ${unnormalizedCount}. Nic se nezmenilo, oprav je rucne.`
    );
  }
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS member_email_lower_unique ON member (lower(email))`;
  console.log("  [5/6] member_email_lower_unique ensured");

  // [6/6] kontrolni dotazy jen nad schematem, exit 1 pri neshode
  const svRows = (await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member' AND column_name = 'session_version'`) as ColumnRow[];
  const sv = svRows[0];
  if (!sv || sv.data_type !== "integer" || sv.is_nullable !== "NO" || sv.column_default !== "0") {
    fail(`[6/6a] member.session_version nesedi: ${JSON.stringify(sv ?? null)}`);
  }
  console.log("  [6/6a] member.session_version INTEGER NOT NULL DEFAULT 0 OK");

  const mllColumns = (await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'member_login_link'
    ORDER BY ordinal_position`) as ColumnRow[];
  if (mllColumns.length !== EXPECTED_MLL_COLUMNS.length) {
    fail(`[6/6b] ocekavano ${EXPECTED_MLL_COLUMNS.length} sloupcu member_login_link, nalezeno ${mllColumns.length}`);
  }
  for (let i = 0; i < EXPECTED_MLL_COLUMNS.length; i++) {
    const actual = mllColumns[i];
    const expected = EXPECTED_MLL_COLUMNS[i];
    if (
      actual.column_name !== expected.column_name ||
      actual.data_type !== expected.data_type ||
      actual.is_nullable !== expected.is_nullable
    ) {
      fail(`[6/6b] sloupec #${i} nesedi: ocekavano ${JSON.stringify(expected)}, nalezeno ${JSON.stringify(actual)}`);
    }
  }
  console.log("  [6/6b] 7 sloupcu member_login_link ve spravnem poradi a typech OK");

  const mllConstraints = (await sql`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid = 'public.member_login_link'::regclass
      AND contype IN ('p', 'u', 'c', 'f')
    ORDER BY conname`) as ConstraintRow[];
  const mllConstraintNames = new Set(mllConstraints.map((c) => c.conname));
  for (const name of EXPECTED_MLL_NAMED_CONSTRAINTS) {
    if (!mllConstraintNames.has(name)) fail(`[6/6c] chybi omezeni ${name}`);
  }
  const fk = mllConstraints.filter((c) => c.contype === "f");
  if (mllConstraints.length !== 5 || fk.length !== 1) {
    fail(
      `[6/6c] ocekavano 5 omezeni (pkey, UNIQUE, 2x CHECK, FK), nalezeno ${mllConstraints.length}: ${JSON.stringify(mllConstraints)}`
    );
  }
  const fkRows = (await sql`
    SELECT confdeltype FROM pg_constraint
    WHERE conrelid = 'public.member_login_link'::regclass AND contype = 'f'`) as { confdeltype: string }[];
  if (fkRows[0]?.confdeltype !== "c") {
    fail(`[6/6c] FK member_id nema ON DELETE CASCADE: ${JSON.stringify(fkRows)}`);
  }
  console.log("  [6/6c] 5 omezeni member_login_link (pkey, UNIQUE, 2x CHECK, FK s CASCADE) OK");

  const mllIndexes = (await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'member_login_link'`) as IndexRow[];
  const mllIndexNames = new Set(mllIndexes.map((i) => i.indexname));
  if (mllIndexes.length !== EXPECTED_MLL_INDEXES.length) {
    fail(`[6/6d] ocekavano ${EXPECTED_MLL_INDEXES.length} indexy member_login_link, nalezeno ${JSON.stringify([...mllIndexNames])}`);
  }
  for (const name of EXPECTED_MLL_INDEXES) {
    if (!mllIndexNames.has(name)) fail(`[6/6d] chybi index ${name}`);
  }
  const oneActive = mllIndexes.find((i) => i.indexname === "mll_one_active_set_password")?.indexdef ?? "";
  if (!/UNIQUE INDEX/i.test(oneActive) || !/set-password/.test(oneActive) || !/used_at IS NULL/i.test(oneActive)) {
    fail(`[6/6d] mll_one_active_set_password nesedi: ${oneActive || "(chybi)"}`);
  }
  console.log("  [6/6d] 4 indexy member_login_link (vcetne castecneho unikatniho mll_one_active_set_password) OK");

  const memberCheck = (await sql`
    SELECT conname, contype FROM pg_constraint
    WHERE conrelid = 'public.member'::regclass
      AND conname IN ('member_password_only_for_management',
                      'member_management_requires_credentials',
                      'member_management_role_check')`) as ConstraintRow[];
  if (memberCheck.length !== 3 || memberCheck.some((c) => c.contype !== "c")) {
    fail(`[6/6e] ocekavany 3 CHECKy na member (novy + 2 stavajici), nalezeno ${JSON.stringify(memberCheck)}`);
  }
  console.log("  [6/6e] CHECK member_password_only_for_management + 2 stavajici CHECKy OK");

  const emailIndex = (await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'member'
      AND indexname = 'member_email_lower_unique'`) as IndexRow[];
  const def = emailIndex[0]?.indexdef ?? "";
  if (!/UNIQUE INDEX/i.test(def) || !/lower\(email\)/i.test(def)) {
    fail(`[6/6f] member_email_lower_unique nesedi: ${def || "(chybi)"}`);
  }
  console.log("  [6/6f] UNIQUE INDEX member_email_lower_unique ON member (lower(email)) OK");

  console.log("\niter-032 access migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
