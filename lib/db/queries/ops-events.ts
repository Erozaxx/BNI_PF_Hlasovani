/**
 * iter-027 (T-005 + T-006) — DB vrstva pro `ops_event` (arch iter-027
 * T-001, sekce 3, 8.3, 10.2, 15). `insertOpsEvent` a `purgeOldOpsEvents`
 * jsou na kritické cestě T-005 (logOpsEvent, fáze 7 cronu). Výpis/filtry
 * (`getEventsBy*`) vznikly v T-005, aby T-006 (status stránka) importovala
 * existující implementaci a nepsala druhou (review T-002, sekce 9).
 *
 * T-006 (arch 7.2, 8.3) doplňuje do TÉHOŽ souboru — podle odchylky 6 v
 * handoff_T-005_iter-027.md — čtyři funkce pro status stránku:
 * `getRecentRunIds` (pruh 1, seskupení podle run_id), `listOpsEvents`
 * (pruh 2/3, filtry + stránkování), `getOpsEventsForDelivery` a
 * `updateOpsEventDeliveryStatus` (obojí volá jen
 * app/api/status/delivery/route.ts, 8.3). Žádná z T-005 funkcí se
 * nepřepisuje.
 *
 * NENÍ čistý modul — importuje drizzle-orm a @/lib/db/*, stejně jako
 * ostatní soubory v lib/db/queries/.
 */
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { opsEvent } from "@/lib/db/schema";
import type { OpsEventRow, OpsEventSeverity } from "@/lib/ops/types";

function getDb() {
  return drizzle(getSql());
}

/**
 * INSERT jednoho řádku. Volaná jako výchozí `write` z logOpsEvent
 * (lib/ops/event-log.ts) — TAHLE funkce smí a má vyhazovat (chybějící
 * tabulka = 42P01, cizí klíč = 23503); je to ten throw, který
 * logOpsEvent's try/catch chytá (D2). Sama žádný guard proti selhání
 * nemá a mít nesmí.
 */
export async function insertOpsEvent(row: OpsEventRow): Promise<void> {
  await getDb().insert(opsEvent).values({
    runId: row.runId,
    seq: row.seq,
    occurredAt: row.occurredAt,
    source: row.source,
    kind: row.kind,
    severity: row.severity,
    actor: row.actor,
    meetingId: row.meetingId,
    meetingDate: row.meetingDate,
    memberId: row.memberId,
    memberName: row.memberName,
    email: row.email,
    code: row.code,
    message: row.message,
    detail: row.detail,
    resendEmailId: row.resendEmailId,
    resendMessageId: row.resendMessageId,
  });
}

/**
 * Všechny události jednoho běhu, v pořadí, ve kterém je zobrazí detail běhu
 * (7.4): ORDER BY occurred_at, seq (3.2) — index idx_ops_event_run_id
 * (run_id, seq).
 */
export async function getEventsByRunId(runId: string) {
  return getDb()
    .select()
    .from(opsEvent)
    .where(eq(opsEvent.runId, runId))
    .orderBy(opsEvent.occurredAt, opsEvent.seq);
}

/**
 * Historie jednoho člena, nejnovější první (7.4, případ Kateřiny Černé) —
 * index idx_ops_event_member_id (member_id, occurred_at DESC).
 */
export async function getEventsByMemberId(memberId: string, limit = 100) {
  return getDb()
    .select()
    .from(opsEvent)
    .where(eq(opsEvent.memberId, memberId))
    .orderBy(desc(opsEvent.occurredAt))
    .limit(limit);
}

/**
 * Historie jedné schůzky, nejnovější první — index idx_ops_event_meeting_id
 * (meeting_id, occurred_at DESC).
 */
export async function getEventsByMeetingId(meetingId: string, limit = 200) {
  return getDb()
    .select()
    .from(opsEvent)
    .where(eq(opsEvent.meetingId, meetingId))
    .orderBy(desc(opsEvent.occurredAt))
    .limit(limit);
}

/**
 * Retence (fáze 7 cronu, 10.2): DELETE po hrstkách, `LIMIT` v poddotazu —
 * Postgres nemá `DELETE ... LIMIT` přímo. Vrací počet smazaných řádků;
 * volající (cron route) podle 10.2 nezapisuje `retention.purged`, když je
 * to 0 (ať stránka nezarůstá šumem).
 */
export async function purgeOldOpsEvents(
  cutoff: Date,
  limit = 5000
): Promise<number> {
  const result = await getDb().execute(sql`
    DELETE FROM ops_event
    WHERE id IN (
      SELECT id FROM ops_event WHERE occurred_at < ${cutoff} LIMIT ${limit}
    )
  `);
  return result.rowCount ?? 0;
}

/** Jeden běh v seznamu z `getRecentRunIds` — jen `run_id` a čas poslední
 * události, dost pro seřazení a stránkování. Detail (celý timeline) si pro
 * konkrétní `runId` volající dotáhne přes `getEventsByRunId`. */
export interface RecentRun {
  runId: string;
  lastOccurredAt: Date;
}

/**
 * Posledních N běhů seskupených podle `run_id`, seřazeno podle nejnovější
 * události v běhu (arch 7.2, pruh 1 „Poslední běhy"). Group-by přes
 * `getDb().execute(sql...)` — stejný vzor jako `purgeOldOpsEvents` výše,
 * drizzle query builder nemá pohodlné group-by-agregate-order-by-agregate
 * bez duplicitní `sql` klauzule.
 */
export async function getRecentRunIds(limit = 10, offset = 0): Promise<RecentRun[]> {
  const result = await getDb().execute<{ run_id: string; last_occurred_at: string }>(sql`
    SELECT run_id, MAX(occurred_at) AS last_occurred_at
    FROM ops_event
    GROUP BY run_id
    ORDER BY MAX(occurred_at) DESC
    LIMIT ${limit} OFFSET ${offset}
  `);
  return result.rows.map((r) => ({
    runId: r.run_id,
    lastOccurredAt: new Date(r.last_occurred_at),
  }));
}

/** Filtr pro `listOpsEvents` — querystring pruhu 2 (7.2): `member`,
 * `meeting`, `severity`, `from`, `to`. Všechna pole nepovinná — bez filtru
 * vrací posledních N událostí napříč vším. */
export interface OpsEventFilter {
  memberId?: string;
  meetingId?: string;
  severity?: OpsEventSeverity;
  from?: Date;
  to?: Date;
}

/**
 * Plochý výpis událostí přes VŠECHNY běhy, nejnovější první (7.2, pruh 3
 * „Události" + 7.4 filtr na člena). Stránkování voláním s vyšším `offset`;
 * volající si o jednu položku navíc řekne sám, aby poznal „je další
 * stránka", tahle funkce vrací přesně `limit` řádků nebo míň.
 */
export async function listOpsEvents(
  filter: OpsEventFilter,
  limit = 50,
  offset = 0
) {
  const conditions = [];
  if (filter.memberId) conditions.push(eq(opsEvent.memberId, filter.memberId));
  if (filter.meetingId) conditions.push(eq(opsEvent.meetingId, filter.meetingId));
  if (filter.severity) conditions.push(eq(opsEvent.severity, filter.severity));
  if (filter.from) conditions.push(gte(opsEvent.occurredAt, filter.from));
  if (filter.to) conditions.push(lte(opsEvent.occurredAt, filter.to));

  return getDb()
    .select()
    .from(opsEvent)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(opsEvent.occurredAt), desc(opsEvent.seq))
    .limit(limit)
    .offset(offset);
}

/** Řádek potřebný pro `POST /api/status/delivery` (8.3, krok 1). */
export interface OpsEventDeliveryLookup {
  id: string;
  resendEmailId: string | null;
  deliveryStatus: string | null;
}

/**
 * SELECT `resend_email_id, delivery_status` pro dávku id (8.3, krok 1) —
 * volá jen `app/api/status/delivery/route.ts`. Prázdné pole na vstupu
 * vrací prázdné pole bez dotazu (`ANY('{}')` by fungovalo taky, ale takhle
 * je to čitelnější a o dotaz méně).
 */
export async function getOpsEventsForDelivery(
  ids: string[]
): Promise<OpsEventDeliveryLookup[]> {
  if (ids.length === 0) return [];
  return getDb()
    .select({
      id: opsEvent.id,
      resendEmailId: opsEvent.resendEmailId,
      deliveryStatus: opsEvent.deliveryStatus,
    })
    .from(opsEvent)
    .where(inArray(opsEvent.id, ids));
}

/**
 * UPDATE terminálního stavu doručení (8.3, krok 4) — obyčejný
 * `UPDATE ... WHERE id = $1`, idempotentní, BEZ TRANSAKCE (LL-003). Volá se
 * jen pro terminální `DeliveryStatus` (volající to hlídá); když selže, další
 * zobrazení se zeptá znovu, nic se neztratí.
 */
export async function updateOpsEventDeliveryStatus(
  id: string,
  status: { state: string; messageId: string | null; checkedAt: Date }
): Promise<void> {
  await getDb()
    .update(opsEvent)
    .set({
      deliveryStatus: status.state,
      deliveryCheckedAt: status.checkedAt,
      resendMessageId: status.messageId,
    })
    .where(eq(opsEvent.id, id));
}
