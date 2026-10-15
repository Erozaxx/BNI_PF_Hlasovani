import { getSession, type SessionData } from "@/lib/auth/session";

type AuthSuccess = { success: true; session: SessionData };
type AuthFailure = { success: false; error: string };

/**
 * Require an authenticated session.
 * Returns session data on success, or { success: false, error } on failure.
 * Never throws for auth failures.
 *
 * iter-032 (7.2): getSession() už vrací ověřenou session (verze a role
 * proti DB), sesazený člen tu neprojde.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const session = await getSession();

  if (!session.memberId) {
    return { success: false, error: "Not authenticated" };
  }

  return { success: true, session };
}

/**
 * Require a specific management role (or one of several).
 * Checks that the user is authenticated AND has one of the required roles.
 */
export async function requireManagementRole(
  roles: Array<"admin" | "moderator">
): Promise<AuthSuccess | AuthFailure> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const { session } = authResult;
  if (!session.managementRole || !roles.includes(session.managementRole)) {
    return {
      success: false,
      error: "Insufficient permissions",
    };
  }

  return authResult;
}

/**
 * Shorthand: require admin role.
 */
export async function requireAdmin(): Promise<AuthSuccess | AuthFailure> {
  return requireManagementRole(["admin"]);
}
