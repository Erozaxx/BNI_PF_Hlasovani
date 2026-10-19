/**
 * iter-033 (T-005, arch T-001 sekce 4, 8, 11): DB vrstva zásobníku „Master mind“
 * (`mastermind_case`, `mastermind_interest`).
 *
 * Bez transakcí (LL-003): každý přechod je JEDEN SQL příkaz, jehož WHERE
 * drží podmínky (stav, autorita, limit 5, kolize data). Autorita je tady, ne
 * v UI. Data a časy se z DB čtou přetypované na text / milisekundy, aby je
 * driver nepřevedl na Date v lokálním pásmu.
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { memberActiveSql } from "@/lib/db/queries/member-active";
import {
  CASE_LIMIT,
  PRESENTED_LIMIT,
  type CaseStatus,
  type DashboardCaseRow,
} from "@/lib/mastermind/rules";

function getDb() {
  return drizzle(getSql());
}

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// ── Čtení pro přehled ──

export interface CaseInterestPerson {
  memberId: string;
  name: string;
}

export interface CaseListRow {
  id: string;
  memberId: string;
  presenterName: string;
  title: string;
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
  status: CaseStatus;
  /** „YYYY-MM-DD“ nebo null u navrženého */
  internalDate: string | null;
  createdAtMs: number;
  /** Den přihlášení v Praze, „YYYY-MM-DD“ */
  createdDay: string;
  /** Zájemci / posluchači v pořadí podle `created_at` (kdo dřív) */
  interested: CaseInterestPerson[];
}

type CaseListDbRow = {
  id: string;
  member_id: string;
  presenter_name: string;
  title: string;
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
  status: CaseStatus;
  internal_date: string | null;
  created_ms: string | number;
  created_day: string;
  interested: string | null;
}

function parseInterested(raw: string | null): CaseInterestPerson[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as Array<{ memberId: string; name: string }>;
    return arr.map((p) => ({ memberId: p.memberId, name: p.name }));
  } catch {
    return [];
  }
}

function toCaseListRow(r: CaseListDbRow): CaseListRow {
  return {
    id: r.id,
    memberId: r.member_id,
    presenterName: r.presenter_name,
    title: r.title,
    situation: r.situation,
    path: r.path,
    takeaway: r.takeaway,
    ask: r.ask,
    status: r.status,
    internalDate: r.internal_date,
    createdAtMs: Number(r.created_ms),
    createdDay: r.created_day,
    interested: parseInterested(r.interested),
  };
}

/**
 * Všechny případy pro přehled `/mastermind` jedním dotazem (se jmény
 * zájemců). Odprezentovaných jen posledních PRESENTED_LIMIT podle data
 * interní. Řazení zásobníku dělá čistá `sortCases`, SQL vrací data.
 *
 * iter-037 (T-003b, arch 5.2): témata neaktivního člena jsou neviditelná všem
 * včetně vedení (`JOIN member p ... memberActiveSql`), jeho zájem o cizí témata
 * zůstává v DB, ale ve jménech zájemců se nepočítá (`LEFT JOIN member m ...
 * memberActiveSql`).
 */
export async function getCasesForOverview(): Promise<CaseListRow[]> {
  const result = await getDb().execute<CaseListDbRow>(sql`
    SELECT c.id, c.member_id, p.name AS presenter_name, c.title, c.situation,
           c.path, c.takeaway, c.ask, c.status,
           c.internal_date::text AS internal_date,
           floor(extract(epoch FROM c.created_at) * 1000)::bigint::text AS created_ms,
           to_char(c.created_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS created_day,
           COALESCE(
             json_agg(json_build_object('memberId', i.member_id, 'name', m.name)
                      ORDER BY i.created_at, i.member_id)
               FILTER (WHERE m.id IS NOT NULL),
             '[]'::json
           )::text AS interested
    FROM mastermind_case c
    JOIN member p ON p.id = c.member_id AND ${memberActiveSql("p")}
    LEFT JOIN mastermind_interest i ON i.case_id = c.id
    LEFT JOIN member m ON m.id = i.member_id AND ${memberActiveSql("m")}
    WHERE c.status <> 'presented'
       OR c.id IN (
         SELECT id FROM mastermind_case
         WHERE status = 'presented'
         ORDER BY internal_date DESC
         LIMIT ${PRESENTED_LIMIT}::int
       )
    GROUP BY c.id, p.name
  `);
  return result.rows.map(toCaseListRow);
}

export interface CaseDetailRow {
  id: string;
  memberId: string;
  presenterName: string;
  title: string;
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
  status: CaseStatus;
  internalDate: string | null;
}

/**
 * Jeden případ pro stránku úpravy a pro rozhodování, proč příkaz nic nezměnil.
 * iter-037: téma neaktivního člena se nevrací (`null` = „téma teď není k
 * dispozici“, i pro vedení).
 */
export async function getCaseById(caseId: string): Promise<CaseDetailRow | null> {
  const result = await getDb().execute<{
    id: string;
    member_id: string;
    presenter_name: string;
    title: string;
    situation: string;
    path: string | null;
    takeaway: string | null;
    ask: string | null;
    status: CaseStatus;
    internal_date: string | null;
  }>(sql`
    SELECT c.id, c.member_id, p.name AS presenter_name, c.title, c.situation,
           c.path, c.takeaway, c.ask, c.status, c.internal_date::text AS internal_date
    FROM mastermind_case c
    JOIN member p ON p.id = c.member_id AND ${memberActiveSql("p")}
    WHERE c.id = ${caseId}::uuid
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    memberId: r.member_id,
    presenterName: r.presenter_name,
    title: r.title,
    situation: r.situation,
    path: r.path,
    takeaway: r.takeaway,
    ask: r.ask,
    status: r.status,
    internalDate: r.internal_date,
  };
}

/**
 * Data pro nabídku čtvrtků (3.5): data schůzek od dneška a data zařazených
 * případů. iter-037: případy neaktivního člena se nepočítají (při deaktivaci se
 * stejně vracejí do zásobníku).
 */
export async function getThursdayData(todayPrague: string): Promise<{
  meetingDates: string[];
  caseDates: string[];
}> {
  const [meetings, cases] = await Promise.all([
    getDb().execute<{ d: string }>(sql`
      SELECT date::text AS d FROM meeting WHERE date >= ${todayPrague}::date
    `),
    getDb().execute<{ d: string }>(sql`
      SELECT c.internal_date::text AS d FROM mastermind_case c
      JOIN member p ON p.id = c.member_id AND ${memberActiveSql("p")}
      WHERE c.internal_date IS NOT NULL
    `),
  ]);
  return {
    meetingDates: meetings.rows.map((r) => r.d),
    caseDates: cases.rows.map((r) => r.d),
  };
}

// ── Vytvoření s limitem (4.4) ──

export interface CreateCaseInput {
  memberId: string;
  title: string;
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
  createdBy: string;
}

/**
 * Limit 5 otevřených případů hlídá sám INSERT (počet je ve WHERE příkazu,
 * ne v samostatném SELECTu před ním). Vrací `id`, nebo `null` při dosaženém
 * limitu. iter-037 (security L-3): případ neaktivního člena nevznikne ani
 * přímým voláním (akce to hlásí srozumitelně dřív, tohle je poslední pojistka).
 */
export async function createCaseWithLimit(input: CreateCaseInput): Promise<string | null> {
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO mastermind_case (member_id, title, situation, path, takeaway, ask, created_by)
    SELECT ${input.memberId}::uuid, ${input.title}::text, ${input.situation}::text,
           ${input.path}::text, ${input.takeaway}::text, ${input.ask}::text,
           ${input.createdBy}::uuid
    WHERE (SELECT count(*) FROM mastermind_case c
            WHERE c.member_id = ${input.memberId}::uuid
              AND c.status IN ('proposed','scheduled')) < ${CASE_LIMIT}::int
      AND EXISTS (SELECT 1 FROM member m
                   WHERE m.id = ${input.memberId}::uuid AND ${memberActiveSql("m")})
    RETURNING id
  `);
  return result.rows[0]?.id ?? null;
}

// ── Úprava a odstranění (autorita ve WHERE) ──

export async function updateCaseGuarded(opts: {
  caseId: string;
  actorId: string;
  isManagement: boolean;
  todayPrague: string;
  title: string;
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
}): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    UPDATE mastermind_case
    SET title = ${opts.title}::text, situation = ${opts.situation}::text,
        path = ${opts.path}::text, takeaway = ${opts.takeaway}::text,
        ask = ${opts.ask}::text, updated_at = now()
    WHERE id = ${opts.caseId}::uuid
      AND (
        (${opts.isManagement}::boolean AND status IN ('proposed','scheduled'))
        OR (member_id = ${opts.actorId}::uuid
            AND (status = 'proposed'
                 OR (status = 'scheduled' AND internal_date > ${opts.todayPrague}::date)))
      )
    RETURNING id
  `);
  return result.rows.length > 0;
}

export interface RemovedCase {
  caseId: string;
  presenterId: string;
  presenterName: string;
  status: CaseStatus;
  internalDate: string | null;
}

/** Autor smí stáhnout jen navržený, vedení navržený i zařazený. Zájmy kaskádou. */
export async function removeCaseGuarded(opts: {
  caseId: string;
  actorId: string;
  isManagement: boolean;
}): Promise<RemovedCase | null> {
  const result = await getDb().execute<{
    id: string;
    member_id: string;
    name: string;
    status: CaseStatus;
    internal_date: string | null;
  }>(sql`
    WITH d AS (
      DELETE FROM mastermind_case
      WHERE id = ${opts.caseId}::uuid
        AND (
          (${opts.isManagement}::boolean AND status IN ('proposed','scheduled'))
          OR (member_id = ${opts.actorId}::uuid AND status = 'proposed')
        )
      RETURNING id, member_id, status, internal_date::text AS internal_date
    )
    SELECT d.id, d.member_id, m.name, d.status, d.internal_date
    FROM d JOIN member m ON m.id = d.member_id
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    caseId: r.id,
    presenterId: r.member_id,
    presenterName: r.name,
    status: r.status,
    internalDate: r.internal_date,
  };
}

// ── Zájem (4.2) ──

/**
 * Přidání zájmu: jeden příkaz, který zároveň hlídá vlastní případ a stav
 * (U5, server, ne UI). Vrací `true`, když řádek vznikl. `false` znamená:
 * případ neexistuje, je vlastní, je odprezentovaný, nebo zájem už byl.
 */
export async function addInterest(caseId: string, memberId: string): Promise<boolean> {
  const result = await getDb().execute<{ case_id: string }>(sql`
    INSERT INTO mastermind_interest (case_id, member_id)
    SELECT c.id, ${memberId}::uuid FROM mastermind_case c
    JOIN member p ON p.id = c.member_id AND ${memberActiveSql("p")}
    WHERE c.id = ${caseId}::uuid AND c.member_id <> ${memberId}::uuid
      AND c.status IN ('proposed','scheduled')
    ON CONFLICT (case_id, member_id) DO NOTHING
    RETURNING case_id
  `);
  return result.rows.length > 0;
}

/** Odvolání zájmu jen u neodprezentovaného případu (K10: po odprezentování zamrzlé). */
export async function removeInterest(caseId: string, memberId: string): Promise<boolean> {
  const result = await getDb().execute<{ case_id: string }>(sql`
    DELETE FROM mastermind_interest i USING mastermind_case c
    WHERE i.case_id = ${caseId}::uuid AND i.member_id = ${memberId}::uuid
      AND c.id = i.case_id AND c.status IN ('proposed','scheduled')
    RETURNING i.case_id
  `);
  return result.rows.length > 0;
}

export async function countInterest(caseId: string): Promise<number> {
  // iter-037: zájem neaktivního člena se nepočítá (řádek zůstává v DB).
  const result = await getDb().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM mastermind_interest i
    JOIN member m ON m.id = i.member_id AND ${memberActiveSql("m")}
    WHERE i.case_id = ${caseId}::uuid
  `);
  return Number(result.rows[0]?.n ?? 0);
}

// ── Přechody (4.3) ──

export interface ScheduledCaseRow {
  id: string;
  memberId: string;
  title: string;
  situation: string;
  path: string | null;
  takeaway: string | null;
  ask: string | null;
  internalDate: string;
}

export type ScheduleOutcome =
  | { ok: true; row: ScheduledCaseRow }
  | { ok: false; reason: "gone" | "not-proposed" | "taken" | "open-meeting" | "not-available" };

/**
 * Zařazení na čtvrtek: jeden UPDATE. Podmínky: stav `proposed`, datum není
 * v minulosti, na datum není žádná schůzka v `meeting` (jen čtení). Kolize
 * na `mmc_one_per_date` (23505) znamená „na tenhle čtvrtek už je případ“.
 * Že je datum čtvrtek a v okně 12 týdnů, ověřila akce před voláním.
 */
export async function scheduleCaseGuarded(opts: {
  caseId: string;
  date: string;
  actorId: string;
  todayPrague: string;
}): Promise<ScheduleOutcome> {
  let rows: Array<{
    id: string;
    member_id: string;
    title: string;
    situation: string;
    path: string | null;
    takeaway: string | null;
    ask: string | null;
    internal_date: string;
  }>;
  try {
    const result = await getDb().execute<(typeof rows)[number]>(sql`
      UPDATE mastermind_case
      SET status = 'scheduled', internal_date = ${opts.date}::date,
          scheduled_at = now(), scheduled_by = ${opts.actorId}::uuid, updated_at = now()
      WHERE id = ${opts.caseId}::uuid AND status = 'proposed'
        AND ${opts.date}::date >= ${opts.todayPrague}::date
        AND NOT EXISTS (SELECT 1 FROM meeting WHERE date = ${opts.date}::date)
      RETURNING id, member_id, title, situation, path, takeaway, ask,
                internal_date::text AS internal_date
    `);
    rows = result.rows;
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "taken" };
    throw err;
  }

  const r = rows[0];
  if (r) {
    return {
      ok: true,
      row: {
        id: r.id,
        memberId: r.member_id,
        title: r.title,
        situation: r.situation,
        path: r.path,
        takeaway: r.takeaway,
        ask: r.ask,
        internalDate: r.internal_date,
      },
    };
  }

  // Nic se nezměnilo: dohledat proč, ať hláška sedí.
  const current = await getCaseById(opts.caseId);
  if (!current) return { ok: false, reason: "gone" };
  if (current.status !== "proposed") return { ok: false, reason: "not-proposed" };
  const meetingOnDate = await getDb().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM meeting WHERE date = ${opts.date}::date
  `);
  if (Number(meetingOnDate.rows[0]?.n ?? 0) > 0) return { ok: false, reason: "open-meeting" };
  return { ok: false, reason: "not-available" };
}

export interface TransitionRow {
  caseId: string;
  presenterId: string;
  presenterName: string;
  /** Datum interní před změnou (pro log) */
  internalDate: string | null;
}

type TransitionDbRow = {
  id: string;
  member_id: string;
  name: string;
  internal_date: string | null;
}

function toTransition(r: TransitionDbRow | undefined): TransitionRow | null {
  if (!r) return null;
  return {
    caseId: r.id,
    presenterId: r.member_id,
    presenterName: r.name,
    internalDate: r.internal_date,
  };
}

/**
 * Vrácení do zásobníku. Přihlášky posluchačů zůstávají a jsou z nich zase
 * zájmy. Vrací staré datum interní pro log.
 */
export async function unscheduleCaseGuarded(caseId: string): Promise<TransitionRow | null> {
  const result = await getDb().execute<TransitionDbRow>(sql`
    WITH u AS (
      UPDATE mastermind_case c
      SET status = 'proposed', internal_date = NULL, scheduled_at = NULL,
          scheduled_by = NULL, updated_at = now()
      FROM mastermind_case o
      WHERE o.id = c.id AND c.id = ${caseId}::uuid AND c.status = 'scheduled'
      RETURNING c.id, c.member_id, o.internal_date::text AS internal_date
    )
    SELECT u.id, u.member_id, m.name, u.internal_date
    FROM u JOIN member m ON m.id = u.member_id
  `);
  return toTransition(result.rows[0]);
}

/** Potvrzení „Odprezentováno“: až v den interní nebo po ní. */
export async function confirmPresentedGuarded(opts: {
  caseId: string;
  actorId: string;
  todayPrague: string;
}): Promise<TransitionRow | null> {
  const result = await getDb().execute<TransitionDbRow>(sql`
    WITH u AS (
      UPDATE mastermind_case
      SET status = 'presented', presented_at = now(),
          presented_confirmed_by = ${opts.actorId}::uuid, updated_at = now()
      WHERE id = ${opts.caseId}::uuid AND status = 'scheduled'
        AND internal_date <= ${opts.todayPrague}::date
      RETURNING id, member_id, internal_date::text AS internal_date
    )
    SELECT u.id, u.member_id, m.name, u.internal_date
    FROM u JOIN member m ON m.id = u.member_id
  `);
  return toTransition(result.rows[0]);
}

/** Vrácení potvrzení (K13), jen oprava překlepu. */
export async function undoPresentedGuarded(caseId: string): Promise<TransitionRow | null> {
  // Limit 5 otevřených případů hlídá stejný příkaz jako u vložení (m-5, LL-003).
  const result = await getDb().execute<TransitionDbRow>(sql`
    WITH u AS (
      UPDATE mastermind_case
      SET status = 'scheduled', presented_at = NULL, presented_confirmed_by = NULL,
          updated_at = now()
      WHERE id = ${caseId}::uuid AND status = 'presented'
        AND (SELECT count(*) FROM mastermind_case o
              WHERE o.member_id = mastermind_case.member_id
                AND o.status IN ('proposed','scheduled')) < ${CASE_LIMIT}::int
      RETURNING id, member_id, internal_date::text AS internal_date
    )
    SELECT u.id, u.member_id, m.name, u.internal_date
    FROM u JOIN member m ON m.id = u.member_id
  `);
  return toTransition(result.rows[0]);
}

// ── Dashboard (8.1) ──

/**
 * Zařazené případy pro řádek na dashboardu: jedním dotazem, zařazených je
 * nejvýš desítky. Rozdělení na „příští“, „prezentuješ ty“, „jsi přihlášený(á)“
 * a „čeká na potvrzení“ dělá čistá `summarizeDashboard`.
 */
export async function getDashboardMastermindRows(memberId: string): Promise<DashboardCaseRow[]> {
  const result = await getDb().execute<{
    id: string;
    member_id: string;
    name: string;
    title: string;
    internal_date: string;
    cnt: number;
    listening: boolean;
  }>(sql`
    SELECT c.id, c.member_id, p.name, c.title, c.internal_date::text AS internal_date,
           (SELECT count(*) FROM mastermind_interest i
              JOIN member m ON m.id = i.member_id AND ${memberActiveSql("m")}
             WHERE i.case_id = c.id)::int AS cnt,
           EXISTS (SELECT 1 FROM mastermind_interest i
                   WHERE i.case_id = c.id AND i.member_id = ${memberId}::uuid) AS listening
    FROM mastermind_case c
    JOIN member p ON p.id = c.member_id AND ${memberActiveSql("p")}
    WHERE c.status = 'scheduled'
    ORDER BY c.internal_date, c.id
  `);
  return result.rows.map((r) => ({
    id: r.id,
    presenterId: r.member_id,
    presenterName: r.name,
    title: r.title,
    internalDate: r.internal_date,
    listenerCount: Number(r.cnt),
    listening: Boolean(r.listening),
  }));
}
