"use server";

import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { getMemberByEmail } from "@/lib/db/queries/members";
import { createSession, destroySession } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/types";

/**
 * Login action for admin/moderator via email + password.
 *
 * - Validates credentials against DB (bcrypt cost 12)
 * - Only allows members with management_role ('admin' or 'moderator')
 * - Creates an 8-hour session with authMethod: 'password'
 */
export async function loginAction(
  email: string,
  password: string
): Promise<ActionResult> {
  if (!email || !password) {
    return { success: false, error: "Email a heslo jsou povinne." };
  }

  const member = await getMemberByEmail(email);

  // Generic error — no user enumeration
  if (!member) {
    return { success: false, error: "Neplatne prihlasovaci udaje." };
  }

  // Only management roles can log in with password
  if (!member.managementRole) {
    return { success: false, error: "Neplatne prihlasovaci udaje." };
  }

  if (!member.passwordHash) {
    return { success: false, error: "Neplatne prihlasovaci udaje." };
  }

  const passwordValid = await compare(password, member.passwordHash);
  if (!passwordValid) {
    return { success: false, error: "Neplatne prihlasovaci udaje." };
  }

  await createSession({
    memberId: member.id,
    managementRole: member.managementRole as "admin" | "moderator",
    authMethod: "password",
    name: member.name,
  });

  redirect("/dashboard");
}

/**
 * Logout action — destroys the session and redirects to /login.
 */
export async function logoutAction(): Promise<never> {
  await destroySession();
  redirect("/login");
}
