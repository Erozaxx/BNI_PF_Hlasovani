/**
 * iter-040 (T-003, arch 6, 10; gate Z1): dotazy interní schůzky v docházce.
 *
 * Bez transakcí (LL-003): založení i zrušení je JEDEN SQL příkaz s pojistkami
 * v CTE. Zrušení maže omluvy a zneplatňuje ranní odkazy jen tehdy, když
 * `del` skutečně smazal řádek `attendance_internal_day` a na den není běžná
 * schůzka. SQL záměrně NEVRACÍ počet ani příznak smazaných omluv (Z1):
 * `absencesDeleted` se počítá z pravidla v `lib/attendance/internal.ts`.
 * Všechny hodnoty jsou bind parametry šablony `sql`, žádné `sql.raw`.
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { MAX_ADVANCE_DAYS } from "@/lib/attendance/rules";
import { TODAY_SQL } from "@/lib/db/queries/attendance";

function getDb() {
  return drizzle(getSql());
}


/** Data interních schůzek v rozsahu `[from, to]` (zelená v kalendáři). */
export async function listInternalDays(from: string, to: string): Promise<string[]> {
  const result = await getDb().execute<{ d: string }>(sql`
    SELECT attendance_date::text AS d FROM attendance_internal_day
    WHERE attendance_date >= ${from}::date AND attendance_date <= ${to}::date
    ORDER BY attendance_date
  `);
  return result.rows.map((r) => r.d);
}

export interface InternalDayState {
  hasInternal: boolean;
  hasMeeting: boolean;
  finalized: boolean;
  hasManagerRecord: boolean;
}

/** Stav dne pro hlášku a kartu po akci (jeden SELECT, vzor `getDayMeta`). */
export async function getInternalDayState(date: string): Promise<InternalDayState> {
  const result = await getDb().execute<{
    has_internal: boolean;
    has_meeting: boolean;
    finalized: boolean;
    has_manager: boolean;
  }>(sql`
    SELECT EXISTS (SELECT 1 FROM attendance_internal_day i WHERE i.attendance_date = ${date}::date) AS has_internal,
           EXISTS (SELECT 1 FROM meeting mt WHERE mt.date = ${date}::date) AS has_meeting,
           EXISTS (
             SELECT 1 FROM attendance_day d
             WHERE d.attendance_date = ${date}::date AND d.finalized_at IS NOT NULL
           ) AS finalized,
           EXISTS (
             SELECT 1 FROM attendance_record r
             WHERE r.attendance_date = ${date}::date AND r.source = 'manager'
           ) AS has_manager
  `);
  const r = result.rows[0];
  return {
    hasInternal: Boolean(r?.has_internal),
    hasMeeting: Boolean(r?.has_meeting),
    finalized: Boolean(r?.finalized),
    hasManagerRecord: Boolean(r?.has_manager),
  };
}

export interface CreateInternalResult {
  /** Řádek vložil tenhle příkaz. */
  created: boolean;
  /** Interní už na den byla (cílový stav splněn). */
  existed: boolean;
  hasMeeting: boolean;
  rangeOk: boolean;
}

/** Založení (6.2): jeden příkaz, souběh vyřeší `ON CONFLICT`. */
export async function createInternalDay(input: {
  date: string;
  actorId: string;
}): Promise<CreateInternalResult> {
  const { date, actorId } = input;
  const result = await getDb().execute<{
    range_ok: boolean;
    has_meeting: boolean;
    existed: boolean;
    n: number;
  }>(sql`
    WITH g AS (
      SELECT (${date}::date > ${TODAY_SQL} AND ${date}::date <= ${TODAY_SQL} + ${MAX_ADVANCE_DAYS}::int) AS range_ok,
             EXISTS (SELECT 1 FROM meeting WHERE date = ${date}::date) AS has_meeting,
             EXISTS (SELECT 1 FROM attendance_internal_day WHERE attendance_date = ${date}::date) AS existed
    ),
    ins AS (
      INSERT INTO attendance_internal_day (attendance_date, created_by)
      SELECT ${date}::date, ${actorId}::uuid
      WHERE (SELECT range_ok AND NOT has_meeting FROM g)
      ON CONFLICT (attendance_date) DO NOTHING
      RETURNING 1
    )
    SELECT g.range_ok, g.has_meeting, g.existed, (SELECT count(*) FROM ins)::int AS n FROM g
  `);
  const r = result.rows[0];
  return {
    created: Number(r?.n ?? 0) === 1,
    existed: Boolean(r?.existed),
    hasMeeting: Boolean(r?.has_meeting),
    rangeOk: Boolean(r?.range_ok),
  };
}

export interface CancelInternalResult {
  /** Řádek smazal tenhle příkaz. */
  deleted: boolean;
  /** Interní na den byla před příkazem. */
  existed: boolean;
  timeOk: boolean;
  openOk: boolean;
  recorded: boolean;
  hasMeeting: boolean;
}

/**
 * Zrušení (6.3, LL-003): jeden příkaz. `gone` (omluvy) i `rev` (ranní odkazy)
 * běží jen s `EXISTS (SELECT 1 FROM del)` a jen bez běžné schůzky. Výsledek
 * nenese počet ani příznak smazaných omluv (Z1).
 */
export async function cancelInternalDay(input: { date: string }): Promise<CancelInternalResult> {
  const { date } = input;
  const result = await getDb().execute<{
    time_ok: boolean;
    open_ok: boolean;
    recorded: boolean;
    has_meeting: boolean;
    existed: boolean;
    n: number;
  }>(sql`
    WITH g AS (
      SELECT (${date}::date >= ${TODAY_SQL}
              AND now() < ((${date}::date + time '17:00') AT TIME ZONE 'Europe/Prague')) AS time_ok,
             NOT EXISTS (SELECT 1 FROM attendance_day d
                         WHERE d.attendance_date = ${date}::date AND d.finalized_at IS NOT NULL) AS open_ok,
             EXISTS (SELECT 1 FROM attendance_record r
                     WHERE r.attendance_date = ${date}::date AND r.source = 'manager') AS recorded,
             EXISTS (SELECT 1 FROM meeting mt WHERE mt.date = ${date}::date) AS has_meeting,
             EXISTS (SELECT 1 FROM attendance_internal_day x WHERE x.attendance_date = ${date}::date) AS existed
    ),
    del AS (
      DELETE FROM attendance_internal_day
      WHERE attendance_date = ${date}::date
        AND (SELECT time_ok AND open_ok AND (has_meeting OR NOT recorded) FROM g)
      RETURNING 1
    ),
    gone AS (
      DELETE FROM member_absence
      WHERE absence_date = ${date}::date
        AND EXISTS (SELECT 1 FROM del) AND NOT (SELECT has_meeting FROM g)
      RETURNING 1
    ),
    rev AS (
      UPDATE attendance_link SET revoked_at = now()
      WHERE attendance_date = ${date}::date AND revoked_at IS NULL
        AND EXISTS (SELECT 1 FROM del) AND NOT (SELECT has_meeting FROM g)
      RETURNING 1
    )
    SELECT g.time_ok, g.open_ok, g.recorded, g.has_meeting, g.existed,
           (SELECT count(*) FROM del)::int AS n
    FROM g
  `);
  const r = result.rows[0];
  return {
    deleted: Number(r?.n ?? 0) === 1,
    existed: Boolean(r?.existed),
    timeOk: Boolean(r?.time_ok),
    openOk: Boolean(r?.open_ok),
    recorded: Boolean(r?.recorded),
    hasMeeting: Boolean(r?.has_meeting),
  };
}
