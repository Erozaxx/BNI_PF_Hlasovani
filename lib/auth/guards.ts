import { NextResponse } from "next/server";
import { getSession, type SessionData } from "@/lib/auth/session";
import {
  can,
  hasPasswordSession,
  NO_PERMISSION_MESSAGE,
  type Permission,
} from "@/lib/auth/permissions";

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
 * iter-037 (arch 6.3): guard na konkrétní právo místo role. Chyba je česká
 * hláška z gate (N7). Nepřihlášený dostane „Not authenticated“ jako dřív.
 */
export async function requirePermission(
  permission: Permission
): Promise<AuthSuccess | AuthFailure> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  if (!can(authResult.session, permission)) {
    return { success: false, error: NO_PERMISSION_MESSAGE };
  }

  return authResult;
}

/**
 * iter-037: akce, která patří jen k session s heslem (`changePasswordAction`).
 * Přihlášení odkazem ani člen bez role ji nesmí.
 */
export async function requirePasswordSession(): Promise<AuthSuccess | AuthFailure> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  // T-003b: heslo má držitel role NEBO funkce (hasPasswordAccess).
  if (!hasPasswordSession(authResult.session)) {
    return { success: false, error: NO_PERMISSION_MESSAGE };
  }

  return authResult;
}

/**
 * iter-037 (arch 6.6): sjednocený guard pro API routes (dřív 11 kopií
 * `isManagement` ručně). Vrací buď session (`{ session }`), nebo hotovou
 * odpověď (`{ response }`). Bez práva i bez session je to 401 s českou
 * hláškou (QA S18), `status` jde přepsat tam, kde route dřív vracela jiný kód.
 * `splitStatus` (iter-038) rozliší 401 bez session a 403 bez práva.
 *
 *   const authz = await requirePermissionForRoute("meetings.manage");
 *   if ("response" in authz) return authz.response;
 *   const { session } = authz;
 */
export async function requirePermissionForRoute(
  permission: Permission | readonly Permission[],
  opts?: { status?: number; splitStatus?: boolean }
): Promise<{ session: SessionData } | { response: NextResponse }> {
  const session = await getSession();
  const required = Array.isArray(permission) ? permission : [permission];
  const allowed =
    !!session.memberId && required.every((p) => can(session, p as Permission));
  if (!allowed) {
    // iter-038: `splitStatus` = 401 jen bez session, 403 pro přihlášeného bez práva.
    if (opts?.splitStatus && session.memberId) {
      return {
        response: NextResponse.json({ error: NO_PERMISSION_MESSAGE }, { status: 403 }),
      };
    }
    return {
      response: NextResponse.json(
        { error: NO_PERMISSION_MESSAGE },
        { status: opts?.status ?? 401 }
      ),
    };
  }
  return { session };
}
