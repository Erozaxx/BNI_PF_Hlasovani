/**
 * iter-041 (arch 4, 5.8, 5.9, 6, gate Z4, Z8 až Z11): dotazy semaforu.
 *
 * Bez transakcí (LL-003): uložení importu je JEDEN SQL příkaz (data-modifying
 * CTE), mazání jsou jednotlivé příkazy. Žádná JS interpolace do textu SQL,
 * všechno jsou bind parametry (`sql` šablona drizzle). Bonus se nikam
 * neukládá, počítá se živě z `mastermind_case`, `burza_help` a
 * `burza_contact_use` (jeden dotaz `UNION ALL`, strop a ořez v TS).
 *
 * Funkce, které vrací jména nebo cizí čísla (`listOverviewRows`, `listMonthMembers`,
 * `listMembersForMatch`, `listAliases`), smí volat jen stránky a akce za právem
 * `semafor.view_all` nebo `semafor.import`. Členská stránka `/semafor` volá
 * jen `listMyScores`, `listBonusEvents` s `memberId` a `getChapterCounts`
 * (čtyři čísla, žádná jména).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { memberActiveSql } from "@/lib/db/queries/member-active";
import { bonusForMonth, type BonusEvent, type ScoreRecord } from "@/lib/semafor/mine";
import { bonusWindow, filterBonusEvents, internalScore, type BonusSources } from "@/lib/semafor/bonus";
import { summarizeChapter, type ChapterCounts } from "@/lib/semafor/summary";
import type { SaveRow } from "@/lib/semafor/import";
import type { MatchMember } from "@/lib/semafor/names";

function getDb() {
  return drizzle(getSql());
}

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

interface ScoreDbRow extends Record<string, unknown> {
  month: string;
  member_id: string;
  total_score: string;
  attendance_rate: string | null;
  attendance_score: string | null;
  ceu_rate: string | null;
  ceu_score: string | null;
  one_to_one_rate: string | null;
  one_to_one_score: string | null;
  referrals_given_rate: string | null;
  referrals_given_score: string | null;
  tyfcb: string | null;
  tyfcb_score: string | null;
  visitors: string | null;
  visitor_score: string | null;
  sponsors: string | null;
  sponsor_score: string | null;
}

function toRecord(r: ScoreDbRow): ScoreRecord {
  return {
    month: r.month,
    memberId: r.member_id,
    totalScore: Number(r.total_score),
    attendanceRate: num(r.attendance_rate),
    attendanceScore: num(r.attendance_score),
    ceuRate: num(r.ceu_rate),
    ceuScore: num(r.ceu_score),
    oneToOneRate: num(r.one_to_one_rate),
    oneToOneScore: num(r.one_to_one_score),
    referralsGivenRate: num(r.referrals_given_rate),
    referralsGivenScore: num(r.referrals_given_score),
    tyfcb: num(r.tyfcb),
    tyfcbScore: num(r.tyfcb_score),
    visitors: num(r.visitors),
    visitorScore: num(r.visitor_score),
    sponsors: num(r.sponsors),
    sponsorScore: num(r.sponsor_score),
  };
}

const SCORE_COLUMNS = sql`s.month::text AS month, s.member_id::text AS member_id, s.total_score,
  s.attendance_rate, s.attendance_score, s.ceu_rate, s.ceu_score, s.one_to_one_rate,
  s.one_to_one_score, s.referrals_given_rate, s.referrals_given_score, s.tyfcb, s.tyfcb_score,
  s.visitors, s.visitor_score, s.sponsors, s.sponsor_score`;

// ── Měsíce ────────────────────────────────────────────────────

/** Poslední měsíc, za který je něco nahráno (`YYYY-MM-01`), nebo `null`. */
export async function getLatestMonth(): Promise<string | null> {
  const r = await getDb().execute<{ m: string | null }>(sql`SELECT max(month)::text AS m FROM semafor_score`);
  return r.rows[0]?.m ?? null;
}

export interface MonthSummaryRow {
  month: string;
  rows: number;
  lastUploadedOn: string | null;
  uploadedByName: string | null;
}

/** Nahrané měsíce (nejnovější první) s počtem řádků a posledním nahráním. */
export async function listMonths(): Promise<MonthSummaryRow[]> {
  const r = await getDb().execute<{
    month: string;
    rows: number;
    uploaded_on: string | null;
    uploaded_by: string | null;
  }>(sql`
    SELECT c.month::text AS month, c.n AS rows,
           (i.uploaded_at AT TIME ZONE 'Europe/Prague')::date::text AS uploaded_on,
           u.name AS uploaded_by
    FROM (SELECT month, count(*)::int AS n FROM semafor_score GROUP BY month) c
    LEFT JOIN LATERAL (
      SELECT uploaded_at, uploaded_by FROM semafor_import i
      WHERE i.month = c.month ORDER BY i.uploaded_at DESC LIMIT 1
    ) i ON true
    LEFT JOIN member u ON u.id = i.uploaded_by
    ORDER BY c.month DESC
  `);
  return r.rows.map((x) => ({
    month: x.month,
    rows: x.rows,
    lastUploadedOn: x.uploaded_on,
    uploadedByName: x.uploaded_by,
  }));
}

export interface MonthState {
  rows: number;
  lastUploadedOn: string | null;
  /** Členové, kteří už mají v měsíci řádek (jména, jen pro import). */
  members: { id: string; name: string }[];
}

export async function getMonthState(month: string): Promise<MonthState> {
  const r = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT m.id::text AS id, m.name
    FROM semafor_score s JOIN member m ON m.id = s.member_id
    WHERE s.month = ${month}::date
    ORDER BY m.name
  `);
  const last = await getDb().execute<{ d: string | null }>(sql`
    SELECT (max(uploaded_at) AT TIME ZONE 'Europe/Prague')::date::text AS d
    FROM semafor_import WHERE month = ${month}::date
  `);
  return { rows: r.rows.length, lastUploadedOn: last.rows[0]?.d ?? null, members: r.rows };
}

/** Měsíce, ve kterých už byl nahraný soubor se stejným SHA-256. */
export async function listMonthsBySha(sha: string): Promise<string[]> {
  const r = await getDb().execute<{ m: string }>(sql`
    SELECT DISTINCT month::text AS m FROM semafor_import
    WHERE file_sha256 = ${sha} ORDER BY m
  `);
  return r.rows.map((x) => x.m);
}

// ── Člen: vlastní snímky ──────────────────────────────────────

/** Vlastní snímky člena, nejnovější první (nejvýš `limit`). Jen `memberId` ze session. */
export async function listMyScores(memberId: string, limit = 12): Promise<ScoreRecord[]> {
  const r = await getDb().execute<ScoreDbRow>(sql`
    SELECT ${SCORE_COLUMNS}
    FROM semafor_score s
    WHERE s.member_id = ${memberId}::uuid
    ORDER BY s.month DESC
    LIMIT ${limit}::int
  `);
  return r.rows.map(toRecord);
}

// ── Bonus (Z8 až Z11) ─────────────────────────────────────────

/**
 * Události bonusu s datem v `(after, to]`: odprezentovaný Master mind
 * (`member_id`, `internal_date`), pomoc v burze a využitý kontakt
 * (`helper_id`, `used_on`). Využité kontakty se počítají nejvýš jednou na
 * dvojici (pomocník, příjemce) a kalendářní měsíc (první využití v měsíci;
 * výběr je před oknem, aby byl stejný pro každé okno). Jeden dotaz `UNION ALL`.
 * `memberId` omezí na jednoho člena (stránka člena), bez něj jsou všichni (přehled jednoho měsíce).
 */
export function bonusEventsSql(opts: { after: string; to: string; memberId?: string }): SQL {
  const mm: SQL = opts.memberId ? sql`AND c.member_id = ${opts.memberId}::uuid` : sql``;
  const bh: SQL = opts.memberId ? sql`AND h.helper_id = ${opts.memberId}::uuid` : sql``;
  const bc: SQL = opts.memberId ? sql`AND u.helper_id = ${opts.memberId}::uuid` : sql``;
  return sql`
    SELECT c.member_id::text AS member_id, 'mastermind'::text AS category, c.internal_date::text AS d
    FROM mastermind_case c
    WHERE c.status = 'presented' AND c.internal_date IS NOT NULL
      AND c.internal_date > ${opts.after}::date AND c.internal_date <= ${opts.to}::date ${mm}
    UNION ALL
    SELECT h.helper_id::text, 'burza'::text, h.used_on::text
    FROM burza_help h
    WHERE h.used_on > ${opts.after}::date AND h.used_on <= ${opts.to}::date ${bh}
    UNION ALL
    SELECT d.helper_id::text, 'burza'::text, d.used_on::text
    FROM (
      SELECT DISTINCT ON (u.helper_id, u.recipient_id, date_trunc('month', u.used_on::timestamp))
             u.helper_id, u.used_on
      FROM burza_contact_use u
      WHERE true ${bc}
      ORDER BY u.helper_id, u.recipient_id, date_trunc('month', u.used_on::timestamp), u.used_on
    ) d
    WHERE d.used_on > ${opts.after}::date AND d.used_on <= ${opts.to}::date
  `;
}

/**
 * Jediná cesta ke čtení událostí bonusu (BK2): vrací jen události ze zapnutých
 * částí (`sources` z `bonusSources(await getChapterSettings())`, povinný
 * parametr, aby ho volající nemohl vynechat). Vypnutá část nedává bonus, data
 * v DB zůstávají a po zapnutí se bonus vrátí. Filtr je v TS
 * (`filterBonusEvents`), SQL zůstává beze změny. Modul nečte nastavení sám,
 * zůstává použitelný v holém Node (test PALMS importuje `bonusEventsSql`).
 */
export async function listBonusEvents(opts: {
  after: string;
  to: string;
  memberId?: string;
  sources: BonusSources;
}): Promise<BonusEvent[]> {
  const r = await getDb().execute<{ member_id: string; category: "mastermind" | "burza"; d: string }>(
    bonusEventsSql(opts)
  );
  const events = r.rows.map((x) => ({ memberId: x.member_id, category: x.category, date: x.d }));
  return filterBonusEvents(events, opts.sources);
}

/** Události člena pro jeho měsíce (jedno okno od nejstaršího po nejnovější, rozpad po měsících v TS). */
export async function listMyBonusEvents(
  memberId: string,
  months: readonly string[],
  sources: BonusSources
): Promise<BonusEvent[]> {
  if (months.length === 0) return [];
  const sorted = [...months].sort();
  const oldest = bonusWindow(sorted[0]);
  const newest = bonusWindow(sorted[sorted.length - 1]);
  return listBonusEvents({ after: oldest.after, to: newest.to, memberId, sources });
}

/** Události člena po konci posledního nahraného měsíce (pro větu „započtou se“). */
export async function countMyEventsAfter(
  memberId: string,
  afterDate: string,
  today: string,
  sources: BonusSources
): Promise<number> {
  if (today <= afterDate) return 0;
  const events = await listBonusEvents({ after: afterDate, to: today, memberId, sources });
  return events.length;
}

// ── Souhrn chapteru a přehled vedení ──────────────────────────

/**
 * Souhrn chapteru (Z4): čtyři počty členů v interních barvách za měsíc. Jen
 * aktivní členové s řádkem. Žádná jména, do klienta jde jen výsledek.
 */
export async function getChapterCounts(month: string, sources: BonusSources): Promise<ChapterCounts> {
  const rows = await getDb().execute<{ member_id: string; total_score: string }>(sql`
    SELECT s.member_id::text AS member_id, s.total_score
    FROM semafor_score s JOIN member m ON m.id = s.member_id
    WHERE s.month = ${month}::date AND ${memberActiveSql("m")}
  `);
  const w = bonusWindow(month);
  const events = await listBonusEvents({ after: w.after, to: w.to, sources });
  return summarizeChapter(
    rows.rows.map((x) => ({
      internalScore: internalScore(Number(x.total_score), bonusForMonth(month, x.member_id, events).bonus),
    }))
  );
}

export interface OverviewRow {
  record: ScoreRecord | null;
  memberId: string;
  name: string;
  active: boolean;
  updatedOn: string | null;
}

/**
 * Přehled se jmény pro měsíc: členové s řádkem (i neaktivní, Z5) a aktivní
 * členové bez řádku (hodnoty `null`). Smí volat jen stránka s `semafor.view_all`.
 */
export async function listOverviewRows(month: string): Promise<OverviewRow[]> {
  const r = await getDb().execute<
    ScoreDbRow & { name: string; active: boolean; updated_on: string | null; has_row: boolean }
  >(sql`
    SELECT ${SCORE_COLUMNS}, m.id::text AS mid, m.name, (${memberActiveSql("m")}) AS active,
           (s.updated_at AT TIME ZONE 'Europe/Prague')::date::text AS updated_on,
           (s.member_id IS NOT NULL) AS has_row
    FROM member m
    LEFT JOIN semafor_score s ON s.member_id = m.id AND s.month = ${month}::date
    WHERE s.member_id IS NOT NULL OR ${memberActiveSql("m")}
    ORDER BY m.name
  `);
  return r.rows.map((x) => {
    const row = x as unknown as ScoreDbRow & { mid: string; name: string; active: boolean; updated_on: string | null; has_row: boolean };
    return {
      record: row.has_row ? toRecord(row) : null,
      memberId: row.mid,
      name: row.name,
      active: row.active,
      updatedOn: row.updated_on,
    };
  });
}

// ── Import: členové a aliasy ──────────────────────────────────

/**
 * Všichni členové (i neaktivní) pro párování jmen ze souboru. `email` je jen
 * pro párování na serveru: výsledek nikdy nejde do props klienta ani do logu.
 */
export async function listMembersForMatch(): Promise<MatchMember[]> {
  const r = await getDb().execute<{ id: string; name: string; active: boolean; email: string | null }>(sql`
    SELECT m.id::text AS id, m.name, (${memberActiveSql("m")}) AS active, m.email
    FROM member m ORDER BY m.name
  `);
  return r.rows.map((x) => ({ id: x.id, name: x.name, active: x.active, email: x.email }));
}

export interface AliasRow {
  nameKey: string;
  memberId: string;
  memberName: string;
}

export async function listAliases(): Promise<AliasRow[]> {
  const r = await getDb().execute<{ name_key: string; member_id: string; name: string }>(sql`
    SELECT a.name_key, a.member_id::text AS member_id, m.name
    FROM semafor_name_alias a JOIN member m ON m.id = a.member_id
    ORDER BY a.name_key
  `);
  return r.rows.map((x) => ({ nameKey: x.name_key, memberId: x.member_id, memberName: x.name }));
}

// ── Uložení a mazání ──────────────────────────────────────────

export interface SaveImportResult {
  inserted: number;
  updated: number;
  total: number;
  aliases: number;
}

/**
 * Uložení importu: JEDEN příkaz (data-modifying CTE), atomický bez transakce.
 * Řádky jdou jako jeden JSON parametr, prázdný seznam se do SQL neposílá (volající
 * ho odmítne dřív). `IS DISTINCT FROM` přes všechny hodnotové sloupce hlídá, že
 * „beze změny“ nelže (NULL vs. hodnota). Člen, který mezitím zmizel, se
 * přeskočí (JOIN na `member`).
 */
export async function saveSemaforImport(opts: {
  month: string;
  actorId: string;
  sha256: string;
  fileRows: number;
  rows: SaveRow[];
  aliases: { nameKey: string; memberId: string }[];
}): Promise<SaveImportResult> {
  if (opts.rows.length === 0) throw new Error("empty import");
  const rowsJson = JSON.stringify(opts.rows);
  const aliasJson = JSON.stringify(opts.aliases.map((a) => ({ name_key: a.nameKey, member_id: a.memberId })));
  const r = await getDb().execute<{ inserted: number; updated: number; total: number; aliases: number }>(sql`
    WITH input AS (
      SELECT * FROM jsonb_to_recordset(${rowsJson}::jsonb) AS x(
        member_id uuid, total_score numeric, attendance_rate numeric, attendance_score numeric,
        ceu_rate numeric, ceu_score numeric, one_to_one_rate numeric, one_to_one_score numeric,
        referrals_given_rate numeric, referrals_given_score numeric, tyfcb numeric, tyfcb_score numeric,
        visitors numeric, visitor_score numeric, sponsors numeric, sponsor_score numeric)
    ),
    imp AS (
      INSERT INTO semafor_import (month, uploaded_by, file_sha256, row_count, saved_count)
      VALUES (${opts.month}::date, ${opts.actorId}::uuid, ${opts.sha256}, ${opts.fileRows}::int,
              (SELECT count(*)::int FROM input))
      RETURNING id
    ),
    up AS (
      INSERT INTO semafor_score (month, member_id, import_id, total_score, attendance_rate, attendance_score,
        ceu_rate, ceu_score, one_to_one_rate, one_to_one_score, referrals_given_rate, referrals_given_score,
        tyfcb, tyfcb_score, visitors, visitor_score, sponsors, sponsor_score, updated_at)
      SELECT ${opts.month}::date, i.member_id, imp.id, i.total_score, i.attendance_rate, i.attendance_score,
        i.ceu_rate, i.ceu_score, i.one_to_one_rate, i.one_to_one_score, i.referrals_given_rate,
        i.referrals_given_score, i.tyfcb, i.tyfcb_score, i.visitors, i.visitor_score, i.sponsors,
        i.sponsor_score, now()
      FROM input i CROSS JOIN imp JOIN member m ON m.id = i.member_id
      ON CONFLICT (month, member_id) DO UPDATE SET
        import_id = EXCLUDED.import_id, total_score = EXCLUDED.total_score,
        attendance_rate = EXCLUDED.attendance_rate, attendance_score = EXCLUDED.attendance_score,
        ceu_rate = EXCLUDED.ceu_rate, ceu_score = EXCLUDED.ceu_score,
        one_to_one_rate = EXCLUDED.one_to_one_rate, one_to_one_score = EXCLUDED.one_to_one_score,
        referrals_given_rate = EXCLUDED.referrals_given_rate, referrals_given_score = EXCLUDED.referrals_given_score,
        tyfcb = EXCLUDED.tyfcb, tyfcb_score = EXCLUDED.tyfcb_score,
        visitors = EXCLUDED.visitors, visitor_score = EXCLUDED.visitor_score,
        sponsors = EXCLUDED.sponsors, sponsor_score = EXCLUDED.sponsor_score,
        updated_at = now()
      WHERE (semafor_score.total_score, semafor_score.attendance_rate, semafor_score.attendance_score,
             semafor_score.ceu_rate, semafor_score.ceu_score, semafor_score.one_to_one_rate,
             semafor_score.one_to_one_score, semafor_score.referrals_given_rate,
             semafor_score.referrals_given_score, semafor_score.tyfcb, semafor_score.tyfcb_score,
             semafor_score.visitors, semafor_score.visitor_score, semafor_score.sponsors,
             semafor_score.sponsor_score)
        IS DISTINCT FROM
            (EXCLUDED.total_score, EXCLUDED.attendance_rate, EXCLUDED.attendance_score,
             EXCLUDED.ceu_rate, EXCLUDED.ceu_score, EXCLUDED.one_to_one_rate,
             EXCLUDED.one_to_one_score, EXCLUDED.referrals_given_rate,
             EXCLUDED.referrals_given_score, EXCLUDED.tyfcb, EXCLUDED.tyfcb_score,
             EXCLUDED.visitors, EXCLUDED.visitor_score, EXCLUDED.sponsors,
             EXCLUDED.sponsor_score)
      RETURNING (xmax = 0) AS inserted
    ),
    al AS (
      INSERT INTO semafor_name_alias (name_key, member_id, created_by)
      SELECT a.name_key, a.member_id, ${opts.actorId}::uuid
      FROM jsonb_to_recordset(${aliasJson}::jsonb) AS a(name_key text, member_id uuid)
      JOIN member am ON am.id = a.member_id
      ON CONFLICT (name_key) DO UPDATE
        SET member_id = EXCLUDED.member_id, created_by = EXCLUDED.created_by, created_at = now()
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM up WHERE inserted)::int AS inserted,
           (SELECT count(*) FROM up WHERE NOT inserted)::int AS updated,
           (SELECT count(*) FROM input)::int AS total,
           (SELECT count(*) FROM al)::int AS aliases
  `);
  const row = r.rows[0];
  return {
    inserted: row?.inserted ?? 0,
    updated: row?.updated ?? 0,
    total: row?.total ?? 0,
    aliases: row?.aliases ?? 0,
  };
}

/** Smaže všechny řádky měsíce. Historie `semafor_import` zůstává. Vrací počet smazaných. */
export async function deleteSemaforMonth(month: string): Promise<number> {
  const r = await getDb().execute<{ n: number }>(sql`
    WITH d AS (DELETE FROM semafor_score WHERE month = ${month}::date RETURNING 1)
    SELECT count(*)::int AS n FROM d
  `);
  return r.rows[0]?.n ?? 0;
}

export async function deleteSemaforRow(month: string, memberId: string): Promise<number> {
  const r = await getDb().execute<{ n: number }>(sql`
    WITH d AS (DELETE FROM semafor_score WHERE month = ${month}::date AND member_id = ${memberId}::uuid RETURNING 1)
    SELECT count(*)::int AS n FROM d
  `);
  return r.rows[0]?.n ?? 0;
}

export async function removeSemaforAlias(nameKey: string): Promise<number> {
  const r = await getDb().execute<{ n: number }>(sql`
    WITH d AS (DELETE FROM semafor_name_alias WHERE name_key = ${nameKey} RETURNING 1)
    SELECT count(*)::int AS n FROM d
  `);
  return r.rows[0]?.n ?? 0;
}
