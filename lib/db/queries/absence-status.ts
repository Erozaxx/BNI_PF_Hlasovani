/**
 * iter-041 (arch 7.3): jediné místo pro SQL „záznam je absence“. Absence je
 * `absent` (neprítomen) i `unexcused` („Chyběl(a) bez omluvy“). TS protějšek je
 * `isAbsenceStatus` (stav) a `isCountedAbsence` (stav a medical) v lib/attendance/rules.ts. Statický test hlídá, že v
 * `lib/db/queries/attendance*.ts` nezůstane holé `status = 'absent'` mimo
 * zápis (`fillDayRows`).
 *
 * Alias se skládá přes `sql.raw` JEN z pevných literálů (typ `RecordAlias`).
 */
import { sql, type SQL } from "drizzle-orm";

export type RecordAlias = "r" | "x";

/**
 * iter-046 (arch 5.1): počítá se do absencí. `absent` nebo `unexcused`, ke
 * kterému NEEXISTUJE medical omluva téhož člena a dne. TS protějšek je
 * `isCountedAbsence` v lib/attendance/rules.ts (společný test).
 */
export function absenceStatusSql(alias: RecordAlias): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.status IN ('absent', 'unexcused') AND NOT EXISTS (
    SELECT 1 FROM member_absence mma
    WHERE mma.member_id = ${a}.member_id AND mma.absence_date = ${a}.attendance_date AND mma.medical
  ))`;
}

/**
 * iter-046: člen ten den chyběl (i s medical). Jen pro souhrny dne, ne pro
 * limit absencí.
 */
export function missingStatusSql(alias: RecordAlias): SQL {
  const a = sql.raw(alias);
  return sql`${a}.status IN ('absent', 'unexcused')`;
}
