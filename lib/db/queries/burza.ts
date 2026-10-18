/**
 * iter-035 (T-005, arch T-001 sekce 5, 6.6, gate Z1 až Z6): DB vrstva Burzy
 * pomoci (`burza_offer`, `burza_help`).
 *
 * Bez transakcí (LL-003): každý zápis je JEDEN SQL příkaz, jehož WHERE drží
 * autoritu (`$target = $me OR $isManagement`) a pojistky (jeden řádek na
 * člena, pomocník musí mít řádek, ne sám sobě, jeden záznam na dvojici a
 * měsíc). Data a časy se čtou přetypované na text, aby je driver nepřevedl
 * na Date v lokálním pásmu.
 *
 * Z členské tabulky se čte jen jméno, firma a obor. Burza nečte kontaktní
 * údaje členů z účtu, kontakt píše člen sám (Z1, statický test to hlídá).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  HELP_RECORDS_LIMIT,
  HELP_RECORDS_MONTHS,
  HELP_WINDOW_MONTHS,
  monthStart,
} from "@/lib/burza/rules";

function getDb() {
  return drizzle(getSql());
}

// ── Čtení pro přehled ──

export interface OfferRow {
  memberId: string;
  name: string;
  company: string | null;
  obor: string | null;
  offer: string;
  contact: string | null;
  note: string | null;
  /** Den posledního potvrzení v Praze, „YYYY-MM-DD“ */
  confirmedDay: string;
}

/** Všechny řádky burzy se jmény, firmou a oborem z `member`. Řazení dělá čistá `sortOffers`. */
export async function getOffersForOverview(): Promise<OfferRow[]> {
  const result = await getDb().execute<{
    member_id: string;
    name: string;
    company: string | null;
    obor: string | null;
    offer: string;
    contact: string | null;
    note: string | null;
    confirmed_day: string;
  }>(sql`
    SELECT o.member_id, m.name, m.company, m.obor, o.offer, o.contact, o.note,
           to_char(o.confirmed_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS confirmed_day
    FROM burza_offer o
    JOIN member m ON m.id = o.member_id
    ORDER BY m.name, o.member_id
  `);
  return result.rows.map((r) => ({
    memberId: r.member_id,
    name: r.name,
    company: r.company,
    obor: r.obor,
    offer: r.offer,
    contact: r.contact,
    note: r.note,
    confirmedDay: r.confirmed_day,
  }));
}

export interface OfferForEdit {
  memberId: string;
  name: string;
  /** Řádek už existuje (formulář pak nese `isNew = false`). */
  hasOffer: boolean;
  offer: string;
  contact: string;
  note: string;
}

/** Člen a jeho případný řádek pro formulář. `null` = člen neexistuje. Volá se až po kontrole práva. */
export async function getOfferForEdit(memberId: string): Promise<OfferForEdit | null> {
  const result = await getDb().execute<{
    id: string;
    name: string;
    has_offer: boolean;
    offer: string | null;
    contact: string | null;
    note: string | null;
  }>(sql`
    SELECT m.id, m.name, (o.member_id IS NOT NULL) AS has_offer, o.offer, o.contact, o.note
    FROM member m
    LEFT JOIN burza_offer o ON o.member_id = m.id
    WHERE m.id = ${memberId}::uuid
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    memberId: r.id,
    name: r.name,
    hasOffer: Boolean(r.has_offer),
    offer: r.offer ?? "",
    contact: r.contact ?? "",
    note: r.note ?? "",
  };
}

export interface MemberName {
  id: string;
  name: string;
}

/** Členové bez řádku v burze (pracovní seznam vedení). */
export async function getMembersWithoutOffer(): Promise<MemberName[]> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT m.id, m.name
    FROM member m
    WHERE NOT EXISTS (SELECT 1 FROM burza_offer o WHERE o.member_id = m.id)
    ORDER BY m.name, m.id
  `);
  return result.rows.map((r) => ({ id: r.id, name: r.name }));
}

/**
 * Členové s řádkem v burze (jen id a jméno), pro výběr „Kdo pomohl“ na
 * `/burza/pomoc`. Záměrně bez kontaktu a poznámky (m2): ty se do stránky
 * ani do RSC payloadu vedení dostat nesmí.
 */
export async function getOfferHolderNames(): Promise<MemberName[]> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT m.id, m.name
    FROM member m
    WHERE EXISTS (SELECT 1 FROM burza_offer o WHERE o.member_id = m.id)
    ORDER BY m.name, m.id
  `);
  return result.rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Všichni členové (jen id a jméno), pro výběr „Komu“ na `/burza/pomoc`. */
export async function getMemberNames(): Promise<MemberName[]> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT id, name FROM member ORDER BY name, id
  `);
  return result.rows.map((r) => ({ id: r.id, name: r.name }));
}

export interface MyHelpState {
  /** `helper_id` -> `id` záznamu, který jsem tento měsíc zapsal jako příjemce. */
  recordedByHelper: Record<string, string>;
  /** Kolik záznamů je za posledních 6 měsíců, kde jsem pomocník. */
  helpedCount: number;
}

export async function getMyHelpState(me: string, today: string): Promise<MyHelpState> {
  const month = monthStart(today);
  const [recorded, helped] = await Promise.all([
    getDb().execute<{ id: string; helper_id: string }>(sql`
      SELECT id, helper_id FROM burza_help
      WHERE recipient_id = ${me}::uuid AND used_month = ${month}::date
    `),
    getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM burza_help
      WHERE helper_id = ${me}::uuid
        AND used_on >= (${today}::date - make_interval(months => ${HELP_WINDOW_MONTHS}::int))::date
        AND used_on <= ${today}::date
    `),
  ]);
  const recordedByHelper: Record<string, string> = {};
  for (const r of recorded.rows) recordedByHelper[r.helper_id] = r.id;
  return { recordedByHelper, helpedCount: Number(helped.rows[0]?.n ?? 0) };
}

export interface HelpRecordRow {
  id: string;
  usedOn: string;
  note: string | null;
  helperId: string;
  helperName: string;
  recipientId: string | null;
  recipientName: string | null;
  createdBy: string | null;
  createdByName: string | null;
}

/** Záznamy pomoci za 12 měsíců pro vedení, nejnovější nahoře, nejvýš 200. */
export async function getHelpRecordsForManagement(today: string): Promise<HelpRecordRow[]> {
  const result = await getDb().execute<{
    id: string;
    used_on: string;
    note: string | null;
    helper_id: string;
    helper_name: string;
    recipient_id: string | null;
    recipient_name: string | null;
    created_by: string | null;
    created_by_name: string | null;
  }>(sql`
    SELECT h.id, h.used_on::text AS used_on, h.note,
           h.helper_id, hm.name AS helper_name,
           h.recipient_id, rm.name AS recipient_name,
           h.created_by, cm.name AS created_by_name
    FROM burza_help h
    JOIN member hm ON hm.id = h.helper_id
    LEFT JOIN member rm ON rm.id = h.recipient_id
    LEFT JOIN member cm ON cm.id = h.created_by
    WHERE h.used_on >= (${today}::date - make_interval(months => ${HELP_RECORDS_MONTHS}::int))::date
    ORDER BY h.used_on DESC, h.created_at DESC, h.id
    LIMIT ${HELP_RECORDS_LIMIT}::int
  `);
  return result.rows.map((r) => ({
    id: r.id,
    usedOn: r.used_on,
    note: r.note,
    helperId: r.helper_id,
    helperName: r.helper_name,
    recipientId: r.recipient_id,
    recipientName: r.recipient_name,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
  }));
}

/** Den posledního potvrzení vlastního řádku, `null` když řádek není (dashboard). */
export async function getDashboardBurza(me: string): Promise<{ ownConfirmedDay: string | null }> {
  const result = await getDb().execute<{ confirmed_day: string }>(sql`
    SELECT to_char(confirmed_at AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS confirmed_day
    FROM burza_offer
    WHERE member_id = ${me}::uuid
  `);
  return { ownConfirmedDay: result.rows[0]?.confirmed_day ?? null };
}

// ── Zápis řádku (Z3: jeden příkaz podle `isNew`) ──

export interface OfferWriteArgs {
  targetId: string;
  actorId: string;
  isManagement: boolean;
  offer: string;
  contact: string | null;
  note: string | null;
}

export interface OfferOwner {
  memberId: string;
  memberName: string;
}

/**
 * Založení řádku: jen INSERT, existující řádek se nepřepíše. Vrací vlastníka,
 * nebo `null` (0 řádků: řádek mezitím vznikl, nebo autorita nesedí).
 */
export async function createOfferGuarded(args: OfferWriteArgs): Promise<OfferOwner | null> {
  const result = await getDb().execute<{ member_id: string; name: string }>(sql`
    WITH s AS (
      INSERT INTO burza_offer (member_id, offer, contact, note, updated_by)
      SELECT ${args.targetId}::uuid, ${args.offer}::text, ${args.contact}::text,
             ${args.note}::text, ${args.actorId}::uuid
       WHERE (${args.targetId}::uuid = ${args.actorId}::uuid OR ${args.isManagement}::boolean)
      ON CONFLICT (member_id) DO NOTHING
      RETURNING member_id
    )
    SELECT s.member_id, m.name FROM s JOIN member m ON m.id = s.member_id
  `);
  const r = result.rows[0];
  return r ? { memberId: r.member_id, memberName: r.name } : null;
}

/**
 * Úprava řádku: jen UPDATE, smazaný řádek se znovu nezaloží. Uložení je
 * zároveň potvrzení. Vrací vlastníka, nebo `null` (řádek mezitím někdo
 * smazal, nebo autorita nesedí).
 */
export async function updateOfferGuarded(args: OfferWriteArgs): Promise<OfferOwner | null> {
  const result = await getDb().execute<{ member_id: string; name: string }>(sql`
    WITH s AS (
      UPDATE burza_offer
         SET offer = ${args.offer}::text, contact = ${args.contact}::text,
             note = ${args.note}::text, updated_by = ${args.actorId}::uuid,
             confirmed_at = now(), updated_at = now()
       WHERE member_id = ${args.targetId}::uuid
         AND (${args.targetId}::uuid = ${args.actorId}::uuid OR ${args.isManagement}::boolean)
      RETURNING member_id
    )
    SELECT s.member_id, m.name FROM s JOIN member m ON m.id = s.member_id
  `);
  const r = result.rows[0];
  return r ? { memberId: r.member_id, memberName: r.name } : null;
}

/** „Platí dál“: jen vlastník, posune datum potvrzení. `false` = řádek už není. */
export async function confirmOfferGuarded(me: string): Promise<boolean> {
  const result = await getDb().execute<{ member_id: string }>(sql`
    UPDATE burza_offer SET confirmed_at = now()
     WHERE member_id = ${me}::uuid
    RETURNING member_id
  `);
  return result.rows.length > 0;
}

/** Smazání řádku: vlastník, nebo vedení. Vrací vlastníka, nebo `null`. */
export async function removeOfferGuarded(args: {
  targetId: string;
  actorId: string;
  isManagement: boolean;
}): Promise<OfferOwner | null> {
  const result = await getDb().execute<{ member_id: string; name: string }>(sql`
    WITH d AS (
      DELETE FROM burza_offer
       WHERE member_id = ${args.targetId}::uuid
         AND (${args.targetId}::uuid = ${args.actorId}::uuid OR ${args.isManagement}::boolean)
      RETURNING member_id
    )
    SELECT d.member_id, m.name FROM d JOIN member m ON m.id = d.member_id
  `);
  const r = result.rows[0];
  return r ? { memberId: r.member_id, memberName: r.name } : null;
}

// ── Pomoc využita ──

/**
 * L-2: před smazáním člena vynuluje `note` u záznamů, kde je příjemcem
 * (po smazání by se `recipient_id` přes ON DELETE SET NULL ztratilo a text
 * by osiřel). Jeden příkaz, bez transakce.
 */
export async function clearHelpNotesForRecipient(memberId: string): Promise<void> {
  await getDb().execute(sql`
    UPDATE burza_help SET note = NULL WHERE recipient_id = ${memberId}::uuid
  `);
}

/**
 * Zápis pomoci: jeden příkaz. Pomocník musí mít řádek v burze, nesmí být
 * příjemcem ani zapisujícím (L-1: vedení nezapisuje pomoc sobě jako
 * pomocníkovi) a záznam na dvojici a měsíc je nejvýš jeden (UNIQUE). Vrací `id`
 * nového záznamu, nebo `null` (nic nevzniklo, důvod rozliší `getHelpMissReason`).
 */
export async function recordHelpGuarded(args: {
  helperId: string;
  recipientId: string;
  createdBy: string;
  note: string | null;
  today: string;
}): Promise<string | null> {
  const month = monthStart(args.today);
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO burza_help (helper_id, recipient_id, used_on, used_month, note, created_by)
    SELECT o.member_id, ${args.recipientId}::uuid, ${args.today}::date, ${month}::date,
           ${args.note}::text, ${args.createdBy}::uuid
      FROM burza_offer o
     WHERE o.member_id = ${args.helperId}::uuid AND o.member_id <> ${args.recipientId}::uuid
       AND o.member_id <> ${args.createdBy}::uuid
    ON CONFLICT (helper_id, recipient_id, used_month) DO NOTHING
    RETURNING id
  `);
  return result.rows[0]?.id ?? null;
}

export interface HelpMissReason {
  /** Jméno pomocníka, `null` když člen neexistuje. */
  helperName: string | null;
  hasOffer: boolean;
  /** Záznam na dvojici za tento měsíc už je. */
  recordedId: string | null;
}

/** Proč zápis pomoci nic nevytvořil (druhé čtení, jen při prázdném výsledku). */
export async function getHelpMissReason(args: {
  helperId: string;
  recipientId: string;
  today: string;
}): Promise<HelpMissReason> {
  const month = monthStart(args.today);
  const result = await getDb().execute<{
    name: string | null;
    has_offer: boolean;
    recorded_id: string | null;
  }>(sql`
    SELECT (SELECT m.name FROM member m WHERE m.id = ${args.helperId}::uuid) AS name,
           EXISTS (SELECT 1 FROM burza_offer o WHERE o.member_id = ${args.helperId}::uuid) AS has_offer,
           (SELECT h.id FROM burza_help h
             WHERE h.helper_id = ${args.helperId}::uuid
               AND h.recipient_id = ${args.recipientId}::uuid
               AND h.used_month = ${month}::date
             LIMIT 1) AS recorded_id
  `);
  const r = result.rows[0];
  return {
    helperName: r?.name ?? null,
    hasOffer: Boolean(r?.has_offer),
    recordedId: r?.recorded_id ?? null,
  };
}

export interface RemovedHelpRow {
  helpId: string;
  helperId: string;
  helperName: string;
  recipientId: string | null;
  createdBy: string | null;
}

/** Smazání záznamu pomoci: příjemce svůj, vedení jakýkoli. */
export async function removeHelpGuarded(args: {
  helpId: string;
  actorId: string;
  isManagement: boolean;
}): Promise<RemovedHelpRow | null> {
  const result = await getDb().execute<{
    id: string;
    helper_id: string;
    helper_name: string;
    recipient_id: string | null;
    created_by: string | null;
  }>(sql`
    WITH d AS (
      DELETE FROM burza_help
       WHERE id = ${args.helpId}::uuid
         AND (recipient_id = ${args.actorId}::uuid OR ${args.isManagement}::boolean)
      RETURNING id, helper_id, recipient_id, created_by
    )
    SELECT d.id, d.helper_id, m.name AS helper_name, d.recipient_id, d.created_by
      FROM d JOIN member m ON m.id = d.helper_id
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    helpId: r.id,
    helperId: r.helper_id,
    helperName: r.helper_name,
    recipientId: r.recipient_id,
    createdBy: r.created_by,
  };
}
