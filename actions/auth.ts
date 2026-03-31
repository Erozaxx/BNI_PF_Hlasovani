"use server";

import { redirect } from "next/navigation";
import { compare } from "bcryptjs";
import { getMemberByEmail, getMemberById, updatePasswordHash } from "@/lib/db/queries/members";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { hash } from "bcryptjs";
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
 * Change password action for admin/moderator.
 *
 * - Requires an active management session
 * - Verifies current password via bcrypt.compare
 * - Validates new password (min 8 chars, confirmation match)
 * - Hashes new password (bcrypt cost 12) and persists to DB
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<ActionResult> {
  if (!currentPassword || !newPassword || !confirmPassword) {
    return { success: false, error: "Vsechna pole jsou povinna." };
  }

  if (newPassword.length < 8) {
    return { success: false, error: "Nove heslo musi mit alespon 8 znaku." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Nova hesla se neshoduji." };
  }

  const session = await getSession();
  if (!session.memberId || !session.managementRole) {
    return { success: false, error: "Nemate opravneni pro tuto akci." };
  }

  const member = await getMemberById(session.memberId);
  if (!member || !member.passwordHash) {
    return { success: false, error: "Uzivatel nenalezen." };
  }

  const currentValid = await compare(currentPassword, member.passwordHash);
  if (!currentValid) {
    return { success: false, error: "Aktualni heslo je nespravne." };
  }

  const newHash = await hash(newPassword, 12);
  await updatePasswordHash(session.memberId, newHash);

  return { success: true };
}

/**
 * Logout action — destroys the session and redirects to /login.
 */
export async function logoutAction(): Promise<never> {
  await destroySession();
  redirect("/login");
}
