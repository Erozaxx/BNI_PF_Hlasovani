/**
 * Migrace pro iter-037 (členská iterace, arch T-001 sekce 3, gate T-002 Z1,
 * Z7, změna zadání Toma 19. 10.). Celá migrace iterace v jednom skriptu,
 * aditivní a idempotentní:
 *
 *   - `member`: tři sloupce deaktivace (`deactivated_at`, `inactive_until`,
 *     `deactivated_by`), cizí klíč `deactivated_by` a CHECK
 *     `member_inactive_until_needs_deactivation`. Bez `deactivation_note`
 *     (gate Z1). Logika deaktivace je až v T-003b, tady jen sloupce.
 *   - T-003b (rozhodnutí 19. 10., heslo pro držitele funkce): odstraní CHECK
 *     `member_password_only_for_management` (iter-032: `password_hash IS NULL
 *     OR management_role IS NOT NULL`). Funkce Prezident, Viceprezident a Člen
 *     výboru musí fungovat i bez role, a CHECK nemůže číst `member_function`.
 *     Pravidlo „heslo lze nastavit a přihlásit se jím jen s rolí nebo funkcí“
 *     se přesouvá do aplikace (`hasPasswordAccess`, lib/auth/permissions.ts),
 *     kde ho drží jedno místo pravdy: přihlášení heslem, nastavení hesla
 *     odkazem a akce funkce. Odebrání poslední role i funkce heslo smaže a
 *     zvýší `session_version`. `member_management_requires_credentials` (role
 *     vyžaduje e-mail a heslo) zůstává. Krok je idempotentní
 *     (`DROP CONSTRAINT IF EXISTS`). Kontrolní dotaz [6g] ověří, že žádný člen
 *     nemá heslo bez role i bez funkce.
 *   - `chapter_function` a `member_function` (člen má NEJVÝŠ JEDNU funkci:
 *     PRIMARY KEY na `member_id`).
 *   - seed TŘÍ funkcí: Prezident a Viceprezident se značkou
 *     `ADMIN_DELEGABLE_MARKER` v `permissions` (= všechna práva admina kromě
 *     nedelegovatelných `access.manage` a `functions.manage`, odvozená
 *     z AKTUÁLNÍHO katalogu v kódu, ne snímek 20 práv; rozhodnutí Toma 19. 10.
 *     a review MIN-2), Člen výboru s `permissions = NULL` (= výchozí sada
 *     dnešního moderátora). Žádných 14 funkcí z pavouka,
 *     žádná přechodná funkce. „Běžný člen“ je člen bez řádku v `member_function`.
 *   - dnešní moderátoři i admini se NEMĚNÍ: role `moderator` a `admin` zůstávají
 *     beze změny, nikdo nedostane funkci automaticky. Funkce přidělí Tom
 *     v aplikaci (T-003c).
 *
 * DŮLEŽITÉ: tenhle soubor coder (T-003a) NAPSAL, NESPUSTIL. `.env.local` míří
 * na produkční Neon, dev databáze neexistuje. Nejdřív se spustí na dočasné
 * větvi Neonu (LL-010, e-maily členů přepsat a bez RESEND_API_KEY), druhé
 * spuštění musí projít beze změny, teprve potom na PROD PŘED mergem (arch 3.4,
 * R2). Nový `getSession()` čte `member_function` a `chapter_function`, nový
 * `getMembers()` čte nové sloupce `member`. Bez migrace spadne na 42P01 nebo
 * 42703 a fail closed odhlásí všechny. Starý kód nové sloupce ani tabulky
 * nečte, migrace mu nevadí.
 *
 * Zámek na `member`: nullable sloupce bez defaultu jsou jen změna metadat.
 * Cizí klíč a VALIDATE CHECK drží krátce zámek (SHARE ROW EXCLUSIVE, resp.
 * SHARE UPDATE EXCLUSIVE), `lock_timeout` 5 s hlídá, že migrace nečeká na
 * cizí transakci. Tabulka má kolem 30 řádků.
 *
 * lock_timeout (LL-006): veškeré DDL běží v DO blocích, které nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je v každém DO bloku napsaná DOSLOVNĚ, UVNITŘ `$$ … $$` NENÍ
 * ŽÁDNÁ JS interpolace (LL-006 bod 1). Seed a převod moderátorů jsou obyčejné
 * příkazy s bind parametry mimo DO blok.
 *
 * Krok [0/7] je smoke test (LL-006 bod 2): PŘESNĚ stejný tvar DO bloků jako
 * kroky [2/7] až [4/7] (set_config, CREATE TABLE s CHECK a text[], ALTER TABLE
 * ADD COLUMN IF NOT EXISTS, ADD CONSTRAINT ... NOT VALID s kontrolou
 * pg_constraint, VALIDATE, DROP CONSTRAINT IF EXISTS) na dočasných tabulkách
 * bez cizích klíčů. Selže-li,
 * runner skončí exit 1 dřív, než cokoli změní.
 *
 * Krok [6/7] jsou kontrolní dotazy v runneru, exit 1 při neshodě: sloupce
 * a typy obou nových tabulek a nových sloupců `member`, pojmenovaná omezení,
 * `confdeltype` cizích klíčů, existence tří funkcí, rozložení
 * `management_role` shodné se snímkem z kroku [1/7].
 *
 * Seed je `ON CONFLICT DO NOTHING` podle `lower(name)`: druhý běh nic nemění
 * a nepřepíše případně upravená práva. Pozor: když admin funkci mezitím
 * PŘEJMENOVAL, další běh původní název založí znovu. Skript se po prvním
 * ostrém běhu nepouští znovu.
 *
 * ROLLBACK (v tomto pořadí):
 *   1. vrátit kód (redeploy předchozího buildu ve Vercelu nebo revert merge),
 *      starý kód s novými sloupci a tabulkami běží beze změny,
 *   2. CHECK `member_password_only_for_management` se vrací jen ručně a jen
 *      když žádný člen nemá heslo bez role (kontrolní dotaz [6g] ukáže počet),
 *      jinak by `ADD CONSTRAINT` selhal:
 *      ALTER TABLE member ADD CONSTRAINT member_password_only_for_management
 *        CHECK (password_hash IS NULL OR management_role IS NOT NULL);
 *   3. tabulky a sloupce nechat, nebo ručně (jen ručně, ne z tohoto skriptu):
 *      před smazáním exportovat přidělení funkcí (`SELECT * FROM
 *      member_function`) do souboru MIMO repo, pak
 *      DROP TABLE member_function; DROP TABLE chapter_function;
 *      ALTER TABLE member DROP COLUMN deactivated_by, DROP COLUMN
 *      inactive_until, DROP COLUMN deactivated_at;
 *      (CHECK a cizí klíč zaniknou se sloupci).
 *
 * Spuštění (nejdřív větev Neonu, LL-010; pak PROD PŘED mergem):
 *   npx tsx scripts/migrate-iter-037-clenove.ts   (načítá DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import { ADMIN_DELEGABLE_MARKER } from "../lib/auth/permissions";

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

interface RoleCountRow {
  management_role: string | null;
  n: number;
}

const TS = "timestamp with time zone";


// Nové sloupce `member` (gate Z1: bez deactivation_note).
const MEMBER_NEW_COLUMNS: ColumnRow[] = [
  { column_name: "deactivated_at", data_type: TS, is_nullable: "YES" },
  { column_name: "inactive_until", data_type: "date", is_nullable: "YES" },
  { column_name: "deactivated_by", data_type: "uuid", is_nullable: "YES" },
];

const FUNCTION_COLUMNS: ColumnRow[] = [
  { column_name: "id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "name", data_type: "text", is_nullable: "NO" },
  { column_name: "area", data_type: "text", is_nullable: "NO" },
  { column_name: "description", data_type: "text", is_nullable: "YES" },
  { column_name: "display_order", data_type: "integer", is_nullable: "NO" },
  { column_name: "permissions", data_type: "ARRAY", is_nullable: "YES" },
  { column_name: "created_at", data_type: TS, is_nullable: "NO" },
  { column_name: "updated_at", data_type: TS, is_nullable: "NO" },
];

const MEMBER_FUNCTION_COLUMNS: ColumnRow[] = [
  { column_name: "member_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "function_id", data_type: "uuid", is_nullable: "NO" },
  { column_name: "assigned_at", data_type: TS, is_nullable: "NO" },
  { column_name: "assigned_by", data_type: "uuid", is_nullable: "YES" },
];

const FUNCTION_NAMED = ["chapter_function_area_check", "chapter_function_description_len"];
// pkey + 2 CHECK
const FUNCTION_CONSTRAINT_COUNT = 3;
// pkey + 2 FK (member_id, assigned_by) + 1 FK (function_id)
const MEMBER_FUNCTION_CONSTRAINT_COUNT = 4;

// sloupec -> confdeltype ('c' = CASCADE, 'r' = RESTRICT, 'n' = SET NULL)
const MEMBER_FUNCTION_FK_EXPECTED: Record<string, string> = {
  member_id: "c",
  function_id: "r",
  assigned_by: "n",
};

const FUNCTION_INDEX_NAMES = ["chapter_function_pkey", "chapter_function_name_lower_unique"];
const MEMBER_FUNCTION_INDEX_NAMES = ["member_function_pkey", "idx_member_function_function"];

// Seed (změna zadání 19. 10.): tři funkce. Plná sada práv admina je v datech
// (`permissions`), Člen výboru má NULL = výchozí sada moderátora.
interface SeedFunction {
  order: number;
  name: string;
  area: "vedeni" | "leadership" | "vybor" | "ostatni";
  description: string;
  permissions: readonly string[] | null;
}

const LEADER_DESCRIPTION =
  "Má práva admina po přihlášení heslem, kromě přidělování admina, funkcí a hesel.";
/** Původní popis prvního seedu (před rozhodnutím 19. 10.), druhý běh ho přepíše. */
const OLD_LEADER_DESCRIPTION = "Má práva admina po přihlášení heslem.";

const SEED_FUNCTIONS: SeedFunction[] = [
  {
    order: 10,
    name: "Prezident",
    area: "vedeni",
    description: LEADER_DESCRIPTION,
    permissions: [ADMIN_DELEGABLE_MARKER],
  },
  {
    order: 20,
    name: "Viceprezident",
    area: "vedeni",
    description: LEADER_DESCRIPTION,
    permissions: [ADMIN_DELEGABLE_MARKER],
  },
  {
    order: 30,
    name: "Člen výboru",
    area: "vybor",
    description: "Má stejná práva jako moderátor.",
    permissions: null,
  },
];

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

function checkFks(
  label: string,
  actual: FkRow[],
  expected: Record<string, string>,
  referencedOverride: Record<string, string> = {}
): void {
  if (actual.length !== Object.keys(expected).length) {
    fail(`[${label}] očekáváno ${Object.keys(expected).length} cizích klíčů, nalezeno ${actual.length}`);
  }
  for (const fk of actual) {
    const del = expected[fk.column_name];
    if (del === undefined) fail(`[${label}] nečekaný FK na sloupci ${fk.column_name}`);
    if (fk.confdeltype !== del) {
      fail(`[${label}.${fk.column_name}] confdeltype ${fk.confdeltype}, očekáváno ${del}`);
    }
    const target = referencedOverride[fk.column_name] ?? "member";
    if (fk.referenced !== target) {
      fail(`[${label}.${fk.column_name}] odkazuje na ${fk.referenced}, očekáváno ${target}`);
    }
  }
}

async function roleDistribution(): Promise<RoleCountRow[]> {
  return (await sql`
    SELECT management_role, count(*)::int AS n FROM member
    GROUP BY management_role ORDER BY management_role NULLS FIRST`) as RoleCountRow[];
}

async function main() {
  console.log("Running iter-037 členové migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  const memberColsBefore = (await columnsOf("member")).length;
  if (memberColsBefore < 1) fail("tabulka member nenalezena (špatná databáze?)");

  // [0/7] smoke test: stejný tvar DO bloků jako kroky [2/7] až [4/7], dočasné
  // tabulky bez cizích klíčů. Žádný fallback při selhání.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter037_member_smoke (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid()
    ) ON COMMIT DROP;
    ALTER TABLE _iter037_member_smoke ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
    ALTER TABLE _iter037_member_smoke ADD COLUMN IF NOT EXISTS inactive_until DATE;
    ALTER TABLE _iter037_member_smoke ADD COLUMN IF NOT EXISTS deactivated_by UUID;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'member_inactive_until_needs_deactivation_smoke'
        AND conrelid = '_iter037_member_smoke'::regclass
    ) THEN
      ALTER TABLE _iter037_member_smoke
        ADD CONSTRAINT member_inactive_until_needs_deactivation_smoke
        CHECK (inactive_until IS NULL OR deactivated_at IS NOT NULL) NOT VALID;
    END IF;
    ALTER TABLE _iter037_member_smoke
      VALIDATE CONSTRAINT member_inactive_until_needs_deactivation_smoke;
    ALTER TABLE _iter037_member_smoke ADD COLUMN IF NOT EXISTS password_hash TEXT;
    ALTER TABLE _iter037_member_smoke ADD COLUMN IF NOT EXISTS management_role TEXT;
    ALTER TABLE _iter037_member_smoke
      ADD CONSTRAINT member_password_only_for_management_smoke
      CHECK (password_hash IS NULL OR management_role IS NOT NULL);
    ALTER TABLE _iter037_member_smoke
      DROP CONSTRAINT IF EXISTS member_password_only_for_management_smoke;
    ALTER TABLE _iter037_member_smoke
      DROP CONSTRAINT IF EXISTS member_password_only_for_management_smoke;
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter037_function_smoke (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT        NOT NULL,
      area          TEXT        NOT NULL,
      description   TEXT,
      display_order INTEGER     NOT NULL,
      permissions   TEXT[],
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chapter_function_area_check_smoke
        CHECK (area IN ('vedeni', 'leadership', 'vybor', 'ostatni')),
      CONSTRAINT chapter_function_description_len_smoke
        CHECK (description IS NULL OR char_length(description) <= 300)
    ) ON COMMIT DROP;
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TEMPORARY TABLE _iter037_member_function_smoke (
      member_id   UUID        NOT NULL,
      function_id UUID        NOT NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      assigned_by UUID,
      PRIMARY KEY (member_id)
    ) ON COMMIT DROP;
  END $$`;
  console.log("  [0/7] smoke test OK (3 DO bloky: set_config, CREATE TABLE, ADD COLUMN, CHECK NOT VALID, VALIDATE, bez FK)");

  // [1/7] snímek před (pro krok [6/7])
  const rolesBefore = await roleDistribution();
  const rolesBeforeJson = JSON.stringify(rolesBefore);
  console.log(`  [1/7] snímek management_role před: ${rolesBeforeJson}`);

  // [2/7] member: sloupce deaktivace, FK deactivated_by, CHECK (arch 3.1, Z1)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE member ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
    ALTER TABLE member ADD COLUMN IF NOT EXISTS inactive_until DATE;
    ALTER TABLE member ADD COLUMN IF NOT EXISTS deactivated_by UUID;
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'member_deactivated_by_fk'
        AND conrelid = 'public.member'::regclass
    ) THEN
      ALTER TABLE member ADD CONSTRAINT member_deactivated_by_fk
        FOREIGN KEY (deactivated_by) REFERENCES member(id) ON DELETE SET NULL;
    END IF;
  END $$`;
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'member_inactive_until_needs_deactivation'
        AND conrelid = 'public.member'::regclass
    ) THEN
      ALTER TABLE member ADD CONSTRAINT member_inactive_until_needs_deactivation
        CHECK (inactive_until IS NULL OR deactivated_at IS NOT NULL) NOT VALID;
    END IF;
    ALTER TABLE member VALIDATE CONSTRAINT member_inactive_until_needs_deactivation;
  END $$`;
  // T-003b: heslo pro držitele funkce. CHECK nemůže číst `member_function`,
  // pravidlo žije v aplikaci (`hasPasswordAccess`). Idempotentní.
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    ALTER TABLE member DROP CONSTRAINT IF EXISTS member_password_only_for_management;
  END $$`;
  console.log("  [2/7] member: 3 sloupce deaktivace, FK deactivated_by, CHECK member_inactive_until_needs_deactivation ensured, CHECK member_password_only_for_management odstraněn");

  // [3/7] chapter_function (arch 3.2)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS chapter_function (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      name          TEXT        NOT NULL,
      area          TEXT        NOT NULL,
      description   TEXT,
      display_order INTEGER     NOT NULL,
      permissions   TEXT[],
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chapter_function_area_check
        CHECK (area IN ('vedeni', 'leadership', 'vybor', 'ostatni')),
      CONSTRAINT chapter_function_description_len
        CHECK (description IS NULL OR char_length(description) <= 300)
    );
  END $$`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS chapter_function_name_lower_unique
            ON chapter_function (lower(name))`;
  console.log("  [3/7] chapter_function + chapter_function_name_lower_unique ensured");

  // [4/7] member_function (arch 3.2)
  await sql`DO $$ BEGIN
    PERFORM set_config('lock_timeout', '5s', true);
    CREATE TABLE IF NOT EXISTS member_function (
      member_id   UUID        NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      function_id UUID        NOT NULL REFERENCES chapter_function(id) ON DELETE RESTRICT,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      assigned_by UUID        REFERENCES member(id) ON DELETE SET NULL,
      PRIMARY KEY (member_id)
    );
  END $$`;
  await sql`CREATE INDEX IF NOT EXISTS idx_member_function_function
            ON member_function (function_id)`;
  console.log("  [4/7] member_function + idx_member_function_function ensured");

  // [5/7] seed tří funkcí (obyčejné příkazy, bind parametry mimo DO blok,
  // LL-006). Moderátoři ani admini se nemění, žádné automatické přidělení.
  for (const f of SEED_FUNCTIONS) {
    // Pole jako textový literál Postgresu, nezávislé na serializaci polí v driveru.
    const perms = f.permissions ? `{${f.permissions.map((x) => `"${x}"`).join(",")}}` : null;
    await sql`
      INSERT INTO chapter_function (name, area, description, display_order, permissions)
      VALUES (${f.name}, ${f.area}, ${f.description}, ${f.order}, ${perms}::text[])
      ON CONFLICT (lower(name)) DO NOTHING`;
  }
  console.log(`  [5/7] seed ${SEED_FUNCTIONS.length} funkcí (Prezident, Viceprezident, Člen výboru) ensured`);

  // [5b/7] oprava starého seedu (review MIN-2, rozhodnutí 19. 10.): první verze
  // migrace uložila Prezidentovi a Viceprezidentovi snímek 20 práv včetně
  // `access.manage` a `functions.manage`. `ON CONFLICT DO NOTHING` ho druhý běh
  // nepřepíše, proto tady UPDATE na značku. Mění jen řádky, které opravdu mají
  // starý tvar (obsahují obě nedelegovatelná práva a nemají značku), takže
  // případně ručně upravená práva zůstanou. Idempotentní: po opravě nic nematchne.
  const leaderNames = SEED_FUNCTIONS.filter((f) => f.permissions?.includes(ADMIN_DELEGABLE_MARKER)).map(
    (f) => f.name
  );
  // Pole jako textový literál Postgresu (stejně jako seed), nezávislé na serializaci v driveru.
  const markerArray = `{"${ADMIN_DELEGABLE_MARKER}"}`;
  const leaderNamesArray = `{${leaderNames.map((n) => `"${n.toLowerCase()}"`).join(",")}}`;
  const fixedPerms = (await sql`
    UPDATE chapter_function
       SET permissions = ${markerArray}::text[]
     WHERE lower(name) = ANY (${leaderNamesArray}::text[])
       AND permissions IS NOT NULL
       AND NOT (${ADMIN_DELEGABLE_MARKER}::text = ANY (permissions))
       AND 'access.manage' = ANY (permissions)
       AND 'functions.manage' = ANY (permissions)
    RETURNING id`) as { id: string }[];
  const fixedDescriptions = (await sql`
    UPDATE chapter_function
       SET description = ${LEADER_DESCRIPTION}
     WHERE lower(name) = ANY (${leaderNamesArray}::text[])
       AND description = ${OLD_LEADER_DESCRIPTION}
    RETURNING id`) as { id: string }[];
  console.log(
    `  [5b/7] starý seed opraven: práv ${fixedPerms.length}, popisů ${fixedDescriptions.length} (při opakování 0)`
  );

  // [6/7] kontrolní dotazy, exit 1 při jakékoli neshodě
  const memberCols = await columnsOf("member");
  const memberColNames = new Set(memberCols.map((c) => c.column_name));
  for (const expected of MEMBER_NEW_COLUMNS) {
    const actual = memberCols.find((c) => c.column_name === expected.column_name);
    if (!actual) fail(`[6a] member nemá sloupec ${expected.column_name}`);
    if (actual.data_type !== expected.data_type || actual.is_nullable !== expected.is_nullable) {
      fail(`[6a] member.${expected.column_name} nesedí: ${JSON.stringify(actual)}`);
    }
  }
  if (memberColNames.has("deactivation_note")) {
    fail("[6a] member nesmí mít sloupec deactivation_note (gate Z1)");
  }
  checkColumns("6a chapter_function", await columnsOf("chapter_function"), FUNCTION_COLUMNS);
  checkColumns("6a member_function", await columnsOf("member_function"), MEMBER_FUNCTION_COLUMNS);
  console.log("  [6a] sloupce member (3 nové, bez deactivation_note), chapter_function (8), member_function (4) OK");

  checkConstraints(
    "6b chapter_function",
    await constraintsOf("chapter_function"),
    FUNCTION_CONSTRAINT_COUNT,
    FUNCTION_NAMED
  );
  const memberConstraints = new Set((await constraintsOf("member")).map((c) => c.conname));
  for (const name of [
    "member_inactive_until_needs_deactivation",
    "member_deactivated_by_fk",
    "member_management_requires_credentials",
    "member_management_role_check",
  ]) {
    if (!memberConstraints.has(name)) fail(`[6b] member nemá omezení ${name}`);
  }
  if (memberConstraints.has("member_password_only_for_management")) {
    fail("[6b] member má pořád CHECK member_password_only_for_management (T-003b ho odstraňuje)");
  }
  const validated = (await sql`
    SELECT convalidated FROM pg_constraint
    WHERE conname = 'member_inactive_until_needs_deactivation'
      AND conrelid = 'public.member'::regclass`) as { convalidated: boolean }[];
  if (validated[0]?.convalidated !== true) {
    fail("[6b] CHECK member_inactive_until_needs_deactivation není validovaný");
  }
  checkConstraints(
    "6b member_function",
    await constraintsOf("member_function"),
    MEMBER_FUNCTION_CONSTRAINT_COUNT,
    []
  );
  console.log("  [6b] omezení OK (chapter_function 3, member_function 4, member nová a stávající, CHECK validovaný)");

  checkFks("6c member_function", await fksOf("member_function"), MEMBER_FUNCTION_FK_EXPECTED, {
    function_id: "chapter_function",
  });
  const memberFk = (await fksOf("member")).find((f) => f.column_name === "deactivated_by");
  if (!memberFk || memberFk.confdeltype !== "n" || memberFk.referenced !== "member") {
    fail(`[6c] member.deactivated_by FK nesedí: ${JSON.stringify(memberFk)}`);
  }
  console.log("  [6c] cizí klíče OK (member_id c, function_id r, assigned_by n, deactivated_by n)");

  checkIndexNames("6d chapter_function", await indexesOf("chapter_function"), FUNCTION_INDEX_NAMES);
  checkIndexNames("6d member_function", await indexesOf("member_function"), MEMBER_FUNCTION_INDEX_NAMES);
  console.log("  [6d] indexy OK (2 + 2)");

  // [6e] obsah `permissions` (review MIN-3): Prezident a Viceprezident mají
  // PŘESNĚ jednoprvkové pole se značkou (ne snímek práv, ne NULL), Člen výboru
  // NULL. Starý seed s 20 právy tu spadne, pokud ho [5b] neopravil.
  for (const f of SEED_FUNCTIONS) {
    const found = (await sql`
      SELECT permissions IS NULL AS perms_null,
             array_length(permissions, 1) AS len,
             permissions[1] AS first_perm
        FROM chapter_function
       WHERE lower(name) = lower(${f.name})`) as {
      perms_null: boolean;
      len: number | null;
      first_perm: string | null;
    }[];
    if (found.length !== 1) fail(`[6e] funkce ${f.name} nenalezena`);
    const row = found[0];
    if (f.permissions === null) {
      if (!row.perms_null) fail(`[6e] ${f.name}: permissions má být NULL (výchozí sada)`);
    } else if (row.perms_null || row.len !== 1 || row.first_perm !== ADMIN_DELEGABLE_MARKER) {
      fail(
        `[6e] ${f.name}: permissions má být přesně {"${ADMIN_DELEGABLE_MARKER}"}, je ` +
          `${row.perms_null ? "NULL" : `pole o ${row.len} prvcích, první ${row.first_perm}`}`
      );
    }
  }
  const nonDelegableLeak = (await sql`
    SELECT count(*)::int AS n FROM chapter_function
     WHERE permissions IS NOT NULL
       AND ('access.manage' = ANY (permissions) OR 'functions.manage' = ANY (permissions))`) as {
    n: number;
  }[];
  if ((nonDelegableLeak[0]?.n ?? 0) !== 0) {
    fail("[6e] nějaká funkce má v permissions nedelegovatelné právo (access.manage, functions.manage)");
  }
  const fnCount = (await sql`SELECT count(*)::int AS n FROM chapter_function`) as { n: number }[];
  if ((fnCount[0]?.n ?? 0) < SEED_FUNCTIONS.length) {
    fail(`[6e] funkcí je ${fnCount[0]?.n}, očekáváno aspoň ${SEED_FUNCTIONS.length}`);
  }
  const multi = (await sql`
    SELECT count(*)::int AS n FROM (
      SELECT member_id FROM member_function GROUP BY member_id HAVING count(*) > 1
    ) t`) as { n: number }[];
  if ((multi[0]?.n ?? 0) !== 0) fail("[6e] člen s víc funkcemi (nejvýš jedna)");
  console.log(
    `  [6e] funkcí ${fnCount[0]?.n}, obsah permissions OK (Prezident, Viceprezident = {${ADMIN_DELEGABLE_MARKER}}, Člen výboru NULL, bez access.manage a functions.manage), žádný člen s víc funkcemi`
  );

  const rolesAfterJson = JSON.stringify(await roleDistribution());
  if (rolesAfterJson !== rolesBeforeJson) {
    fail(`[6f] rozložení management_role se změnilo: před ${rolesBeforeJson}, po ${rolesAfterJson}`);
  }
  console.log("  [6f] rozložení management_role shodné se snímkem před migrací");

  // [6g] T-003b: pravidlo „heslo jen s rolí nebo funkcí“ už nehlídá CHECK. Do
  // aplikace ho drží `hasPasswordAccess`, tady se ověří stav dat: žádný člen
  // nesmí mít heslo bez role i bez funkce.
  const orphanPasswords = (await sql`
    SELECT count(*)::int AS n FROM member m
    WHERE m.password_hash IS NOT NULL
      AND m.management_role IS NULL
      AND NOT EXISTS (SELECT 1 FROM member_function mf WHERE mf.member_id = m.id)`) as { n: number }[];
  if ((orphanPasswords[0]?.n ?? 0) !== 0) {
    fail(`[6g] ${orphanPasswords[0]?.n} členů má heslo bez role i bez funkce`);
  }
  console.log("  [6g] žádné heslo bez role i bez funkce (pravidlo drží aplikace, hasPasswordAccess)");

  const deactivated = (await sql`
    SELECT count(*)::int AS n FROM member WHERE deactivated_at IS NOT NULL`) as { n: number }[];
  console.log(
    `  [6h] deaktivovaných členů: ${deactivated[0]?.n} (při prvním běhu musí být 0, při opakování jen výpis)`
  );

  // [7/7] souhrn (jen počty)
  const summary = (await sql`
    SELECT
      (SELECT count(*)::int FROM chapter_function) AS functions,
      (SELECT count(*)::int FROM member WHERE management_role = 'admin') AS admins,
      (SELECT count(*)::int FROM member WHERE management_role = 'moderator') AS moderators,
      (SELECT count(*)::int FROM member_function) AS assignments`) as {
    functions: number;
    admins: number;
    moderators: number;
    assignments: number;
  }[];
  const sm = summary[0];
  console.log(
    `  [7/7] souhrn: funkcí ${sm?.functions}, adminů ${sm?.admins}, moderátorů ${sm?.moderators} (beze změny), přidělení funkcí ${sm?.assignments}, sloupců member ${memberCols.length} (před ${memberColsBefore})`
  );
  console.log("\niter-037 členové migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
