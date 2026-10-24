"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { compare, hash } from "bcryptjs";
import { getMemberByEmail, getMemberById, setOwnPassword } from "@/lib/db/queries/members";
import { createSession, destroySession } from "@/lib/auth/session";
import { requirePasswordSession } from "@/lib/auth/guards";
import { hasPasswordAccess } from "@/lib/auth/permissions";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
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

/** Gate K18: o deaktivaci se člen dozví až po správném hesle. */
const ACCESS_PAUSED_TEXT = "Přístup máš teď pozastavený. Když je to omyl, ozvi se adminovi.";

/**
 * Login action for admin/moderator via email + password.
 *
 * iter-032 (arch 9.3, K11, K13, N1, N2, N8):
 * - e-mail bez ohledu na velikost písmen,
 * - throttle `throttleHit` atomicky před porovnáním: dvojice e-mail a IP 10,
 *   e-mail 50, IP 20 za 10 minut; počítá se i neexistující e-mail,
 * - dummy bcrypt u neexistujícího e-mailu a člena bez role,
 * - session nese `session_version` z řádku člena,
 * - po úspěchu se smaže jen klíč dvojice,
 * - iter-037 (T-003b): heslo má držitel role NEBO funkce (funkce bez role stačí),
 *   neaktivní člen se nepřihlásí ani se správným heslem (K18: hláška až po
 *   ověření hesla, bez hesla se o deaktivaci nic nedozví, session nevznikne).
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

  const hasAccess =
    !!member &&
    hasPasswordAccess({
      managementRole: member.managementRole,
      hasFunction: member.hasFunction,
    });
  const usableHash =
    member && hasAccess && member.passwordHash ? member.passwordHash : DUMMY_PASSWORD_HASH;
  const passwordValid = await compare(password, usableHash);

  // Generic error - no user enumeration
  if (!member || !hasAccess || !member.passwordHash || !passwordValid) {
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

  // Správné heslo, ale člen je deaktivovaný: session nevznikne.
  if (!isMemberActive(member, pragueToday())) {
    return { success: false, error: ACCESS_PAUSED_TEXT };
  }

  await createSession(
    {
      memberId: member.id,
      managementRole: (member.managementRole as "admin" | "moderator" | null) ?? null,
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
    return { success: false, error: "Vyplň všechna pole." };
  }

  if (newPassword.length < 8) {
    return { success: false, error: "Nové heslo musí mít aspoň 8 znaků." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Nová hesla se neshodují." };
  }

  const auth = await requirePasswordSession();
  if (!auth.success) {
    return { success: false, error: auth.error };
  }
  const { session } = auth;

  try {
    const member = await getMemberById(session.memberId);
    if (!member) {
      return { success: false, error: "Uživatel nenalezen." };
    }

    // If member already has a password, verify current password first
    if (member.passwordHash) {
      if (!currentPassword) {
        return { success: false, error: "Zadej aktuální heslo." };
      }
      const currentValid = await compare(currentPassword, member.passwordHash);
      if (!currentValid) {
        return { success: false, error: "Aktuální heslo nesedí." };
      }
      const sameAsCurrent = await compare(newPassword, member.passwordHash);
      if (sameAsCurrent) {
        return { success: false, error: "Nové heslo musí být jiné než současné." };
      }
    }

    const newHash = await hash(newPassword, 12);
    const updated = await setOwnPassword(session.memberId, newHash);
    if (!updated) {
      return { success: false, error: "Na tohle nemáš oprávnění." };
    }

    await createSession(
      {
        memberId: session.memberId,
        managementRole: (updated.managementRole as "admin" | "moderator" | null) ?? null,
        authMethod: "password",
        name: updated.name,
      },
      updated.sessionVersion
    );

    return { success: true };
  } catch (err) {
    const cls = err instanceof Error ? err.name : typeof err;
    console.error(`[changePasswordAction] failed memberId=${session.memberId}: ${cls}`);
    return { success: false, error: "Heslo se nepodařilo změnit. Zkus to znovu." };
  }
}

/**
 * Logout action - destroys the session and redirects to /login.
 */
export async function logoutAction(): Promise<never> {
  await destroySession();
  redirect("/login");
}
