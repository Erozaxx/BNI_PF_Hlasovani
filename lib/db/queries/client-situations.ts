/**
 * iter-049 (arch 4, 6, 7): DB vrstva klientských situací (`client_situation`,
 * `client_situation_item`, `client_situation_source`).
 *
 * Bez transakcí (LL-003): každý zápis je JEDEN SQL příkaz, jehož WHERE drží
 * autoritu (`target = actor` NEBO aktér má v DB `situations.manage`, cíl je
 * aktivní). Klient neposílá id situace, jen člena a slot. SQL se skládá
 * funkcemi `*Sql` (testuje je PGlite), `execute` volají tenké obalové funkce.
 *
 * Neměnnost snímku z workshopu: sloupec `original` se v tomhle souboru nikdy
 * nezapisuje, píše ho jen importní skript. Statický test 14 to hlídá.
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import type { ExportData, ExportItem, ExportMember, ExportSituation } from "@/lib/situations/export";
import { actorHasPermissionSql, memberActiveSql } from "@/lib/db/queries/member-active";
import {
  itemLimitFor,
  type HeadField,
  type ItemKind,
  type ItemRow,
  type Slot,
  type WriteState,
} from "@/lib/situations/rules";

function getDb() {
  return drizzle(getSql());
}

/** Časy se čtou jako ISO text v UTC, aby je driver nepřevedl na Date v lokálním pásmu. */
const ISO_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;
function isoSql(column: string): SQL {
  return sql.raw(`to_char(${column} AT TIME ZONE 'UTC', ${ISO_FORMAT})`);
}

// ── Autorita ──

function targetActiveSql(target: string): SQL {
  return sql`EXISTS (SELECT 1 FROM member t WHERE t.id = ${target}::uuid AND ${memberActiveSql("t")})`;
}

/** Aktér píše za sebe, nebo má v DB `situations.manage` (druhá pojistka vedle `can()` v akci). */
function allowedSql(target: string, actor: string): SQL {
  return sql`(${target}::uuid = ${actor}::uuid OR ${actorHasPermissionSql(actor, "situations.manage")})`;
}

function authoritySql(target: string, actor: string): SQL {
  return sql`(${allowedSql(target, actor)} AND ${targetActiveSql(target)})`;
}

/** Název sloupce hlavičky z pevného seznamu, nikdy z klienta. */
function headColumn(field: HeadField): SQL {
  switch (field) {
    case "client":
      return sql.raw("client");
    case "title":
      return sql.raw("title");
    case "description":
      return sql.raw("description");
  }
}

// ── Zápisy (SQL builder + obal) ──

export interface HeadArgs {
  target: string;
  slot: Slot;
  actor: string;
  field: HeadField;
  value: string;
}

/**
 * Upsert situace s nastavením jednoho pole hlavičky (arch 6.3). Bez práva
 * nevznikne řádek ani se nezmění existující. Stejná hodnota nezapíše nic
 * (`IS DISTINCT FROM`), takže otevření ani blur bez změny nenastaví `updated_by`.
 */
export function upsertHeadSql(a: HeadArgs): SQL {
  const col = headColumn(a.field);
  return sql`
    INSERT INTO client_situation (member_id, slot, ${col}, updated_by)
    SELECT ${a.target}::uuid, ${a.slot}::smallint, ${a.value}::text, ${a.actor}::uuid
     WHERE ${authoritySql(a.target, a.actor)}
    ON CONFLICT (member_id, slot) DO UPDATE
       SET ${col} = EXCLUDED.${col}, updated_at = now(), updated_by = EXCLUDED.updated_by
     WHERE client_situation.${col} IS DISTINCT FROM EXCLUDED.${col}
    RETURNING id
  `;
}

export async function saveHeadGuarded(a: HeadArgs): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(upsertHeadSql(a));
  return result.rows.length > 0;
}

export interface AddItemArgs {
  target: string;
  slot: Slot;
  actor: string;
  itemId: string;
  kind: ItemKind;
  text: string;
}

const ITEM_COLUMNS = (alias: string): SQL =>
  sql.raw(
    `${alias}.id AS id, ${alias}.kind AS kind, ${alias}.text AS text, ${alias}.imported_text AS imported_text`
  );

/**
 * Přidání kartičky jedním příkazem: upsert situace (jen při skutečném přidání:
 * `itemId` ještě neexistuje a sloupec je pod limitem) a `INSERT item ... ON CONFLICT
 * (id) DO NOTHING`. Dvojí odeslání stejného `itemId` nevloží nic a vrátí 0 řádků,
 * existující kartičku pak přečte `getWriteState`.
 */
export function addItemSql(a: AddItemArgs): SQL {
  const limit = itemLimitFor(a.kind);
  return sql`
    WITH sit AS (
      INSERT INTO client_situation (member_id, slot, updated_by)
      SELECT ${a.target}::uuid, ${a.slot}::smallint, ${a.actor}::uuid
       WHERE ${authoritySql(a.target, a.actor)}
         AND NOT EXISTS (SELECT 1 FROM client_situation_item dup WHERE dup.id = ${a.itemId}::uuid)
         AND (SELECT count(*) FROM client_situation_item ci
                JOIN client_situation cs ON cs.id = ci.situation_id
               WHERE cs.member_id = ${a.target}::uuid AND cs.slot = ${a.slot}::smallint
                 AND ci.kind = ${a.kind}::text) < ${limit}::int
      ON CONFLICT (member_id, slot) DO UPDATE
         SET updated_at = now(), updated_by = EXCLUDED.updated_by
      RETURNING id
    ), ins AS (
      INSERT INTO client_situation_item (id, situation_id, kind, text, updated_by)
      SELECT ${a.itemId}::uuid, sit.id, ${a.kind}::text, ${a.text}::text, ${a.actor}::uuid
        FROM sit
      ON CONFLICT (id) DO NOTHING
      RETURNING id, kind, text, imported_text, created_at, updated_at
    )
    SELECT ${ITEM_COLUMNS("ins")}, ${isoSql("ins.created_at")} AS created_at,
           ${isoSql("ins.updated_at")} AS updated_at
      FROM ins
  `;
}

type ItemDbRow = {
  id: string;
  kind: ItemKind;
  text: string;
  imported_text: string | null;
  created_at: string;
  updated_at: string;
};

function toItemRow(r: ItemDbRow): ItemRow {
  return {
    id: r.id,
    kind: r.kind,
    text: r.text,
    importedText: r.imported_text,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function addItemGuarded(a: AddItemArgs): Promise<ItemRow | null> {
  const result = await getDb().execute<ItemDbRow>(addItemSql(a));
  const r = result.rows[0];
  return r ? toItemRow(r) : null;
}

export interface UpdateItemArgs {
  target: string;
  actor: string;
  itemId: string;
  kind: ItemKind;
  text: string;
}

/**
 * Úprava kartičky: vlastnictví přes `situation.member_id = target` (cizí
 * `itemId` s vlastním `memberId` vrátí 0 řádků, IDOR), `kind` musí sedět, stejný
 * text nezapíše nic. Čas a `updated_by` situace se nastaví ve stejném příkazu.
 */
export function updateItemSql(a: UpdateItemArgs): SQL {
  return sql`
    WITH upd AS (
      UPDATE client_situation_item i
         SET text = ${a.text}::text, updated_at = now(), updated_by = ${a.actor}::uuid
        FROM client_situation s
       WHERE i.id = ${a.itemId}::uuid AND s.id = i.situation_id
         AND s.member_id = ${a.target}::uuid AND i.kind = ${a.kind}::text
         AND i.text IS DISTINCT FROM ${a.text}::text
         AND ${authoritySql(a.target, a.actor)}
      RETURNING i.id AS id, i.situation_id AS situation_id, i.kind AS kind, i.text AS text,
                i.imported_text AS imported_text, i.created_at AS created_at, i.updated_at AS updated_at
    ), touch AS (
      UPDATE client_situation
         SET updated_at = now(), updated_by = ${a.actor}::uuid
       WHERE id IN (SELECT situation_id FROM upd)
    )
    SELECT ${ITEM_COLUMNS("upd")}, ${isoSql("upd.created_at")} AS created_at,
           ${isoSql("upd.updated_at")} AS updated_at
      FROM upd
  `;
}

export async function updateItemGuarded(a: UpdateItemArgs): Promise<ItemRow | null> {
  const result = await getDb().execute<ItemDbRow>(updateItemSql(a));
  const r = result.rows[0];
  return r ? toItemRow(r) : null;
}

export interface RemoveItemArgs {
  target: string;
  actor: string;
  itemId: string;
}

export function removeItemSql(a: RemoveItemArgs): SQL {
  return sql`
    WITH del AS (
      DELETE FROM client_situation_item i
       USING client_situation s
       WHERE i.id = ${a.itemId}::uuid AND s.id = i.situation_id
         AND s.member_id = ${a.target}::uuid
         AND ${authoritySql(a.target, a.actor)}
      RETURNING i.situation_id AS situation_id
    ), touch AS (
      UPDATE client_situation
         SET updated_at = now(), updated_by = ${a.actor}::uuid
       WHERE id IN (SELECT situation_id FROM del)
    )
    SELECT count(*)::int AS n FROM del
  `;
}

export async function removeItemGuarded(a: RemoveItemArgs): Promise<boolean> {
  const result = await getDb().execute<{ n: number }>(removeItemSql(a));
  return (result.rows[0]?.n ?? 0) > 0;
}

// ── Důvod, proč zápis nic nezapsal (jedno čtení, jen při 0 řádcích) ──

export interface WriteStateArgs {
  target: string;
  actor: string;
  slot?: Slot;
  kind?: ItemKind;
  itemId?: string;
  head?: { field: HeadField; value: string };
}

export function writeStateSql(a: WriteStateArgs): SQL {
  const slot = a.slot ?? null;
  const kind = a.kind ?? null;
  const itemId = a.itemId ?? null;
  const unchanged = a.head
    ? sql`EXISTS (SELECT 1 FROM client_situation hs
                   WHERE hs.member_id = ${a.target}::uuid AND hs.slot = ${slot}::smallint
                     AND hs.${headColumn(a.head.field)} = ${a.head.value}::text)`
    : sql`false`;
  return sql`
    SELECT ${allowedSql(a.target, a.actor)} AS allowed,
           ${targetActiveSql(a.target)} AS active,
           (SELECT count(*)::int FROM client_situation_item ci
              JOIN client_situation cs ON cs.id = ci.situation_id
             WHERE cs.member_id = ${a.target}::uuid AND cs.slot = ${slot}::smallint
               AND ci.kind = ${kind}::text) AS kind_count,
           ${unchanged} AS head_unchanged,
           it.id AS item_id, it.kind AS item_kind, it.text AS item_text,
           it.imported_text AS item_imported_text,
           ${isoSql("it.created_at")} AS item_created_at,
           ${isoSql("it.updated_at")} AS item_updated_at
      FROM (SELECT 1) one
      LEFT JOIN (SELECT i2.* FROM client_situation_item i2
                   JOIN client_situation s2 ON s2.id = i2.situation_id
                    AND s2.member_id = ${a.target}::uuid
                  WHERE i2.id = ${itemId}::uuid) it ON true
  `;
}

export async function getWriteState(a: WriteStateArgs): Promise<WriteState> {
  const result = await getDb().execute<{
    allowed: boolean;
    active: boolean;
    kind_count: number;
    head_unchanged: boolean;
    item_id: string | null;
    item_kind: ItemKind | null;
    item_text: string | null;
    item_imported_text: string | null;
    item_created_at: string | null;
    item_updated_at: string | null;
  }>(writeStateSql(a));
  const r = result.rows[0];
  if (!r) return { allowed: false, active: false, item: null, kindCount: 0, headUnchanged: false };
  return {
    allowed: Boolean(r.allowed),
    active: Boolean(r.active),
    kindCount: Number(r.kind_count ?? 0),
    headUnchanged: Boolean(r.head_unchanged),
    item:
      r.item_id && r.item_kind && r.item_text !== null
        ? {
            id: r.item_id,
            kind: r.item_kind,
            text: r.item_text,
            importedText: r.item_imported_text,
            createdAt: r.item_created_at ?? "",
            updatedAt: r.item_updated_at ?? "",
          }
        : null,
  };
}

// ── Čtení pro stránky ──

export interface OverviewRow {
  memberId: string;
  name: string;
  slot: number | null;
  client: string;
  title: string;
  touched: boolean;
  hasOriginal: boolean;
  itemCount: number;
}

/** Aktivní členové a jejich situace (LEFT JOIN, člen bez řádku má `slot = null`). Jeden SELECT. */
export async function getOverviewRows(): Promise<OverviewRow[]> {
  const result = await getDb().execute<{
    member_id: string;
    name: string;
    slot: number | null;
    client: string | null;
    title: string | null;
    touched: boolean | null;
    has_original: boolean | null;
    item_count: number | null;
  }>(sql`
    SELECT m.id AS member_id, m.name, s.slot, s.client, s.title,
           (s.updated_by IS NOT NULL) AS touched,
           (s.original IS NOT NULL) AS has_original,
           (SELECT count(*)::int FROM client_situation_item i WHERE i.situation_id = s.id) AS item_count
      FROM member m
      LEFT JOIN client_situation s ON s.member_id = m.id
     WHERE ${memberActiveSql("m")}
     ORDER BY m.name, m.id, s.slot
  `);
  return result.rows.map((r) => ({
    memberId: r.member_id,
    name: r.name,
    slot: r.slot === null ? null : Number(r.slot),
    client: r.client ?? "",
    title: r.title ?? "",
    touched: Boolean(r.touched),
    hasOriginal: Boolean(r.has_original),
    itemCount: Number(r.item_count ?? 0),
  }));
}

export interface SelectableMember {
  id: string;
  name: string;
}

/** Aktivní členové pro výběr „Vyplnit za člena“. */
export async function getSelectableMembers(): Promise<SelectableMember[]> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT m.id, m.name FROM member m WHERE ${memberActiveSql("m")} ORDER BY m.name, m.id
  `);
  return result.rows.map((r) => ({ id: r.id, name: r.name }));
}

export interface SituationMember {
  id: string;
  name: string;
  active: boolean;
}

/** Člen pro stránku situací. `null` = člen neexistuje. */
export async function getSituationMember(memberId: string): Promise<SituationMember | null> {
  const result = await getDb().execute<{ id: string; name: string; active: boolean }>(sql`
    SELECT m.id, m.name, ${memberActiveSql("m")} AS active FROM member m WHERE m.id = ${memberId}::uuid
  `);
  const r = result.rows[0];
  return r ? { id: r.id, name: r.name, active: Boolean(r.active) } : null;
}

export interface SituationView {
  slot: Slot;
  client: string;
  title: string;
  description: string;
  /** Snímek z workshopu (tvar situace.json), `null` = situace z workshopu nepochází. */
  original: unknown;
  touched: boolean;
  items: ItemRow[];
}

/** Tři situace člena s kartičkami (chybějící slot = prázdná situace). Dva dotazy, pořadí `created_at, id`. */
export async function getSituationsForMember(memberId: string): Promise<SituationView[]> {
  const db = getDb();
  const [heads, items] = await Promise.all([
    db.execute<{
      slot: number;
      client: string;
      title: string;
      description: string;
      original: unknown;
      touched: boolean;
    }>(sql`
      SELECT s.slot, s.client, s.title, s.description, s.original,
             (s.updated_by IS NOT NULL) AS touched
        FROM client_situation s
       WHERE s.member_id = ${memberId}::uuid
       ORDER BY s.slot
    `),
    db.execute<ItemDbRow & { slot: number }>(sql`
      SELECT s.slot, i.id, i.kind, i.text, i.imported_text,
             ${isoSql("i.created_at")} AS created_at, ${isoSql("i.updated_at")} AS updated_at
        FROM client_situation_item i
        JOIN client_situation s ON s.id = i.situation_id
       WHERE s.member_id = ${memberId}::uuid
       ORDER BY s.slot, i.kind, i.created_at, i.id
    `),
  ]);
  const out: SituationView[] = ([1, 2, 3] as const).map((slot) => {
    const h = heads.rows.find((r) => Number(r.slot) === slot);
    return {
      slot,
      client: h?.client ?? "",
      title: h?.title ?? "",
      description: h?.description ?? "",
      original: h?.original ?? null,
      touched: Boolean(h?.touched),
      items: items.rows.filter((r) => Number(r.slot) === slot).map(toItemRow),
    };
  });
  return out;
}

// ── Data exportu (arch 8.1, gate změna 1) ──

/** Členové exportu: aktivní, plus neaktivní se zdrojem z workshopu (mapa nemá přijít o data). */
export function exportMembersSql(): SQL {
  return sql`
    SELECT m.id AS member_id, m.name, m.company, m.obor,
           ${memberActiveSql("m")} AS active,
           src.source_name, src.competences
      FROM member m
      LEFT JOIN client_situation_source src ON src.member_id = m.id
     WHERE ${memberActiveSql("m")} OR src.member_id IS NOT NULL
     ORDER BY m.name, m.id
  `;
}

/** Situace členů z `exportMembersSql` (stejná podmínka). */
export function exportSituationsSql(): SQL {
  return sql`
    SELECT s.id AS situation_id, s.member_id, s.slot, s.source_id, s.client, s.title, s.description,
           s.original, (s.updated_by IS NOT NULL) AS touched,
           ${isoSql("s.updated_at")} AS updated_at
      FROM client_situation s
      JOIN member m ON m.id = s.member_id
      LEFT JOIN client_situation_source src ON src.member_id = m.id
     WHERE ${memberActiveSql("m")} OR src.member_id IS NOT NULL
     ORDER BY m.name, m.id, s.slot
  `;
}

/** Kartičky v pořadí `created_at, id`. */
export function exportItemsSql(): SQL {
  return sql`
    SELECT i.situation_id, i.id, i.kind, i.text, i.imported_text,
           ${isoSql("i.created_at")} AS created_at, ${isoSql("i.updated_at")} AS updated_at
      FROM client_situation_item i
      JOIN client_situation s ON s.id = i.situation_id
      JOIN member m ON m.id = s.member_id
      LEFT JOIN client_situation_source src ON src.member_id = m.id
     WHERE ${memberActiveSql("m")} OR src.member_id IS NOT NULL
     ORDER BY i.created_at, i.id
  `;
}

type ExportMemberDb = {
  member_id: string;
  name: string;
  company: string | null;
  obor: string | null;
  active: boolean;
  source_name: string | null;
  competences: unknown;
};
type ExportSituationDb = {
  situation_id: string;
  member_id: string;
  slot: number;
  source_id: string | null;
  client: string;
  title: string;
  description: string;
  original: unknown;
  touched: boolean;
  updated_at: string;
};
type ExportItemDb = ItemDbRow & { situation_id: string };

/** Složí výsledky tří dotazů do tvaru pro čisté `buildSituaceJson` a `buildCsv`. */
export function assembleExportData(
  members: ExportMemberDb[],
  situations: ExportSituationDb[],
  items: ExportItemDb[]
): ExportData {
  const itemsBySituation: Record<string, ExportItem[]> = {};
  for (const r of items) {
    const list = itemsBySituation[r.situation_id] ?? [];
    list.push({
      id: r.id,
      kind: r.kind,
      text: r.text,
      importedText: r.imported_text,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
    itemsBySituation[r.situation_id] = list;
  }
  const outMembers: ExportMember[] = members.map((r) => {
    let comp: unknown = r.competences;
    if (typeof comp === "string") {
      try {
        comp = JSON.parse(comp);
      } catch {
        comp = null;
      }
    }
    return {
      memberId: r.member_id,
      name: r.name,
      company: r.company,
      obor: r.obor,
      active: Boolean(r.active),
      sourceName: r.source_name,
      competences: Array.isArray(comp) ? comp : null,
    };
  });
  const outSituations: ExportSituation[] = situations.map((r) => ({
    memberId: r.member_id,
    slot: Number(r.slot),
    sourceId: r.source_id,
    client: r.client,
    title: r.title,
    description: r.description,
    original: r.original ?? null,
    touched: Boolean(r.touched),
    updatedAt: r.updated_at,
    items: itemsBySituation[r.situation_id] ?? [],
  }));
  return { members: outMembers, situations: outSituations };
}

export async function getExportData(): Promise<ExportData> {
  const db = getDb();
  const [m, s, i] = await Promise.all([
    db.execute<ExportMemberDb>(exportMembersSql()),
    db.execute<ExportSituationDb>(exportSituationsSql()),
    db.execute<ExportItemDb>(exportItemsSql()),
  ]);
  return assembleExportData(m.rows, s.rows, i.rows);
}
