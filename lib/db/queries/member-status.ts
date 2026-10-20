/**
 * iter-037 (T-003b, arch 5.1, gate Z1): deaktivace a reaktivace člena a
 * pojistka „poslední aktivní účet se správou členů“.
 *
 * Bez transakcí (LL-003): deaktivace je JEDEN SQL příkaz (CTE), který nastaví
 * sloupce, zvýší `session_version` (odhlásí všude hned), zneplatní nepoužité
 * odkazy z mailu a vrátí naplánovaná budoucí témata Master mindu do zásobníku.
 * Pojistky jsou ve WHERE: ne sám sebe, ne už neaktivní, ne poslední aktivní
 * účet se správou členů. Poznámka k důvodu neexistuje (Z1).
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  actorMayChangeSql,
  memberActiveSql,
  memberHasManageFunctionSql,
  memberManagesMembersSql,
} from "@/lib/db/queries/member-active";
import type { DeactivationTarget } from "@/lib/members/activity";

function getDb() {
  return drizzle(getSql());
}

/** Kolik aktivních účtů se správou členů je (admin, nebo funkce s `members.manage`, s heslem). */
export async function countActiveMemberManagers(): Promise<number> {
  const result = await getDb().execute<{ n: number }>(sql`
    SELECT count(*)::int AS n FROM member m
    WHERE ${memberActiveSql("m")} AND ${memberManagesMembersSql("m")}
  `);
  return Number(result.rows[0]?.n ?? 0);
}

export interface ManagerContext {
  target: (DeactivationTarget & { name: string }) | null;
  /**
   * Cíl má funkci s `members.manage`. Po sesazení z role admin by si správu
   * členů ponechal (jen přes funkci), pojistka posledního účtu ho tedy
   * nezastavuje.
   */
  targetHasManageFunction: boolean;
  /** Aktivní účty se správou členů kromě cíle. */
  otherActiveManagers: number;
}

/**
 * Cíl a počet ostatních aktivních účtů se správou členů jedním dotazem, pro
 * srozumitelnou hlášku (deaktivace, smazání, odebrání role nebo funkce).
 * Správnost drží SQL pojistky v příslušných příkazech.
 */
export async function getManagerContext(targetId: string): Promise<ManagerContext> {
  const result = await getDb().execute<{
    id: string;
    name: string;
    deactivated_at: string | null;
    inactive_until: string | null;
    is_active_manager: boolean;
    has_manage_function: boolean;
    others: number;
  }>(sql`
    SELECT t.id, t.name, t.deactivated_at::text AS deactivated_at,
           t.inactive_until::text AS inactive_until,
           (${memberActiveSql("t")} AND ${memberManagesMembersSql("t")}) AS is_active_manager,
           ${memberHasManageFunctionSql("t")} AS has_manage_function,
           (SELECT count(*)::int FROM member o
             WHERE o.id <> t.id AND ${memberActiveSql("o")} AND ${memberManagesMembersSql("o")}) AS others
    FROM member t
    WHERE t.id = ${targetId}::uuid
  `);
  const r = result.rows[0];
  if (!r) return { target: null, targetHasManageFunction: false, otherActiveManagers: 0 };
  return {
    targetHasManageFunction: Boolean(r.has_manage_function),
    target: {
      id: r.id,
      name: r.name,
      deactivatedAt: r.deactivated_at,
      inactiveUntil: r.inactive_until,
      isActiveManager: Boolean(r.is_active_manager),
    },
    otherActiveManagers: Number(r.others),
  };
}

function dateValue(until: string | null) {
  return until === null ? sql`NULL::date` : sql`${until}::date`;
}

/**
 * Deaktivace jedním příkazem (arch 5.1 bez poznámky). Vrací `null`, když
 * neprošla některá pojistka (cíl je volající, už neaktivní, poslední aktivní
 * účet se správou členů, neexistuje). `unscheduled` = kolik témat Master mindu
 * se vrátilo do zásobníku (jen naplánovaná od dneška dál, K5).
 *
 * `session_version + 1` odhlásí všechna zařízení hned. Odkazy `meeting_member_link`,
 * `event_participant`, `interview_link` se neruší, neplatí díky kontrole při
 * ověření a po návratu fungují zase. 7denní odkaz (`magic_token_hash`) se
 * nemaže, neplatí díky `getMemberByTokenHash`.
 *
 * CTE se jmenují jinak než `old` (PostgreSQL 18 má v RETURNING vlastní alias).
 */
export async function deactivateMemberGuarded(input: {
  targetId: string;
  actorId: string;
  until: string | null;
}): Promise<{ id: string; name: string; unscheduled: number } | null> {
  const { targetId, actorId, until } = input;
  const result = await getDb().execute<{ id: string; name: string; unscheduled: number }>(sql`
    WITH today AS (SELECT (now() AT TIME ZONE 'Europe/Prague')::date AS d),
    managers AS (
      SELECT m.id FROM member m
      WHERE ${memberActiveSql("m")} AND ${memberManagesMembersSql("m")}
      ORDER BY m.id FOR UPDATE OF m
    ), upd AS (
      UPDATE member t SET
        deactivated_at  = now(),
        inactive_until  = ${dateValue(until)},
        deactivated_by  = ${actorId}::uuid,
        session_version = t.session_version + 1
      WHERE t.id = ${targetId}::uuid
        AND t.id <> ${actorId}::uuid
        AND ${actorMayChangeSql("t", actorId)}
        AND ${memberActiveSql("t")}
        AND NOT (
          EXISTS (SELECT 1 FROM managers WHERE managers.id = t.id)
          AND (SELECT count(*) FROM managers WHERE managers.id <> t.id) = 0
        )
      RETURNING t.id, t.name
    ), links AS (
      UPDATE member_login_link SET used_at = now()
      WHERE member_id IN (SELECT id FROM upd) AND used_at IS NULL
    ), alinks AS (
      -- iter-038 (security L-4): ranní odkaz docházky přestane platit i po návratu
      -- téhož dne (jinak by ho znovuaktivace oživila). Stejný příkaz, bez transakce.
      UPDATE attendance_link SET revoked_at = now()
      WHERE member_id IN (SELECT id FROM upd) AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
    ), mm AS (
      UPDATE mastermind_case c SET status = 'proposed', internal_date = NULL,
             scheduled_at = NULL, scheduled_by = NULL, updated_at = now()
      FROM today
      WHERE c.member_id IN (SELECT id FROM upd)
        AND c.status = 'scheduled' AND c.internal_date >= today.d
      RETURNING c.id
    )
    SELECT upd.id, upd.name, (SELECT count(*)::int FROM mm) AS unscheduled FROM upd
  `);
  const r = result.rows[0];
  if (!r) return null;
  return { id: r.id, name: r.name, unscheduled: Number(r.unscheduled) };
}

/**
 * Změna data u neaktivního člena. Session ani odkazy se nemění. `false` =
 * člen už není neaktivní (vrátil se, nebo deaktivace prošla), nic se nezměnilo.
 */
export async function updateDeactivationGuarded(input: {
  targetId: string;
  actorId: string;
  until: string | null;
}): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    UPDATE member t SET inactive_until = ${dateValue(input.until)}
    WHERE t.id = ${input.targetId}::uuid
      AND ${actorMayChangeSql("t", input.actorId)}
      AND t.deactivated_at IS NOT NULL
      AND NOT ${memberActiveSql("t")}
    RETURNING t.id
  `);
  return result.rows.length > 0;
}

/**
 * Reaktivace („Aktivovat hned“). Session se nemění (člen se přihlásí sám),
 * témata Master mindu se nevracejí do plánu. `null` = člen nebyl deaktivovaný.
 */
export async function reactivateMemberGuarded(
  targetId: string,
  actorId: string
): Promise<{ id: string; name: string } | null> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    UPDATE member SET deactivated_at = NULL, inactive_until = NULL, deactivated_by = NULL
    WHERE id = ${targetId}::uuid AND deactivated_at IS NOT NULL
      AND ${actorMayChangeSql("member", actorId)}
    RETURNING id, name
  `);
  return result.rows[0] ?? null;
}

/**
 * Úklid prošlých deaktivací (fáze 6 ranního cronu, arch 4.3). Minimalizace
 * dat, správnost na něm nestojí: aktivita se vyhodnocuje při čtení. Session
 * se tu nezvyšuje. Vrací počet vyčištěných řádků.
 */
export async function cleanupExpiredDeactivations(): Promise<number> {
  const result = await getDb().execute<{ id: string }>(sql`
    UPDATE member SET deactivated_at = NULL, inactive_until = NULL, deactivated_by = NULL
    WHERE deactivated_at IS NOT NULL
      AND inactive_until IS NOT NULL
      AND inactive_until < (now() AT TIME ZONE 'Europe/Prague')::date
    RETURNING id
  `);
  return result.rows.length;
}
