/**
 * iter-037 (arch 6.1, 6.2, změna zadání 19. 10.): katalog práv a jediné místo
 * rozhodnutí, co smí session dělat.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * Bezpečné pro scripts/test-iter-037-members.ts.
 *
 * Každý guard v aplikaci se ptá na konkrétní právo, ne na roli. Práva session
 * se počítají v `getSession()` z `member.management_role` a funkce člena:
 *
 * 1. přihlášení odkazem (`authMethod !== "password"`) = práva člena, tedy
 *    prázdná množina (iter-032 6.4), i pro Prezidenta a Viceprezidenta.
 *    JEDINÁ výjimka (iter-038, K1 A): příznak Správce docházky přidá tři práva
 *    docházky (`ATTENDANCE_MANAGER_PERMISSIONS`) bez ohledu na způsob přihlášení,
 * 2. admin = všechna práva,
 * 3. jinak je to SJEDNOCENÍ práv role a práv funkce. Role `moderator` dává
 *    `MODERATOR_ROLE_PERMISSIONS` (dnešní moderátor, iter-041 Z7). Funkce (nejvýš jedna:
 *    Prezident, Viceprezident, Člen výboru) dává `chapter_function.permissions`,
 *    `NULL` = `DEFAULT_FUNCTION_PERMISSIONS`. V datech mají Prezident a
 *    Viceprezident značku `ADMIN_DELEGABLE_MARKER` (= všechna práva admina
 *    kromě nedelegovatelných, počítá se z AKTUÁLNÍHO katalogu, ne ze snímku),
 *    Člen výboru `NULL`. Rozhodnutí Toma 19. 10. (M-1): `NON_DELEGABLE`
 *    (`access.manage`, `functions.manage`) nedostane žádná funkce, ani kdyby je
 *    měla v datech. Roli admin a funkce, hesla a odkaz admina mění jen admin,
 * 4. držitel funkce BEZ role má heslo i práva (T-003b, rozhodnutí 19. 10.):
 *    CHECK `member_password_only_for_management` je pryč, pravidlo „heslo jen
 *    s rolí nebo funkcí“ žije tady (`hasPasswordAccess`). Bez role i bez funkce
 *    je množina prázdná (fail closed).
 */

import type { AuthMethod } from "@/lib/auth/session-check";

export const PERMISSIONS = [
  "guests.manage",
  "guests.promote",
  "guests.delete",
  "categories.create",
  "categories.manage",
  "meetings.manage",
  "meetings.delete",
  "events.manage",
  "events.delete",
  "timers.manage",
  "interviews.manage",
  "interviewQuestions.manage",
  "ops.view",
  "mastermind.manage",
  "burza.manage",
  "members.manage",
  "members.deactivate",
  "members.delete",
  "access.manage",
  "functions.manage",
  // iter-038 (arch 5.1): docházka. P a VP je dostanou značkou `admin-delegable`
  // bez migrace dat, Člen výboru a moderátor ne (vidí jen svou docházku).
  "attendance.record",
  "attendance.view_all",
  "attendance.audit_view",
  "attendance.edit_history",
  // iter-040: zakládání a rušení interní schůzky v docházce.
  "attendance.internal_manage",
  // iter-041 (gate Z7): semafor. `view_all` = přehled se jmény (výchozí sada
  // FUNKCE, ne role moderátor), `import` = nahrávání souboru a mazání (jen
  // admin a značka `admin-delegable`, tedy Prezident a Viceprezident).
  "semafor.view_all",
  "semafor.import",
  // iter-044 (gate Q4 A): vlastní body semaforu (školení, přivedený host, akce,
  // mazání záznamů). Výchozí sada FUNKCE (Člen výboru), P a VP značkou, admin
  // vždy; ne role moderátor. Ostatní práci navíc smí udělit jen držitel funkce
  // s `area = COMMITTEE_FUNCTION_AREA`.
  "semafor.points",
  // iter-042 (gate BK1): Nastavení chapteru (/admin/nastaveni). Mimo
  // `NON_DELEGABLE`, takže ho přes značku dostane Prezident a Viceprezident.
  // Není v sadě moderátora ani Člena výboru.
  "chapter.settings",
  // iter-043 (gate K13 A): reset hesla člena vedení. Delegovatelné, je v sadě
  // role moderátor, takže ho má i Člen výboru, Prezident a Viceprezident.
  // `access.manage` (role, funkce, odkaz ke zkopírování) zůstává jen adminovi.
  "access.password_reset",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Práva ROLE `moderator` (bez funkce) = dnešní moderátor (arch 6.1, sloupec
 * „Výchozí sada“). iter-041 (gate Z7): oddělená konstanta, aby přidání
 * `semafor.view_all` do výchozí sady funkce nedalo jména i moderátorovi bez
 * funkce. Tom: „právo jen funkci, moderátor může být i někdo, kdo není člen
 * výboru a nemá vidět detaily semaforu“. Test 9a ji hlídá proti tabulce.
 */
export const MODERATOR_ROLE_PERMISSIONS: readonly Permission[] = [
  "guests.manage",
  "guests.promote",
  "categories.create",
  "meetings.manage",
  "events.manage",
  "timers.manage",
  "interviews.manage",
  "interviewQuestions.manage",
  "ops.view",
  "mastermind.manage",
  "burza.manage",
  "attendance.internal_manage",
  // iter-043 (gate K13 A): reset hesla člena vedení.
  "access.password_reset",
];

/** Role `moderator` dává právo `permission` (SQL pojistka čte sadu role odsud, ne z opsaného seznamu). */
export function roleGrants(role: "moderator", permission: Permission): boolean {
  return role === "moderator" && MODERATOR_ROLE_PERMISSIONS.includes(permission);
}

/**
 * Výchozí sada FUNKCE (`chapter_function.permissions = NULL`, tedy Člen výboru):
 * práva moderátora plus přehled semaforu se jmény. NULL zůstává „výchozí sada“
 * a dál dostává budoucí změny. Funkce s ručně upraveným seznamem nové právo
 * nedostane, admin ho tam přidá ve správě funkcí.
 */
export const DEFAULT_FUNCTION_PERMISSIONS: readonly Permission[] = [
  ...MODERATOR_ROLE_PERMISSIONS,
  "semafor.view_all",
  "semafor.points",
];

/**
 * iter-044 (Tom 30. 10.): ostatní práci pro chapter v semaforu uděluje jen
 * držitel funkce s tímhle `chapter_function.area` (dnes jen Člen výboru).
 * Právo `semafor.points` to vyjádřit neumí (značka `admin-delegable` ho dá i
 * Prezidentovi a Viceprezidentovi, admin ho má vždy), proto druhá podmínka
 * v SQL (`actorHoldsCommitteeFunctionSql`). Jde jako bind parametr.
 */
export const COMMITTEE_FUNCTION_AREA = "vybor";

/**
 * iter-038 (arch 5.2, gate K1 A, Z4): práva, která dává příznak „Správce
 * docházky“ (`member.attendance_manager_since`) bez ohledu na způsob přihlášení,
 * tedy i přihlášení odkazem z mailu. Přesně čtyři (iter-040 přidala `attendance.internal_manage`). `attendance.edit_history`
 * (zpětné opravy) příznak nedává nikdy, ani Prezidentovi s příznakem přihlášenému
 * odkazem. Jediné místo, kde se ta výjimka z iter-032 dělá, je `permissionsFor`.
 */
export const ATTENDANCE_MANAGER_PERMISSIONS: readonly Permission[] = [
  "attendance.record",
  "attendance.view_all",
  "attendance.audit_view",
  "attendance.internal_manage",
];

/**
 * Práva, která funkce nikdy nedostane (rozhodnutí Toma 19. 10., M-1): přidělování
 * role admin a funkcí patří jen roli admin (reset hesla je samostatné delegovatelné právo). Jediné místo, kde se to
 * rozhoduje, `permissionsFor` filtruje funkce přes tenhle seznam.
 */
export const NON_DELEGABLE: readonly Permission[] = ["access.manage", "functions.manage"];

const NON_DELEGABLE_SET: ReadonlySet<string> = new Set(NON_DELEGABLE);

/** Všechna práva katalogu, která smí dostat funkce (admin bez nedelegovatelných). */
export const DELEGABLE_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => !NON_DELEGABLE_SET.has(p)
);

/**
 * Značka v `chapter_function.permissions` (jediný prvek pole): „všechna práva
 * admina kromě nedelegovatelných“. Odvozuje se z aktuálního katalogu při každém
 * výpočtu, takže nové právo v `PERMISSIONS` dostanou Prezident a Viceprezident
 * hned, bez migrace (review MIN-2). Není to `Permission`.
 */
export const ADMIN_DELEGABLE_MARKER = "admin-delegable";

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/**
 * Práva funkce z dat: `NULL` = výchozí sada, značka = všechna delegovatelná
 * práva, jinak jmenovitě (neznámé klíče se ignorují). Nedelegovatelná práva
 * vypadnou vždy.
 */
export function expandFunctionPermissions(raw: readonly string[] | null): Permission[] {
  const granted = new Set<Permission>();
  if (raw === null) {
    for (const p of DEFAULT_FUNCTION_PERMISSIONS) granted.add(p);
  } else {
    for (const value of raw) {
      if (value === ADMIN_DELEGABLE_MARKER) {
        for (const p of DELEGABLE_PERMISSIONS) granted.add(p);
      } else if (isPermission(value)) {
        granted.add(value);
      }
    }
  }
  return [...granted].filter((p) => !NON_DELEGABLE_SET.has(p));
}

/**
 * Funkce z dat dává právo `permission` (stejné pravidlo jako
 * `expandFunctionPermissions`, SQL protějšek je `functionGrantsSql`).
 */
export function functionGrants(raw: readonly string[] | null, permission: Permission): boolean {
  return expandFunctionPermissions(raw).includes(permission);
}

/** Session je admin přihlášený heslem (role, ne funkce). Jen takový smí měnit účet admina. */
export function isAdminSession(
  session: { authMethod?: AuthMethod; managementRole?: string | null } | null | undefined
): boolean {
  return !!session && session.authMethod === "password" && session.managementRole === "admin";
}

/** Účet s rolí admin smí měnit jen admin (rozhodnutí Toma 19. 10.). Ostatní cíle smí každý s právem. */
export function mayChangeMember(actorIsAdmin: boolean, targetRole: string | null | undefined): boolean {
  return targetRole !== "admin" || actorIsAdmin;
}

export const ADMIN_ONLY_MESSAGE = "Účet admina může měnit jen admin.";

export type PasswordResetDenied =
  | "no-permission"
  | "self"
  | "admin-target"
  | "not-found"
  | "no-access";

/**
 * iter-043 (gate změna 3): jediné místo pravdy pro „smí volající resetovat
 * heslo cíli“. Pořadí kontrol: právo, sebe, cíl existuje, účet admina, cíl má
 * přístup k heslu (role nebo funkce). Hlášky zůstávají v akcích.
 */
export function decidePasswordReset(input: {
  actorId: string;
  actorIsAdmin: boolean;
  actorMayReset: boolean;
  target: { id: string; managementRole: string | null; hasPasswordAccess: boolean } | null;
}): { ok: true } | { ok: false; reason: PasswordResetDenied } {
  if (!input.actorMayReset) return { ok: false, reason: "no-permission" };
  if (input.target && input.target.id === input.actorId) return { ok: false, reason: "self" };
  if (!input.target) return { ok: false, reason: "not-found" };
  if (!mayChangeMember(input.actorIsAdmin, input.target.managementRole)) {
    return { ok: false, reason: "admin-target" };
  }
  if (!input.target.hasPasswordAccess) return { ok: false, reason: "no-access" };
  return { ok: true };
}

/** Funkce člena tak, jak ji čte `getMemberAuthState`. */
export interface MemberFunctionInfo {
  name: string;
  permissions: string[] | null;
}

/**
 * Člen má skutečné heslo: hash existuje a člen nečeká na odkaz „nastav si
 * heslo“. Zámkový hash (povýšení, první funkce, reset) není heslo, nejde jím
 * přihlásit (review MIN-1). Čekající odkaz = nepoužitý `set-password` v DB.
 */
export function hasRealPassword(input: {
  hasHash: boolean;
  pendingSetPasswordLink: boolean;
}): boolean {
  return input.hasHash && !input.pendingSetPasswordLink;
}

/**
 * Jedno místo pravdy pro „smí mít heslo a přihlásit se jím“ (T-003b): člen má
 * roli (admin, moderator), NEBO aspoň jednu funkci. Dřív to hlídal CHECK
 * `member_password_only_for_management` (jen role), ten CHECK nemůže číst
 * `member_function`, proto je pravidlo v aplikaci.
 */
export function hasPasswordAccess(input: {
  managementRole: string | null | undefined;
  hasFunction: boolean;
}): boolean {
  return !!input.managementRole || input.hasFunction;
}

/** Session s heslem a přístupem (role nebo funkce). Pro nastavení hesla a menu. */
export function hasPasswordSession(
  session:
    | {
        authMethod: AuthMethod;
        managementRole: string | null;
        functionNames?: readonly string[];
      }
    | null
    | undefined
): boolean {
  if (!session || session.authMethod !== "password") return false;
  return hasPasswordAccess({
    managementRole: session.managementRole,
    hasFunction: (session.functionNames?.length ?? 0) > 0,
  });
}

export function permissionsFor(input: {
  authMethod: AuthMethod;
  managementRole: "admin" | "moderator" | null;
  functions: readonly MemberFunctionInfo[];
  /** iter-038: člen má příznak Správce docházky (`attendance_manager_since`). */
  attendanceManager: boolean;
}): ReadonlySet<Permission> {
  const result = new Set<Permission>(basePermissions(input));
  // K1 A (gate Z4): příznak dává čtyři práva docházky i při přihlášení odkazem.
  // Nic jiného z toho nevznikne, `attendance.edit_history` ani `members.*`.
  if (input.attendanceManager) {
    for (const p of ATTENDANCE_MANAGER_PERMISSIONS) result.add(p);
  }
  return result;
}

function basePermissions(input: {
  authMethod: AuthMethod;
  managementRole: "admin" | "moderator" | null;
  functions: readonly MemberFunctionInfo[];
}): ReadonlySet<Permission> {
  if (input.authMethod !== "password") return new Set();

  if (input.managementRole === "admin") return new Set(PERMISSIONS);

  // Role moderator dává výchozí sadu, držitel funkce bez role začíná prázdný a
  // dostane jen práva funkce. Bez role i bez funkce zůstane množina prázdná.
  const result = new Set<Permission>(
    input.managementRole === "moderator" ? MODERATOR_ROLE_PERMISSIONS : []
  );
  for (const fn of input.functions) {
    // Značka i výchozí sada se rozbalí z aktuálního katalogu, NON_DELEGABLE vypadne.
    for (const p of expandFunctionPermissions(fn.permissions)) result.add(p);
  }
  return result;
}

/** Nejmenší tvar session, který `can` potřebuje (prázdná session = `false`). */
export interface PermissionHolder {
  permissions?: readonly Permission[];
}

export function can(
  session: PermissionHolder | null | undefined,
  permission: Permission
): boolean {
  return session?.permissions?.includes(permission) ?? false;
}

/** Aspoň jedno z práv. */
export function canAny(
  session: PermissionHolder | null | undefined,
  permissions: readonly Permission[]
): boolean {
  return permissions.some((p) => can(session, p));
}

/** Česká hláška pro `requirePermission` a API routes (gate, sekce 5). */
export const NO_PERMISSION_MESSAGE = "Na tohle nemáš oprávnění.";
