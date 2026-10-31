/**
 * iter-044 (F-01): kontroly schématu nových tabulek, které spouští migrace
 * (`scripts/migrate-iter-044-vlastni-body.ts`, kroky [4a] až [4d]) i test nad
 * PGlite (`scripts/test-iter-044-semafor-sql.ts`). Díky tomu se chyba v kontrole
 * (třeba literál, který `pg_get_constraintdef` nikdy nevypíše) chytí bez síťové DB.
 *
 * Čistý modul, bez importu DB. Dotaz se předává jako funkce `query(text, params)`.
 */
import { ACTIVITY_UNIQUE, POINT_CHECKS, POINT_UNIQUES } from "./points-ddl";

export type PointsQuery = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: "YES" | "NO";
}

const TS = "timestamp with time zone";
const col = (column_name: string, data_type: string, nullable: boolean): ColumnRow => ({
  column_name,
  data_type,
  is_nullable: nullable ? "YES" : "NO",
});

export const EXPECTED_COLUMNS: Record<string, ColumnRow[]> = {
  semafor_activity: [
    col("id", "uuid", false),
    col("title", "text", false),
    col("held_on", "date", false),
    col("created_by", "uuid", true),
    col("created_at", TS, false),
  ],
  semafor_point: [
    col("id", "uuid", false),
    col("member_id", "uuid", false),
    col("category", "text", false),
    col("earned_on", "date", false),
    col("earned_month", "date", false),
    col("points", "smallint", true),
    col("note", "text", true),
    col("ref_member_id", "uuid", true),
    col("activity_id", "uuid", true),
    col("created_by", "uuid", true),
    col("created_at", TS, false),
  ],
};

export const EXPECTED_FKS: { table: string; column: string; confdeltype: string; referenced: string }[] = [
  { table: "semafor_activity", column: "created_by", confdeltype: "n", referenced: "member" },
  { table: "semafor_point", column: "member_id", confdeltype: "c", referenced: "member" },
  { table: "semafor_point", column: "ref_member_id", confdeltype: "c", referenced: "member" },
  { table: "semafor_point", column: "activity_id", confdeltype: "c", referenced: "semafor_activity" },
  { table: "semafor_point", column: "created_by", confdeltype: "n", referenced: "member" },
];

/**
 * Literály, které musí `pg_get_constraintdef` obsahovat (kontrola, že CHECK není
 * vyprázdněný). Postgres `BETWEEN` rozepíše na `(points >= 1) AND (points <= 20)`,
 * proto se hledají obě poloviny zvlášť (F-01).
 */
export const CHECK_LITERALS: Record<string, string[]> = {
  sp_category: ["'training'", "'thanks'", "'host_member'", "'activity'", "'work'"],
  sp_points: ["IS NOT NULL", "points >= 1", "points <= 20"],
  sp_note_required: ["'thanks'", "'training'", "'work'"],
  sp_ref: ["host_member"],
  sp_activity: ["activity"],
};

export const EXPECTED_INDEXES = [
  "idx_sa_held_on",
  "idx_sp_created_by",
  "idx_sp_earned",
  "idx_sp_member_earned",
  "semafor_activity_pkey",
  "semafor_point_pkey",
  ACTIVITY_UNIQUE,
  ...Object.keys(POINT_UNIQUES),
].sort();

export interface VerifyStep {
  step: "4a" | "4b" | "4c" | "4d";
  /** Chyby kroku, prázdné pole = OK. */
  errors: string[];
}

/** Kroky [4a] až [4d]: sloupce, cizí klíče, CHECK, indexy. Vrací chyby po krocích (nic nevyhazuje). */
export async function verifyPointsSchema(query: PointsQuery): Promise<VerifyStep[]> {
  const steps: VerifyStep[] = [];

  const a: string[] = [];
  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const cols = (await query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table]
    )) as unknown as ColumnRow[];
    if (cols.length !== expected.length) {
      a.push(`${table}: očekáváno ${expected.length} sloupců, nalezeno ${cols.length}`);
      continue;
    }
    expected.forEach((e, i) => {
      const x = cols[i];
      if (x.column_name !== e.column_name || x.data_type !== e.data_type || x.is_nullable !== e.is_nullable) {
        a.push(`${table} sloupec #${i} nesedí: očekáváno ${JSON.stringify(e)}, nalezeno ${JSON.stringify(x)}`);
      }
    });
  }
  steps.push({ step: "4a", errors: a });

  const b: string[] = [];
  for (const e of EXPECTED_FKS) {
    const fks = (await query(
      `SELECT c.confdeltype::text AS confdeltype, c.confrelid::regclass::text AS referenced
       FROM pg_constraint c
       JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
       WHERE c.conrelid = ($1)::regclass AND c.contype = 'f' AND a.attname = $2`,
      ["public." + e.table, e.column]
    )) as unknown as { confdeltype: string; referenced: string }[];
    if (fks.length !== 1 || fks[0].confdeltype !== e.confdeltype || fks[0].referenced !== e.referenced) {
      b.push(`FK ${e.table}.${e.column} nesedí: ${JSON.stringify(fks)}`);
    }
  }
  steps.push({ step: "4b", errors: b });

  const c: string[] = [];
  const checks = (await query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'public.semafor_point'::regclass AND contype = 'c'`
  )) as unknown as { conname: string; def: string }[];
  for (const name of POINT_CHECKS) {
    const found = checks.find((x) => x.conname === name);
    if (!found) {
      c.push(`chybí CHECK semafor_point.${name}`);
      continue;
    }
    for (const lit of CHECK_LITERALS[name] ?? []) {
      if (!found.def.includes(lit)) c.push(`CHECK ${name} neobsahuje ${lit}: ${found.def}`);
    }
  }
  const titleCheck = (await query(
    `SELECT count(*)::int AS n FROM pg_constraint
     WHERE conrelid = 'public.semafor_activity'::regclass AND contype = 'c' AND conname = 'sa_title_len'`
  )) as unknown as { n: number }[];
  if (Number(titleCheck[0]?.n) !== 1) c.push("chybí CHECK semafor_activity.sa_title_len");
  steps.push({ step: "4c", errors: c });

  const d: string[] = [];
  const idx = (await query(
    `SELECT indexname, indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND tablename IN ('semafor_activity', 'semafor_point')
     ORDER BY indexname`
  )) as unknown as { indexname: string; indexdef: string }[];
  const names = idx.map((i) => i.indexname).sort();
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_INDEXES)) {
    d.push(`indexy ${JSON.stringify(names)}, očekáváno ${JSON.stringify(EXPECTED_INDEXES)}`);
  }
  for (const [name, literal] of Object.entries(POINT_UNIQUES)) {
    const def = idx.find((i) => i.indexname === name)?.indexdef ?? "";
    if (!/UNIQUE/.test(def) || !/WHERE/.test(def) || !def.includes(literal)) {
      d.push(`index ${name} není částečný UNIQUE s kategorií ${literal}: ${def}`);
    }
  }
  if (!(idx.find((i) => i.indexname === "uq_sp_work")?.indexdef ?? "").includes("md5")) {
    d.push("uq_sp_work neobsahuje md5 (výrazový index s popisem)");
  }
  const dup = idx.find((i) => i.indexname === ACTIVITY_UNIQUE)?.indexdef ?? "";
  if (!/UNIQUE/.test(dup) || !dup.includes("lower") || !dup.includes("held_on")) {
    d.push(`index ${ACTIVITY_UNIQUE} není UNIQUE nad (held_on, lower(btrim(title))): ${dup}`);
  }
  steps.push({ step: "4d", errors: d });

  return steps;
}
