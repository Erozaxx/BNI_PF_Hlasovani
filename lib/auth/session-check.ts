/**
 * iter-032 (arch T-001, sekce 7.2) — čistá kontrola session proti DB.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * Bezpečné pro scripts/test-iter-032-access.ts.
 */

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
}

export type SessionCheckResult =
  | { valid: true }
  | {
      valid: false;
      reason: "member-missing" | "version-mismatch" | "role-mismatch" | "link-with-role";
    };

/**
 * Neplatná session, když (7.2 bod 3):
 * - člen neexistuje,
 * - `(cookie.sv ?? 0) !== row.sessionVersion` (N-a: chybějící sv = 0),
 * - u `password` se role v cookie neshoduje s DB,
 * - u `magic_link` a `email_link` je v cookie role jiná než `null`.
 */
export function checkSession(
  cookie: SessionCookieState,
  row: MemberAuthRow | null
): SessionCheckResult {
  if (!row) return { valid: false, reason: "member-missing" };

  if ((cookie.sv ?? 0) !== row.sessionVersion) {
    return { valid: false, reason: "version-mismatch" };
  }

  if (cookie.authMethod === "password") {
    if ((cookie.managementRole ?? null) !== (row.managementRole ?? null)) {
      return { valid: false, reason: "role-mismatch" };
    }
  } else if (cookie.managementRole != null) {
    return { valid: false, reason: "link-with-role" };
  }

  return { valid: true };
}
