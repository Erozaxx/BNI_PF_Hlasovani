/**
 * iter-038 (T-003c, arch 9, 10): dotazy ranního odkazu, uzavření dne a reportu.
 * Navazuje na lib/db/queries/attendance.ts (T-003a, T-003b).
 *
 * Bez transakcí (LL-003): každý krok je JEDEN SQL příkaz, idempotentní
 * (`ON CONFLICT`, WHERE pojistky), pořadí kroků je zvolené tak, aby pád
 * uprostřed nikdy neposlal mail dvakrát. Datum a čas se počítá v Europe/Prague.
 * Žádná JS interpolace do textu SQL, všechno jsou bind parametry (`sql`
 * šablona drizzle).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { memberActiveSql } from "@/lib/db/queries/member-active";
import {
  ATTENDANCE_LINK_VALID_HOURS,
  ATTENDANCE_REPORT_FUNCTIONS,
  CLAIM_STALE_MINUTES,
  REPORT_RESUME_HOURS,
} from "@/lib/attendance/cron-plan";
import { absenceWindowStart } from "@/lib/attendance/rules";
import type { ReportMember } from "@/lib/attendance/report";

function getDb() {
  return drizzle(getSql());
}

/** `timestamptz` jako ISO řetězec (UTC), nezávisle na tom, co vrací driver. */
function isoSql(col: SQL): SQL {
  return sql`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

// ── Stav dne ─────────────────────────────────────────────────

export interface CloseState {
  /** Na den existuje schůzka v aplikaci. */
  hasMeeting: boolean;
  /** iter-040: na den je interní schůzka (`attendance_internal_day`). */
  hasInternal: boolean;
  /** Na den je řádek zapsaný správcem. */
  hasManagerRecord: boolean;
  /** Na den existuje řádek ranního odkazu (ranní cron už pro den běžel). */
  hasLinkRow: boolean;
  /** Den docházky (3.1): schůzka NEBO interní schůzka NEBO zápis správce. */
  isAttendanceDay: boolean;
  finalized: boolean;
  /** Uzavřeno v posledních `REPORT_RESUME_HOURS` hodinách (dosílání reportu). */
  finalizedRecently: boolean;
  mode: "recorded" | "unrecorded" | null;
  reportLate: boolean;
}

export async function getCloseState(date: string): Promise<CloseState> {
  const result = await getDb().execute<{
    finalized_at: string | null;
    recent: boolean | null;
    mode: string | null;
    late: boolean | null;
    has_meeting: boolean;
    has_internal: boolean;
    has_manager: boolean;
    has_link: boolean;
  }>(sql`
    SELECT ${isoSql(sql`ad.finalized_at`)} AS finalized_at,
           (ad.finalized_at IS NOT NULL
              AND ad.finalized_at > now() - make_interval(hours => ${REPORT_RESUME_HOURS}::int)) AS recent,
           ad.mode, ad.report_late AS late,
           EXISTS (SELECT 1 FROM meeting mt WHERE mt.date = ${date}::date) AS has_meeting,
           EXISTS (SELECT 1 FROM attendance_internal_day i WHERE i.attendance_date = ${date}::date) AS has_internal,
           EXISTS (
             SELECT 1 FROM attendance_record r
             WHERE r.attendance_date = ${date}::date AND r.source = 'manager'
           ) AS has_manager,
           EXISTS (SELECT 1 FROM attendance_link l WHERE l.attendance_date = ${date}::date) AS has_link
    FROM (SELECT 1) x
    LEFT JOIN attendance_day ad ON ad.attendance_date = ${date}::date
  `);
  const r = result.rows[0];
  const hasMeeting = Boolean(r?.has_meeting);
  const hasInternal = Boolean(r?.has_internal);
  const hasManagerRecord = Boolean(r?.has_manager);
  return {
    hasMeeting,
    hasInternal,
    hasManagerRecord,
    hasLinkRow: Boolean(r?.has_link),
    isAttendanceDay: hasMeeting || hasInternal || hasManagerRecord,
    finalized: Boolean(r?.finalized_at),
    finalizedRecently: Boolean(r?.recent),
    mode: r?.mode === "recorded" || r?.mode === "unrecorded" ? r.mode : null,
    reportLate: Boolean(r?.late),
  };
}

// ── Ranní odkaz (arch 9.1, 9.2) ──────────────────────────────

export interface LinkTarget {
  memberId: string;
  name: string;
  email: string | null;
}

/**
 * Aktivní správci docházky, kterým ještě není co poslat: bez řádku odkazu pro den,
 * nebo s řádkem bez `sent_at` a bez `revoked_at` (pád, selhání Resendu). Člen
 * BEZ e-mailu, který už řádek má (přeskočení už je zaznamenané), se nevrací, ať
 * záchranné běhy nedělají zbytečnou práci. Odebraný odkaz (`revoked_at`) se
 * v tomto dni znovu nevydává.
 */
export async function listPendingLinkTargets(date: string): Promise<LinkTarget[]> {
  const result = await getDb().execute<{ id: string; name: string; email: string | null }>(sql`
    SELECT m.id, m.name, NULLIF(btrim(m.email), '') AS email
    FROM member m
    LEFT JOIN attendance_link l ON l.member_id = m.id AND l.attendance_date = ${date}::date
    WHERE m.attendance_manager_since IS NOT NULL
      AND ${memberActiveSql("m")}
      AND (
        l.id IS NULL
        OR (l.sent_at IS NULL AND l.revoked_at IS NULL AND NULLIF(btrim(m.email), '') IS NOT NULL)
      )
    ORDER BY m.name
  `);
  return result.rows.map((r) => ({ memberId: r.id, name: r.name, email: r.email }));
}

/**
 * Přeskočení správce bez e-mailu: zapíše prázdný řádek odkazu (bez tokenu), aby
 * se přeskočení zalogovalo jednou. Vrací `true`, když řádek vznikl teď. Pokud
 * člen e-mail doplní, další ranní běh řádek převezme běžným claimem.
 */
export async function recordLinkSkipped(memberId: string, date: string): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO attendance_link (member_id, attendance_date, claimed_at)
    VALUES (${memberId}::uuid, ${date}::date, now() - make_interval(mins => ${CLAIM_STALE_MINUTES}::int))
    ON CONFLICT (member_id, attendance_date) DO NOTHING
    RETURNING id
  `);
  return result.rows.length > 0;
}

export interface LinkClaim {
  linkId: string;
  /** ISO čas konce platnosti. */
  expiresAt: string;
}

/**
 * Claim odkazu (arch 9.2): jeden příkaz. Vrácený řádek = tenhle běh smí poslat.
 * Souběžný druhý běh řádek nedostane, protože `claimed_at` je čerstvé. Řádek
 * starší než `CLAIM_STALE_MINUTES` bez `sent_at` (pád mezi claimem a odesláním)
 * převezme další běh s novým tokenem; starý hash nikdy neodešel.
 */
export async function claimAttendanceLink(input: {
  memberId: string;
  date: string;
  tokenHash: string;
}): Promise<LinkClaim | null> {
  const { memberId, date, tokenHash } = input;
  const result = await getDb().execute<{ id: string; expires_at: string }>(sql`
    INSERT INTO attendance_link (member_id, attendance_date, token_hash, expires_at, claimed_at)
    VALUES (
      ${memberId}::uuid, ${date}::date, ${tokenHash},
      now() + make_interval(hours => ${ATTENDANCE_LINK_VALID_HOURS}::int), now()
    )
    ON CONFLICT (member_id, attendance_date) DO UPDATE
      SET token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at,
          claimed_at = now()
      WHERE attendance_link.sent_at IS NULL
        AND attendance_link.revoked_at IS NULL
        AND attendance_link.claimed_at < now() - make_interval(mins => ${CLAIM_STALE_MINUTES}::int)
    RETURNING id, ${isoSql(sql`expires_at`)} AS expires_at
  `);
  const r = result.rows[0];
  return r ? { linkId: r.id, expiresAt: r.expires_at } : null;
}

/** Po úspěšném odeslání. Bez transakce: pád před tímhle krokem = odkaz nefunguje a další běh pošle nový. */
export async function markLinkSent(linkId: string, resendId: string | null): Promise<void> {
  await getDb().execute(sql`
    UPDATE attendance_link
    SET sent_at = now(), resend_email_id = ${resendId}
    WHERE id = ${linkId}::uuid
  `);
}

/** Počet předem omluvených a z nich s náhradníkem (jen aktivní členové), pro ranní mail. */
export async function countExcusedFor(date: string): Promise<{ excused: number; withSubstitute: number }> {
  const result = await getDb().execute<{ excused: number; with_sub: number }>(sql`
    SELECT count(*)::int AS excused,
           count(a.substitute_name)::int AS with_sub
    FROM member_absence a
    JOIN member m ON m.id = a.member_id
    WHERE a.absence_date = ${date}::date AND ${memberActiveSql("m")}
  `);
  const r = result.rows[0];
  return { excused: Number(r?.excused ?? 0), withSubstitute: Number(r?.with_sub ?? 0) };
}

// ── Uzavření dne (arch 10.2) ─────────────────────────────────

export type DayMode = "recorded" | "unrecorded";

/**
 * Krok 1: doplnění řádků, idempotentní (`ON CONFLICT DO NOTHING`), `source =
 * 'auto'`, `version = 1`, `updated_by NULL`.
 *
 * - `recorded`: každý aktivní člen s `joined_at <= D` bez řádku dostane `absent`
 *   (ohlášený náhradník, který nepřišel, je tedy absence);
 * - `unrecorded`: jen členové s ohlášením na D, bez náhradníka `absent`, s
 *   náhradníkem `substitute` + jméno. Ostatní bez řádku jsou přítomni.
 *
 * Vrací počet nově vložených řádků.
 */
export async function fillDayRows(date: string, mode: DayMode): Promise<number> {
  if (mode === "recorded") {
    const result = await getDb().execute<{ n: number }>(sql`
      WITH ins AS (
        INSERT INTO attendance_record
          (attendance_date, member_id, status, substitute_name, source, version, updated_by)
        SELECT ${date}::date, m.id, 'absent', NULL, 'auto', 1, NULL
        FROM member m
        WHERE ${memberActiveSql("m")} AND m.joined_at <= ${date}::date
        ON CONFLICT (attendance_date, member_id) DO NOTHING
        RETURNING 1
      )
      SELECT count(*)::int AS n FROM ins
    `);
    return Number(result.rows[0]?.n ?? 0);
  }
  const result = await getDb().execute<{ n: number }>(sql`
    WITH ins AS (
      INSERT INTO attendance_record
        (attendance_date, member_id, status, substitute_name, source, version, updated_by)
      SELECT ${date}::date, a.member_id,
             CASE WHEN a.substitute_name IS NULL THEN 'absent' ELSE 'substitute' END,
             a.substitute_name, 'auto', 1, NULL
      FROM member_absence a
      JOIN member m ON m.id = a.member_id
      WHERE a.absence_date = ${date}::date
        AND ${memberActiveSql("m")} AND m.joined_at <= ${date}::date
      ON CONFLICT (attendance_date, member_id) DO NOTHING
      RETURNING 1
    )
    SELECT count(*)::int AS n FROM ins
  `);
  return Number(result.rows[0]?.n ?? 0);
}

/**
 * Krok 2: označení dne. Vrací ISO čas uzavření, když ho nastavil TENHLE příkaz;
 * `null`, když byl den už uzavřený (jiný běh vyhrál). Od teď neprojde zápis v
 * režimu `normal` (dayGuardSql). `finalized_at` je čas uzavření těsně před
 * rozesláním reportu (rozdíl jsou vteřiny), banner „Report odešel v {čas}“
 * čte tenhle sloupec.
 */
export async function markDayFinalized(input: {
  date: string;
  mode: DayMode;
  late: boolean;
}): Promise<string | null> {
  const { date, mode, late } = input;
  const result = await getDb().execute<{ finalized_at: string }>(sql`
    INSERT INTO attendance_day (attendance_date, finalized_at, mode, report_late)
    VALUES (${date}::date, now(), ${mode}, ${late}::boolean)
    ON CONFLICT (attendance_date) DO UPDATE
      SET finalized_at = EXCLUDED.finalized_at,
          mode = EXCLUDED.mode,
          report_late = EXCLUDED.report_late
      WHERE attendance_day.finalized_at IS NULL
    RETURNING ${isoSql(sql`finalized_at`)} AS finalized_at
  `);
  return result.rows[0]?.finalized_at ?? null;
}

// ── Report (arch 10.3, 10.4) ─────────────────────────────────

export interface ReportRecipient {
  memberId: string;
  name: string;
  email: string | null;
}

/**
 * Příjemci reportu (K8): aktivní držitelé příznaku Správce docházky a aktivní
 * členové s funkcí Prezident nebo Viceprezident, bez duplicit podle `member.id`.
 * Admin jen pokud splňuje jedno z toho. `onlyPending` vynechá ty, kdo už mají
 * řádek v `attendance_report_mail` pro den (claim = jednou na příjemce a den).
 */
export async function listReportRecipients(
  date: string,
  onlyPending: boolean
): Promise<ReportRecipient[]> {
  const names = sql.join(
    ATTENDANCE_REPORT_FUNCTIONS.map((n) => sql`${n}`),
    sql`, `
  );
  const pending = onlyPending
    ? sql`AND NOT EXISTS (
        SELECT 1 FROM attendance_report_mail rm
        WHERE rm.attendance_date = ${date}::date AND rm.member_id = m.id
      )`
    : sql``;
  const result = await getDb().execute<{ id: string; name: string; email: string | null }>(sql`
    SELECT m.id, m.name, NULLIF(btrim(m.email), '') AS email
    FROM member m
    WHERE ${memberActiveSql("m")}
      AND (
        m.attendance_manager_since IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM member_function mf
          JOIN chapter_function cf ON cf.id = mf.function_id
          WHERE mf.member_id = m.id AND lower(cf.name) IN (${names})
        )
      )
      ${pending}
    ORDER BY m.name
  `);
  return result.rows.map((r) => ({ memberId: r.id, name: r.name, email: r.email }));
}

/** Claim reportu pro příjemce a den. `true` = tenhle běh smí poslat. Pád po claimu = příjemce report nedostane (raději jeden chybějící mail než dvojí). */
export async function claimReportMail(date: string, memberId: string): Promise<boolean> {
  const result = await getDb().execute<{ member_id: string }>(sql`
    INSERT INTO attendance_report_mail (attendance_date, member_id)
    VALUES (${date}::date, ${memberId}::uuid)
    ON CONFLICT (attendance_date, member_id) DO NOTHING
    RETURNING member_id
  `);
  return result.rows.length > 0;
}

export async function markReportSent(
  date: string,
  memberId: string,
  resendId: string | null
): Promise<void> {
  await getDb().execute(sql`
    UPDATE attendance_report_mail
    SET sent_at = now(), resend_email_id = ${resendId}
    WHERE attendance_date = ${date}::date AND member_id = ${memberId}::uuid
  `);
}

export interface ReportRows {
  members: ReportMember[];
  /** Jména správců, kteří zapisovali (řádky `source = 'manager'`). */
  writers: string[];
  /** ISO čas poslední změny zapsané správcem. */
  lastChange: string | null;
}

/**
 * Řádky dne po doplnění pro report (arch 10.4). Pořadí absence člena je počet
 * jeho `absent` v UZAVŘENÝCH dnech okna `(absenceWindowStart(D), D]` včetně
 * tohoto dne (K9), hranici počítá TS a SQL ji dostane jako parametr.
 */
export async function loadReportRows(date: string): Promise<ReportRows> {
  const from = absenceWindowStart(date);
  const result = await getDb().execute<{
    name: string;
    status: string;
    substitute_name: string | null;
    excused: boolean;
    ann_sub: boolean;
    source: string;
    updated_at: string;
    updated_by_name: string | null;
    ordinal: number | null;
  }>(sql`
    SELECT m.name, r.status, r.substitute_name,
           (ma.member_id IS NOT NULL) AS excused,
           (ma.substitute_name IS NOT NULL) AS ann_sub,
           r.source, ${isoSql(sql`r.updated_at`)} AS updated_at, ub.name AS updated_by_name,
           CASE WHEN r.status = 'absent' THEN (
             SELECT count(*)::int
             FROM attendance_record x
             JOIN attendance_day xd
               ON xd.attendance_date = x.attendance_date AND xd.finalized_at IS NOT NULL
             WHERE x.member_id = r.member_id AND x.status = 'absent'
               AND x.attendance_date > ${from}::date AND x.attendance_date <= ${date}::date
           ) END AS ordinal
    FROM attendance_record r
    JOIN member m ON m.id = r.member_id
    LEFT JOIN member_absence ma ON ma.member_id = r.member_id AND ma.absence_date = r.attendance_date
    LEFT JOIN member ub ON ub.id = r.updated_by
    WHERE r.attendance_date = ${date}::date
    ORDER BY m.name
  `);

  const members: ReportMember[] = [];
  const writers = new Set<string>();
  let lastChange: string | null = null;
  for (const r of result.rows) {
    const status = r.status === "present" || r.status === "substitute" ? r.status : "absent";
    members.push({
      name: r.name,
      status,
      substituteName: r.substitute_name,
      excused: Boolean(r.excused),
      announcedSubstitute: Boolean(r.ann_sub),
      ordinal: status === "absent" && r.ordinal !== null ? Number(r.ordinal) : null,
    });
    if (r.source === "manager") {
      if (r.updated_by_name) writers.add(r.updated_by_name);
      if (!lastChange || r.updated_at > lastChange) lastChange = r.updated_at;
    }
  }
  return { members, writers: [...writers], lastChange };
}
