/**
 * iter-046 (arch 3.1, 3.2): DDL medical jako textové konstanty. Čte je migrace
 * `scripts/migrate-iter-046-medical.ts` i SQL test nad PGlite
 * (`scripts/test-iter-046-sql.ts`), takže test ověřuje přesně stejný tvar SQL
 * jako migrace (LL-006 bod 2) a druhý běh se dá ověřit bez DB.
 *
 * Čistý modul. V textu žádná JS interpolace: do `DO $$ ... $$` bloku by se
 * dostala jako bind parametr, který Postgres uvnitř dollar-quoted stringu
 * nerozpozná (LL-006 bod 1). Idempotentní: `ADD COLUMN IF NOT EXISTS`,
 * podmíněný `ADD CONSTRAINT` přes `pg_constraint`.
 */

export const MEMBER_MEDICAL_DDL = `
ALTER TABLE member ADD COLUMN IF NOT EXISTS medical_from DATE;
ALTER TABLE member ADD COLUMN IF NOT EXISTS medical_until DATE;
ALTER TABLE member ADD COLUMN IF NOT EXISTS medical_set_by UUID REFERENCES member(id) ON DELETE SET NULL;
ALTER TABLE member ADD COLUMN IF NOT EXISTS medical_set_at TIMESTAMPTZ;
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'member_medical_range' AND conrelid = 'member'::regclass
) THEN
  ALTER TABLE member ADD CONSTRAINT member_medical_range CHECK (
    (medical_from IS NULL AND medical_until IS NULL)
    OR (medical_from IS NOT NULL AND medical_until IS NOT NULL AND medical_from <= medical_until)
  );
END IF;
`;

export const ABSENCE_MEDICAL_DDL = `
ALTER TABLE member_absence ADD COLUMN IF NOT EXISTS medical BOOLEAN NOT NULL DEFAULT false;
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'ma_medical_no_sub' AND conrelid = 'member_absence'::regclass
) THEN
  ALTER TABLE member_absence ADD CONSTRAINT ma_medical_no_sub CHECK (
    NOT medical OR substitute_name IS NULL
  );
END IF;
`;

export const AUDIT_MEDICAL_DDL = `
IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'aa_field' AND conrelid = 'attendance_audit'::regclass
    AND pg_get_constraintdef(oid) LIKE '%medical%'
) THEN
  ALTER TABLE attendance_audit DROP CONSTRAINT IF EXISTS aa_field;
  ALTER TABLE attendance_audit ADD CONSTRAINT aa_field CHECK (
    field IN ('presence', 'absence', 'medical')
  );
END IF;
`;

/** Tělo v jednom `DO $$ ... $$` bloku s transakčně lokálním `lock_timeout` 5 s ('5s' doslovně). */
export function doBlock(body: string): string {
  if (body.includes("$$")) throw new Error("doBlock: tělo nesmí obsahovat $$");
  return `DO $$ BEGIN
PERFORM set_config('lock_timeout', '5s', true);
${body}
END $$`;
}

/** Smoke test (LL-006 bod 2): stejné tři bloky na dočasných tabulkách, na konci se zahodí. */
export function smokeDdl(): string {
  const rename = (t: string) =>
    t
      .replace(/\bmember_absence\b/g, "_iter046_absence_smoke")
      .replace(/\battendance_audit\b/g, "_iter046_audit_smoke")
      .replace(/REFERENCES member\(id\)/g, "REFERENCES _iter046_member_smoke(id)")
      .replace(/\bmember\b(?!_)/g, "_iter046_member_smoke");
  return `CREATE TEMPORARY TABLE _iter046_member_smoke (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TEMPORARY TABLE _iter046_absence_smoke (substitute_name TEXT);
CREATE TEMPORARY TABLE _iter046_audit_smoke (
  field TEXT NOT NULL,
  CONSTRAINT aa_field CHECK (field IN ('presence', 'absence'))
);
${rename(MEMBER_MEDICAL_DDL)}
${rename(ABSENCE_MEDICAL_DDL)}
${rename(AUDIT_MEDICAL_DDL)}
DROP TABLE _iter046_audit_smoke;
DROP TABLE _iter046_absence_smoke;
DROP TABLE _iter046_member_smoke;`;
}
