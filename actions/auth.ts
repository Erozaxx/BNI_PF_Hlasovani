"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { compare, hash } from "bcryptjs";
import { getMemberByEmail, getMemberById, setOwnPassword } from "@/lib/db/queries/members";
import { createSession, destroySession, getSession } from "@/lib/auth/session";
import { getClientIp, throttleClear, throttleHit } from "@/lib/auth/throttle";
import {
  THROTTLE_BLOCKED_TEXT,
  THROTTLE_WINDOW_MINUTES,
  findBlockedRule,
  normalizeEmail,
  passwordLoginPairKey,
  passwordLoginThrottleRules,
} from "@/lib/auth/login-link-core";
import type { ActionResult } from "@/lib/types";

/**
 * Pevný bcrypt hash (cost 12) náhodného řetězce, který nikdo nezná (iter-032,
 * N2). Porovnává se proti němu, když e-mail neexistuje nebo člen nemá roli,
 * ať doba odpovědi neprozradí, kdo má účet vedení.
 */
const DUMMY_PASSWORD_HASH =
  "$2a$12$DTb6OUE7ltOkZPkrGpivju.8oEGT3fCW0rTEI0yyf/rYwDVFQICJS";

const INVALID_CREDENTIALS = "Neplatné přihlašovací údaje.";

/**
 * Login action for admin/moderator via email + password.
 *
 * iter-032 (arch 9.3, K11, K13, N1, N2, N8):
 * - e-mail bez ohledu na velikost písmen,
 * - throttle `throttleHit` atomicky před porovnáním: dvojice e-mail a IP 10,
 *   e-mail 50, IP 20 za 10 minut; počítá se i neexistující e-mail,
 * - dummy bcrypt u neexistujícího e-mailu a člena bez role,
 * - session nese `session_version` z řádku člena,
 * - po úspěchu se smaže jen klíč dvojice.
 */
export async function loginAction(
  email: string,
  password: string
): Promise<ActionResult> {
  if (!email || !password) {
    return { success: false, error: "E-mail a heslo jsou povinné." };
  }

  const normalizedEmail = normalizeEmail(email);
  const ip = getClientIp(await headers());
  if (ip === "unknown") {
    console.warn("[loginAction] chybí x-forwarded-for, throttle jen na e-mail");
  }

  let member: Awaited<ReturnType<typeof getMemberByEmail>>;
  try {
    const rules = passwordLoginThrottleRules(normalizedEmail, ip);
    const counts = await throttleHit(
      rules.map((r) => r.key),
      THROTTLE_WINDOW_MINUTES
    );
    if (findBlockedRule(rules, counts)) {
      return { success: false, error: THROTTLE_BLOCKED_TEXT };
    }

    member = await getMemberByEmail(normalizedEmail);
  } catch (err) {
    const cls = err instanceof Error ? err.name : typeof err;
    console.error(`[loginAction] throttle/lookup failed: ${cls}`);
    return { success: false, error: "Přihlášení se nepovedlo, zkus to znovu." };
  }

  const usableHash =
    member && member.managementRole && member.passwordHash
      ? member.passwordHash
      : DUMMY_PASSWORD_HASH;
  const passwordValid = await compare(password, usableHash);

  // Generic error — no user enumeration
  if (!member || !member.managementRole || !member.passwordHash || !passwordValid) {
    return { success: false, error: INVALID_CREDENTIALS };
  }

  const pairKey = passwordLoginPairKey(normalizedEmail, ip);
  if (pairKey) {
    try {
      await throttleClear(pairKey);
    } catch (err) {
      const cls = err instanceof Error ? err.name : typeof err;
      console.error(`[loginAction] throttle clear failed memberId=${member.id}: ${cls}`);
    }
  }

  await createSession(
    {
      memberId: member.id,
      managementRole: member.managementRole as "admin" | "moderator",
      authMethod: "password",
      name: member.name,
    },
    member.sessionVersion
  );

  redirect("/dashboard");
}

/**
 * Change password action for admin/moderator.
 *
 * - Requires an active (verified) management session
 * - Verifies current password via bcrypt.compare
 * - Validates new password (min 8 chars, confirmation match)
 * - iter-032 (5.4, N6, F10): odmítne heslo shodné se současným, jeden UPDATE
 *   uloží hash a zvýší `session_version`, nová cookie s novou verzí drží
 *   aktuální zařízení přihlášené, ostatní session končí.
 */
export async function changePasswordAction(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<ActionResult> {
  if (!newPassword || !confirmPassword) {
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

  try {
    const member = await getMemberById(session.memberId);
    if (!member) {
      return { success: false, error: "Uzivatel nenalezen." };
    }

    // If member already has a password, verify current password first
    if (member.passwordHash) {
      if (!currentPassword) {
        return { success: false, error: "Zadejte aktualni heslo." };
      }
      const currentValid = await compare(currentPassword, member.passwordHash);
      if (!currentValid) {
        return { success: false, error: "Aktualni heslo je nespravne." };
      }
      const sameAsCurrent = await compare(newPassword, member.passwordHash);
      if (sameAsCurrent) {
        return { success: false, error: "Nove heslo musi byt jine nez soucasne." };
      }
    }

    const newHash = await hash(newPassword, 12);
    const updated = await setOwnPassword(session.memberId, newHash);
    if (!updated) {
      return { success: false, error: "Nemate opravneni pro tuto akci." };
    }

    await createSession(
      {
        memberId: session.memberId,
        managementRole: updated.managementRole as "admin" | "moderator",
        authMethod: "password",
        name: updated.name,
      },
      updated.sessionVersion
    );

    return { success: true };
  } catch (err) {
    const cls = err instanceof Error ? err.name : typeof err;
    console.error(`[changePasswordAction] failed memberId=${session.memberId}: ${cls}`);
    return { success: false, error: "Nepodarilo se zmenit heslo. Zkuste to znovu." };
  }
}

/**
 * Logout action — destroys the session and redirects to /login.
 */
export async function logoutAction(): Promise<never> {
  await destroySession();
  redirect("/login");
}
