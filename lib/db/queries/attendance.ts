/**
 * iter-038 (T-003a, T-003b, arch 4, 5.3, 6, 7, 8, 12, 13): dotazy docházky na
 * straně člena, příznak Správce docházky, zápis správce s verzí řádku, zpětné
 * opravy s auditem ve stejném příkazu a přehled. Ranní odkaz, uzavření dne a report
 * jsou v lib/db/queries/attendance-close.ts (T-003c).
 *
 * Bez transakcí (LL-003): každá změna je JEDEN SQL příkaz, pojistky jsou ve
 * WHERE a nic se nezapisuje napůl. Datum a čas se počítá v Europe/Prague.
 * Žádná JS interpolace do textu SQL, všechno jsou bind parametry (`sql`
 * šablona drizzle).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { actorMayChangeSql, memberActiveSql } from "@/lib/db/queries/member-active";
import { ATTENDANCE_START, MAX_ADVANCE_DAYS, SUBSTITUTE_NAME_MEMORY_LIMIT } from "@/lib/attendance/rules";
import { absenceStatusSql } from "@/lib/db/queries/absence-status";
import type { AuditRow, PresenceStatus, SheetRow } from "@/lib/attendance/sheet";
import type { PlanEntry } from "@/lib/attendance/plan";

function getDb() {
  return drizzle(getSql());
}

/** Dnešek v Praze jako `date`. */
export const TODAY_SQL = sql`(now() AT TIME ZONE 'Europe/Prague')::date`;

/**
 * Pojistka „člen smí dnes změnit nepřítomnost na den D“ (arch 6.1): D je od
 * dneška do dnes + 365, ještě před začátkem schůzky v den D (7:30 pražského
 * času) a člen je aktivní. TS protějšek `decideMemberAbsenceEdit`
 * (lib/attendance/rules.ts) slouží jen pro srozumitelnou hlášku, tohle je
 * pravda.
 */
function absenceEditGuardSql(memberId: string, date: string): SQL {
  return sql`(
    ${date}::date >= ${TODAY_SQL}
    AND ${date}::date <= ${TODAY_SQL} + ${MAX_ADVANCE_DAYS}::int
    AND now() < ((${date}::date + ${ATTENDANCE_START}::time) AT TIME ZONE 'Europe/Prague')
    AND EXISTS (SELECT 1 FROM member gm WHERE gm.id = ${memberId}::uuid AND ${memberActiveSql("gm")})
  )`;
}

/**
 * Horní mez paměti jmen náhradníků na člena (security L-2). CTE `trim` smaže
 * nejstarší jména člena tak, aby po vložení nového zůstalo nejvýš
 * `SUBSTITUTE_NAME_MEMORY_LIMIT`. Běží ve stejném příkazu jako vložení (data
 * modifying CTE vidí snímek před ním), proto řadí jen jména JINÁ než vkládané
 * (to se buď vloží, nebo jen osvěží) a nechá jich limit minus jedna.
 * `newName` je SQL výraz s vkládaným jménem (`NULL` = nic se nevkládá, nic se nemaže).
 */
function trimNamesSql(memberId: string, newName: SQL): SQL {
  return sql`trim AS (
      DELETE FROM member_substitute_name d
      WHERE d.member_id = ${memberId}::uuid
        AND (${newName}) IS NOT NULL
        AND d.id IN (
          SELECT r.id FROM (
            SELECT o.id, row_number() OVER (ORDER BY o.last_used_at DESC, o.name) AS rn
            FROM member_substitute_name o
            WHERE o.member_id = ${memberId}::uuid AND lower(o.name) <> lower(${newName})
          ) r
          WHERE r.rn > ${SUBSTITUTE_NAME_MEMORY_LIMIT}::int - 1
        )
      RETURNING 1
    )`;
}

export interface AbsenceRow {
  date: string;
  substituteName: string | null;
}

export interface SubstituteNameRow {
  id: string;
  name: string;
}

export interface PastDayRow {
  date: string;
  status: "present" | "substitute" | "absent" | "unexcused";
}

/** Ohlášené nepřítomnosti člena v rozsahu `[from, to]`, seřazené podle data. */
export async function listMyAbsences(
  memberId: string,
  from: string,
  to: string
): Promise<AbsenceRow[]> {
  const result = await getDb().execute<{ d: string; substitute_name: string | null }>(sql`
    SELECT absence_date::text AS d, substitute_name
    FROM member_absence
    WHERE member_id = ${memberId}::uuid
      AND absence_date >= ${from}::date AND absence_date <= ${to}::date
    ORDER BY absence_date
  `);
  return result.rows.map((r) => ({ date: r.d, substituteName: r.substitute_name }));
}

/** Data, na která existuje schůzka v aplikaci (podtržení v kalendáři). */
export async function listMeetingDates(from: string, to: string): Promise<string[]> {
  const result = await getDb().execute<{ d: string }>(sql`
    SELECT date::text AS d FROM meeting
    WHERE date >= ${from}::date AND date <= ${to}::date
    ORDER BY date
  `);
  return result.rows.map((r) => r.d);
}

/** Řádek kalendáře plánovaných omluv (iter-039). */
export type PlannedAbsenceRow = PlanEntry;

/**
 * iter-039 (T-003, arch 5): omluvy všech AKTIVNÍCH členů v rozsahu `[from, to]`
 * pro kalendář správce. Jen čtení. NEčte, kdo omluvu zapsal (K2), jen datum
 * ohlášení v Europe/Prague. Smí se volat jen z `lib/attendance/plan-view.ts`,
 * které ověří právo `attendance.view_all` (dotazy session nedostávají).
 * Řazení jmen se dělá v TS (česká kolace).
 */
export async function listPlannedAbsences(from: string, to: string): Promise<PlannedAbsenceRow[]> {
  const result = await getDb().execute<{
    d: string;
    id: string;
    name: string;
    substitute_name: string | null;
    announced_on: string;
  }>(sql`
    SELECT a.absence_date::text AS d, m.id, m.name, a.substitute_name,
           (a.created_at AT TIME ZONE 'Europe/Prague')::date::text AS announced_on
    FROM member_absence a
    JOIN member m ON m.id = a.member_id
    WHERE a.absence_date >= ${from}::date AND a.absence_date <= ${to}::date
      AND ${memberActiveSql("m")}
    ORDER BY a.absence_date
  `);
  return result.rows.map((r) => ({
    date: r.d,
    memberId: r.id,
    name: r.name,
    substituteName: r.substitute_name,
    announcedOn: r.announced_on,
  }));
}

/** Výsledek uzavřených dní člena (`✓ N A` v minulosti). Neuzavřený den značku nemá. */
export async function listMyPastDays(
  memberId: string,
  from: string,
  to: string
): Promise<PastDayRow[]> {
  const result = await getDb().execute<{ d: string; status: string }>(sql`
    SELECT r.attendance_date::text AS d, r.status
    FROM attendance_record r
    JOIN attendance_day ad ON ad.attendance_date = r.attendance_date AND ad.finalized_at IS NOT NULL
    WHERE r.member_id = ${memberId}::uuid
      AND r.attendance_date >= ${from}::date AND r.attendance_date <= ${to}::date
    ORDER BY r.attendance_date
  `);
  return result.rows.map((r) => ({
    date: r.d,
    status: r.status as PastDayRow["status"],
  }));
}

/** Paměť jmen člena: nejnovější první. */
export async function listSubstituteNames(
  memberId: string,
  limit = 50
): Promise<SubstituteNameRow[]> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT id, name FROM member_substitute_name
    WHERE member_id = ${memberId}::uuid
    ORDER BY last_used_at DESC, name
    LIMIT ${limit}::int
  `);
  return result.rows.map((r) => ({ id: r.id, name: r.name }));
}

export type SetAbsenceKind = "none" | "absence" | "substitute";

/**
 * Člen nastaví svou nepřítomnost na den D jedním příkazem (arch 6.1, 6.2).
 * `ok` = pojistka (rozsah dnů, 7:30, aktivita) prošla. Cíl je vždy volající
 * člen. Jméno náhradníka se uloží do paměti jmen ve stejném příkazu.
 *
 * `none` smaže řádek (bez řádku je člen přítomen). Smazání neexistujícího
 * řádku je úspěch (cílový stav je splněn).
 */
export async function setMyAbsenceGuarded(input: {
  memberId: string;
  date: string;
  kind: SetAbsenceKind;
  /** Už ořezané a zvalidované jméno, jen u `substitute`. */
  name: string | null;
}): Promise<{ ok: boolean }> {
  const { memberId, date, kind, name } = input;
  const guard = absenceEditGuardSql(memberId, date);

  if (kind === "none") {
    const result = await getDb().execute<{ ok: boolean }>(sql`
      WITH g AS (SELECT ${guard} AS ok),
      del AS (
        DELETE FROM member_absence
        WHERE member_id = ${memberId}::uuid AND absence_date = ${date}::date
          AND (SELECT ok FROM g)
        RETURNING 1
      )
      SELECT (SELECT ok FROM g) AS ok, (SELECT count(*) FROM del) AS n
    `);
    return { ok: Boolean(result.rows[0]?.ok) };
  }

  const nameValue = kind === "substitute" ? sql`${name}::text` : sql`NULL::text`;
  const result = await getDb().execute<{ ok: boolean }>(sql`
    WITH g AS (SELECT ${guard} AS ok),
    ins AS (
      INSERT INTO member_absence (member_id, absence_date, substitute_name, created_by, updated_by)
      SELECT ${memberId}::uuid, ${date}::date, ${nameValue}, ${memberId}::uuid, ${memberId}::uuid
      WHERE (SELECT ok FROM g)
      ON CONFLICT (member_id, absence_date) DO UPDATE SET
        substitute_name = EXCLUDED.substitute_name,
        updated_by = EXCLUDED.updated_by,
        updated_at = now()
      RETURNING member_id, substitute_name
    ),
    names AS (
      INSERT INTO member_substitute_name (member_id, name, last_used_at)
      SELECT member_id, btrim(substitute_name), now() FROM ins WHERE substitute_name IS NOT NULL
      ON CONFLICT (member_id, lower(name)) DO UPDATE SET last_used_at = now()
    ),
    ${trimNamesSql(memberId, sql`(SELECT btrim(substitute_name) FROM ins WHERE substitute_name IS NOT NULL)`)}
    SELECT (SELECT ok FROM g) AS ok, (SELECT count(*) FROM ins) AS n
  `);
  return { ok: Boolean(result.rows[0]?.ok) };
}

/** Člen smaže své jméno z paměti. `false` = jméno není jeho nebo už neexistuje. */
export async function forgetSubstituteName(memberId: string, nameId: string): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    DELETE FROM member_substitute_name
    WHERE id = ${nameId}::uuid AND member_id = ${memberId}::uuid
    RETURNING id
  `);
  return result.rows.length > 0;
}

// ── Absence za okno (arch 12) ───────────────────────────────

export interface AbsenceDayRow {
  date: string;
  /** Člen se na ten den předem omluvil (řádek v `member_absence`). */
  excused: boolean;
}

/**
 * Absence člena v okně: `absent` v UZAVŘENÉM dni, `attendance_date > from`
 * a `<= to`. Hranici `from` počítá TS (`absenceWindowStart`), SQL ji dostane
 * jako parametr (arch 12.2).
 */
export async function listMyAbsenceDays(
  memberId: string,
  from: string,
  to: string
): Promise<AbsenceDayRow[]> {
  const result = await getDb().execute<{ d: string; excused: boolean }>(sql`
    SELECT r.attendance_date::text AS d,
           EXISTS (
             SELECT 1 FROM member_absence ma
             WHERE ma.member_id = r.member_id AND ma.absence_date = r.attendance_date
           ) AS excused
    FROM attendance_record r
    JOIN attendance_day ad ON ad.attendance_date = r.attendance_date AND ad.finalized_at IS NOT NULL
    WHERE r.member_id = ${memberId}::uuid AND ${absenceStatusSql("r")}
      AND r.attendance_date > ${from}::date AND r.attendance_date <= ${to}::date
    ORDER BY r.attendance_date DESC
  `);
  return result.rows.map((r) => ({ date: r.d, excused: Boolean(r.excused) }));
}

/** Nejstarší uzavřený den docházky (karta říká „Počítáme od …“). `null` = žádný. */
export async function getFirstClosedDay(): Promise<string | null> {
  const result = await getDb().execute<{ d: string | null }>(sql`
    SELECT min(attendance_date)::text AS d FROM attendance_day WHERE finalized_at IS NOT NULL
  `);
  return result.rows[0]?.d ?? null;
}

/** Nejbližší ohlášená nepřítomnost člena od `from` včetně. */
export async function getNextAbsence(memberId: string, from: string): Promise<AbsenceRow | null> {
  const result = await getDb().execute<{ d: string; substitute_name: string | null }>(sql`
    SELECT absence_date::text AS d, substitute_name FROM member_absence
    WHERE member_id = ${memberId}::uuid AND absence_date >= ${from}::date
    ORDER BY absence_date LIMIT 1
  `);
  const r = result.rows[0];
  return r ? { date: r.d, substituteName: r.substitute_name } : null;
}

// ── Příznak Správce docházky (arch 5.3) ─────────────────────

export interface AttendanceManagerChange {
  id: string;
  name: string;
  /** Příznak měl cíl už PŘED příkazem (pro log jen skutečné změny). */
  was: boolean;
  /** Příznak má cíl po příkazu. */
  now: boolean;
}

/**
 * Nastaví příznak Správce docházky jedním příkazem (cílový stav, idempotentní,
 * arch 5.3). Pojistka ve WHERE: účet admina mění jen admin (`actorMayChangeSql`).
 * Odebrání zároveň zneplatní nevypršelé ranní odkazy člena (`attendance_link`,
 * T-003c), aby odkaz přestal fungovat hned. Vrací `null`, když cíl neexistuje
 * nebo pojistka neprošla.
 *
 * Sám sobě příznak dát i vzít jde (není to eskalace nad `members.manage`).
 * Neaktivnímu jde nastavit (příprava na návrat), maily mu chodit nebudou.
 */
export async function setAttendanceManagerGuarded(input: {
  targetId: string;
  actorId: string;
  enabled: boolean;
}): Promise<AttendanceManagerChange | null> {
  const { targetId, actorId, enabled } = input;
  const result = await getDb().execute<{
    id: string;
    name: string;
    was_manager: boolean;
    is_manager: boolean;
  }>(sql`
    WITH prev AS (
      SELECT id, (attendance_manager_since IS NOT NULL) AS was_manager
      FROM member WHERE id = ${targetId}::uuid
    ),
    upd AS (
      UPDATE member SET
        attendance_manager_since = CASE WHEN ${enabled}::boolean
          THEN COALESCE(attendance_manager_since, now()) ELSE NULL END,
        attendance_manager_by = CASE WHEN ${enabled}::boolean
          THEN COALESCE(attendance_manager_by, ${actorId}::uuid) ELSE NULL END
      WHERE id = ${targetId}::uuid AND ${actorMayChangeSql("member", actorId)}
      RETURNING id, name, (attendance_manager_since IS NOT NULL) AS is_manager
    ),
    revoked AS (
      UPDATE attendance_link SET revoked_at = now()
      WHERE NOT ${enabled}::boolean
        AND member_id IN (SELECT id FROM upd)
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
    )
    SELECT upd.id, upd.name, (SELECT was_manager FROM prev) AS was_manager, upd.is_manager FROM upd
  `);
  const r = result.rows[0];
  if (!r) return null;
  return { id: r.id, name: r.name, was: Boolean(r.was_manager), now: Boolean(r.is_manager) };
}

// ── Zápis správce (arch 6.2, 8, 13.2) ───────────────────────

/** `timestamptz` jako ISO řetězec (UTC), nezávisle na tom, co vrací driver. */
function isoSql(col: SQL): SQL {
  return sql`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

export interface DayMeta {
  finalized: boolean;
  /** ISO čas uzavření dne, `null` = neuzavřený. */
  finalizedAt: string | null;
  dayMode: "recorded" | "unrecorded" | null;
  /** Na den existuje schůzka v aplikaci. */
  hasMeeting: boolean;
  /** iter-040: na den je interní schůzka (`attendance_internal_day`). */
  hasInternal: boolean;
  /** Na den je aspoň jeden řádek zapsaný správcem (Z2). */
  hasManagerRecord: boolean;
}

/** Stav dne: uzavření, schůzka a zápis správce (jeden dotaz). */
export async function getDayMeta(date: string): Promise<DayMeta> {
  const result = await getDb().execute<{
    finalized_at: string | null;
    mode: string | null;
    has_meeting: boolean;
    has_internal: boolean;
    has_manager: boolean;
  }>(sql`
    SELECT ${isoSql(sql`ad.finalized_at`)} AS finalized_at,
           ad.mode,
           EXISTS (SELECT 1 FROM meeting mt WHERE mt.date = ${date}::date) AS has_meeting,
           EXISTS (SELECT 1 FROM attendance_internal_day i WHERE i.attendance_date = ${date}::date) AS has_internal,
           EXISTS (
             SELECT 1 FROM attendance_record r
             WHERE r.attendance_date = ${date}::date AND r.source = 'manager'
           ) AS has_manager
    FROM (SELECT 1) x
    LEFT JOIN attendance_day ad ON ad.attendance_date = ${date}::date
  `);
  const r = result.rows[0];
  return {
    finalized: Boolean(r?.finalized_at),
    finalizedAt: r?.finalized_at ?? null,
    dayMode: r?.mode === "recorded" || r?.mode === "unrecorded" ? r.mode : null,
    hasMeeting: Boolean(r?.has_meeting),
    hasInternal: Boolean(r?.has_internal),
    hasManagerRecord: Boolean(r?.has_manager),
  };
}

/** Členové, kteří patří do seznamu dne: aktivní s `joined_at <= D` a členové s řádkem pro D. */
function dayListCriteriaSql(date: string): SQL {
  return sql`(
    (${memberActiveSql("m")} AND m.joined_at <= ${date}::date)
    OR EXISTS (
      SELECT 1 FROM attendance_record x
      WHERE x.attendance_date = ${date}::date AND x.member_id = m.id
    )
  )`;
}

/**
 * Seznam dne pro zápis (arch 8): aktivní členové s `joined_at <= D` plus členové
 * s řádkem pro D (po uzavření nebo opravě), podle jména. `onlyMemberId` zúží
 * výsledek na jednoho člena (odpověď na zápis).
 */
export async function listSheetRows(date: string, onlyMemberId?: string): Promise<SheetRow[]> {
  const only = onlyMemberId ? sql`AND m.id = ${onlyMemberId}::uuid` : sql``;
  const result = await getDb().execute<{
    id: string;
    name: string;
    status: string | null;
    rec_sub: string | null;
    version: number | null;
    updated_by_id: string | null;
    updated_by_name: string | null;
    updated_at: string | null;
    excused: boolean;
    ann_name: string | null;
  }>(sql`
    SELECT m.id, m.name, r.status, r.substitute_name AS rec_sub, r.version,
           r.updated_by AS updated_by_id, ub.name AS updated_by_name,
           ${isoSql(sql`r.updated_at`)} AS updated_at,
           (ma.member_id IS NOT NULL) AS excused, ma.substitute_name AS ann_name
    FROM member m
    LEFT JOIN attendance_record r ON r.member_id = m.id AND r.attendance_date = ${date}::date
    LEFT JOIN member ub ON ub.id = r.updated_by
    LEFT JOIN member_absence ma ON ma.member_id = m.id AND ma.absence_date = ${date}::date
    WHERE ${dayListCriteriaSql(date)} ${only}
    ORDER BY m.name
  `);

  const namesResult = await getDb().execute<{ member_id: string; name: string }>(sql`
    SELECT member_id, name FROM (
      SELECT n.member_id, n.name,
             row_number() OVER (PARTITION BY n.member_id ORDER BY n.last_used_at DESC, n.name) AS rn
      FROM member_substitute_name n
      WHERE n.member_id IN (SELECT m.id FROM member m WHERE ${dayListCriteriaSql(date)} ${only})
    ) t
    WHERE rn <= 8
    ORDER BY member_id, rn
  `);
  const byMember = new Map<string, string[]>();
  for (const n of namesResult.rows) {
    const list = byMember.get(n.member_id) ?? [];
    list.push(n.name);
    byMember.set(n.member_id, list);
  }

  const rowsOut: SheetRow[] = result.rows.map((r) => ({
    memberId: r.id,
    name: r.name,
    status:
      r.status === "present" ||
      r.status === "substitute" ||
      r.status === "absent" ||
      r.status === "unexcused"
        ? (r.status as PresenceStatus)
        : null,
    substituteName: r.rec_sub,
    version: Number(r.version ?? 0),
    updatedById: r.updated_by_id,
    updatedByName: r.updated_by_name,
    updatedAt: r.updated_at,
    excused: Boolean(r.excused),
    announcedName: r.ann_name,
    names: byMember.get(r.id) ?? [],
  }));
  // Česky jako report (návrh 8); kolace databáze by Č, Š, Ž poslala na konec.
  return rowsOut.sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

export type WriteMode2 = "normal" | "history";

export type PresenceWriteResult =
  | { result: "ok"; version: number; audited: boolean }
  /** Verze se neshoduje (nebo je řádek na jiné verzi / ještě / už neexistuje). */
  | { result: "conflict" }
  /** Den už není v režimu `normal` (uzavřený nebo ne dnešní), případně nesedí `history`. */
  | { result: "day-closed" }
  | { result: "inactive" }
  /** iter-041 (Z1): „Chyběl(a) bez omluvy“ před 7:30 v den schůzky. */
  | { result: "too-early" }
  /** iter-041 (K6): člen má na ten den omluvu, `unexcused` nejde. */
  | { result: "excused-conflict" };

/**
 * iter-041 (gate Z1): „Chyběl(a) bez omluvy“ až od 7:30 v den schůzky, do té
 * doby se člen smí omluvit (`absenceEditGuardSql`). Podmínka je v `g` stejně jako
 * u omluvy. Zpětná oprava minulého dne omezená není (7:30 už dávno uplynulo).
 */
function unexcusedTimeSql(date: string): SQL {
  return sql`(now() >= ((${date}::date + ${ATTENDANCE_START}::time) AT TIME ZONE 'Europe/Prague'))`;
}

/** Pojistka na den: `normal` = dnes a neuzavřený, `history` = zápis do minulosti/dnes; nepřítomnost do dnes + 365. */
function dayGuardSql(date: string, mode: WriteMode2, op: "presence" | "excuse"): SQL {
  if (mode === "normal") {
    return sql`(
      ${date}::date = ${TODAY_SQL}
      AND NOT EXISTS (
        SELECT 1 FROM attendance_day fd WHERE fd.attendance_date = ${date}::date AND fd.finalized_at IS NOT NULL
      )
    )`;
  }
  if (op === "presence") return sql`(${date}::date <= ${TODAY_SQL})`;
  return sql`(${date}::date <= ${TODAY_SQL} + ${MAX_ADVANCE_DAYS}::int)`;
}

/**
 * Pojistka na člena: `normal` = aktivní a `joined_at <= D`. `history` navíc
 * pustí člena, který pro den už řádek (nebo ohlášení) má, třeba po deaktivaci.
 */
function memberGuardSql(date: string, memberId: string, mode: WriteMode2): SQL {
  const base = sql`EXISTS (
    SELECT 1 FROM member gm
    WHERE gm.id = ${memberId}::uuid AND ${memberActiveSql("gm")} AND gm.joined_at <= ${date}::date
  )`;
  if (mode === "normal") return sql`(${base})`;
  return sql`(${base}
    OR EXISTS (SELECT 1 FROM attendance_record hr WHERE hr.attendance_date = ${date}::date AND hr.member_id = ${memberId}::uuid)
    OR EXISTS (SELECT 1 FROM member_absence ha WHERE ha.absence_date = ${date}::date AND ha.member_id = ${memberId}::uuid)
    OR EXISTS (SELECT 1 FROM member em WHERE em.id = ${memberId}::uuid AND em.joined_at <= ${date}::date))`;
}

/**
 * Zápis přítomnosti jako cílový stav s verzí řádku, jeden SQL příkaz (arch 6.2,
 * LL-003). Řádek existuje (`expectedVersion >= 1`): UPDATE jen při shodě verze.
 * Řádek neexistuje (`0`): INSERT ... ON CONFLICT DO NOTHING. Paměť jmen se plní
 * ve stejném příkazu. V režimu `history` stejný příkaz zapíše audit (13.2), a to
 * jen při skutečné změně hodnoty; změna a audit jsou buď obojí, nebo nic.
 *
 * Při nezapsání příkaz vrací pojistky, ze kterých se pozná důvod (den, člen,
 * jinak konflikt verze).
 */
export async function writePresenceGuarded(input: {
  date: string;
  memberId: string;
  status: PresenceStatus;
  /** Zvalidované jméno, jen u `substitute`. */
  name: string | null;
  expectedVersion: number;
  actorId: string;
  mode: WriteMode2;
}): Promise<PresenceWriteResult> {
  const { date, memberId, status, name, expectedVersion, actorId, mode } = input;
  const nameValue = status === "substitute" ? sql`${name}::text` : sql`NULL::text`;
  const isUnexcused = status === "unexcused";

  const audit =
    mode === "history"
      ? sql`,
    aud AS (
      INSERT INTO attendance_audit
        (actor_id, actor_name, member_id, member_name, attendance_date, field, old_value, new_value)
      SELECT ${actorId}::uuid,
             (SELECT name FROM member WHERE id = ${actorId}::uuid),
             ${memberId}::uuid,
             (SELECT name FROM member WHERE id = ${memberId}::uuid),
             ${date}::date,
             'presence',
             CASE b.status WHEN 'substitute' THEN 'substitute:' || b.substitute_name ELSE b.status END,
             CASE u.status WHEN 'substitute' THEN 'substitute:' || u.substitute_name ELSE u.status END
      FROM res u LEFT JOIN before b ON true
      WHERE (CASE b.status WHEN 'substitute' THEN 'substitute:' || b.substitute_name ELSE b.status END)
            IS DISTINCT FROM
            (CASE u.status WHEN 'substitute' THEN 'substitute:' || u.substitute_name ELSE u.status END)
      RETURNING 1
    )`
      : sql``;

  const result = await getDb().execute<{
    day_ok: boolean;
    member_ok: boolean;
    time_ok: boolean;
    excuse_ok: boolean;
    version: number | null;
    audited: number;
  }>(sql`
    WITH g AS (
      SELECT ${dayGuardSql(date, mode, "presence")} AS day_ok,
             ${memberGuardSql(date, memberId, mode)} AS member_ok,
             ${isUnexcused ? unexcusedTimeSql(date) : sql`true`} AS time_ok,
             ${
               isUnexcused
                 ? sql`NOT EXISTS (SELECT 1 FROM member_absence ea WHERE ea.member_id = ${memberId}::uuid AND ea.absence_date = ${date}::date)`
                 : sql`true`
             } AS excuse_ok
    ),
    ok AS (SELECT (day_ok AND member_ok AND time_ok AND excuse_ok) AS go FROM g),
    before AS (
      SELECT status, substitute_name FROM attendance_record
      WHERE attendance_date = ${date}::date AND member_id = ${memberId}::uuid
    ),
    upd AS (
      UPDATE attendance_record r SET
        status = ${status}::text, substitute_name = ${nameValue}, source = 'manager',
        version = r.version + 1, updated_by = ${actorId}::uuid, updated_at = now()
      WHERE ${expectedVersion}::int >= 1
        AND r.attendance_date = ${date}::date AND r.member_id = ${memberId}::uuid
        AND r.version = ${expectedVersion}::int
        AND (SELECT go FROM ok)
      RETURNING r.status, r.substitute_name, r.version
    ),
    ins AS (
      INSERT INTO attendance_record
        (attendance_date, member_id, status, substitute_name, source, version, updated_by, updated_at)
      SELECT ${date}::date, ${memberId}::uuid, ${status}::text, ${nameValue}, 'manager', 1,
             ${actorId}::uuid, now()
      WHERE ${expectedVersion}::int = 0 AND (SELECT go FROM ok)
      ON CONFLICT (attendance_date, member_id) DO NOTHING
      RETURNING status, substitute_name, version
    ),
    res AS (
      SELECT status, substitute_name, version FROM upd
      UNION ALL
      SELECT status, substitute_name, version FROM ins
    ),
    names AS (
      INSERT INTO member_substitute_name (member_id, name, last_used_at)
      SELECT ${memberId}::uuid, btrim(substitute_name), now() FROM res WHERE status = 'substitute'
      ON CONFLICT (member_id, lower(name)) DO UPDATE SET last_used_at = now()
    ),
    ${trimNamesSql(memberId, sql`(SELECT btrim(substitute_name) FROM res WHERE status = 'substitute')`)}${audit}
    SELECT (SELECT day_ok FROM g) AS day_ok,
           (SELECT member_ok FROM g) AS member_ok,
           (SELECT time_ok FROM g) AS time_ok,
           (SELECT excuse_ok FROM g) AS excuse_ok,
           (SELECT version FROM res) AS version,
           ${mode === "history" ? sql`(SELECT count(*) FROM aud)::int` : sql`0`} AS audited
  `);
  const r = result.rows[0];
  if (r && r.version !== null && r.version !== undefined) {
    return { result: "ok", version: Number(r.version), audited: Number(r.audited) > 0 };
  }
  if (!r?.day_ok) return { result: "day-closed" };
  if (!r?.member_ok) return { result: "inactive" };
  if (!r?.time_ok) return { result: "too-early" };
  if (!r?.excuse_ok) return { result: "excused-conflict" };
  return { result: "conflict" };
}

export type ExcuseWriteResult =
  | { result: "ok"; audited: boolean }
  | { result: "day-closed" }
  | { result: "inactive" }
  /** iter-041 (K6): řádek je `unexcused`, omluva nejde, nejdřív změnit zápis. */
  | { result: "unexcused-conflict" };

/**
 * „Omluven(a)“ za člena (arch 6.3): cílový stav ohlášení bez náhradníka, bez
 * verze (poslední zápis vyhrává). `excused = false` smaže ohlášení (i s
 * náhradníkem, je to cílový stav). V režimu `history` zapíše audit ve stejném
 * příkazu, jen při skutečné změně.
 */
export async function setExcuseGuarded(input: {
  date: string;
  memberId: string;
  excused: boolean;
  actorId: string;
  mode: WriteMode2;
}): Promise<ExcuseWriteResult> {
  const { date, memberId, excused, actorId, mode } = input;

  const oldExpr = sql`(CASE WHEN (SELECT count(*) FROM before) = 0 THEN 'none'
    WHEN b.substitute_name IS NULL THEN 'absence'
    ELSE 'absence:' || b.substitute_name END)`;
  const newExpr = sql`(CASE WHEN ${excused}::boolean THEN
      (CASE WHEN (SELECT count(*) FROM before) = 0 THEN 'absence'
            WHEN b.substitute_name IS NULL THEN 'absence'
            ELSE 'absence:' || b.substitute_name END)
    ELSE 'none' END)`;

  const audit =
    mode === "history"
      ? sql`,
    aud AS (
      INSERT INTO attendance_audit
        (actor_id, actor_name, member_id, member_name, attendance_date, field, old_value, new_value)
      SELECT ${actorId}::uuid,
             (SELECT name FROM member WHERE id = ${actorId}::uuid),
             ${memberId}::uuid,
             (SELECT name FROM member WHERE id = ${memberId}::uuid),
             ${date}::date,
             'absence',
             ${oldExpr},
             ${newExpr}
      FROM (SELECT 1) x LEFT JOIN before b ON true
      WHERE (SELECT go FROM ok) AND ${oldExpr} IS DISTINCT FROM ${newExpr}
      RETURNING 1
    )`
      : sql``;

  const result = await getDb().execute<{
    day_ok: boolean;
    member_ok: boolean;
    unexcused_ok: boolean;
    audited: number;
  }>(sql`
    WITH g AS (
      SELECT ${dayGuardSql(date, mode, "excuse")} AS day_ok,
             ${memberGuardSql(date, memberId, mode)} AS member_ok,
             NOT (${excused}::boolean AND EXISTS (
               SELECT 1 FROM attendance_record ur
               WHERE ur.attendance_date = ${date}::date AND ur.member_id = ${memberId}::uuid
                 AND ur.status = 'unexcused'
             )) AS unexcused_ok
    ),
    ok AS (SELECT (day_ok AND member_ok AND unexcused_ok) AS go FROM g),
    before AS (
      SELECT substitute_name FROM member_absence
      WHERE member_id = ${memberId}::uuid AND absence_date = ${date}::date
    ),
    ins AS (
      INSERT INTO member_absence (member_id, absence_date, substitute_name, created_by, updated_by)
      SELECT ${memberId}::uuid, ${date}::date, NULL, ${actorId}::uuid, ${actorId}::uuid
      WHERE ${excused}::boolean AND (SELECT go FROM ok)
      ON CONFLICT (member_id, absence_date) DO NOTHING
      RETURNING 1
    ),
    del AS (
      DELETE FROM member_absence
      WHERE NOT ${excused}::boolean AND member_id = ${memberId}::uuid
        AND absence_date = ${date}::date AND (SELECT go FROM ok)
      RETURNING 1
    )${audit}
    SELECT (SELECT day_ok FROM g) AS day_ok, (SELECT member_ok FROM g) AS member_ok,
           (SELECT unexcused_ok FROM g) AS unexcused_ok,
           ${mode === "history" ? sql`(SELECT count(*) FROM aud)::int` : sql`0`} AS audited
  `);
  const r = result.rows[0];
  if (!r?.day_ok) return { result: "day-closed" };
  if (!r?.member_ok) return { result: "inactive" };
  if (!r?.unexcused_ok) return { result: "unexcused-conflict" };
  return { result: "ok", audited: Number(r.audited) > 0 };
}

// ── Audit a přehled (arch 12.4, 13.3) ───────────────────────

type AuditDbRow = {
  id: string | number;
  at: string;
  actor_name: string;
  member_name: string;
  d: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
};

function mapAudit(rows: AuditDbRow[]): AuditRow[] {
  return rows.map((r) => ({
    id: String(r.id),
    at: r.at,
    actorName: r.actor_name,
    memberName: r.member_name,
    date: r.d,
    field: r.field === "absence" ? "absence" : "presence",
    oldValue: r.old_value,
    newValue: r.new_value,
  }));
}

/** Historie oprav jednoho dne, nejnovější první. */
export async function listAuditForDate(date: string, limit = 100): Promise<AuditRow[]> {
  const result = await getDb().execute<AuditDbRow>(sql`
    SELECT id, ${isoSql(sql`at`)} AS at, actor_name, member_name, attendance_date::text AS d,
           field, old_value, new_value
    FROM attendance_audit
    WHERE attendance_date = ${date}::date
    ORDER BY at DESC, id DESC
    LIMIT ${limit}::int
  `);
  return mapAudit(result.rows);
}

/** Historie oprav jednoho člena, nejnovější první. */
export async function listAuditForMember(memberId: string, limit = 100): Promise<AuditRow[]> {
  const result = await getDb().execute<AuditDbRow>(sql`
    SELECT id, ${isoSql(sql`at`)} AS at, actor_name, member_name, attendance_date::text AS d,
           field, old_value, new_value
    FROM attendance_audit
    WHERE member_id = ${memberId}::uuid
    ORDER BY at DESC, id DESC
    LIMIT ${limit}::int
  `);
  return mapAudit(result.rows);
}

export interface OverviewMemberRow {
  memberId: string;
  name: string;
  absences: number;
  substitutes: number;
}

/**
 * Přehled aktivních členů: absence a náhradníci v UZAVŘENÝCH dnech okna
 * `(from, to]`. Hranici `from` počítá TS (`absenceWindowStart`), SQL ji dostane
 * jako parametr (arch 12.2).
 */
export async function listOverviewMembers(from: string, to: string): Promise<OverviewMemberRow[]> {
  const result = await getDb().execute<{
    id: string;
    name: string;
    absences: number;
    substitutes: number;
  }>(sql`
    SELECT m.id, m.name,
           count(r.member_id) FILTER (WHERE ${absenceStatusSql("r")})::int AS absences,
           count(r.member_id) FILTER (WHERE r.status = 'substitute')::int AS substitutes
    FROM member m
    LEFT JOIN attendance_record r
      ON r.member_id = m.id
     AND r.attendance_date > ${from}::date AND r.attendance_date <= ${to}::date
     AND EXISTS (
       SELECT 1 FROM attendance_day ad
       WHERE ad.attendance_date = r.attendance_date AND ad.finalized_at IS NOT NULL
     )
    WHERE ${memberActiveSql("m")}
    GROUP BY m.id, m.name
    ORDER BY m.name
  `);
  return result.rows.map((r) => ({
    memberId: r.id,
    name: r.name,
    absences: Number(r.absences),
    substitutes: Number(r.substitutes),
  }));
}

export interface ClosedDayRow {
  date: string;
  dayMode: "recorded" | "unrecorded" | null;
  present: number;
  substitutes: number;
  absent: number;
}

/** Poslední uzavřené dny s počty (odkaz na `/dochazka/zapis?d=`). */
export async function listClosedDays(limit = 20): Promise<ClosedDayRow[]> {
  const result = await getDb().execute<{
    d: string;
    mode: string | null;
    present: number;
    substitutes: number;
    absent: number;
  }>(sql`
    SELECT ad.attendance_date::text AS d, ad.mode,
           count(r.member_id) FILTER (WHERE r.status = 'present')::int AS present,
           count(r.member_id) FILTER (WHERE r.status = 'substitute')::int AS substitutes,
           count(r.member_id) FILTER (WHERE ${absenceStatusSql("r")})::int AS absent
    FROM attendance_day ad
    LEFT JOIN attendance_record r ON r.attendance_date = ad.attendance_date
    WHERE ad.finalized_at IS NOT NULL
    GROUP BY ad.attendance_date, ad.mode
    ORDER BY ad.attendance_date DESC
    LIMIT ${limit}::int
  `);
  return result.rows.map((r) => ({
    date: r.d,
    dayMode: r.mode === "recorded" || r.mode === "unrecorded" ? r.mode : null,
    present: Number(r.present),
    substitutes: Number(r.substitutes),
    absent: Number(r.absent),
  }));
}

export interface MemberDayRow {
  date: string;
  status: PresenceStatus;
  substituteName: string | null;
  excused: boolean;
}

/** Uzavřené dny člena v okně `(from, to]` s výsledkem a omluvou, nejnovější první. */
export async function listMemberDays(
  memberId: string,
  from: string,
  to: string
): Promise<MemberDayRow[]> {
  const result = await getDb().execute<{
    d: string;
    status: string;
    substitute_name: string | null;
    excused: boolean;
  }>(sql`
    SELECT r.attendance_date::text AS d, r.status, r.substitute_name,
           EXISTS (
             SELECT 1 FROM member_absence ma
             WHERE ma.member_id = r.member_id AND ma.absence_date = r.attendance_date
           ) AS excused
    FROM attendance_record r
    JOIN attendance_day ad ON ad.attendance_date = r.attendance_date AND ad.finalized_at IS NOT NULL
    WHERE r.member_id = ${memberId}::uuid
      AND r.attendance_date > ${from}::date AND r.attendance_date <= ${to}::date
    ORDER BY r.attendance_date DESC
  `);
  return result.rows.map((r) => ({
    date: r.d,
    status: r.status as PresenceStatus,
    substituteName: r.substitute_name,
    excused: Boolean(r.excused),
  }));
}
