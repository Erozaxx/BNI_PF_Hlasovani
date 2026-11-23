/**
 * Testy iter-048, SQL: `interviewDueVisibleSql()` nad PGlite in-process. Bez
 * DATABASE_URL a bez sítě. Modul se hledá v `PGLITE_MODULE_DIR` nebo v cwd,
 * `REQUIRE_PGLITE=1` z chybějícího modulu udělá chybu (npm run test:iter-048-sql).
 * Jména jsou smyšlená.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { interviewDueVisibleSql } from "../lib/db/queries/interviews";
import { addDaysToDateString, isMemberActive, pragueToday } from "../lib/members/activity";
import { isMedicalOn } from "../lib/members/medical";

interface PgLite {
  waitReady: Promise<unknown>;
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

function loadPglite(): (new () => PgLite) | null {
  const dirs = [process.env.PGLITE_MODULE_DIR, process.cwd()].filter((d): d is string => !!d);
  for (const dir of dirs) {
    try {
      const req = createRequire(path.join(dir, "noop.js"));
      const mod = req("@electric-sql/pglite") as { PGlite: new () => PgLite };
      return mod.PGlite;
    } catch {
      /* zkusit další */
    }
  }
  return null;
}

/** Jen sloupce, které podmínka čte, včetně CHECK z ostré DB (member_medical_range, member_inactive_until...). */
const DDL = `
CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  deactivated_at timestamptz, inactive_until date,
  medical_from date, medical_until date,
  CONSTRAINT member_inactive_until_needs_deactivation CHECK (inactive_until IS NULL OR deactivated_at IS NOT NULL),
  CONSTRAINT member_medical_range CHECK (
    (medical_from IS NULL AND medical_until IS NULL)
    OR (medical_from IS NOT NULL AND medical_until IS NOT NULL AND medical_from <= medical_until)
  )
);
`;

type Fixture = {
  name: string;
  deactivatedAt: string | null;
  inactiveUntil: string | null;
  medicalFrom: string | null;
  medicalUntil: string | null;
  visible: boolean;
};

async function main() {
  const PGlite = loadPglite();
  if (!PGlite) {
    const msg =
      "PGlite nenalezen (nastav PGLITE_MODULE_DIR na adresář s node_modules/@electric-sql/pglite). SQL scénáře iter-048 PŘESKOČENY.";
    if (process.env.REQUIRE_PGLITE === "1") {
      console.error(msg);
      process.exit(1);
    }
    console.log(`UPOZORNĚNÍ: ${msg}`);
    return;
  }
  const db = new PGlite();
  await db.waitReady;
  await db.exec(DDL);

  const D = pragueToday();
  const day = (n: number) => addDaysToDateString(D, n);
  const deact = "2026-01-01T00:00:00Z";
  const f = (
    name: string,
    visible: boolean,
    p: Partial<Omit<Fixture, "name" | "visible">> = {}
  ): Fixture => ({
    name,
    visible,
    deactivatedAt: null,
    inactiveUntil: null,
    medicalFrom: null,
    medicalUntil: null,
    ...p,
  });

  const fixtures: Fixture[] = [
    f("Eva Test 1 medical dnes", false, { medicalFrom: day(-3), medicalUntil: day(5) }),
    f("Eva Test 2 medical končí dnes", false, { medicalFrom: day(-3), medicalUntil: day(0) }),
    f("Eva Test 3 medical začal dnes", false, { medicalFrom: day(0), medicalUntil: day(7) }),
    f("Eva Test 4 medical skončil včera", true, { medicalFrom: day(-8), medicalUntil: day(-1) }),
    f("Eva Test 5 medical začne zítra", true, { medicalFrom: day(1), medicalUntil: day(9) }),
    f("Eva Test 6 deaktivace trvalá", false, { deactivatedAt: deact }),
    f("Eva Test 7 deaktivace do D+10", false, { deactivatedAt: deact, inactiveUntil: day(10) }),
    f("Eva Test 8 deaktivace do D", false, { deactivatedAt: deact, inactiveUntil: day(0) }),
    f("Eva Test 9 deaktivace skončená", true, { deactivatedAt: deact, inactiveUntil: day(-1) }),
    f("Eva Test 10 medical i deaktivace", false, {
      deactivatedAt: deact,
      inactiveUntil: day(10),
      medicalFrom: day(-1),
      medicalUntil: day(3),
    }),
    f("Eva Test 11 bez ničeho", true),
  ];

  for (const x of fixtures) {
    await db.query(
      `INSERT INTO member (name, deactivated_at, inactive_until, medical_from, medical_until) VALUES ($1, $2, $3, $4, $5)`,
      [x.name, x.deactivatedAt, x.inactiveUntil, x.medicalFrom, x.medicalUntil]
    );
  }

  const q = new PgDialect().sqlToQuery(sql`SELECT name FROM member WHERE ${interviewDueVisibleSql()}`);
  const visible = new Set((await db.query(q.sql, q.params as unknown[])).rows.map((r) => String(r.name)));

  let n = 0;
  for (const x of fixtures) {
    assert.equal(visible.has(x.name), x.visible, `${x.name}: čekáno ${x.visible ? "viditelný" : "skrytý"}`);
    console.log(`ok ${++n}. ${x.name}: ${x.visible ? "viditelný" : "skrytý"}`);
  }

  for (const x of fixtures) {
    const ts =
      isMemberActive({ deactivatedAt: x.deactivatedAt, inactiveUntil: x.inactiveUntil }, D) &&
      !isMedicalOn({ medicalFrom: x.medicalFrom, medicalUntil: x.medicalUntil }, D);
    assert.equal(ts, visible.has(x.name), `${x.name}: TS a SQL se rozcházejí`);
  }
  console.log(`ok ${++n}. shoda s TS isMemberActive a isMedicalOn pro všech ${fixtures.length} řádků`);

  await db.close();
  console.log(`\n${n}/${n} testů prošlo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
