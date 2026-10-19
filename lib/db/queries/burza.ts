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
 * iter-037 (T-003b, arch 5.2): karty a kontakty neaktivního člena jsou
 * neviditelné (přehledy, pracovní seznamy vedení, výběry), nový zápis
 * „Využil(a) jsem“ k jeho kartě nejde. Existující zápisy zůstávají a vedení je
 * vidí na `/burza/pomoc` beze změny.
 *
 * Z členské tabulky se čte jen jméno, firma a obor. Burza nečte kontaktní
 * údaje členů z účtu, kontakt píše člen sám (Z1, statický test to hlídá).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { memberActiveSql } from "@/lib/db/queries/member-active";
import {
  CONTACT_ITEMS_LIMIT,
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
    JOIN member m ON m.id = o.member_id AND ${memberActiveSql("m")}
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
    WHERE m.id = ${memberId}::uuid AND ${memberActiveSql("m")}
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
    WHERE ${memberActiveSql("m")}
      AND NOT EXISTS (SELECT 1 FROM burza_offer o WHERE o.member_id = m.id)
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
    WHERE ${memberActiveSql("m")}
      AND EXISTS (SELECT 1 FROM burza_offer o WHERE o.member_id = m.id)
    ORDER BY m.name, m.id
  `);
  return result.rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Všichni aktivní členové (jen id a jméno), pro výběr „Komu“ na `/burza/pomoc`. */
export async function getMemberNames(): Promise<MemberName[]> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT m.id, m.name FROM member m WHERE ${memberActiveSql("m")} ORDER BY m.name, m.id
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
  /** `timestamptz::text`, jen pro řazení v `mergeUseRecords`. */
  createdAt: string;
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
    created_at: string;
  }>(sql`
    SELECT h.id, h.used_on::text AS used_on, h.note,
           h.helper_id, hm.name AS helper_name,
           h.recipient_id, rm.name AS recipient_name,
           h.created_by, cm.name AS created_by_name,
           h.created_at::text AS created_at
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
    createdAt: r.created_at,
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
 * iter-037 (security L-3, review MIN-4): zápis do burzy za neaktivního člena
 * neprojde ani přímým voláním. UI neaktivní nenabízí, tohle je poslední pojistka
 * na serveru. `t` je alias z uzavřeného typu `MemberAlias`.
 */
function targetActiveSql(targetId: string) {
  return sql`EXISTS (SELECT 1 FROM member t WHERE t.id = ${targetId}::uuid AND ${memberActiveSql("t")})`;
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
         AND ${targetActiveSql(args.targetId)}
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
         AND ${targetActiveSql(args.targetId)}
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
      JOIN member hm ON hm.id = o.member_id AND ${memberActiveSql("hm")}
      JOIN member rm ON rm.id = ${args.recipientId}::uuid AND ${memberActiveSql("rm")}
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
  /** iter-037: pomocník je aktivní (neaktivní = „Karta teď není k dispozici.“). */
  helperActive: boolean;
  /** Příjemce je aktivní a existuje (neaktivnímu zapisuje pomoc jen vedení, server to odmítne). */
  recipientActive: boolean;
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
    helper_active: boolean | null;
    recipient_active: boolean | null;
    has_offer: boolean;
    recorded_id: string | null;
  }>(sql`
    SELECT (SELECT m.name FROM member m WHERE m.id = ${args.helperId}::uuid) AS name,
           (SELECT ${memberActiveSql("m")} FROM member m WHERE m.id = ${args.helperId}::uuid) AS helper_active,
           (SELECT ${memberActiveSql("rm")} FROM member rm WHERE rm.id = ${args.recipientId}::uuid) AS recipient_active,
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
    helperActive: r?.helper_active !== false,
    recipientActive: r?.recipient_active !== false,
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

/**
 * Přepínač pomoci, odškrtnutí: jeden příkaz, maže přesně záznam, který člověk
 * viděl zaškrtnutý (podle `id`, ne podle měsíce, kvůli přelomu měsíce). Cizí
 * nebo neexistující `helpId` nic nesmaže. 0 i 1 řádek je úspěch.
 */
export async function unsetHelpUsedGuarded(args: {
  helpId: string;
  recipientId: string;
  helperId: string;
}): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    DELETE FROM burza_help
     WHERE id = ${args.helpId}::uuid
       AND recipient_id = ${args.recipientId}::uuid
       AND helper_id = ${args.helperId}::uuid
    RETURNING id
  `);
  return result.rows.length > 0;
}

// ── Kontakty (iter-035 doplnění, T-013) ──

export interface ContactItemRow {
  id: string;
  memberId: string;
  name: string;
  company: string | null;
  obor: string | null;
  label: string;
  /** `timestamptz::text`, řadí se jako řetězec. */
  createdAt: string;
}

/** Všechny položky kontaktů se jmenným údaji nabízejícího. Bez e-mailu. */
export async function getContactItemsForOverview(): Promise<ContactItemRow[]> {
  const result = await getDb().execute<{
    id: string;
    member_id: string;
    name: string;
    company: string | null;
    obor: string | null;
    label: string;
    created_at: string;
  }>(sql`
    SELECT c.id, c.member_id, m.name, m.company, m.obor, c.label, c.created_at::text AS created_at
    FROM burza_contact c
    JOIN member m ON m.id = c.member_id AND ${memberActiveSql("m")}
    ORDER BY m.name, c.member_id, c.created_at, c.id
  `);
  return result.rows.map((r) => ({
    id: r.id,
    memberId: r.member_id,
    name: r.name,
    company: r.company,
    obor: r.obor,
    label: r.label,
    createdAt: r.created_at,
  }));
}

export interface MyContactState {
  /** `contact_id` všech položek, které jsem zaškrtl (natrvalo, bez časového okna). */
  usedContactIds: string[];
  /** Kolik záznamů využití je za posledních 6 měsíců, kde jsem nabízející. */
  usedCount: number;
}

export async function getMyContactState(me: string, today: string): Promise<MyContactState> {
  const [used, count] = await Promise.all([
    getDb().execute<{ contact_id: string }>(sql`
      SELECT contact_id FROM burza_contact_use
      WHERE recipient_id = ${me}::uuid AND contact_id IS NOT NULL
    `),
    getDb().execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM burza_contact_use
      WHERE helper_id = ${me}::uuid
        AND used_on >= (${today}::date - make_interval(months => ${HELP_WINDOW_MONTHS}::int))::date
        AND used_on <= ${today}::date
    `),
  ]);
  return {
    usedContactIds: used.rows.map((r) => r.contact_id),
    usedCount: Number(count.rows[0]?.n ?? 0),
  };
}

export interface ContactItemsForEdit {
  memberId: string;
  name: string;
  items: Array<{ id: string; label: string }>;
}

/** Člen a jeho položky v pořadí přidání. `null` = člen neexistuje. Volá se až po `canEditContacts`. */
export async function getContactItemsForEdit(memberId: string): Promise<ContactItemsForEdit | null> {
  const [member, items] = await Promise.all([
    getDb().execute<{ id: string; name: string }>(sql`
      SELECT m.id, m.name FROM member m WHERE m.id = ${memberId}::uuid AND ${memberActiveSql("m")}
    `),
    getDb().execute<{ id: string; label: string }>(sql`
      SELECT id, label FROM burza_contact
      WHERE member_id = ${memberId}::uuid
      ORDER BY created_at, id
    `),
  ]);
  const m = member.rows[0];
  if (!m) return null;
  return {
    memberId: m.id,
    name: m.name,
    items: items.rows.map((r) => ({ id: r.id, label: r.label })),
  };
}

export interface ContactUseRow {
  id: string;
  usedOn: string;
  /** `null` = položka už v burze není. */
  contactLabel: string | null;
  helperId: string;
  helperName: string;
  recipientId: string | null;
  recipientName: string | null;
  createdAt: string;
}

/** Záznamy využití kontaktů za 12 měsíců pro vedení, nejnovější nahoře, nejvýš 200. */
export async function getContactUsesForManagement(today: string): Promise<ContactUseRow[]> {
  const result = await getDb().execute<{
    id: string;
    used_on: string;
    label: string | null;
    helper_id: string;
    helper_name: string;
    recipient_id: string | null;
    recipient_name: string | null;
    created_at: string;
  }>(sql`
    SELECT u.id, u.used_on::text AS used_on, c.label,
           u.helper_id, hm.name AS helper_name,
           u.recipient_id, rm.name AS recipient_name,
           u.created_at::text AS created_at
    FROM burza_contact_use u
    JOIN member hm ON hm.id = u.helper_id
    LEFT JOIN member rm ON rm.id = u.recipient_id
    LEFT JOIN burza_contact c ON c.id = u.contact_id
    WHERE u.used_on >= (${today}::date - make_interval(months => ${HELP_RECORDS_MONTHS}::int))::date
    ORDER BY u.used_on DESC, u.created_at DESC, u.id
    LIMIT ${HELP_RECORDS_LIMIT}::int
  `);
  return result.rows.map((r) => ({
    id: r.id,
    usedOn: r.used_on,
    contactLabel: r.label,
    helperId: r.helper_id,
    helperName: r.helper_name,
    recipientId: r.recipient_id,
    recipientName: r.recipient_name,
    createdAt: r.created_at,
  }));
}

// ── Zápis položek kontaktů ──

export interface ContactOwner {
  memberId: string;
  memberName: string;
}

/**
 * Založení položky s limitem: jeden příkaz. Autorita (vlastník, nebo vedení)
 * a počet položek (méně než `CONTACT_ITEMS_LIMIT`) jsou ve WHERE. `null` =
 * limit je plný (neexistující člen skončí na FK 23503).
 */
export async function createContactItemWithLimit(args: {
  targetId: string;
  actorId: string;
  isManagement: boolean;
  label: string;
}): Promise<ContactOwner | null> {
  const result = await getDb().execute<{ member_id: string; name: string }>(sql`
    WITH s AS (
      INSERT INTO burza_contact (member_id, label, updated_by)
      SELECT ${args.targetId}::uuid, ${args.label}::text, ${args.actorId}::uuid
       WHERE (${args.targetId}::uuid = ${args.actorId}::uuid OR ${args.isManagement}::boolean)
         AND ${targetActiveSql(args.targetId)}
         AND (SELECT count(*) FROM burza_contact WHERE member_id = ${args.targetId}::uuid) < ${CONTACT_ITEMS_LIMIT}::int
      RETURNING member_id
    )
    SELECT s.member_id, m.name FROM s JOIN member m ON m.id = s.member_id
  `);
  const r = result.rows[0];
  return r ? { memberId: r.member_id, memberName: r.name } : null;
}

/** Úprava položky: poslední vyhraje. `null` = položka mezitím zmizela, nebo autorita nesedí. */
export async function updateContactItemGuarded(args: {
  contactId: string;
  targetId: string;
  actorId: string;
  isManagement: boolean;
  label: string;
}): Promise<ContactOwner | null> {
  const result = await getDb().execute<{ member_id: string; name: string }>(sql`
    WITH s AS (
      UPDATE burza_contact
         SET label = ${args.label}::text, updated_by = ${args.actorId}::uuid, updated_at = now()
       WHERE id = ${args.contactId}::uuid AND member_id = ${args.targetId}::uuid
         AND (${args.targetId}::uuid = ${args.actorId}::uuid OR ${args.isManagement}::boolean)
         AND ${targetActiveSql(args.targetId)}
      RETURNING member_id
    )
    SELECT s.member_id, m.name FROM s JOIN member m ON m.id = s.member_id
  `);
  const r = result.rows[0];
  return r ? { memberId: r.member_id, memberName: r.name } : null;
}

/** Smazání položky: vlastník, nebo vedení. Záznamy využití zůstanou s `contact_id = NULL`. */
export async function removeContactItemGuarded(args: {
  contactId: string;
  actorId: string;
  isManagement: boolean;
}): Promise<ContactOwner | null> {
  const result = await getDb().execute<{ member_id: string; name: string }>(sql`
    WITH d AS (
      DELETE FROM burza_contact
       WHERE id = ${args.contactId}::uuid
         AND (member_id = ${args.actorId}::uuid OR ${args.isManagement}::boolean)
      RETURNING member_id
    )
    SELECT d.member_id, m.name FROM d JOIN member m ON m.id = d.member_id
  `);
  const r = result.rows[0];
  return r ? { memberId: r.member_id, memberName: r.name } : null;
}

// ── Využití kontaktu (natrvalo) ──

/**
 * Zaškrtnutí kontaktu: jeden příkaz. `helper_id` se bere z položky, ne od
 * klienta, vlastní položka se nezapíše. Vrací `id` nového záznamu, nebo `null`
 * (nic nevzniklo, důvod rozliší `getContactUseMissReason`).
 */
export async function setContactUsedGuarded(args: {
  contactId: string;
  recipientId: string;
  today: string;
}): Promise<string | null> {
  const result = await getDb().execute<{ id: string }>(sql`
    INSERT INTO burza_contact_use (contact_id, helper_id, recipient_id, used_on)
    SELECT c.id, c.member_id, ${args.recipientId}::uuid, ${args.today}::date
      FROM burza_contact c
      JOIN member hm ON hm.id = c.member_id AND ${memberActiveSql("hm")}
     WHERE c.id = ${args.contactId}::uuid AND c.member_id <> ${args.recipientId}::uuid
    ON CONFLICT (contact_id, recipient_id) DO NOTHING
    RETURNING id
  `);
  return result.rows[0]?.id ?? null;
}

/** Odškrtnutí kontaktu: přirozený klíč (položka, já). 0 i 1 řádek je úspěch. */
export async function unsetContactUsedGuarded(args: {
  contactId: string;
  recipientId: string;
}): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    DELETE FROM burza_contact_use
     WHERE contact_id = ${args.contactId}::uuid AND recipient_id = ${args.recipientId}::uuid
    RETURNING id
  `);
  return result.rows.length > 0;
}

export interface ContactUseMissReason {
  /** Položka existuje. */
  exists: boolean;
  /** iter-037: nabízející je aktivní (neaktivní = „Karta teď není k dispozici.“). */
  ownerActive: boolean;
  /** Položka patří přihlášenému. */
  own: boolean;
  /** Záznam na (položka, já) už je. */
  recordedId: string | null;
}

/** Proč zaškrtnutí kontaktu nic nevytvořilo (druhé čtení, jen při prázdném výsledku). */
export async function getContactUseMissReason(args: {
  contactId: string;
  recipientId: string;
}): Promise<ContactUseMissReason> {
  const result = await getDb().execute<{
    owner_id: string | null;
    owner_active: boolean | null;
    recorded_id: string | null;
  }>(sql`
    SELECT (SELECT c.member_id FROM burza_contact c WHERE c.id = ${args.contactId}::uuid) AS owner_id,
           (SELECT ${memberActiveSql("m")} FROM burza_contact c JOIN member m ON m.id = c.member_id
             WHERE c.id = ${args.contactId}::uuid) AS owner_active,
           (SELECT u.id FROM burza_contact_use u
             WHERE u.contact_id = ${args.contactId}::uuid
               AND u.recipient_id = ${args.recipientId}::uuid
             LIMIT 1) AS recorded_id
  `);
  const r = result.rows[0];
  return {
    exists: Boolean(r?.owner_id),
    ownerActive: r?.owner_active !== false,
    own: r?.owner_id === args.recipientId,
    recordedId: r?.recorded_id ?? null,
  };
}

export interface RemovedContactUseRow {
  useId: string;
  helperId: string;
  helperName: string;
  recipientId: string | null;
}

/** Smazání záznamu o využití kontaktu vedením (volá jen akce s `requirePermission("burza.manage")`). */
export async function removeContactUseGuarded(useId: string): Promise<RemovedContactUseRow | null> {
  const result = await getDb().execute<{
    id: string;
    helper_id: string;
    helper_name: string;
    recipient_id: string | null;
  }>(sql`
    WITH d AS (
      DELETE FROM burza_contact_use WHERE id = ${useId}::uuid
      RETURNING id, helper_id, recipient_id
    )
    SELECT d.id, d.helper_id, m.name AS helper_name, d.recipient_id
      FROM d JOIN member m ON m.id = d.helper_id
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    useId: r.id,
    helperId: r.helper_id,
    helperName: r.helper_name,
    recipientId: r.recipient_id,
  };
}
