"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getClientIp, throttleHit } from "@/lib/auth/throttle";
import { getMemberByEmail } from "@/lib/db/queries/members";
import {
  THROTTLE_WINDOW_MINUTES,
  findBlockedRule,
  loginStartThrottleRules,
  normalizeEmail,
  planLoginStart,
} from "@/lib/auth/login-link-core";
import { z } from "zod";
import {
  consumeLoginLink,
  consumeSetPasswordLink,
  requestLoginLink,
} from "@/lib/auth/login-link";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import { randomUUID } from "node:crypto";
import type { ActionResult } from "@/lib/types";

/**
 * iter-032 (arch 6.1): člen si na /login řekne o odkaz. Vždy stejná odpověď
 * a doba aspoň 2,5 s (logika v lib/auth/login-link.ts).
 */
export async function requestLoginLinkAction(
  email: string
): Promise<ActionResult<{ message: string }>> {
  const ip = getClientIp(await headers());
  const result = await requestLoginLink(email, ip);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { message: result.message } };
}

/**
 * iter-032 T-011: krok 1 dvoukrokového /login.
 *
 * Rozhodnutí uživatele 15. 10. 2026: kdo je vedení s heslem, se z kroku 1
 * pozná (dostane `password`), protože vedení chapteru je veřejně známé a
 * přihlášení heslem má throttle. Člena a neexistující e-mail ale rozlišit
 * nesmí jít: vše ostatní jde do `requestLoginLink` (stejná odpověď, aspoň
 * 2,5 s). Chyba DB nebo výjimka také končí větví odkazu, nikdy heslem.
 * Vlastní throttle (klíče `login-start-*`) před hledáním člena, ať krok 1
 * nejde zneužít k neomezenému zkoušení e-mailů. Nic se neloguje.
 */
export async function startLoginAction(
  email: string
): Promise<ActionResult<{ next: "password" | "link"; message?: string }>> {
  const normalized = normalizeEmail(typeof email === "string" ? email : "");
  if (!z.string().email().max(254).safeParse(normalized).success) {
    return { success: false, error: "Zadej platný e-mail." };
  }
  const ip = getClientIp(await headers());

  try {
    const rules = loginStartThrottleRules(normalized, ip);
    const counts = await throttleHit(
      rules.map((r) => r.key),
      THROTTLE_WINDOW_MINUTES
    );
    const blocked = findBlockedRule(rules, counts);
    const member = blocked ? null : await getMemberByEmail(normalized);
    const plan = planLoginStart({ blocked, member });
    if (plan.next === "blocked") return { success: false, error: plan.message };
    if (plan.next === "password") return { success: true, data: { next: "password" } };
  } catch (err) {
    console.error(`[startLoginAction] failed: ${err instanceof Error ? err.name : typeof err}`);
  }

  const result = await requestLoginLink(normalized, ip);
  if (!result.ok) return { success: false, error: result.error };
  return { success: true, data: { next: "link", message: result.message } };
}

/**
 * iter-032 (arch 6.2): spotřebování odkazu člena tlačítkem na mezistránce
 * /login/odkaz (POST, GET nic nespotřebuje). Úspěch přesměruje na /dashboard.
 */
export async function consumeLoginLinkAction(token: string): Promise<ActionResult> {
  const ip = getClientIp(await headers());
  const result = await consumeLoginLink(token, ip);
  if (!result.ok) return { success: false, error: result.error };
  redirect("/dashboard");
}

/**
 * iter-032 (arch 5.2): nastavení hesla vedení odkazem z mailu (/login/heslo).
 * Úspěch založí session vedení, zapíše `access.password-set` a přesměruje.
 */
export async function setPasswordFromLinkAction(
  token: string,
  password: string,
  confirm: string
): Promise<ActionResult> {
  const ip = getClientIp(await headers());
  const result = await consumeSetPasswordLink(token, password, confirm, ip);
  if (!result.ok) return { success: false, error: result.error };

  // LL-011: vstup se sestaví uvnitř try, logOpsEvent sám nikdy nevyhodí.
  try {
    const event: OpsEventInput = {
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.password-set",
      severity: "info",
      actor: result.name,
      memberId: result.memberId,
      memberName: result.name,
      message: `${result.name} si nastavil(a) heslo odkazem z mailu.`,
    };
    await logOpsEvent(event);
  } catch (err) {
    console.error(
      `[setPasswordFromLinkAction] ops log failed memberId=${result.memberId}: ${err instanceof Error ? err.name : typeof err}`
    );
  }

  redirect("/dashboard");
}
