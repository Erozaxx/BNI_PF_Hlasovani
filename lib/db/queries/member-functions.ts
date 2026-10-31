/**
 * iter-037 (T-003b): přidělení funkce členovi s pojistkami (heslo držitele
 * funkce, poslední účet se správou členů). Katalog funkcí (`/admin/funkce`) je
 * až T-003c.
 *
 * Rozhodnutí Toma 19. 10. (M-1): funkce přiděluje a odebírá jen admin (`access.manage`
 * nedostane žádná funkce). V SQL je to druhá pojistka: volající je v DB admin
 * (`actorIsAdminSql`), účet admina nikdo jiný nezmění (`actorMayChangeSql`).
 *
 * Bez transakcí (LL-003): změna je JEDEN SQL příkaz s pojistkami ve WHERE.
 * Člen má nejvýš jednu funkci (`member_function` PRIMARY KEY na `member_id`).
 * INSERT a DELETE téhož klíče v jednom příkazu by se potkaly na starém řádku,
 * proto přidělení/změna je `INSERT ... ON CONFLICT DO UPDATE` a odebrání
 * `DELETE`, každé samostatný příkaz.
 *
 * NENÍ čistý modul (importuje drizzle-orm a @/lib/db/*).
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import {
  actorIsAdminSql,
  actorMayChangeSql,
  functionGrantsSql,
  memberActiveSql,
  memberManagesMembersSql,
} from "@/lib/db/queries/member-active";

function getDb() {
  return drizzle(getSql());
}

export interface ChapterFunctionRow {
  id: string;
  name: string;
  /** `NULL` = výchozí sada. */
  permissions: string[] | null;
  givesMembersManage: boolean;
}

export async function getChapterFunctionById(id: string): Promise<ChapterFunctionRow | null> {
  const result = await getDb().execute<{
    id: string;
    name: string;
    permissions: string[] | null;
    gives_manage: boolean;
  }>(sql`
    SELECT id, name, permissions,
           ${functionGrantsSql(sql`permissions`, "members.manage")} AS gives_manage
    FROM chapter_function WHERE id = ${id}::uuid
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    permissions: r.permissions ?? null,
    givesMembersManage: Boolean(r.gives_manage),
  };
}

/** Funkce, kterou člen má teď (`null` = žádnou). */
export async function getMemberFunctionId(memberId: string): Promise<string | null> {
  const result = await getDb().execute<{ function_id: string }>(sql`
    SELECT function_id FROM member_function WHERE member_id = ${memberId}::uuid
  `);
  return result.rows[0]?.function_id ?? null;
}

export interface SetFunctionRow {
  id: string;
  name: string;
  email: string | null;
  /** Člen dostal zámkový hash (neměl heslo): volající mu vystaví odkaz „nastav si heslo“. */
  passwordCreated: boolean;
  /** Člen přišel o heslo (odebrána poslední role i funkce). */
  passwordCleared: boolean;
}

/**
 * Přidělení nebo změna funkce (`newFunctionId` není `null`). Vrací `null`, když
 * neprošla některá pojistka: funkce se mezitím změnila (`expectedFunctionId`),
 * cíl bez e-mailu, cíl je volající (bez `allowSelf`), nebo by zmizel poslední
 * aktivní účet se správou členů. Neexistující funkce (`nf` prázdné) vrací
 * také `null`.
 *
 * Člen bez hesla dostane zámkový hash a `session_version + 1` (stejně jako
 * povýšení v iter-032), člen s heslem si heslo i session ponechá, práva se
 * přepočítají při dalším požadavku.
 */
export async function assignMemberFunctionGuarded(input: {
  targetId: string;
  actorId: string;
  allowSelf: boolean;
  newFunctionId: string;
  expectedFunctionId: string | null;
  lockHash: string;
}): Promise<SetFunctionRow | null> {
  const { targetId, actorId, allowSelf, newFunctionId, expectedFunctionId, lockHash } = input;
  const expected = expectedFunctionId === null ? sql`NULL::uuid` : sql`${expectedFunctionId}::uuid`;
  const result = await getDb().execute<{
    id: string;
    name: string;
    email: string | null;
    password_created: boolean;
  }>(sql`
    WITH managers AS (
      SELECT m.id FROM member m
      WHERE ${memberActiveSql("m")} AND ${memberManagesMembersSql("m")}
      ORDER BY m.id FOR UPDATE OF m
    ), nf AS (
      SELECT id, ${functionGrantsSql(sql`permissions`, "members.manage")} AS manage
      FROM chapter_function WHERE id = ${newFunctionId}::uuid
    ), cur AS (
      SELECT t.id, t.name, t.email, t.management_role, t.password_hash,
             (SELECT function_id FROM member_function WHERE member_id = t.id) AS old_fn
      FROM member t
      WHERE t.id = ${targetId}::uuid
        AND (${allowSelf}::boolean OR t.id <> ${actorId}::uuid)
        AND ${actorMayChangeSql("t", actorId)}
        AND ${actorIsAdminSql(actorId)}
        AND t.email IS NOT NULL AND t.email <> ''
      FOR UPDATE OF t
    ), ok AS (
      -- Zámkový hash a odkaz „nastav si heslo“ dostane člen, který k první funkci
      -- nemá použitelné heslo: žádné heslo (L-1: ani role, ani funkce = starý
      -- hash po souběhu se nepoužije), nebo jen čekající odkaz po povýšení či
      -- resetu (MIN-1: role po funkci a naopak mail s pozvánkou znovu odejde).
      SELECT cur.id, cur.name, cur.email,
             (cur.password_hash IS NULL
              OR (cur.old_fn IS NULL
                  AND (cur.management_role IS NULL
                       OR EXISTS (SELECT 1 FROM member_login_link l
                                   WHERE l.member_id = cur.id
                                     AND l.purpose = 'set-password' AND l.used_at IS NULL)))
             ) AS needs_lock
      FROM cur, nf
      WHERE cur.old_fn IS NOT DISTINCT FROM ${expected}
        AND NOT (
          EXISTS (SELECT 1 FROM managers WHERE managers.id = cur.id)
          AND cur.management_role IS DISTINCT FROM 'admin'
          AND NOT nf.manage
          AND (SELECT count(*) FROM managers WHERE managers.id <> cur.id) = 0
        )
    ), ins AS (
      INSERT INTO member_function (member_id, function_id, assigned_by)
      SELECT ok.id, ${newFunctionId}::uuid, ${actorId}::uuid FROM ok
      ON CONFLICT (member_id) DO UPDATE SET
        function_id = EXCLUDED.function_id,
        -- iter-044 (Q10 A): assigned_at se při změně funkce nepřepisuje, datum
        -- znamená „drží nějakou funkci od“ (bonus za funkci v semaforu).
        assigned_by = EXCLUDED.assigned_by
      RETURNING member_id
    ), upd AS (
      UPDATE member t SET
        password_hash   = ${lockHash}::text,
        session_version = t.session_version + 1
      FROM ok
      WHERE t.id = ok.id AND ok.needs_lock
      RETURNING t.id
    )
    SELECT ok.id, ok.name, ok.email,
           EXISTS (SELECT 1 FROM upd WHERE upd.id = ok.id) AS password_created
    FROM ok
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordCreated: Boolean(r.password_created),
    passwordCleared: false,
  };
}

/**
 * Odebrání funkce. Člen BEZ role přijde o přístup: heslo se smaže, zvýší se
 * `session_version` a nepoužité odkazy `set-password` přestanou platit. Člen
 * s rolí si heslo ponechá. Vrací `null`, když funkce nebyla taková, jakou
 * volající viděl (`expectedFunctionId`), cíl je volající (bez `allowSelf`),
 * nebo by zmizel poslední aktivní účet se správou členů.
 */
export async function removeMemberFunctionGuarded(input: {
  targetId: string;
  actorId: string;
  allowSelf: boolean;
  expectedFunctionId: string;
}): Promise<SetFunctionRow | null> {
  const { targetId, actorId, allowSelf, expectedFunctionId } = input;
  const result = await getDb().execute<{
    id: string;
    name: string;
    email: string | null;
    password_cleared: boolean;
  }>(sql`
    WITH managers AS (
      SELECT m.id FROM member m
      WHERE ${memberActiveSql("m")} AND ${memberManagesMembersSql("m")}
      ORDER BY m.id FOR UPDATE OF m
    ), cur AS (
      SELECT t.id, t.name, t.email, t.management_role,
             (SELECT function_id FROM member_function WHERE member_id = t.id) AS old_fn
      FROM member t
      WHERE t.id = ${targetId}::uuid
        AND (${allowSelf}::boolean OR t.id <> ${actorId}::uuid)
        AND ${actorMayChangeSql("t", actorId)}
        AND ${actorIsAdminSql(actorId)}
      FOR UPDATE OF t
    ), ok AS (
      SELECT cur.id, cur.name, cur.email, (cur.management_role IS NULL) AS clears
      FROM cur
      WHERE cur.old_fn = ${expectedFunctionId}::uuid
        AND NOT (
          EXISTS (SELECT 1 FROM managers WHERE managers.id = cur.id)
          AND cur.management_role IS DISTINCT FROM 'admin'
          AND (SELECT count(*) FROM managers WHERE managers.id <> cur.id) = 0
        )
    ), del AS (
      DELETE FROM member_function WHERE member_id IN (SELECT id FROM ok) RETURNING member_id
    ), upd AS (
      UPDATE member t SET password_hash = NULL, session_version = t.session_version + 1
      FROM ok
      WHERE t.id = ok.id AND ok.clears
      RETURNING t.id
    ), revoked AS (
      UPDATE member_login_link SET used_at = now()
      WHERE member_id IN (SELECT id FROM upd)
        AND purpose = 'set-password'
        AND used_at IS NULL
    )
    SELECT ok.id, ok.name, ok.email,
           EXISTS (SELECT 1 FROM upd WHERE upd.id = ok.id) AS password_cleared
    FROM ok
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordCreated: false,
    passwordCleared: Boolean(r.password_cleared),
  };
}

// ── Čtení pro UI správy členů (T-003c) ──

export interface FunctionOption {
  id: string;
  name: string;
}

/** Funkce pro výběr na stránce člena, v pořadí z katalogu. */
export async function listChapterFunctions(): Promise<FunctionOption[]> {
  const result = await getDb().execute<{ id: string; name: string }>(sql`
    SELECT id, name FROM chapter_function ORDER BY display_order ASC, name ASC
  `);
  return result.rows.map((r) => ({ id: r.id, name: r.name }));
}

/** Funkce všech členů najednou (seznam karet): `member_id` -> funkce. */
export async function getMemberFunctionMap(): Promise<Map<string, FunctionOption>> {
  const result = await getDb().execute<{ member_id: string; id: string; name: string }>(sql`
    SELECT mf.member_id, cf.id, cf.name
    FROM member_function mf
    JOIN chapter_function cf ON cf.id = mf.function_id
  `);
  return new Map(result.rows.map((r) => [r.member_id, { id: r.id, name: r.name }]));
}
