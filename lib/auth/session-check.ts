/**
 * iter-032 (arch T-001, sekce 7.2) — čistá kontrola session proti DB.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * Bezpečné pro scripts/test-iter-032-access.ts.
 */
import { isMemberActive, pragueToday } from "@/lib/members/activity";

export type ManagementRole = "admin" | "moderator";
export type AuthMethod = "magic_link" | "password" | "email_link";

/** Co je v cookie. Stará cookie z doby před iter-032 nemá `sv`. */
export interface SessionCookieState {
  memberId: string;
  managementRole: ManagementRole | null;
  authMethod: AuthMethod;
  sv?: number;
}

/** Řádek člena z DB (`getMemberAuthState`), `null` = člen neexistuje. */
export interface MemberAuthRow {
  sessionVersion: number;
  managementRole: string | null;
  /**
   * iter-037 (T-003b): deaktivace člena. Chybějící pole = aktivní (starší
   * volající a testy).
   */
  deactivatedAt?: Date | string | null;
  inactiveUntil?: string | null;
  /**
   * iter-037 (T-003b): člen má funkci. Heslo a přihlášení heslem smí mít
   * držitel role NEBO funkce, funkce bez role stačí.
   */
  hasFunction?: boolean;
  /**
   * iter-038 (arch 5.2): kdy člen dostal příznak Správce docházky, `null` =
   * není správce. Chybějící pole = není (starší volající a testy).
   */
  attendanceManagerSince?: Date | string | null;
}

/**
 * iter-037 (arch 6.3): řádek člena včetně funkcí. `checkSession` funkce
 * nepotřebuje, počítá z nich práva `getSession()`.
 */
export interface MemberAuthState extends MemberAuthRow {
  functions: { name: string; permissions: string[] | null }[];
}

export type SessionCheckResult =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "member-missing"
        | "inactive"
        | "version-mismatch"
        | "role-mismatch"
        | "link-with-role"
        | "no-password-access";
    };

/**
 * Neplatná session, když (7.2 bod 3):
 * - člen neexistuje,
 * - člen je neaktivní (iter-037, deaktivace včetně data, vyhodnoceno v Praze;
 *   platí pro všechny tři způsoby přihlášení),
 * - `(cookie.sv ?? 0) !== row.sessionVersion` (N-a: chybějící sv = 0),
 * - u `password` se role v cookie neshoduje s DB,
 * - u `magic_link` a `email_link` je v cookie role jiná než `null`,
 * - u `password` nemá člen v DB ani roli, ani funkci (heslo bez přístupu).
 */
export function checkSession(
  cookie: SessionCookieState,
  row: MemberAuthRow | null,
  todayPrague: string = pragueToday()
): SessionCheckResult {
  if (!row) return { valid: false, reason: "member-missing" };

  if (!isMemberActive({ deactivatedAt: row.deactivatedAt ?? null, inactiveUntil: row.inactiveUntil ?? null }, todayPrague)) {
    return { valid: false, reason: "inactive" };
  }

  if ((cookie.sv ?? 0) !== row.sessionVersion) {
    return { valid: false, reason: "version-mismatch" };
  }

  if (cookie.authMethod === "password") {
    if ((cookie.managementRole ?? null) !== (row.managementRole ?? null)) {
      return { valid: false, reason: "role-mismatch" };
    }
    if (row.managementRole == null && !row.hasFunction) {
      return { valid: false, reason: "no-password-access" };
    }
  } else if (cookie.managementRole != null) {
    return { valid: false, reason: "link-with-role" };
  }

  return { valid: true };
}
