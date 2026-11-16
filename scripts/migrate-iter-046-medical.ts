/**
 * Migrace pro iter-046 (medical, arch T-001 kap. 3). Aditivní a idempotentní:
 *
 *   - `member.medical_from`, `medical_until`, `medical_set_by`, `medical_set_at`
 *     a CHECK `member_medical_range`,
 *   - `member_absence.medical` (boolean NOT NULL DEFAULT false) a CHECK
 *     `ma_medical_no_sub`,
 *   - `attendance_audit.aa_field` rozšířený o `'medical'`.
 *
 * DŮLEŽITÉ: tenhle soubor coder NAPSAL, NESPUSTIL proti žádné DB. `.env.local`
 * míří na produkční Neon, dev databáze neexistuje. Nejdřív dočasná větev Neonu
 * (LL-010), druhé spuštění musí projít beze změny, teprve potom PROD PŘED
 * testováním v preview i PŘED mergem (preview běží nad PROD DB). Bez migrace
 * padá zápis, uzávěrka a hlasování na 42703. Nespouštět ve čtvrtek ráno.
 *
 * lock_timeout (LL-006): DDL běží v DO blocích, které nejdřív nastaví
 * transakčně lokální lock_timeout přes set_config('lock_timeout', '5s', true).
 * Hodnota '5s' je napsaná DOSLOVNĚ, UVNITŘ `$$ ... $$` NENÍ ŽÁDNÁ JS interpolace.
 * Bez db.transaction() (LL-003).
 *
 * DDL žije v lib/members/medical-ddl.ts (čte ho i test nad PGlite).
 * Krok [0/4] je smoke test (LL-006 bod 2): stejný text bloků jako [1/4] až
 * [3/4] na dočasných tabulkách. Selže-li, exit 1 dřív, než se cokoli změní.
 * Krok [4/4] jsou kontroly, exit 1 při neshodě. Jen čtení navíc: názvy funkcí
 * s `permissions IS NULL` (dostanou `members.medical` výchozí sadou) a počet
 * funkcí s ručním seznamem. Jména členů se nevypisují.
 *
 * Kontrola hostu: když je nastavená `EXPECT_DB_HOST`, host z `DATABASE_URL` ji
 * musí obsahovat, jinak exit 1.
 *
 * ROLLBACK: vrátit kód, sloupce nechat (starý kód je nečte, DEFAULT false mu
 * nevadí). Po rollbacku kódu se medical omluvy uzavřených dnů znovu počítají
 * jako absence.
 *
 * Spuštění: npx tsx scripts/migrate-iter-046-medical.ts   (DATABASE_URL z .env.local)
 */

import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import {
  ABSENCE_MEDICAL_DDL,
  AUDIT_MEDICAL_DDL,
  MEMBER_MEDICAL_DDL,
  doBlock,
  smokeDdl,
} from "../lib/members/medical-ddl";

dotenv.config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

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

interface ColExpect {
  table: string;
  column: string;
  data_type: string;
  is_nullable: "YES" | "NO";
  default_has?: string;
}

const EXPECTED_COLUMNS: ColExpect[] = [
  { table: "member", column: "medical_from", data_type: "date", is_nullable: "YES" },
  { table: "member", column: "medical_until", data_type: "date", is_nullable: "YES" },
  { table: "member", column: "medical_set_by", data_type: "uuid", is_nullable: "YES" },
  { table: "member", column: "medical_set_at", data_type: "timestamp with time zone", is_nullable: "YES" },
  { table: "member_absence", column: "medical", data_type: "boolean", is_nullable: "NO", default_has: "false" },
];

async function main() {
  console.log("Running iter-046 medical migration...");
  console.log(`Target DB: ${process.env.DATABASE_URL?.replace(/:[^@]+@/, ":***@")}`);

  const expectHost = process.env.EXPECT_DB_HOST;
  if (expectHost && !hostOf(process.env.DATABASE_URL).includes(expectHost)) {
    fail(`host databáze neobsahuje EXPECT_DB_HOST=${expectHost}, migrace se nespustí`);
  }

  // [0/4] smoke test: stejný text DDL jako kroky [1/4] až [3/4] (lib/members/medical-ddl.ts),
  // dočasné tabulky. '5s' je doslovné, uvnitř $$ žádná interpolace (LL-006).
  await sql(doBlock(smokeDdl()));
  console.log("  [0/4] smoke test OK (stejný tvar DO bloků na dočasných tabulkách)");

  for (const table of ["member", "member_absence", "attendance_audit"]) {
    const r = (await sql`
      SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${table}`) as { n: number }[];
    if (!r[0]?.n) fail(`tabulka ${table} nenalezena (špatná databáze nebo chybí dřívější migrace)`);
  }

  // [1/4] member
  await sql(doBlock(MEMBER_MEDICAL_DDL));
  console.log("  [1/4] member: medical_from, medical_until, medical_set_by, medical_set_at, member_medical_range");

  // [2/4] member_absence
  await sql(doBlock(ABSENCE_MEDICAL_DDL));
  console.log("  [2/4] member_absence: medical, ma_medical_no_sub");

  // [3/4] attendance_audit
  await sql(doBlock(AUDIT_MEDICAL_DDL));
  console.log("  [3/4] attendance_audit: aa_field (+ medical)");

  // [4/4] kontroly
  for (const e of EXPECTED_COLUMNS) {
    const rows = (await sql`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${e.table} AND column_name = ${e.column}`) as {
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }[];
    const a = rows[0];
    if (!a || a.data_type !== e.data_type || a.is_nullable !== e.is_nullable) {
      fail(`[4a] ${e.table}.${e.column} nesedí: ${JSON.stringify(a)}`);
    }
    if (e.default_has && !(a.column_default ?? "").includes(e.default_has)) {
      fail(`[4a] ${e.table}.${e.column} nemá výchozí hodnotu ${e.default_has}: ${a.column_default}`);
    }
  }
  console.log("  [4a] sloupce a typy sedí");

  const fks = (await sql`
    SELECT c.confdeltype::text AS confdeltype, c.confrelid::regclass::text AS referenced
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.member'::regclass AND c.contype = 'f' AND a.attname = 'medical_set_by'`) as {
    confdeltype: string;
    referenced: string;
  }[];
  if (fks.length !== 1 || fks[0].confdeltype !== "n" || fks[0].referenced !== "member") {
    fail(`[4b] FK member.medical_set_by nesedí: ${JSON.stringify(fks)}`);
  }
  console.log("  [4b] FK medical_set_by (SET NULL)");

  const checks = (await sql`
    SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
    WHERE contype = 'c' AND (
      (conrelid = 'public.member'::regclass AND conname = 'member_medical_range')
      OR (conrelid = 'public.member_absence'::regclass AND conname = 'ma_medical_no_sub')
      OR (conrelid = 'public.attendance_audit'::regclass AND conname = 'aa_field'))
    ORDER BY conname`) as { conname: string; def: string }[];
  const defOf = (n: string) => checks.find((c) => c.conname === n)?.def ?? "";
  if (!defOf("member_medical_range").includes("medical_from <= medical_until")) {
    fail(`[4c] member_medical_range nesedí: ${defOf("member_medical_range")}`);
  }
  if (!defOf("ma_medical_no_sub").includes("substitute_name IS NULL")) {
    fail(`[4c] ma_medical_no_sub nesedí: ${defOf("ma_medical_no_sub")}`);
  }
  const aa = defOf("aa_field");
  for (const v of ["'presence'", "'absence'", "'medical'"]) {
    if (!aa.includes(v)) fail(`[4c] aa_field neobsahuje ${v}: ${aa}`);
  }
  console.log("  [4c] CHECK member_medical_range, ma_medical_no_sub, aa_field sedí");

  // Jen čtení: kdo dostane members.medical výchozí sadou.
  const withDefault = (await sql`
    SELECT name FROM chapter_function WHERE permissions IS NULL ORDER BY name`) as { name: string }[];
  const manual = (await sql`
    SELECT count(*)::int AS n FROM chapter_function
    WHERE permissions IS NOT NULL
      AND NOT ('admin-delegable' = ANY(permissions))
      AND NOT ('members.medical' = ANY(permissions))`) as { n: number }[];
  console.log(
    `  [4d] funkce s výchozí sadou (dostanou members.medical, čeká se jen Člen výboru): ${
      withDefault.length === 0 ? "žádné" : withDefault.map((f) => f.name).join(", ")
    }`
  );
  console.log(
    `  [4d] funkcí s ručním seznamem práv bez members.medical (nedostanou, admin je upraví ve správě funkcí): ${manual[0]?.n ?? 0}`
  );
  console.log("\niter-046 medical migration complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
