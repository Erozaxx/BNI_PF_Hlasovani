/**
 * Testy iter-046, část A, SQL: migrace medical (DDL z `lib/members/medical-ddl.ts`,
 * stejný text jako ve skriptu migrace) a skutečné dotazy z `lib/db/queries`
 * nad PGlite in-process. Bez DATABASE_URL a bez sítě. Modul se hledá v
 * `PGLITE_MODULE_DIR` nebo v cwd; bez něj se test přeskočí s hlasitou hláškou,
 * `REQUIRE_PGLITE=1` z toho udělá chybu (npm run test:iter-046-sql).
 *
 * Číslování podle arch_iter-046_T-001 kap. 13.3: 25 až 29, 32, 33, k tomu
 * migrace (idempotence), gate změna 4 (člen zapsaný `unexcused` před obdobím)
 * a gate změna 5 (náhradník k medical omluvě). Část B (C5, C6): testy 30 a 31
 * (heslo, reset), 34 (pohled všech na den), viz konec souboru.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { absenceStatusSql, missingStatusSql } from "../lib/db/queries/absence-status";
import { fillDayRowsSql, materializeMedicalSql, countExcusedForSql } from "../lib/db/queries/attendance-close";
import { clearMemberMedicalSql, memberMayVoteNowSql, setMemberMedicalSql } from "../lib/db/queries/member-medical";
import { ABSENCE_MEDICAL_DDL, AUDIT_MEDICAL_DDL, MEMBER_MEDICAL_DDL, doBlock, smokeDdl } from "../lib/members/medical-ddl";
import { addDaysToDateString, pragueToday } from "../lib/members/activity";
import { sql } from "drizzle-orm";
import { resetPasswordSql, setOwnPasswordSql, setPasswordFromLinkSql, revokeMagicLinkSql, updateMemberEmailSql } from "../lib/db/queries/members";

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

let n = 0;
const ok = (m: string) => console.log(`ok ${++n}. ${m}`);

/** Schéma před iter-046 (jen sloupce a CHECK, které dotazy čtou), včetně audit triggeru append-only. */
const BASE_DDL = `
CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  joined_at date NOT NULL DEFAULT '2020-01-01',
  password_hash text, management_role text,
  deactivated_at timestamptz, inactive_until date,
  CONSTRAINT member_inactive_until_needs_deactivation CHECK (inactive_until IS NULL OR deactivated_at IS NOT NULL)
);
CREATE TABLE chapter_function (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, area text NOT NULL,
  display_order integer NOT NULL, permissions text[]
);
CREATE TABLE member_function (
  member_id uuid PRIMARY KEY REFERENCES member(id) ON DELETE CASCADE,
  function_id uuid NOT NULL REFERENCES chapter_function(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now(), assigned_by uuid REFERENCES member(id) ON DELETE SET NULL
);
CREATE TABLE member_absence (
  member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  absence_date date NOT NULL,
  substitute_name text,
  created_by uuid REFERENCES member(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES member(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, absence_date),
  CONSTRAINT ma_sub_len CHECK (substitute_name IS NULL OR char_length(btrim(substitute_name)) BETWEEN 2 AND 80)
);
CREATE TABLE attendance_record (
  attendance_date date NOT NULL,
  member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  status text NOT NULL, substitute_name text,
  source text NOT NULL DEFAULT 'manager', version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES member(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attendance_date, member_id),
  CONSTRAINT ar_status CHECK (status IN ('absent', 'present', 'substitute', 'unexcused')),
  CONSTRAINT ar_source CHECK (source IN ('manager', 'auto', 'palms')),
  CONSTRAINT ar_sub CHECK ((status = 'substitute') = (substitute_name IS NOT NULL))
);
CREATE TABLE attendance_day (
  attendance_date date PRIMARY KEY, finalized_at timestamptz, mode text,
  report_late boolean NOT NULL DEFAULT false
);
CREATE TABLE member_substitute_name (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  name text NOT NULL, last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX msn_member_name ON member_substitute_name (member_id, lower(name));
CREATE TABLE attendance_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid, actor_name text NOT NULL, member_id uuid, member_name text NOT NULL,
  attendance_date date NOT NULL, field text NOT NULL, old_value text, new_value text,
  CONSTRAINT aa_field CHECK (field IN ('presence', 'absence'))
);
CREATE FUNCTION attendance_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN RAISE EXCEPTION 'attendance_audit je jen pro zápis'; END $f$;
CREATE TRIGGER attendance_audit_no_update_delete BEFORE UPDATE OR DELETE ON attendance_audit
  FOR EACH ROW EXECUTE FUNCTION attendance_audit_immutable();
`;

const dialect = new PgDialect();
const TODAY = pragueToday();
const PAST = addDaysToDateString(TODAY, -14);
const FUTURE = addDaysToDateString(TODAY, 3);
const day = (d: number) => addDaysToDateString(TODAY, d);

async function main() {
  // `attendance.ts` importuje `getChapterSettings` (React `cache`), v holém Node (tsx) bez Reactu serveru
  // funkce `cache` chybí. Pro test stačí průchozí náhrada, dotazy se tím nemění.
  const reactMod = createRequire(__filename)("react") as { cache?: unknown };
  if (typeof reactMod.cache !== "function") reactMod.cache = <T>(fn: T): T => fn;
  const {
    listDayPlannedPublicSql,
    listDayResultsPublicSql,
    listSheetRowsSql,
    setMedicalFlagSql,
    setMyAbsenceSql,
    writePresenceSql,
  } = await import(
    "../lib/db/queries/attendance"
  );
  const PGlite = loadPglite();
  if (!PGlite) {
    const msg =
      "PGlite nenalezen (nastav PGLITE_MODULE_DIR na adresář s node_modules/@electric-sql/pglite). SQL scénáře iter-046 PŘESKOČENY.";
    if (process.env.REQUIRE_PGLITE === "1") {
      console.error(msg);
      process.exit(1);
    }
    console.log(`UPOZORNĚNÍ: ${msg}`);
    return;
  }
  const db = new PGlite();
  await db.waitReady;
  await db.exec(BASE_DDL);

  const run = async (q: SQL) => {
    const c = dialect.sqlToQuery(q);
    return (await db.query(c.sql, c.params as unknown[])).rows;
  };
  const rows = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
  const one = async (text: string, params: unknown[] = []) => (await rows(text, params))[0];
  const count = async (table: string, where = "true") =>
    Number((await rows(`SELECT count(*)::int AS c FROM ${table} WHERE ${where}`))[0].c);
  const mk = async (name: string, extra = ""): Promise<string> =>
    String(
      (await rows(`INSERT INTO member (name${extra ? ", " + extra.split("=")[0] : ""}) VALUES ($1${extra ? ", " + extra.split("=")[1] : ""}) RETURNING id`, [name]))[0].id
    );

  // ── Stará data před migrací ─────────────────────────────────
  const oldMember = await mk("Starý člen");
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $2, NULL)`, [oldMember, PAST]);
  await db.query(
    `INSERT INTO attendance_audit (actor_name, member_name, attendance_date, field, old_value, new_value) VALUES ('A', 'B', $1, 'presence', 'present', 'absent')`,
    [PAST]
  );

  // ── Migrace: idempotence a smoke ────────────────────────────
  for (let i = 0; i < 2; i++) {
    await db.exec(doBlock(smokeDdl()));
  }
  assert.equal(await count("information_schema.tables", "table_name LIKE '%smoke%'"), 0, "smoke po sobě uklidí");
  ok("M1. smoke test (stejný text DDL na dočasných tabulkách) projde dvakrát a po sobě uklidí");

  const migrate = async () => {
    await db.exec(doBlock(MEMBER_MEDICAL_DDL));
    await db.exec(doBlock(ABSENCE_MEDICAL_DDL));
    await db.exec(doBlock(AUDIT_MEDICAL_DDL));
  };
  await migrate();
  const snapshot = async () =>
    JSON.stringify({
      cols: await rows(
        `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
         WHERE table_schema = 'public' AND column_name IN ('medical_from','medical_until','medical_set_by','medical_set_at','medical') ORDER BY 1, 2`
      ),
      cons: await rows(
        `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname IN ('member_medical_range','ma_medical_no_sub','aa_field') ORDER BY 1`
      ),
    });
  const first = await snapshot();
  await migrate();
  assert.equal(await snapshot(), first, "druhý běh nic nezměnil");
  ok("M2. migrace dvakrát po sobě (druhý běh nic nezmění), nad audit tabulkou s triggerem append-only");

  const cols = JSON.parse(first).cols as { table_name: string; column_name: string; data_type: string; is_nullable: string }[];
  assert.equal(cols.length, 5);
  const medicalCol = cols.find((c) => c.column_name === "medical")!;
  assert.equal(medicalCol.data_type, "boolean");
  assert.equal(medicalCol.is_nullable, "NO");
  assert.equal((await one(`SELECT medical FROM member_absence WHERE member_id = $1`, [oldMember])).medical, false, "stará omluva má DEFAULT false");
  const fk = await one(
    `SELECT c.confdeltype::text AS t FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'member'::regclass AND c.contype = 'f' AND a.attname = 'medical_set_by'`
  );
  assert.equal(fk.t, "n", "FK medical_set_by je ON DELETE SET NULL");
  const aa = String((await one(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'aa_field'`)).d);
  for (const v of ["'presence'", "'absence'", "'medical'"]) assert.ok(aa.includes(v), aa);
  await db.query(
    `INSERT INTO attendance_audit (actor_name, member_name, attendance_date, field) VALUES ('A', 'B', $1, 'medical')`,
    [PAST]
  );
  assert.equal(await count("attendance_audit"), 2, "stará data zůstala, nová hodnota field projde");
  await assert.rejects(() => db.query(`UPDATE attendance_audit SET new_value = 'x'`), /jen pro zápis/);
  await assert.rejects(() => db.query(`UPDATE member SET medical_from = '2026-11-20', medical_until = '2026-11-10' WHERE id = $1`, [oldMember]), /member_medical_range/);
  await assert.rejects(() => db.query(`UPDATE member SET medical_from = '2026-11-20' WHERE id = $1`, [oldMember]), /member_medical_range/);
  await assert.rejects(
    () => db.query(`UPDATE member_absence SET medical = true, substitute_name = 'Jan Test' WHERE member_id = $1`, [oldMember]),
    /ma_medical_no_sub/
  );
  ok("M3. po migraci: sloupce a typy, FK SET NULL, CHECK range, ma_medical_no_sub, aa_field, stará data beze změny");

  // ── 25. absenceStatusSql / missingStatusSql ─────────────────
  const m25 = await mk("M25");
  const d25 = [day(-30), day(-29), day(-28), day(-27), day(-26)];
  const status25 = ["absent", "absent", "absent", "unexcused", "present"];
  for (let i = 0; i < d25.length; i++) {
    await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status) VALUES ($1, $2, $3)`, [d25[i], m25, status25[i]]);
    await db.query(`INSERT INTO attendance_day (attendance_date, finalized_at) VALUES ($1, now())`, [d25[i]]);
  }
  // d25[0] medical omluva, d25[1] omluva bez medical, d25[2] bez omluvy, d25[3] unexcused
  await db.query(`INSERT INTO member_absence (member_id, absence_date, medical) VALUES ($1, $2, true)`, [m25, d25[0]]);
  await db.query(`INSERT INTO member_absence (member_id, absence_date, medical) VALUES ($1, $2, false)`, [m25, d25[1]]);
  const counted = await run(sql`SELECT r.attendance_date::text AS d FROM attendance_record r WHERE r.member_id = ${m25}::uuid AND ${absenceStatusSql("r")} ORDER BY 1`);
  assert.deepEqual(counted.map((r) => r.d), [d25[1], d25[2], d25[3]]);
  const missing = await run(sql`SELECT r.attendance_date::text AS d FROM attendance_record r WHERE r.member_id = ${m25}::uuid AND ${missingStatusSql("r")} ORDER BY 1`);
  assert.deepEqual(missing.map((r) => r.d), [d25[0], d25[1], d25[2], d25[3]]);
  ok("25. absenceStatusSql nepočítá medical omluvu (bez omluvy, s omluvou bez medical a unexcused ano), missingStatusSql počítá všechny tři");

  // ── 26. Krok 0 + fillDayRows ────────────────────────────────
  const closeDay = day(-5);
  const inPeriod = { from: addDaysToDateString(closeDay, -3), until: addDaysToDateString(closeDay, 3) };
  const setPeriod = (id: string) =>
    db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [id, inPeriod.from, inPeriod.until]);
  const mMed = await mk("M26 medical");
  const mPresent = await mk("M26 present");
  const mSub = await mk("M26 sub");
  const mUnex = await mk("M26 unexcused");
  const mExplicitAbsent = await mk("M26 absent");
  const mOther = await mk("M26 bez medical");
  const mInactive = await mk("M26 neaktivní");
  for (const id of [mMed, mPresent, mSub, mUnex, mExplicitAbsent, mInactive]) await setPeriod(id);
  await db.query(`UPDATE member SET deactivated_at = now() WHERE id = $1`, [mInactive]);
  await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status) VALUES ($1, $2, 'present')`, [closeDay, mPresent]);
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $2, 'Jan Náhradník')`, [mSub, closeDay]);
  await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status) VALUES ($1, $2, 'unexcused')`, [closeDay, mUnex]);
  await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status) VALUES ($1, $2, 'absent')`, [closeDay, mExplicitAbsent]);
  const step0 = async () => Number((await run(materializeMedicalSql(closeDay)))[0].n);
  const medicalRows = async () =>
    (await rows(`SELECT member_id FROM member_absence WHERE absence_date = $1 AND medical`, [closeDay])).map((r) => String(r.member_id)).sort();
  assert.equal(await step0(), 2);
  assert.deepEqual(await medicalRows(), [mMed, mExplicitAbsent].sort(), "období, explicitní absent ano; present, substitute, unexcused, neaktivní, bez období ne");
  assert.equal(await step0(), 0, "druhé spuštění nic nezmění");
  assert.equal(
    (await one(`SELECT substitute_name FROM member_absence WHERE member_id = $1 AND absence_date = $2`, [mSub, closeDay])).substitute_name,
    "Jan Náhradník"
  );
  for (const mode of ["recorded", "unrecorded"] as const) {
    await db.query(`DELETE FROM attendance_record WHERE attendance_date = $1 AND source = 'auto'`, [closeDay]);
    await run(fillDayRowsSql(closeDay, mode));
    const st = async (id: string) => (await rows(`SELECT status FROM attendance_record WHERE attendance_date = $1 AND member_id = $2`, [closeDay, id]))[0]?.status;
    assert.equal(await st(mMed), "absent", `${mode}: medical člen = absent`);
    assert.equal(await st(mSub), "substitute", `${mode}: náhradník zůstal substitute`);
    assert.equal(await st(mPresent), "present");
    assert.equal(await st(mUnex), "unexcused");
    assert.equal(await st(mExplicitAbsent), "absent");
    assert.equal(await st(mOther), mode === "recorded" ? "present" : undefined, `${mode}: člen bez období`);
  }
  const countedAfter = await run(
    sql`SELECT r.member_id FROM attendance_record r WHERE r.attendance_date = ${closeDay}::date AND ${absenceStatusSql("r")}`
  );
  assert.deepEqual(countedAfter.map((r) => String(r.member_id)), [mUnex], "do absencí jen unexcused, medical absent ne");
  ok("26. krok 0 + fillDayRows (recorded i unrecorded): medical z období, přednost present, substitute i unexcused, idempotence");

  // gate změna 4: člen zapsaný unexcused před nastavením období
  const m26u = await mk("M26 gate4");
  await setPeriod(m26u);
  await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status) VALUES ($1, $2, 'unexcused')`, [closeDay, m26u]);
  await step0();
  assert.equal(await count("member_absence", `member_id = '${m26u}'`), 0);
  ok("26b. gate změna 4: člen zapsaný unexcused před obdobím nedostane medical v kroku 0");

  // countExcusedFor (ranní mail): počítá i období bez řádku
  const cx = await run(countExcusedForSql(closeDay));
  assert.ok(Number(cx[0].excused) >= 3, "omluvy i období bez řádku");
  const mAnn = await mk("M26 ann");
  void mAnn;

  // ── 27. listSheetRows ───────────────────────────────────────
  const sheetDay = TODAY;
  const mS = await mk("M27 medical");
  const mSU = await mk("M27 unexcused");
  const mSA = await mk("M27 náhradník");
  const mSO = await mk("M27 vlastní omluva");
  const mSN = await mk("M27 bez medical");
  for (const id of [mS, mSU, mSA, mSO]) {
    await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [id, day(-2), day(5)]);
  }
  await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status) VALUES ($1, $2, 'unexcused')`, [sheetDay, mSU]);
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $2, 'Eva Náhradnice')`, [mSA, sheetDay]);
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $2, NULL)`, [mSO, sheetDay]);
  const sheet = async (d: string) => {
    const r = await run(listSheetRowsSql(d));
    return new Map(r.map((x) => [String(x.id), x]));
  };
  let sh = await sheet(sheetDay);
  assert.equal(sh.get(mS)!.excused, true);
  assert.equal(sh.get(mS)!.medical, true);
  assert.equal(sh.get(mS)!.medical_period_until, day(5));
  assert.equal(sh.get(mSU)!.medical, false, "gate 4: unexcused má přednost před obdobím");
  assert.equal(sh.get(mSU)!.excused, false);
  assert.equal(sh.get(mSA)!.medical, false, "omluva s náhradníkem období nepřebije");
  assert.equal(sh.get(mSA)!.excused, true);
  assert.equal(sh.get(mSO)!.medical, true, "vlastní omluva bez náhradníka v období je medical");
  assert.equal(sh.get(mSO)!.medical_period_until, day(5));
  assert.equal(sh.get(mSN)!.medical, false);
  assert.equal(sh.get(mSN)!.excused, false);
  // uzavřený den: období se po uzávěrce neodvozuje, jen uložený příznak
  await db.query(`INSERT INTO attendance_day (attendance_date, finalized_at) VALUES ($1, now())`, [sheetDay]);
  sh = await sheet(sheetDay);
  assert.equal(sh.get(mS)!.excused, false);
  assert.equal(sh.get(mS)!.medical, false);
  assert.equal(sh.get(mS)!.medical_period_until, null);
  await db.query(`DELETE FROM attendance_day WHERE attendance_date = $1`, [sheetDay]);
  // budoucí den v období
  sh = await sheet(day(2));
  assert.equal(sh.get(mS)!.medical, true);
  sh = await sheet(day(6));
  assert.equal(sh.get(mS)!.medical, false, "po konci období bez medical");
  ok("27. listSheetRows: neuzavřený den v období = excused + medical + medicalPeriodUntil, unexcused a náhradník mají přednost, uzavřený den bez uložené omluvy nic");

  // ── 28. writePresence excuse_ok ─────────────────────────────
  const w = async (memberId: string, status: "unexcused" | "present", mode: "normal" | "history" = "normal") => {
    const r = await run(
      writePresenceSql({
        date: TODAY, memberId, status, name: null, expectedVersion: 0, actorId: mS, mode, meetingTime: "00:00",
      })
    );
    return r[0];
  };
  const mW = await mk("M28 medical");
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [mW, day(-1), day(2)]);
  const w1 = await w(mW, "unexcused");
  assert.equal(w1.excuse_ok, false);
  assert.equal(w1.version, null);
  assert.equal(await count("attendance_record", `member_id = '${mW}'`), 0, "Chyběl(a) bez omluvy v období nejde");
  const w2 = await w(mW, "present");
  assert.equal(w2.excuse_ok, true);
  assert.equal(Number(w2.version), 1, "Přítomen v období jde (člen přišel)");
  const mW2 = await mk("M28 bez období");
  const w3 = await w(mW2, "unexcused");
  assert.equal(Number(w3.version), 1);
  ok("28. writePresence: unexcused pro člena v období = excused-conflict (excuse_ok false), present projde, člen bez období projde");

  // ── 29. setMedicalFlag ──────────────────────────────────────
  const mF = await mk("M29");
  const mFS = await mk("M29 s náhradníkem");
  const actor = await mk("M29 actor");
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $2, NULL)`, [mF, PAST]);
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $2, 'Karel Náhradník')`, [mFS, PAST]);
  const flag = async (memberId: string, medical: boolean, mode: "normal" | "history" = "history", date = PAST) =>
    (await run(setMedicalFlagSql({ date, memberId, medical, actorId: actor, mode })))[0];
  const auditN = () => count("attendance_audit", `field = 'medical' AND member_id = '${mF}'`);
  let f = await flag(mF, true);
  assert.equal(Number(f.n), 1);
  assert.equal(Number(f.audited), 1);
  assert.equal(await auditN(), 1);
  assert.equal((await one(`SELECT medical FROM member_absence WHERE member_id = $1`, [mF])).medical, true);
  f = await flag(mF, true);
  assert.equal(Number(f.n), 1);
  assert.equal(Number(f.audited), 0, "audit jen při skutečné změně");
  assert.equal(await auditN(), 1);
  f = await flag(mF, false);
  assert.equal(Number(f.audited), 1);
  const aud = await one(`SELECT old_value, new_value FROM attendance_audit WHERE field = 'medical' AND member_id = $1 ORDER BY id DESC LIMIT 1`, [mF]);
  assert.deepEqual([aud.old_value, aud.new_value], ["ano", "ne"]);
  f = await flag(mFS, true);
  assert.equal(Number(f.n), 0, "omluva s náhradníkem: medical nejde (n = 0, no-excuse)");
  assert.equal((await one(`SELECT medical FROM member_absence WHERE member_id = $1`, [mFS])).medical, false);
  f = await flag(mF, true, "normal", PAST);
  assert.equal(f.day_ok, false, "režim normal na minulý den neprojde");
  assert.equal(await count("attendance_audit", `field = 'medical' AND member_id = '${mF}'`), 2, "normal nic nezapsal ani do auditu");
  await assert.rejects(() => db.query(`UPDATE member_absence SET medical = true WHERE member_id = $1`, [mFS]), /ma_medical_no_sub/);
  ok("29. setMedicalFlag v history: audit field medical jen při změně, omluva s náhradníkem n = 0, CHECK odmítne medical se jménem, normal na minulý den ne");

  // gate změna 5: vlastní omluva člena s medical doplní náhradníka
  const mG5 = await mk("M30 gate5");
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name, medical) VALUES ($1, $2, NULL, true)`, [mG5, FUTURE]);
  const own = (kind: "absence" | "substitute" | "none", name: string | null = null) =>
    run(setMyAbsenceSql({ memberId: mG5, date: FUTURE, kind, name, meetingTime: "23:59" }));
  await own("absence");
  assert.equal((await one(`SELECT medical FROM member_absence WHERE member_id = $1`, [mG5])).medical, true, "stejná omluva medical drží");
  const g5 = await own("substitute", "Petr Náhradník");
  assert.equal(g5[0].ok, true);
  const afterSub = await one(`SELECT medical, substitute_name FROM member_absence WHERE member_id = $1`, [mG5]);
  assert.equal(afterSub.medical, false);
  assert.equal(afterSub.substitute_name, "Petr Náhradník");
  ok("30g. gate změna 5: náhradník k medical omluvě projde a nastaví medical = false (bez pádu na CHECK)");

  // ── 32. nastavení a zrušení medical člena ───────────────────
  const fnId = String((await rows(`INSERT INTO chapter_function (name, area, display_order, permissions) VALUES ('Člen výboru', 'vybor', 1, NULL) RETURNING id`))[0].id);
  const fnOther = String((await rows(`INSERT INTO chapter_function (name, area, display_order, permissions) VALUES ('Ruční', 'ostatni', 2, ARRAY['guests.manage']) RETURNING id`))[0].id);
  const committee = await mk("M32 výbor", "password_hash='x'");
  await db.query(`INSERT INTO member_function (member_id, function_id) VALUES ($1, $2)`, [committee, fnId]);
  const moderator = String((await rows(`INSERT INTO member (name, password_hash, management_role) VALUES ('M32 moderátor', 'x', 'moderator') RETURNING id`))[0].id);
  const manual = await mk("M32 ruční", "password_hash='x'");
  await db.query(`INSERT INTO member_function (member_id, function_id) VALUES ($1, $2)`, [manual, fnOther]);
  const adminId = String((await rows(`INSERT INTO member (name, password_hash, management_role) VALUES ('M32 admin', 'x', 'admin') RETURNING id`))[0].id);
  const target = await mk("M32 cíl");
  const setM = async (actorId: string, targetId: string, until: string) =>
    run(setMemberMedicalSql({ actorId, targetId, until }));
  const stateOf = async (id: string) => await one(`SELECT medical_from::text AS f, medical_until::text AS u, medical_set_by FROM member WHERE id = $1`, [id]);

  assert.equal((await setM(committee, committee, day(3))).length, 0, "sebe ne");
  assert.equal((await setM(moderator, target, day(3))).length, 0, "role moderátor bez funkce nemá právo");
  assert.equal((await setM(manual, target, day(3))).length, 0, "funkce s ručním seznamem bez práva");
  assert.equal((await setM(committee, target, addDaysToDateString(TODAY, -1))).length, 0, "datum v minulosti ne");
  assert.equal((await setM(committee, target, addDaysToDateString(TODAY, 366))).length, 0, "víc než 365 dní ne");
  assert.equal((await setM(committee, target, addDaysToDateString(TODAY, 365))).length, 1, "přesně 365 dní jde");
  assert.equal((await setM(committee, adminId, day(3))).length, 0, "účet admina jen admin");
  assert.equal((await setM(adminId, adminId, day(3))).length, 0, "admin sám sobě také ne");
  assert.equal((await setM(adminId, committee, day(3))).length, 1, "admin jde");
  let st = await stateOf(target);
  assert.equal(st.f, TODAY);
  assert.equal(st.medical_set_by, committee);
  // prodloužení a zkrácení drží medical_from
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [target, day(-4), day(2)]);
  await setM(committee, target, day(10));
  st = await stateOf(target);
  assert.deepEqual([st.f, st.u], [day(-4), day(10)], "prodloužení drží medical_from");
  await setM(committee, target, day(1));
  st = await stateOf(target);
  assert.deepEqual([st.f, st.u], [day(-4), day(1)], "zkrácení drží medical_from");
  // skončené období: nové začíná dneškem
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [target, day(-20), day(-10)]);
  await setM(committee, target, day(4));
  st = await stateOf(target);
  assert.deepEqual([st.f, st.u], [TODAY, day(4)], "nové období po skončeném začíná dneškem");
  // zrušení
  assert.equal((await run(clearMemberMedicalSql({ actorId: committee, targetId: committee }))).length, 0);
  assert.equal((await run(clearMemberMedicalSql({ actorId: moderator, targetId: target }))).length, 0, "bez práva ne");
  assert.equal((await run(clearMemberMedicalSql({ actorId: committee, targetId: target }))).length, 1);
  st = await stateOf(target);
  assert.deepEqual([st.f, st.u], [null, null]);
  assert.equal((await run(clearMemberMedicalSql({ actorId: committee, targetId: target }))).length, 0, "podruhé nic (už není medical)");
  ok("32. setMemberMedical a clear: sebe ne, bez práva (moderátor, ruční funkce) ne, rozsah data, účet admina jen admin, prodloužení a zkrácení drží medical_from, nové období od dneška, clear vynuluje");

  // ── 33. memberMayVoteNow ────────────────────────────────────
  const vMed = await mk("M33 medical");
  const vEnded = await mk("M33 skončil");
  const vInactive = await mk("M33 neaktivní");
  const vOk = await mk("M33 ok");
  const vFuture = await mk("M33 budoucí");
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [vMed, day(-1), day(2)]);
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [vEnded, day(-10), day(-1)]);
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [vFuture, day(1), day(5)]);
  await db.query(`UPDATE member SET deactivated_at = now() WHERE id = $1`, [vInactive]);
  const may = async (id: string) => (await run(memberMayVoteNowSql(id)))[0]?.ok === true;
  assert.equal(await may(vMed), false);
  assert.equal(await may(vEnded), true, "včera skončený medical");
  assert.equal(await may(vFuture), true, "medical od zítřka dnes neblokuje");
  assert.equal(await may(vInactive), false);
  assert.equal(await may(vOk), true);
  assert.equal(await may("99999999-9999-4999-8999-999999999999"), false, "neexistující člen = fail closed");
  ok("33. memberMayVoteNow: medical dnes false, včera skončený a budoucí true, neaktivní false, neexistující false");

  // ── Část B (iter-046, C5 a C6) ──────────────────────────────
  await db.exec(`
    ALTER TABLE member ADD COLUMN email text;
    ALTER TABLE member ADD COLUMN session_version integer NOT NULL DEFAULT 0;
    ALTER TABLE member ADD COLUMN magic_token_hash text;
    ALTER TABLE member ADD COLUMN token_expires_at timestamptz;
    ALTER TABLE member ADD COLUMN previous_token_hash text;
    ALTER TABLE member ADD COLUMN previous_token_expires_at timestamptz;
    ALTER TABLE member ADD COLUMN token_used boolean NOT NULL DEFAULT false;
    CREATE TABLE member_login_link (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
      purpose text NOT NULL, used_at timestamptz
    );
  `);
  const mkP = async (name: string, cols: Record<string, string | null> = {}): Promise<string> => {
    const keys = ["name", ...Object.keys(cols)];
    const vals = [name, ...Object.values(cols)];
    return String(
      (await rows(`INSERT INTO member (${keys.join(", ")}) VALUES (${vals.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING id`, vals))[0].id
    );
  };
  const addLink = (id: string) =>
    db.query(`INSERT INTO member_login_link (member_id, purpose) VALUES ($1, 'set-password')`, [id]);
  const pendingLinks = async (id: string) =>
    count("member_login_link", `member_id = '${id}' AND purpose = 'set-password' AND used_at IS NULL`);
  const sv = async (id: string) => Number((await one(`SELECT session_version AS v FROM member WHERE id = $1`, [id])).v);
  const hashOf = async (id: string) => (await one(`SELECT password_hash AS h FROM member WHERE id = $1`, [id])).h;

  // ── 30. setOwnPasswordGuarded: režimy set a change ──────────
  const setP = (id: string, hash: string, write: Parameters<typeof setOwnPasswordSql>[2]) =>
    run(setOwnPasswordSql(id, hash, write));
  const pPlain = await mkP("M30 bez hesla");
  const r30a = await setP(pPlain, "H1", { mode: "set" });
  assert.equal(r30a.length, 1, "běžný člen bez hesla: set projde");
  assert.equal(await hashOf(pPlain), "H1");
  assert.equal(await sv(pPlain), 1, "verze session +1");
  assert.equal((await setP(pPlain, "H2", { mode: "set" })).length, 0, "skutečné heslo: set už neprojde");
  assert.equal(await hashOf(pPlain), "H1");
  const pLocked = await mkP("M30 zámek", { password_hash: "LOCK" });
  assert.equal((await setP(pLocked, "H3", { mode: "set" })).length, 0, "zámkový hash bez čekajícího odkazu není cesta k heslu");
  await addLink(pLocked);
  // iter-046 (M-1): zámek po resetu s čekajícím odkazem se ze session nepřepíše
  assert.equal((await setP(pLocked, "H3", { mode: "set" })).length, 0, "zámek a čekající odkaz: set neprojde (jen odkazem z mailu)");
  assert.equal(await pendingLinks(pLocked), 1, "čekající odkaz zůstal nepoužitý");
  assert.equal(await hashOf(pLocked), "LOCK", "hash se nezměnil");
  const pFn = await mkP("M30 funkce");
  await db.query(`INSERT INTO member_function (member_id, function_id) VALUES ($1, $2)`, [pFn, fnId]);
  assert.equal((await setP(pFn, "H4", { mode: "set" })).length, 0, "člen s funkcí: set neprojde (via-link)");
  assert.equal((await setP(moderator, "H4", { mode: "set" })).length, 0, "člen s rolí: set neprojde");
  const pInactive = await mkP("M30 neaktivní", { deactivated_at: "2020-01-01" });
  assert.equal((await setP(pInactive, "H5", { mode: "set" })).length, 0, "neaktivní člen heslo nenastaví");
  // change: optimistická pojistka na ověřený hash
  assert.equal((await setP(pPlain, "H6", { mode: "change", verifiedHash: "JINY" })).length, 0, "hash se mezitím změnil: change neprojde");
  assert.equal((await setP(pPlain, "H6", { mode: "change", verifiedHash: "H1" })).length, 1, "ověřený hash sedí: change projde");
  assert.equal(await hashOf(pPlain), "H6");
  assert.equal((await setP(committee, "H7", { mode: "change", verifiedHash: "x" })).length, 1, "vedení se skutečným heslem změní heslo");
  assert.equal((await setP(pInactive, "H8", { mode: "change", verifiedHash: String(await hashOf(pInactive)) })).length, 0, "neaktivní ani přes change");
  // souběh s resetem vedením: reset přepíše hash, change s původním hashem neprojde
  await db.query(`UPDATE member SET password_hash = 'RESET-LOCK' WHERE id = $1`, [pPlain]);
  assert.equal((await setP(pPlain, "H9", { mode: "change", verifiedHash: "H6" })).length, 0, "souběžný reset vyhrává");
  // heslo z odkazu: aktivní člen bez ohledu na roli a funkci
  assert.equal((await run(setPasswordFromLinkSql(pFn, "HL"))).length, 1, "z odkazu i člen s funkcí");
  assert.equal((await run(setPasswordFromLinkSql(pInactive, "HL"))).length, 0, "z odkazu ne neaktivnímu");
  ok("30. setOwnPasswordGuarded: set jen běžnému členovi bez hashe (zámek a čekající odkaz ne, M-1), ne funkci, roli, neaktivnímu; change drží ověřený hash; odkazy použité");

  // ── 31. resetPasswordGuarded: kdokoli s e-mailem ────────────
  const resetP = (actor: string, target: string) => run(resetPasswordSql(target, actor, "LOCKX"));
  const rPlain = await mkP("M31 člen", { email: "clen@example.test", password_hash: "PW" });
  await addLink(rPlain);
  const v0 = await sv(rPlain);
  assert.equal((await resetP(committee, rPlain)).length, 1, "běžný člen s e-mailem: reset projde");
  assert.equal(await hashOf(rPlain), "LOCKX");
  assert.equal(await sv(rPlain), v0 + 1, "session se zneplatní");
  assert.equal(await pendingLinks(rPlain), 0, "čekající odkazy zneplatněné ve stejném příkazu");
  const rNoMail = await mkP("M31 bez e-mailu", { password_hash: "PW" });
  assert.equal((await resetP(committee, rNoMail)).length, 0, "člen bez e-mailu: reset ne");
  const rEmpty = await mkP("M31 prázdný e-mail", { email: "", password_hash: "PW" });
  assert.equal((await resetP(committee, rEmpty)).length, 0, "prázdný e-mail je jako žádný");
  assert.equal((await resetP(committee, committee)).length, 0, "sebe ne");
  await db.query(`UPDATE member SET email = 'a@example.test' WHERE id = $1`, [adminId]);
  assert.equal((await resetP(committee, adminId)).length, 0, "účet admina jen admin");
  assert.equal((await resetP(pPlain, rPlain)).length, 0, "běžný člen bez práva reset nevyvolá");
  assert.equal((await resetP(moderator, rPlain)).length, 1, "moderátor reset smí");
  // M-1: po resetu (zámek + čekající odkaz) běžný člen přes set nepřejde a odkaz zůstane
  await addLink(rPlain);
  assert.equal((await setP(rPlain, "HX", { mode: "set" })).length, 0, "po resetu set neprojde");
  assert.equal(await hashOf(rPlain), "LOCKX");
  assert.equal(await pendingLinks(rPlain), 1, "odkaz z resetu zůstal nepoužitý");
  ok("31. resetPasswordGuarded: běžný člen s e-mailem projde, bez e-mailu a sebe ne, účet admina jen admin, bez práva ne, zneplatní odkazy a session");

  // ── 36. změna e-mailu zvýší session_version každému členovi (L-3) ──
  const eMember = await mkP("M36 člen", { email: "stary@example.test" });
  await addLink(eMember);
  const eSv = await sv(eMember);
  const e1 = await run(updateMemberEmailSql(eMember, "stary@example.test", committee));
  assert.equal(e1[0]?.changed, false);
  assert.equal(await sv(eMember), eSv, "stejná adresa verzi nemění");
  const e2 = await run(updateMemberEmailSql(eMember, "novy@example.test", committee));
  assert.equal(e2[0]?.changed, true);
  assert.equal(await sv(eMember), eSv + 1, "běžný člen: změna e-mailu odhlásí session");
  assert.equal(await pendingLinks(eMember), 0, "odkazy zneplatněné");
  ok("36. updateMemberEmail: změna adresy zvýší session_version i běžnému členovi, stejná adresa ne");

  // ── 37. reset hesla a zneplatnění osobního odkazu (T-005b) ──
  const tMember = await mkP("M37 člen", { email: "clen37@example.test", password_hash: "PW" });
  await db.query(
    `UPDATE member SET magic_token_hash = 'TH', token_expires_at = now() + interval '7 days', previous_token_hash = 'PH', previous_token_expires_at = now() + interval '1 day' WHERE id = $1`,
    [tMember]
  );
  assert.equal((await run(resetPasswordSql(tMember, committee, "LOCK37"))).length, 1);
  assert.equal((await run(revokeMagicLinkSql(tMember, committee))).length, 1, "zneplatnění po resetu projde");
  const tRow = await one(`SELECT magic_token_hash AS m, previous_token_hash AS p, token_expires_at AS e, token_used AS u FROM member WHERE id = $1`, [tMember]);
  assert.deepEqual([tRow.m, tRow.p, tRow.e, tRow.u], [null, null, null, true], "osobní odkaz po resetu neplatí");
  assert.equal(await hashOf(tMember), "LOCK37");
  ok("37. reset hesla a zneplatnění osobního odkazu: tokeny vynulované, token_used true, zámek hesla drží");

  // ── 34. pohled všech na den: jen veřejné sloupce ────────────
  const dClosed = day(-21);
  const dOpen = day(5);
  const vA = await mkP("M34 přítomný");
  const vB = await mkP("M34 omluvený");
  const vC = await mkP("M34 náhradník");
  const vD = await mkP("M34 bez omluvy");
  await db.query(`INSERT INTO attendance_day (attendance_date, finalized_at, mode) VALUES ($1, now(), 'recorded')`, [dClosed]);
  for (const [id, st, sub] of [[vA, "present", null], [vB, "absent", null], [vC, "substitute", "Karel Test"], [vD, "unexcused", null]] as const) {
    await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status, substitute_name) VALUES ($1, $2, $3, $4)`, [dClosed, id, st, sub]);
  }
  await db.query(`INSERT INTO member_absence (member_id, absence_date, medical) VALUES ($1, $2, true)`, [vB, dClosed]);
  const closed = await run(listDayResultsPublicSql(dClosed));
  assert.deepEqual(Object.keys(closed[0]).sort(), ["excused", "name", "status", "substitute_name"], "uzavřený den: jen veřejné sloupce");
  assert.equal(closed.length, 4);
  assert.equal(closed.find((r) => r.name === "M34 omluvený")?.excused, true, "medical omluva je jen omluva");
  assert.equal(closed.find((r) => r.name === "M34 náhradník")?.substitute_name, "Karel Test");
  const vE = await mkP("M34 medical");
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [vE, day(0), day(8)]);
  const vF = await mkP("M34 omluva");
  await db.query(`INSERT INTO member_absence (member_id, absence_date, substitute_name) VALUES ($1, $2, 'Eva Test')`, [vF, dOpen]);
  const vG = await mkP("M34 medical zapsaný přítomný");
  await db.query(`UPDATE member SET medical_from = $2, medical_until = $3 WHERE id = $1`, [vG, day(0), day(8)]);
  await db.query(`INSERT INTO attendance_record (attendance_date, member_id, status) VALUES ($1, $2, 'present')`, [dOpen, vG]);
  const open = await run(listDayPlannedPublicSql(dOpen));
  assert.deepEqual(Object.keys(open[0]).sort(), ["name", "substitute_name"], "neuzavřený den: jen jméno a náhradník");
  const names = open.map((r) => r.name);
  assert.ok(names.includes("M34 medical"), "člen s medical obdobím je v neuzavřeném dni omluvený");
  assert.ok(names.includes("M34 omluva"));
  assert.ok(!names.includes("M34 medical zapsaný přítomný"), "explicitní zápis přítomen má přednost před obdobím");
  assert.ok(!names.includes("M34 přítomný"));
  assert.equal(open.find((r) => r.name === "M34 omluva")?.substitute_name, "Eva Test");
  ok("34. pohled všech: uzavřený den vrací jen name, status, substitute_name, excused; neuzavřený jen name a substitute_name, medical období a omluvy ano, zapsaný přítomný ne");

  await db.close();
  console.log(`\n${n} SQL testů prošlo`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
