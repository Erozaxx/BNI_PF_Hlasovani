/**
 * iter-032 (arch T-001, sekce 5.2, 6) — přihlášení člena odkazem z mailu a
 * odkaz „nastav si heslo" pro vedení. Čistá rozhodnutí jsou v
 * login-link-core.ts, tady je DB, mail a session.
 *
 * Bez transakcí (LL-003). Pořadí kroků je zvolené tak, aby výpadek
 * uprostřed nikdy nedal víc práv, než měl dát (nejhůř spálený odkaz).
 */
import { waitUntil } from "@vercel/functions";
import { hash } from "bcryptjs";
import { z } from "zod";
import { getMemberByEmail, getMemberById, setOwnPassword } from "@/lib/db/queries/members";
import {
  consumeLinkByHash,
  findActiveLinkMemberId,
  insertLoginLink,
  rotateSetPasswordLink,
  upsertSetPasswordLink,
} from "@/lib/db/queries/login-links";
import { createSession } from "@/lib/auth/session";
import { throttleCheck, throttleFail, throttleHit } from "@/lib/auth/throttle";
import {
  LINK_INVALID_TEXT,
  LOGIN_LINK_RESPONSE_TEXT,
  THROTTLE_BLOCKED_TEXT,
  THROTTLE_WINDOW_MINUTES,
  buildLinkUrl,
  findBlockedRule,
  generateLinkToken,
  hashLinkToken,
  isKnownIp,
  isValidLinkTokenFormat,
  linkExpiresAt,
  linkRequestThrottleRules,
  linkUseThrottleKey,
  normalizeEmail,
  planLoginLinkRequest,
  remainingPaddingMs,
} from "@/lib/auth/login-link-core";
import { runSetPasswordConsume } from "@/lib/auth/set-password-consume";
import { sendLoginLinkEmail } from "@/lib/email/resend";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const emailSchema = z.string().email().max(254);

// ── Žádost o odkaz (6.1) ──

export type RequestLoginLinkResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * Vždy stejná odpověď a doba aspoň MIN_RESPONSE_MS ve všech větvích včetně
 * blokace a chyby DB (9.4). Mail jde přes `waitUntil`, odpověď na Resend
 * nečeká (F4). Žádosti se do ops_event nelogují (6.1).
 */
export async function requestLoginLink(
  rawEmail: string,
  ip: string
): Promise<RequestLoginLinkResult> {
  const startedAt = Date.now();
  const email = normalizeEmail(typeof rawEmail === "string" ? rawEmail : "");
  if (!emailSchema.safeParse(email).success) {
    return { ok: false, error: "Zadej platný e-mail." };
  }

  if (!isKnownIp(ip)) {
    console.warn("[login-link] chybí x-forwarded-for, throttle jen na e-mail");
  }

  try {
    const rules = linkRequestThrottleRules(email, ip);
    const counts = await throttleHit(
      rules.map((r) => r.key),
      THROTTLE_WINDOW_MINUTES
    );
    const blocked = findBlockedRule(rules, counts);
    const member = blocked ? null : await getMemberByEmail(email);
    const plan = planLoginLinkRequest({ blocked, member });

    if (plan.send) {
      const token = generateLinkToken();
      await insertLoginLink({
        memberId: plan.memberId,
        purpose: "login",
        tokenHash: hashLinkToken(token),
        expiresAt: linkExpiresAt("login", new Date()),
      });
      const url = buildLinkUrl(appUrl(), "login", token);
      const memberId = plan.memberId;
      const mail = sendLoginLinkEmail({
        memberId,
        to: plan.email,
        name: plan.memberName,
        url,
        isManagement: plan.isManagement,
      })
        .then((r) => {
          if (!r.success) console.error(`[login-link] mail neodešel memberId=${memberId}`);
        })
        .catch((err) => {
          console.error(`[login-link] mail exception memberId=${memberId}: ${errClass(err)}`);
        });
      try {
        waitUntil(mail);
      } catch (err) {
        // Mimo Vercel bez kontextu promise prostě doběhne v běžícím procesu.
        console.warn(`[login-link] waitUntil nedostupné: ${errClass(err)}`);
      }
    }
  } catch (err) {
    console.error(`[login-link] request failed: ${errClass(err)}`);
  }

  const wait = remainingPaddingMs(startedAt, Date.now());
  if (wait > 0) await sleep(wait);
  return { ok: true, message: LOGIN_LINK_RESPONSE_TEXT };
}

// ── Spotřebování odkazu (6.2, 5.2) ──

export type ConsumeError = { ok: false; error: string };

async function linkUseBlocked(ip: string): Promise<boolean> {
  const key = linkUseThrottleKey(ip);
  if (!key) return false;
  const { blocked } = await throttleCheck(key);
  return blocked;
}

async function recordLinkUseFailure(ip: string): Promise<void> {
  const key = linkUseThrottleKey(ip);
  if (!key) return;
  try {
    await throttleFail(key);
  } catch (err) {
    console.error(`[login-link] throttleFail failed: ${errClass(err)}`);
  }
}

/**
 * Odkaz člena: atomicky spotřebuje a založí session `email_link` (12 h,
 * vždy bez role, 6.4). Volající po `ok` přesměruje na /dashboard.
 */
export async function consumeLoginLink(
  token: unknown,
  ip: string
): Promise<{ ok: true } | ConsumeError> {
  try {
    if (await linkUseBlocked(ip)) {
      return { ok: false, error: THROTTLE_BLOCKED_TEXT };
    }
    if (!isValidLinkTokenFormat(token)) {
      await recordLinkUseFailure(ip);
      return { ok: false, error: LINK_INVALID_TEXT };
    }

    const memberId = await consumeLinkByHash(hashLinkToken(token), "login");
    if (!memberId) {
      await recordLinkUseFailure(ip);
      return { ok: false, error: LINK_INVALID_TEXT };
    }

    const member = await getMemberById(memberId);
    if (!member) return { ok: false, error: LINK_INVALID_TEXT };

    await createSession(
      {
        memberId: member.id,
        managementRole: null,
        authMethod: "email_link",
        name: member.name,
      },
      member.sessionVersion
    );
    return { ok: true };
  } catch (err) {
    console.error(`[login-link] consume failed: ${errClass(err)}`);
    return { ok: false, error: "Přihlášení se nepovedlo, zkus to znovu." };
  }
}

/**
 * Odkaz „nastav si heslo" (5.2 body 1 až 6). Pořadí kroků je v
 * `runSetPasswordConsume` (set-password-consume.ts): levné ověření odkazu,
 * pak validace hesla, bcrypt a teprve potom atomické spotřebování
 * (security L-1). Session vedení dostane jen člen, který roli v DB má.
 */
export async function consumeSetPasswordLink(
  token: unknown,
  password: string,
  confirm: string,
  ip: string
): Promise<
  | { ok: true; memberId: string; name: string }
  | ConsumeError
> {
  try {
    const result = await runSetPasswordConsume(
      {
        isBlocked: () => linkUseBlocked(ip),
        recordFailure: () => recordLinkUseFailure(ip),
        findActiveLink: (tokenHash) => findActiveLinkMemberId(tokenHash, "set-password"),
        hashPassword: (pw) => hash(pw, 12),
        consumeLink: (tokenHash) => consumeLinkByHash(tokenHash, "set-password"),
        setPassword: (memberId, passwordHash) => setOwnPassword(memberId, passwordHash),
      },
      { token, password, confirm }
    );
    if (!result.ok) return result;

    await createSession(
      {
        memberId: result.memberId,
        managementRole: result.managementRole as "admin" | "moderator",
        authMethod: "password",
        name: result.name,
      },
      result.sessionVersion
    );
    return { ok: true, memberId: result.memberId, name: result.name };
  } catch (err) {
    console.error(`[set-password-link] consume failed: ${errClass(err)}`);
    return { ok: false, error: "Heslo se nepodařilo nastavit, zkus to znovu." };
  }
}

// ── Vystavení odkazu pro heslo (5.2) ──

/**
 * Nový odkaz `set-password` (24 h) po povýšení nebo resetu. Jeden příkaz
 * (`upsertSetPasswordLink`): nepoužitý odkaz člena je nejvýš jeden a starý
 * token přestane platit v tomtéž příkazu (security L-4). Vrací URL, nikdy
 * ji neloguje.
 */
export async function issueSetPasswordLink(memberId: string): Promise<string> {
  const token = generateLinkToken();
  await upsertSetPasswordLink({
    memberId,
    tokenHash: hashLinkToken(token),
    expiresAt: linkExpiresAt("set-password", new Date()),
  });
  return buildLinkUrl(appUrl(), "set-password", token);
}

/**
 * Nový token pro nepoužitý odkaz `set-password` („Poslat znovu" a odkaz ke
 * zkopírování, security M-2, review F-02). Heslo ani verzi session nemění.
 * `null` = člen žádný nepoužitý odkaz nemá, nic se nezměnilo.
 */
export async function rotateSetPasswordLinkUrl(
  memberId: string,
  opts: { allowExpired: boolean }
): Promise<string | null> {
  const token = generateLinkToken();
  const rotated = await rotateSetPasswordLink({
    memberId,
    tokenHash: hashLinkToken(token),
    expiresAt: linkExpiresAt("set-password", new Date()),
    allowExpired: opts.allowExpired,
  });
  return rotated ? buildLinkUrl(appUrl(), "set-password", token) : null;
}

export { appUrl as getAppUrl };
