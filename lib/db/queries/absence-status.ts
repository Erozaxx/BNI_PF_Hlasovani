/**
 * iter-041 (arch 7.3): jediné místo pro SQL „záznam je absence“. Absence je
 * `absent` (neprítomen) i `unexcused` („Chyběl(a) bez omluvy“). TS protějšek je
 * `isAbsenceStatus` v lib/attendance/rules.ts. Statický test hlídá, že v
 * `lib/db/queries/attendance*.ts` nezůstane holé `status = 'absent'` mimo
 * zápis (`fillDayRows`).
 *
 * Alias se skládá přes `sql.raw` JEN z pevných literálů (typ `RecordAlias`).
 */
import { sql, type SQL } from "drizzle-orm";

export type RecordAlias = "r" | "x";

export function absenceStatusSql(alias: RecordAlias): SQL {
  const a = sql.raw(alias);
  return sql`${a}.status IN ('absent', 'unexcused')`;
}
