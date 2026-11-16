/**
 * iter-046 (arch 4.2, 6.1): nastavení, změna a zrušení medical člena a
 * `memberMayVoteNow`. Bez transakcí (LL-003): každá akce je jeden SQL příkaz,
 * pojistky jsou ve WHERE (právo, ne sebe, účet admina jen admin, rozsah data).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  actorHasPermissionSql,
  actorIsAdminSql,
  actorMayChangeSql,
  memberActiveSql,
  memberMedicalOnSql,
} from "@/lib/db/queries/member-active";
import { MAX_MEDICAL_DAYS, type MedicalFields } from "@/lib/members/medical";
import { VOTE_TEXTS } from "@/lib/meetings/token-error-text";

function getDb() {
  return drizzle(getSql());
}

/** Pražský dnešek (stejný výraz jako `TODAY_SQL` v attendance.ts, bez importu attendance.ts). */
const TODAY: SQL = sql`(now() AT TIME ZONE 'Europe/Prague')::date`;

/**
 * Nastavení nebo změna medical. Prodloužení i zkrácení běžícího období drží
 * `medical_from`, nové období po skončeném začíná dneškem (Q2). `null` =
 * pojistka neprošla (sebe, bez práva, účet admina, datum mimo rozsah).
 */
export function setMemberMedicalSql(input: { targetId: string; actorId: string; until: string }): SQL {
  const { targetId, actorId, until } = input;
  return sql`
    UPDATE member SET
      medical_from   = CASE WHEN medical_until IS NOT NULL AND medical_until >= ${TODAY}
                            THEN medical_from ELSE ${TODAY} END,
      medical_until  = ${until}::date,
      medical_set_by = ${actorId}::uuid,
      medical_set_at = now()
    WHERE id = ${targetId}::uuid
      AND id <> ${actorId}::uuid
      AND ${until}::date >= ${TODAY} AND ${until}::date <= ${TODAY} + ${MAX_MEDICAL_DAYS}::int
      AND ${actorMayChangeSql("member", actorId)}
      AND ${actorHasPermissionSql(actorId, "members.medical")}
    RETURNING id, name, medical_from::text AS medical_from, medical_until::text AS medical_until
  `;
}

export function clearMemberMedicalSql(input: { targetId: string; actorId: string }): SQL {
  const { targetId, actorId } = input;
  return sql`
    UPDATE member SET medical_from = NULL, medical_until = NULL,
      medical_set_by = ${actorId}::uuid, medical_set_at = now()
    WHERE id = ${targetId}::uuid AND id <> ${actorId}::uuid AND medical_until IS NOT NULL
      AND ${actorMayChangeSql("member", actorId)}
      AND ${actorHasPermissionSql(actorId, "members.medical")}
    RETURNING id, name
  `;
}

export async function setMemberMedicalGuarded(input: {
  targetId: string;
  actorId: string;
  until: string;
}): Promise<{ id: string; name: string; medicalFrom: string; medicalUntil: string } | null> {
  const result = await getDb().execute<{
    id: string;
    name: string;
    medical_from: string;
    medical_until: string;
  }>(setMemberMedicalSql(input));
  const r = result.rows[0];
  if (!r) return null;
  return { id: r.id, name: r.name, medicalFrom: r.medical_from, medicalUntil: r.medical_until };
}

export async function clearMemberMedicalGuarded(input: {
  targetId: string;
  actorId: string;
}): Promise<{ id: string; name: string } | null> {
  const result = await getDb().execute<{ id: string; name: string }>(clearMemberMedicalSql(input));
  return result.rows[0] ?? null;
}

/** Cíl a volající pro `decideMedicalChange` (čerstvý řádek, jen potřebná pole). */
export async function getMedicalChangeContext(
  targetId: string,
  actorId: string
): Promise<{
  target: { id: string; name: string; isAdmin: boolean; medicalFrom: string | null; medicalUntil: string | null } | null;
  actorIsAdmin: boolean;
}> {
  const result = await getDb().execute<{
    id: string;
    name: string;
    is_admin: boolean;
    medical_from: string | null;
    medical_until: string | null;
    actor_is_admin: boolean;
  }>(sql`
    SELECT t.id, t.name, (t.management_role = 'admin') AS is_admin,
           t.medical_from::text AS medical_from, t.medical_until::text AS medical_until,
           ${actorIsAdminSql(actorId)} AS actor_is_admin
    FROM member t WHERE t.id = ${targetId}::uuid
  `);
  const r = result.rows[0];
  if (!r) {
    const a = await getDb().execute<{ ok: boolean }>(sql`SELECT ${actorIsAdminSql(actorId)} AS ok`);
    return { target: null, actorIsAdmin: Boolean(a.rows[0]?.ok) };
  }
  return {
    actorIsAdmin: Boolean(r.actor_is_admin),
    target: {
      id: r.id,
      name: r.name,
      isAdmin: Boolean(r.is_admin),
      medicalFrom: r.medical_from,
      medicalUntil: r.medical_until,
    },
  };
}

export interface MedicalMemberRow extends MedicalFields {
  id: string;
  name: string;
}

/** Aktivní členové kromě volajícího se stavem medical (karta Medical pro Člena výboru). */
export async function listMembersForMedical(actorId: string): Promise<MedicalMemberRow[]> {
  const result = await getDb().execute<{
    id: string;
    name: string;
    medical_from: string | null;
    medical_until: string | null;
  }>(sql`
    SELECT m.id, m.name, m.medical_from::text AS medical_from, m.medical_until::text AS medical_until
    FROM member m
    WHERE ${memberActiveSql("m")} AND m.id <> ${actorId}::uuid
    ORDER BY m.name
  `);
  return result.rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      medicalFrom: r.medical_from,
      medicalUntil: r.medical_until,
    }))
    .sort((x, y) => x.name.localeCompare(y.name, "cs"));
}

/** SQL `memberMayVoteNow`: aktivní a dnes (Praha) bez medical. */
export function memberMayVoteNowSql(memberId: string): SQL {
  return sql`
    SELECT (${memberActiveSql("m")} AND NOT ${memberMedicalOnSql("m", TODAY)}) AS ok
    FROM member m WHERE m.id = ${memberId}::uuid
  `;
}

/**
 * Smí člen teď hlasovat: aktivní a dnes (Praha) bez medical (Q3 A). Neexistující
 * člen = `false` (fail closed), stejně chyba dotazu (výjimka se nechytá: hlas
 * se nezapíše).
 */
export async function memberMayVoteNow(memberId: string): Promise<boolean> {
  const result = await getDb().execute<{ ok: boolean }>(memberMayVoteNowSql(memberId));
  return result.rows[0]?.ok === true;
}

/**
 * iter-046 (F-07): text odmítnutí hlasu. Neaktivní člen nedostane text o
 * medical (zdravotní údaj), jen „Člen je neaktivní.“, ostatní text medical.
 * Volá se až po `memberMayVoteNow() === false`, chyba dotazu vrací text medical
 * (hlas je tak jako tak odmítnutý).
 */
export async function voteBlockedText(memberId: string): Promise<string> {
  try {
    const result = await getDb().execute<{ active: boolean }>(
      sql`SELECT ${memberActiveSql("member")} AS active FROM member WHERE id = ${memberId}::uuid`
    );
    if (result.rows[0] && result.rows[0].active === false) return VOTE_TEXTS.inactive;
  } catch {
    // fail closed: hlas je odmítnutý, jen text bude obecnější
  }
  return VOTE_TEXTS.medical;
}
