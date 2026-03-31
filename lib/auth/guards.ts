import { getSession, type SessionData } from "@/lib/auth/session";

type AuthSuccess = { success: true; session: SessionData };
type AuthFailure = { success: false; error: string };

/**
 * Require an authenticated session.
 * Returns session data on success, or { success: false, error } on failure.
 * Never throws for auth failures.
 */
export async function requireAuth(): Promise<AuthSuccess | AuthFailure> {
  const session = await getSession();

  if (!session.memberId) {
    return { success: false, error: "Not authenticated" };
  }

  return {
    success: true,
    session: {
      memberId: session.memberId,
      managementRole: session.managementRole,
      authMethod: session.authMethod,
      name: session.name,
    },
  };
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
