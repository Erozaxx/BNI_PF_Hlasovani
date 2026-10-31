/**
 * iter-044 (arch 5.3): dotazy vlastních bodů semaforu (poděkování, školení,
 * přivedený host, který se stal členem, akce chapteru, ostatní práce).
 *
 * Bez transakcí (LL-003): každý zápis je JEDEN SQL příkaz (data-modifying CTE).
 * Kontroly (právo, funkce Člen výboru, ne sám sobě, příjemce aktivní, datum)
 * jsou ve WHERE příkazu, autorita je SQL. Výsledek nese příznaky a
 * `pointWriteOutcome` z nich udělá klíč hlášky. `ON CONFLICT DO NOTHING` je bez
 * cíle (platí pro částečné i výrazový unique index): duplicita = kontroly
 * prošly a nic se nevložilo. Žádná JS interpolace do textu SQL, jen bind
 * parametry drizzle `sql` šablony.
 *
 * Pravidlo modulu (R-03): SQL větev práva (`actorHasPermissionSql`) smí volat
 * jen akce, která před tím prošla `requirePermission("semafor.points")`.
 * Přihlášení odkazem SQL nerozlišuje. Mazání vlastního poděkování
 * (`deleteOwnThanks`) proto větev práva nemá.
 *
 * Funkce `*Sql` vracejí jen `SQL` (test je spouští nad PGlite). Čtení nových
 * tabulek jde přes `readPointsTables` (42P01 = merge před migrací, R-04).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { pgErrorCode, PG_UNDEFINED_TABLE } from "@/lib/db/pg-error";
import {
  actorHasPermissionSql,
  actorHoldsCommitteeFunctionSql,
  memberActiveSql,
} from "@/lib/db/queries/member-active";
import { WORK_POINTS } from "@/lib/semafor/bonus";
import {
  pointDateRange,
  pointWriteOutcome,
  type PointCategory,
  type WriteFlags,
  type WriteOutcome,
} from "@/lib/semafor/points";

function getDb() {
  return drizzle(getSql());
}

export const SEMAFOR_POINTS_PERMISSION = "semafor.points" as const;

// ── Odchyt chybějící tabulky (R-04) ──────────────────────────

export type PointsRead<T> = { missing: true } | { missing: false; value: T };

/**
 * Čtení `semafor_point` a `semafor_activity` s pojistkou: chybějící tabulka
 * (42P01, nasazení před migrací) vrátí `{ missing: true }` a jednou zaloguje
 * varování. Jiná chyba (síť, oprávnění) se vyhodí dál. Přes tenhle obal jdou
 * VŠECHNA čtení nových tabulek.
 */
export async function readPointsTables<T>(read: () => Promise<T>): Promise<PointsRead<T>> {
  try {
    return { missing: false, value: await read() };
  } catch (err) {
    if (pgErrorCode(err) === PG_UNDEFINED_TABLE) {
      console.warn("[semafor-points] tabulky semafor_point a semafor_activity chybí (migrace iter-044), body se nepočítají");
      return { missing: true };
    }
    throw err;
  }
}

/** Zápisy: 42P01 převede na `errNoTable`, jiná chyba se vyhodí. */
async function writeGuarded<T>(run: () => Promise<T>): Promise<T | { noTable: true }> {
  try {
    return await run();
  } catch (err) {
    if (pgErrorCode(err) === PG_UNDEFINED_TABLE) return { noTable: true };
    throw err;
  }
}

export type WriteResult = { outcome: WriteOutcome } | { outcome: "errNoTable" };

function earnedMonth(date: SQL): SQL {
  return sql`date_trunc('month', ${date}::timestamp)::date`;
}

export interface FlagsRow extends Record<string, unknown> {
  perm?: boolean;
  committee?: boolean;
  self: boolean;
  active: boolean;
  inserted: number | string;
  ref_ok?: boolean;
}

function flagsOf(row: FlagsRow | undefined, withPerm: boolean, withCommittee: boolean): WriteFlags {
  if (!row) return { self: false, active: false, inserted: 0, perm: false };
  return {
    perm: withPerm ? Boolean(row.perm) : undefined,
    committee: withCommittee ? Boolean(row.committee) : undefined,
    self: Boolean(row.self),
    active: Boolean(row.active),
    inserted: Number(row.inserted),
  };
}

/**
 * Z řádku výsledku zápisového příkazu udělá klíč hlášky (společné pro
 * `insertThanks`, `insertPoint` a SQL test nad PGlite). `ref_ok = false` u
 * `host_member` (nový člen mimo okno) dá `errNewMember`.
 */
export function writeOutcomeFromRow(
  row: FlagsRow | undefined,
  opts: { withPerm: boolean; withCommittee: boolean; duplicateKey?: "errDuplicate" | "errWorkDuplicate" | "errThanksDuplicate" }
): WriteOutcome {
  const flags = flagsOf(row, opts.withPerm, opts.withCommittee);
  if (row && flags.perm !== false && !flags.self && flags.active && row.ref_ok === false) return "errNewMember";
  return pointWriteOutcome(flags, opts.duplicateKey ?? "errDuplicate");
}

// ── Poděkování (každý přihlášený) ────────────────────────────

export interface InsertThanksInput {
  actorId: string;
  recipientId: string;
  text: string;
  /** Dnešek v Praze `YYYY-MM-DD`. */
  today: string;
}

/**
 * Poděkování: bez kontroly práva (poděkovat smí každý přihlášený, i odkazem).
 * Autor i příjemce musí být aktivní, ne sám sobě. Duplicitu (autor, příjemce,
 * kalendářní měsíc) hlídá `uq_sp_thanks`.
 */
export function insertThanksSql(p: InsertThanksInput): SQL {
  return sql`
    WITH chk AS (
      SELECT (${p.recipientId}::uuid = ${p.actorId}::uuid) AS self,
             (EXISTS (SELECT 1 FROM member t WHERE t.id = ${p.recipientId}::uuid AND ${memberActiveSql("t")})
              AND EXISTS (SELECT 1 FROM member o WHERE o.id = ${p.actorId}::uuid AND ${memberActiveSql("o")})) AS active
    ), ins AS (
      INSERT INTO semafor_point (member_id, category, earned_on, earned_month, note, created_by)
      SELECT ${p.recipientId}::uuid, 'thanks', ${p.today}::date, ${earnedMonth(sql`${p.today}`)}, ${p.text}::text, ${p.actorId}::uuid
      FROM chk
      WHERE NOT self AND active
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT self, active, (SELECT count(*) FROM ins)::int AS inserted FROM chk
  `;
}

export async function insertThanks(p: InsertThanksInput): Promise<WriteResult> {
  const r = await writeGuarded(() => getDb().execute<FlagsRow>(insertThanksSql(p)));
  if ("noTable" in r) return { outcome: "errNoTable" };
  return {
    outcome: writeOutcomeFromRow(r.rows[0], { withPerm: false, withCommittee: false, duplicateKey: "errThanksDuplicate" }),
  };
}

// ── Školení, ostatní práce, přivedený host ───────────────────

export type InsertPointInput =
  | {
      category: "training";
      actorId: string;
      recipientId: string;
      earnedOn: string;
      note: string;
      today: string;
    }
  | {
      category: "work";
      actorId: string;
      recipientId: string;
      earnedOn: string;
      note: string;
      points: number;
      today: string;
    }
  | {
      category: "host_member";
      actorId: string;
      /** Kdo hosta přivedl (dostane body). */
      recipientId: string;
      /** Nový člen. Datum bodu je jeho `joined_at` z DB. */
      refMemberId: string;
      today: string;
    };

/**
 * Školení, ostatní práce a přivedený host, který se stal členem. Všechny
 * vyžadují `semafor.points`. `work` navíc `actorHoldsCommitteeFunctionSql`
 * (Tom 30. 10.: ostatní práci uděluje jen držitel funkce Člen výboru) a body
 * 1 až `WORK_POINTS.max` jako bind parametr. U `host_member` je datum
 * `joined_at` nového člena z DB (ne ze vstupu).
 */
export function insertPointSql(p: InsertPointInput): SQL {
  const { after } = pointDateRange(p.today);
  const perm = actorHasPermissionSql(p.actorId, SEMAFOR_POINTS_PERMISSION);
  const active = sql`EXISTS (SELECT 1 FROM member t WHERE t.id = ${p.recipientId}::uuid AND ${memberActiveSql("t")})`;
  const self = sql`(${p.recipientId}::uuid = ${p.actorId}::uuid)`;

  if (p.category === "host_member") {
    return sql`
      WITH chk AS (
        SELECT ${perm} AS perm, ${self} AS self, ${active} AS active,
               EXISTS (SELECT 1 FROM member r
                       WHERE r.id = ${p.refMemberId}::uuid AND r.id <> ${p.recipientId}::uuid
                         AND r.joined_at > ${after}::date AND r.joined_at <= ${p.today}::date) AS ref_ok
      ), ins AS (
        INSERT INTO semafor_point (member_id, category, earned_on, earned_month, ref_member_id, created_by)
        SELECT ${p.recipientId}::uuid, 'host_member', r.joined_at, date_trunc('month', r.joined_at::timestamp)::date,
               r.id, ${p.actorId}::uuid
        FROM chk JOIN member r ON r.id = ${p.refMemberId}::uuid
        WHERE chk.perm AND NOT chk.self AND chk.active AND chk.ref_ok
        ON CONFLICT DO NOTHING
        RETURNING id
      )
      SELECT perm, self, active, ref_ok, (SELECT count(*) FROM ins)::int AS inserted FROM chk
    `;
  }

  const datesOk = sql`${p.earnedOn}::date <= ${p.today}::date AND ${p.earnedOn}::date > ${after}::date`;
  if (p.category === "training") {
    return sql`
      WITH chk AS (
        SELECT ${perm} AS perm, ${self} AS self, ${active} AS active
      ), ins AS (
        INSERT INTO semafor_point (member_id, category, earned_on, earned_month, note, created_by)
        SELECT ${p.recipientId}::uuid, 'training', ${p.earnedOn}::date, ${earnedMonth(sql`${p.earnedOn}`)}, ${p.note}::text, ${p.actorId}::uuid
        FROM chk
        WHERE perm AND NOT self AND active AND ${datesOk}
        ON CONFLICT DO NOTHING
        RETURNING id
      )
      SELECT perm, self, active, (SELECT count(*) FROM ins)::int AS inserted FROM chk
    `;
  }
  return sql`
    WITH chk AS (
      SELECT ${perm} AS perm, ${actorHoldsCommitteeFunctionSql(p.actorId)} AS committee,
             ${self} AS self, ${active} AS active
    ), ins AS (
      INSERT INTO semafor_point (member_id, category, earned_on, earned_month, points, note, created_by)
      SELECT ${p.recipientId}::uuid, 'work', ${p.earnedOn}::date, ${earnedMonth(sql`${p.earnedOn}`)},
             ${p.points}::int, ${p.note}::text, ${p.actorId}::uuid
      FROM chk
      WHERE perm AND committee AND NOT self AND active AND ${datesOk}
        AND ${p.points}::int BETWEEN ${WORK_POINTS.min} AND ${WORK_POINTS.max}
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT perm, committee, self, active, (SELECT count(*) FROM ins)::int AS inserted FROM chk
  `;
}

export async function insertPoint(p: InsertPointInput): Promise<WriteResult> {
  const r = await writeGuarded(() => getDb().execute<FlagsRow>(insertPointSql(p)));
  if ("noTable" in r) return { outcome: "errNoTable" };
  return {
    outcome: writeOutcomeFromRow(r.rows[0], {
      withPerm: true,
      withCommittee: p.category === "work",
      duplicateKey: p.category === "work" ? "errWorkDuplicate" : "errDuplicate",
    }),
  };
}

// ── Akce chapteru ────────────────────────────────────────────

export interface InsertActivityInput {
  actorId: string;
  title: string;
  heldOn: string;
  memberIds: readonly string[];
  today: string;
}

/**
 * Akce a body účastníků v jednom příkazu: `ins_a` vloží akci jen s právem, datem
 * v rozpětí a aspoň jedním způsobilým účastníkem (aktivní, ne aktér; jinak by
 * vznikla osiřelá akce, F-03), `ins_p` body těmto účastníkům. Duplicitní akce
 * (stejné datum a název bez ohledu na velikost písmen a mezery na krajích,
 * `uq_sa_dup`, F-02) se nevloží (`ON CONFLICT DO NOTHING`), `activities = 0`
 * při splněných kontrolách znamená duplicitu. Prázdný seznam odmítne volající.
 */
export function insertActivitySql(p: InsertActivityInput): SQL {
  const { after } = pointDateRange(p.today);
  const ids = JSON.stringify(p.memberIds);
  return sql`
    WITH chk AS (
      SELECT ${actorHasPermissionSql(p.actorId, SEMAFOR_POINTS_PERMISSION)} AS perm,
             (${p.heldOn}::date <= ${p.today}::date AND ${p.heldOn}::date > ${after}::date) AS date_ok,
             EXISTS (
               SELECT 1 FROM member m
               WHERE m.id IN (SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb))
                 AND m.id <> ${p.actorId}::uuid AND ${memberActiveSql("m")}
             ) AS has_members
    ), ins_a AS (
      INSERT INTO semafor_activity (title, held_on, created_by)
      SELECT ${p.title}::text, ${p.heldOn}::date, ${p.actorId}::uuid FROM chk
      WHERE perm AND date_ok AND has_members
      ON CONFLICT DO NOTHING
      RETURNING id
    ), ins_p AS (
      INSERT INTO semafor_point (member_id, category, earned_on, earned_month, activity_id, created_by)
      SELECT m.id, 'activity', ${p.heldOn}::date, ${earnedMonth(sql`${p.heldOn}`)}, ins_a.id, ${p.actorId}::uuid
      FROM ins_a
      JOIN member m ON m.id IN (SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb))
      WHERE m.id <> ${p.actorId}::uuid AND ${memberActiveSql("m")}
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT perm, date_ok, has_members,
           (SELECT count(*) FROM ins_a)::int AS activities, (SELECT count(*) FROM ins_p)::int AS written
    FROM chk
  `;
}

export type ActivityResult =
  | { outcome: "ok"; written: number; skipped: number }
  | {
      outcome:
        | "errNoPermission"
        | "errDate"
        | "errNoMembers"
        | "errActivityDuplicate"
        | "errActivityMissing"
        | "errNoTable";
    };

/** Z řádku výsledku `insertActivitySql` udělá výsledek (sdílí i SQL test nad PGlite). */
export function activityOutcomeFromRow(
  row: { perm: boolean; date_ok: boolean; has_members: boolean; activities: number | string; written: number | string } | undefined,
  requested: number
): ActivityResult {
  if (!row || !row.perm) return { outcome: "errNoPermission" };
  if (!row.date_ok) return { outcome: "errDate" };
  if (!row.has_members) return { outcome: "errNoMembers" };
  if (Number(row.activities) === 0) return { outcome: "errActivityDuplicate" };
  const written = Number(row.written);
  return { outcome: "ok", written, skipped: requested - written };
}

export async function insertActivity(p: InsertActivityInput): Promise<ActivityResult> {
  const r = await writeGuarded(() =>
    getDb().execute<{ perm: boolean; date_ok: boolean; has_members: boolean; activities: number | string; written: number | string }>(
      insertActivitySql(p)
    )
  );
  if ("noTable" in r) return { outcome: "errNoTable" };
  return activityOutcomeFromRow(r.rows[0], p.memberIds.length);
}

export interface AddActivityMembersInput {
  actorId: string;
  activityId: string;
  memberIds: readonly string[];
}

/** Doplnění účastníků k existující akci (datum akce se bere z DB). */
export function addActivityMembersSql(p: AddActivityMembersInput): SQL {
  const ids = JSON.stringify(p.memberIds);
  return sql`
    WITH chk AS (
      SELECT ${actorHasPermissionSql(p.actorId, SEMAFOR_POINTS_PERMISSION)} AS perm,
             EXISTS (SELECT 1 FROM semafor_activity a WHERE a.id = ${p.activityId}::uuid) AS found
    ), ins_p AS (
      INSERT INTO semafor_point (member_id, category, earned_on, earned_month, activity_id, created_by)
      SELECT m.id, 'activity', a.held_on, date_trunc('month', a.held_on::timestamp)::date, a.id, ${p.actorId}::uuid
      FROM chk
      JOIN semafor_activity a ON a.id = ${p.activityId}::uuid
      JOIN member m ON m.id IN (SELECT value::uuid FROM jsonb_array_elements_text(${ids}::jsonb))
      WHERE chk.perm AND m.id <> ${p.actorId}::uuid AND ${memberActiveSql("m")}
      ON CONFLICT DO NOTHING
      RETURNING id
    )
    SELECT perm, found, (SELECT count(*) FROM ins_p)::int AS written FROM chk
  `;
}

export async function addActivityMembers(p: AddActivityMembersInput): Promise<ActivityResult> {
  const r = await writeGuarded(() =>
    getDb().execute<{ perm: boolean; found: boolean; written: number | string }>(addActivityMembersSql(p))
  );
  if ("noTable" in r) return { outcome: "errNoTable" };
  const row = r.rows[0];
  if (!row || !row.perm) return { outcome: "errNoPermission" };
  if (!row.found) return { outcome: "errActivityMissing" };
  const written = Number(row.written);
  return { outcome: "ok", written, skipped: p.memberIds.length - written };
}

// ── Mazání ───────────────────────────────────────────────────

/**
 * Autor smaže své poděkování (R-03). ŽÁDNÁ větev práva: přihlášení odkazem
 * (prázdná množina práv, ale SQL ji nerozlišuje) tak nemůže smazat cizí záznam.
 */
export function deleteOwnThanksSql(p: { actorId: string; pointId: string }): SQL {
  return sql`
    DELETE FROM semafor_point
    WHERE id = ${p.pointId}::uuid AND category = 'thanks' AND created_by = ${p.actorId}::uuid
    RETURNING id
  `;
}

export async function deleteOwnThanks(p: { actorId: string; pointId: string }): Promise<{ deleted: boolean } | { noTable: true }> {
  const r = await writeGuarded(() => getDb().execute<{ id: string }>(deleteOwnThanksSql(p)));
  if ("noTable" in r) return r;
  return { deleted: r.rows.length > 0 };
}

/**
 * Moderace: držitel `semafor.points` smaže jakýkoli záznam. Volá ji jen akce
 * s `requirePermission("semafor.points")`. `own` = smazal ho ten, kdo ho
 * zapsal (pro severity v ops logu).
 */
export function deletePointSql(p: { actorId: string; pointId: string }): SQL {
  // Smazáním posledního účastníka zmizí i akce (F-03): osiřelá akce by nebyla vidět
  // v seznamu (skládá se z bodů) a nešla by smazat z UI. Podmínka vylučuje právě
  // mazaný bod, protože ve stejném příkazu ho ještě vidí snapshot.
  return sql`
    WITH del AS (
      DELETE FROM semafor_point sp
      WHERE sp.id = ${p.pointId}::uuid
        AND ${actorHasPermissionSql(p.actorId, SEMAFOR_POINTS_PERMISSION)}
      RETURNING sp.id, sp.activity_id, sp.category::text AS category, (sp.created_by = ${p.actorId}::uuid) AS own
    ), orphan AS (
      DELETE FROM semafor_activity a
      WHERE a.id IN (SELECT activity_id FROM del WHERE activity_id IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM semafor_point q
          WHERE q.activity_id = a.id AND q.id NOT IN (SELECT id FROM del)
        )
      RETURNING a.id
    )
    SELECT category, own FROM del
  `;
}

export async function deletePoint(p: {
  actorId: string;
  pointId: string;
}): Promise<{ deleted: false } | { deleted: true; category: PointCategory; own: boolean } | { noTable: true }> {
  const r = await writeGuarded(() =>
    getDb().execute<{ category: PointCategory; own: boolean | null }>(deletePointSql(p))
  );
  if ("noTable" in r) return r;
  const row = r.rows[0];
  if (!row) return { deleted: false };
  return { deleted: true, category: row.category, own: row.own === true };
}

/** Smazání akce a body všech účastníků (CASCADE). Počet účastníků se spočítá před smazáním. */
export function deleteActivitySql(p: { actorId: string; activityId: string }): SQL {
  return sql`
    WITH chk AS (
      SELECT ${actorHasPermissionSql(p.actorId, SEMAFOR_POINTS_PERMISSION)} AS perm
    ), cnt AS (
      SELECT count(*)::int AS n FROM semafor_point WHERE activity_id = ${p.activityId}::uuid
    ), del AS (
      DELETE FROM semafor_activity a USING chk
      WHERE a.id = ${p.activityId}::uuid AND chk.perm
      RETURNING a.id
    )
    SELECT (SELECT count(*) FROM del)::int AS deleted, (SELECT n FROM cnt) AS participants FROM chk
  `;
}

export async function deleteActivity(p: {
  actorId: string;
  activityId: string;
}): Promise<{ deleted: boolean; participants: number } | { noTable: true }> {
  const r = await writeGuarded(() =>
    getDb().execute<{ deleted: number | string; participants: number | string }>(deleteActivitySql(p))
  );
  if ("noTable" in r) return r;
  const row = r.rows[0];
  return { deleted: Number(row?.deleted ?? 0) > 0, participants: Number(row?.participants ?? 0) };
}

// ── Čtení ────────────────────────────────────────────────────

/** Člen drží funkci Člen výboru (pro stránku `/semafor/body` a nápovědu). Čte jen funkce, ne nové tabulky. */
export async function holdsCommitteeFunction(memberId: string): Promise<boolean> {
  const r = await getDb().execute<{ ok: boolean }>(sql`SELECT ${actorHoldsCommitteeFunctionSql(memberId)} AS ok`);
  return Boolean(r.rows[0]?.ok);
}

export interface MyPointRow {
  id: string;
  category: PointCategory;
  /** `YYYY-MM-DD` */
  earnedOn: string;
  points: number | null;
  note: string | null;
  /** Kdo záznam zapsal, `null` = bývalý člen (smazaný autor). */
  authorName: string | null;
  activityTitle: string | null;
  /** Nový člen u „přivedený host, který se stal členem“. */
  refName: string | null;
}

interface MyPointDbRow extends Record<string, unknown> {
  id: string;
  category: PointCategory;
  earned_on: string;
  points: number | null;
  note: string | null;
  author_name: string | null;
  activity_title: string | null;
  ref_name: string | null;
}

/**
 * Vlastní záznamy člena v `(after, to]`, nejnovější první. Smí volat jen
 * stránka `/semafor` s `session.memberId`, nikdy s cizím id.
 */
export async function listMyPoints(memberId: string, after: string, to: string): Promise<PointsRead<MyPointRow[]>> {
  return readPointsTables(async () => {
    const r = await getDb().execute<MyPointDbRow>(sql`
      SELECT sp.id::text AS id, sp.category, sp.earned_on::text AS earned_on, sp.points::int AS points, sp.note,
             au.name AS author_name, sa.title AS activity_title, rm.name AS ref_name
      FROM semafor_point sp
      LEFT JOIN member au ON au.id = sp.created_by
      LEFT JOIN semafor_activity sa ON sa.id = sp.activity_id
      LEFT JOIN member rm ON rm.id = sp.ref_member_id
      WHERE sp.member_id = ${memberId}::uuid AND sp.earned_on > ${after}::date AND sp.earned_on <= ${to}::date
      ORDER BY sp.earned_on DESC, sp.created_at DESC
    `);
    return r.rows.map((x) => ({
      id: x.id,
      category: x.category,
      earnedOn: x.earned_on,
      points: x.points === null ? null : Number(x.points),
      note: x.note,
      authorName: x.author_name,
      activityTitle: x.activity_title,
      refName: x.ref_name,
    }));
  });
}

export interface WrittenThanksRow {
  id: string;
  earnedOn: string;
  recipientName: string;
  note: string;
}

/** Poděkování, která člen napsal (komu, kdy, text), pro mazání. Jen `session.memberId`. */
export async function listMyWrittenThanks(memberId: string, after: string): Promise<PointsRead<WrittenThanksRow[]>> {
  return readPointsTables(async () => {
    const r = await getDb().execute<{ id: string; earned_on: string; name: string; note: string | null }>(sql`
      SELECT sp.id::text AS id, sp.earned_on::text AS earned_on, m.name, sp.note
      FROM semafor_point sp JOIN member m ON m.id = sp.member_id
      WHERE sp.created_by = ${memberId}::uuid AND sp.category = 'thanks' AND sp.earned_on > ${after}::date
      ORDER BY sp.earned_on DESC, sp.created_at DESC
    `);
    return r.rows.map((x) => ({ id: x.id, earnedOn: x.earned_on, recipientName: x.name, note: x.note ?? "" }));
  });
}

export interface ManagedPointRow {
  id: string;
  category: PointCategory;
  earnedOn: string;
  points: number | null;
  memberName: string;
  authorName: string | null;
  note: string | null;
  activityId: string | null;
  activityTitle: string | null;
  refName: string | null;
}

/**
 * Všechny záznamy v `(after, to]` se jmény. JEN stránka s `semafor.points`
 * (`requirePageSession` jako první příkaz). Filtr kategorie je volitelný.
 */
export async function listPointsForManagement(
  after: string,
  to: string,
  category?: PointCategory
): Promise<PointsRead<ManagedPointRow[]>> {
  return readPointsTables(async () => {
    const cat: SQL = category ? sql`AND sp.category = ${category}::text` : sql``;
    const r = await getDb().execute<
      Record<string, unknown> & {
        id: string;
        category: PointCategory;
        earned_on: string;
        points: number | null;
        member_name: string;
        author_name: string | null;
        note: string | null;
        activity_id: string | null;
        activity_title: string | null;
        ref_name: string | null;
      }
    >(sql`
      SELECT sp.id::text AS id, sp.category, sp.earned_on::text AS earned_on, sp.points::int AS points,
             m.name AS member_name, au.name AS author_name, sp.note,
             sp.activity_id::text AS activity_id, sa.title AS activity_title, rm.name AS ref_name
      FROM semafor_point sp
      JOIN member m ON m.id = sp.member_id
      LEFT JOIN member au ON au.id = sp.created_by
      LEFT JOIN semafor_activity sa ON sa.id = sp.activity_id
      LEFT JOIN member rm ON rm.id = sp.ref_member_id
      WHERE sp.earned_on > ${after}::date AND sp.earned_on <= ${to}::date ${cat}
      ORDER BY sp.earned_on DESC, sp.created_at DESC
    `);
    return r.rows.map((x) => ({
      id: x.id,
      category: x.category,
      earnedOn: x.earned_on,
      points: x.points === null ? null : Number(x.points),
      memberName: x.member_name,
      authorName: x.author_name,
      note: x.note,
      activityId: x.activity_id,
      activityTitle: x.activity_title,
      refName: x.ref_name,
    }));
  });
}

export interface MemberOption {
  id: string;
  name: string;
}

/** Aktivní členové kromě aktéra (jméno, id) pro výběry. Jména aktivních členů nejsou tajná. */
export async function listThanksRecipients(actorId: string): Promise<MemberOption[]> {
  const r = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT m.id::text AS id, m.name FROM member m
    WHERE ${memberActiveSql("m")} AND m.id <> ${actorId}::uuid
    ORDER BY m.name
  `);
  return r.rows.map((x) => ({ id: x.id, name: x.name }));
}

/** Aktivní členové s `joined_at` v `(windowStart, today]` a bez záznamu „přivedený host“. */
export async function listRecentNewMembers(windowStart: string, today: string): Promise<PointsRead<MemberOption[]>> {
  return readPointsTables(async () => {
    const r = await getDb().execute<{ id: string; name: string }>(sql`
      SELECT m.id::text AS id, m.name FROM member m
      WHERE ${memberActiveSql("m")} AND m.joined_at > ${windowStart}::date AND m.joined_at <= ${today}::date
        AND NOT EXISTS (SELECT 1 FROM semafor_point sp WHERE sp.category = 'host_member' AND sp.ref_member_id = m.id)
      ORDER BY m.name
    `);
    return r.rows.map((x) => ({ id: x.id, name: x.name }));
  });
}

// ── Události pro bonus (čte lib/db/queries/semafor.ts) ───────

/** Ruční body v `(after, to]` pro výpočet bonusu. `memberId` omezí na jednoho člena. */
export function pointEventsSql(opts: { after: string; to: string; memberId?: string }): SQL {
  const m: SQL = opts.memberId ? sql`AND sp.member_id = ${opts.memberId}::uuid` : sql``;
  return sql`
    SELECT sp.member_id::text AS member_id, sp.category::text AS category, sp.earned_on::text AS d, sp.points::int AS points
    FROM semafor_point sp
    WHERE sp.earned_on > ${opts.after}::date AND sp.earned_on <= ${opts.to}::date ${m}
  `;
}

/**
 * Funkce (iter-041 K10): držitel funkce, den přidělení v Praze. Bez spodní meze
 * okna, datum `<= to`. Pravidlo „drží dnes a přidělena nejpozději ke konci
 * měsíce“ dělá `bonusForMonth`.
 */
export function functionEventsSql(opts: { to: string; memberId?: string }): SQL {
  const m: SQL = opts.memberId ? sql`AND mf.member_id = ${opts.memberId}::uuid` : sql``;
  return sql`
    SELECT mf.member_id::text AS member_id, 'function'::text AS category,
           (mf.assigned_at AT TIME ZONE 'Europe/Prague')::date::text AS d, NULL::int AS points
    FROM member_function mf
    WHERE (mf.assigned_at AT TIME ZONE 'Europe/Prague')::date <= ${opts.to}::date ${m}
  `;
}

export interface PointEventRow {
  member_id: string;
  category: PointCategory;
  d: string;
  points: number | null;
}

/** Ruční body jako události bonusu; při chybějící tabulce prázdné pole (bonus bez ručních bodů). */
export async function readPointEvents(opts: { after: string; to: string; memberId?: string }): Promise<PointEventRow[]> {
  const r = await readPointsTables(async () => (await getDb().execute<PointEventRow & Record<string, unknown>>(pointEventsSql(opts))).rows);
  return r.missing ? [] : r.value;
}
