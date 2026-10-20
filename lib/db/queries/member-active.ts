/**
 * iter-037 (T-003b, arch 4.2): SQL protějšek `isMemberActive` z
 * lib/members/activity.ts. Dnešek se počítá v DB v Europe/Prague, takže
 * aktivita se vyhodnocuje při každém čtení a na cronu nestojí.
 *
 * Alias se skládá přes `sql.raw` JEN z pevných literálů v kódu (typ
 * `MemberAlias`), nikdy ze vstupu. Statický test 12a hlídá, že se funkce volá
 * jen s řetězcovým literálem.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  ADMIN_DELEGABLE_MARKER,
  DEFAULT_FUNCTION_PERMISSIONS,
  NON_DELEGABLE,
  type Permission,
} from "@/lib/auth/permissions";

/** Povolené aliasy tabulky `member` v dotazech. Přidávat jen pevné literály. */
export type MemberAlias = "member" | "m" | "p" | "hm" | "rm" | "pm" | "t" | "o" | "gm";

export function memberActiveSql(alias: MemberAlias): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.deactivated_at IS NULL OR COALESCE(${a}.inactive_until < (now() AT TIME ZONE 'Europe/Prague')::date, false))`;
}

/**
 * SQL protějšek `functionGrants` (lib/auth/permissions.ts): `perms` (sloupec
 * `chapter_function.permissions`) dává právo `permission`. `NULL` = výchozí
 * sada, značka `admin-delegable` = všechna delegovatelná práva, jinak jmenovitě.
 * Nedelegovatelná práva nedává nikdy. `permission` je typ `Permission`, ne
 * vstup, jde jako bind parametr.
 */
export function functionGrantsSql(perms: SQL, permission: Permission): SQL {
  if (NON_DELEGABLE.includes(permission)) return sql`false`;
  const viaDefault = DEFAULT_FUNCTION_PERMISSIONS.includes(permission)
    ? sql`${perms} IS NULL OR `
    : sql``;
  return sql`(${viaDefault}(${perms} IS NOT NULL AND (${permission}::text = ANY(${perms}) OR ${ADMIN_DELEGABLE_MARKER}::text = ANY(${perms}))))`;
}

/**
 * Člen má funkci, jejíž `chapter_function.permissions` dává `members.manage`
 * (značka „admin bez nedelegovatelných“ ano, `NULL` = výchozí sada ne). Heslo
 * ani aktivita se tu nekontrolují.
 */
export function memberHasManageFunctionSql(alias: MemberAlias): SQL {
  const a = sql.raw(alias);
  return sql`EXISTS (
    SELECT 1 FROM member_function mf
    JOIN chapter_function cf ON cf.id = mf.function_id
    WHERE mf.member_id = ${a}.id
      AND ${functionGrantsSql(sql`cf.permissions`, "members.manage")}
  )`;
}

/**
 * Rozhodnutí Toma 19. 10. (M-1): účet s rolí admin smí měnit jen admin. Cíl
 * (alias) není admin, NEBO volající (`actorId`) je v DB admin (role, ne
 * funkce). Slouží jako podmínka ve WHERE každého zápisu do cizího člena, UI jen
 * skrývá. Volající může měnit i sám sebe (je admin).
 */
export function actorMayChangeSql(alias: MemberAlias, actorId: string): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.management_role IS DISTINCT FROM 'admin' OR ${actorIsAdminSql(actorId)})`;
}

/** Volající je v DB admin (jen role admin dává `access.manage`, tohle je druhá pojistka v SQL). */
export function actorIsAdminSql(actorId: string): SQL {
  return sql`EXISTS (SELECT 1 FROM member adm WHERE adm.id = ${actorId}::uuid AND adm.management_role = 'admin')`;
}

/**
 * Účet se správou členů: člen s heslem, který je admin, nebo má funkci
 * s právem `members.manage`. Slouží pojistce „poslední účet se správou členů“
 * (odebrání role, odebrání funkce, deaktivace, smazání). Bez aktivity:
 * kombinuje se s `memberActiveSql` tam, kde se počítají jen aktivní účty.
 * Heslo se počítá, protože bez něj se držitel funkce nepřihlásí. Počítá se i
 * zámkový hash (člen ještě nenastavil heslo z mailu): nevadí, protože volající
 * akce je vždy přihlášený aktivní správce (sebe měnit nesmí), takže po změně
 * aspoň jeden použitelný účet zůstane (review NIT-2). Kdyby vznikla funkce s
 * `members.deactivate` bez `members.manage`, tuhle vlastnost je nutné přehodnotit.
 */
export function memberManagesMembersSql(alias: MemberAlias): SQL {
  const a = sql.raw(alias);
  return sql`(${a}.password_hash IS NOT NULL AND (${a}.management_role = 'admin' OR ${memberHasManageFunctionSql(alias)}))`;
}
