"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { compare, hash } from "bcryptjs";
import {
  getMemberAuthState,
  getMemberByEmail,
  getMemberById,
  setOwnPasswordGuarded,
} from "@/lib/db/queries/members";
import { sendPasswordChangedNoticeEmail } from "@/lib/email/resend";
import { createSession, destroySession } from "@/lib/auth/session";
import { requireAuth } from "@/lib/auth/guards";
import {
  decideOwnPasswordMode,
  hasRealPassword,
  isLeadershipAccount,
} from "@/lib/auth/permissions";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
import { getClientIp, throttleClear, throttleHit } from "@/lib/auth/throttle";
import {
  THROTTLE_BLOCKED_TEXT,
  THROTTLE_WINDOW_MINUTES,
  findBlockedRule,
  normalizeEmail,
  passwordChangeThrottleRule,
  passwordLoginPairKey,
  passwordLoginThrottleRules,
  PASSWORD_TEXTS,
} from "@/lib/auth/login-link-core";
import type { ActionResult } from "@/lib/types";

/**
 * Pevný bcrypt hash (cost 12) náhodného řetězce, který nikdo nezná (iter-032,
 * N2). Porovnává se proti němu, když e-mail neexistuje nebo člen nemá heslo,
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
 * - iter-046 (P1): heslo smí mít každý člen, brána „jen vedení“ je pryč,
 *   práva dál počítá jen `permissionsFor` z role a funkce v DB,
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

  const usableHash = member?.passwordHash ?? DUMMY_PASSWORD_HASH;
  const passwordValid = await compare(password, usableHash);

  // Generic error - no user enumeration
  if (!member || !member.passwordHash || !passwordValid) {
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
 * Nastavení a změna vlastního hesla (iter-046, arch 8.4).
 *
 * Režim určuje `decideOwnPasswordMode` z čerstvého stavu v DB:
 * - `set`: běžný člen bez skutečného hesla, staré heslo se nechce,
 * - `change`: kdokoli se skutečným heslem, staré heslo + throttle `pw-change`
 *   (limit 10 za 10 minut, před `compare`),
 * - `via-link`: vedení bez hesla, v aplikaci si ho nenastaví (jen odkaz od vedení).
 * Zápis je jeden příkaz s pojistkami (`setOwnPasswordGuarded`), nová cookie
 * drží aktuální zařízení přihlášené, ostatní session končí. Až po zápisu jde
 * členovi kontrolní mail (gate změna 2, R6), jeho selhání heslo nezruší a do
 * logu nejde adresa.
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

  const auth = await requireAuth();
  if (!auth.success) {
    return { success: false, error: auth.error };
  }
  const { session } = auth;

  try {
    const member = await getMemberById(session.memberId);
    if (!member) {
      return { success: false, error: "Uživatel nenalezen." };
    }

    const state = await getMemberAuthState(session.memberId);
    if (!state) {
      return { success: false, error: "Uživatel nenalezen." };
    }
    const mode = decideOwnPasswordMode({
      hasRealPassword: hasRealPassword({
        hasHash: !!member.passwordHash,
        pendingSetPasswordLink: !!state.pendingSetPassword,
      }),
      hasHash: !!member.passwordHash,
      leadership: isLeadershipAccount({
        managementRole: member.managementRole,
        hasFunction: !!state.hasFunction,
      }),
    });

    if (mode === "via-link") {
      return { success: false, error: PASSWORD_TEXTS.viaLinkError };
    }

    let write: Parameters<typeof setOwnPasswordGuarded>[2] = { mode: "set" };
    if (mode === "change" && member.passwordHash) {
      if (!currentPassword) {
        return { success: false, error: "Zadej aktuální heslo." };
      }
      const rule = passwordChangeThrottleRule(session.memberId);
      const counts = await throttleHit([rule.key], THROTTLE_WINDOW_MINUTES);
      if (findBlockedRule([rule], counts)) {
        return { success: false, error: THROTTLE_BLOCKED_TEXT };
      }
      const currentValid = await compare(currentPassword, member.passwordHash);
      if (!currentValid) {
        return { success: false, error: "Aktuální heslo nesedí." };
      }
      const sameAsCurrent = await compare(newPassword, member.passwordHash);
      if (sameAsCurrent) {
        return { success: false, error: "Nové heslo musí být jiné než současné." };
      }
      write = { mode: "change", verifiedHash: member.passwordHash };
    }

    const newHash = await hash(newPassword, 12);
    const updated = await setOwnPasswordGuarded(session.memberId, newHash, write);
    if (!updated) {
      return { success: false, error: "Na tohle nemáš oprávnění." };
    }

    // Kontrolní mail hned po zápisu a před createSession (L-2): výjimka v cookie
    // ho nesmí spolknout. Sestavení argumentů je uvnitř try (LL-011).
    if (member.email) {
      try {
        const sent = await sendPasswordChangedNoticeEmail({
          memberId: member.id,
          to: member.email,
          name: updated.name,
        });
        if (!sent.success) {
          console.error(`[changePasswordAction] notice mail neodešel memberId=${member.id}`);
        }
      } catch (err) {
        const cls = err instanceof Error ? err.name : typeof err;
        console.error(`[changePasswordAction] notice mail exception memberId=${member.id}: ${cls}`);
      }
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
