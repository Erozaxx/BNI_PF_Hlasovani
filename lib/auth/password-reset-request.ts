/**
 * iter-043 (arch T-001b bod 2, gate K5 až K9): pořadí kroků žádosti
 * „Zapomněl(a) jsem heslo". Čistý modul bez DB, next, resend a vercel, všechny
 * závislosti přicházejí zvenku (lib/auth/password-reset.ts), aby šlo pořadí
 * otestovat bez databáze (scripts/test-iter-043-heslo.ts).
 *
 * Pořadí:
 *   1. validace formátu e-mailu (jediná odlišná odpověď, throttle se nepočítá),
 *   2. throttle (každý pokus se počítá, i pro neexistující e-mail; 10 min na
 *      e-mail a IP a denní strop 5 na e-mail),
 *   3. při blokaci se člen nehledá,
 *   4. plán (`planPasswordResetRequest`),
 *   5. jen při `send`: UPSERT odkazu (jeden příkaz, nový token zneplatní starý,
 *      pokud není starý mladší než 5 minut: pak se nic nemění a mail neodejde),
 *   6. doplnění doby na MIN_RESPONSE_MS,
 *   7. teprve potom mail a záznam na /status (`schedule`, tedy waitUntil),
 *      odpověď na ně nečeká a jejich doba se do odpovědi nepromítne.
 *      Vždy stejný text.
 *
 * Žádost nemění heslo ani session člena. Chyba v kterémkoli kroku končí
 * stejnou odpovědí a dobou.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  PASSWORD_RESET_RESPONSE_TEXT,
  PASSWORD_RESET_FRESH_LINK_MINUTES,
  buildLinkUrl,
  findBlockedRule,
  generateLinkToken,
  groupRulesByWindow,
  hashLinkToken,
  linkExpiresAt,
  normalizeEmail,
  passwordResetThrottleRules,
  planPasswordResetRequest,
  remainingPaddingMs,
  type LoginLinkMemberMatch,
  type ThrottleCount,
} from "./login-link-core";
import type { OpsEventInput } from "@/lib/ops/types";

export const PASSWORD_RESET_INVALID_EMAIL_TEXT = "Zadej platný e-mail.";

const emailSchema = z.string().email().max(254);

export interface PasswordResetRequestDeps {
  throttleHit(keys: string[], windowMinutes: number): Promise<ThrottleCount[]>;
  findMember(normalizedEmail: string): Promise<LoginLinkMemberMatch | null>;
  /**
   * Vrací `true`, když byl odkaz vystaven nebo vyměněn, `false` když nepoužitý
   * odkaz mladší než `freshMinutes` zůstal (security M-1b, mail pak neodejde).
   */
  upsertLink(input: {
    memberId: string;
    tokenHash: string;
    expiresAt: Date;
    freshMinutes: number;
  }): Promise<boolean>;
  /** Mail, vrací `success`. Smí vyhodit, runner to zachytí. */
  sendMail(input: { memberId: string; to: string; name: string; url: string }): Promise<{ success: boolean }>;
  logEvent(event: OpsEventInput): Promise<unknown>;
  /** Naplánuje úlohu mimo odpověď (waitUntil). Smí vyhodit, runner to zachytí. */
  schedule(task: Promise<void>): void;
  sleep(ms: number): Promise<void>;
  now(): number;
  appUrl(): string;
}

export type PasswordResetRequestResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** Záznam na /status, bez e-mailu a bez odkazu (OpsEventInput pole pro odkaz nemá). */
function buildRequestedEvent(
  memberId: string,
  memberName: string,
  mailOk: boolean
): OpsEventInput {
  return {
    runId: randomUUID(),
    seq: 1,
    source: "gui",
    kind: "access.password-reset-requested",
    severity: mailOk ? "info" : "warn",
    actor: null,
    memberId,
    memberName,
    message: mailOk
      ? "Žádost o nové heslo z přihlášení, odkaz odeslán."
      : "Žádost o nové heslo z přihlášení, odkaz se nepodařilo odeslat.",
  };
}

export async function runPasswordResetRequest(
  deps: PasswordResetRequestDeps,
  input: { email: unknown; ip: string; startedAt: number }
): Promise<PasswordResetRequestResult> {
  const email = normalizeEmail(typeof input.email === "string" ? input.email : "");
  if (!emailSchema.safeParse(email).success) {
    return { ok: false, error: PASSWORD_RESET_INVALID_EMAIL_TEXT };
  }

  /** Úloha po odpovědi (mail a záznam), vzniká jen v odesílací větvi. */
  let afterReply: (() => Promise<void>) | null = null;
  try {
    const rules = passwordResetThrottleRules(email, input.ip);
    const groups = groupRulesByWindow(rules);
    const counts = (
      await Promise.all(groups.map((g) => deps.throttleHit(g.keys, g.windowMinutes)))
    ).flat();
    const blocked = findBlockedRule(rules, counts);
    const member = blocked ? null : await deps.findMember(email);
    const plan = planPasswordResetRequest({ blocked, member });

    if (plan.send) {
      const token = generateLinkToken();
      const issued = await deps.upsertLink({
        memberId: plan.memberId,
        tokenHash: hashLinkToken(token),
        expiresAt: linkExpiresAt("password-reset", new Date(deps.now())),
        freshMinutes: PASSWORD_RESET_FRESH_LINK_MINUTES,
      });
      if (!issued) {
        // M-1b: čerstvý odkaz zůstal, nový token nevznikl, mail neodejde. Na
        // /status se nezapisuje nic (útočník by jinak plnil záznamy), jen
        // řádek do konzole bez osobních údajů. Odpověď i doba beze změny.
        console.warn("[password-reset] čerstvý odkaz, žádost potlačena");
      } else {
        const url = buildLinkUrl(deps.appUrl(), "password-reset", token);
        const { memberId, memberName, email: to } = plan;

        afterReply = async () => {
          let mailOk = false;
          try {
            const r = await deps.sendMail({ memberId, to, name: memberName, url });
            mailOk = !!r.success;
          } catch (err) {
            console.error(`[password-reset] mail exception memberId=${memberId}: ${errClass(err)}`);
          }
          if (!mailOk) console.error(`[password-reset] mail neodešel memberId=${memberId}`);
          // LL-011: sestavení i zápis v try, záznam nesmí shodit úlohu.
          try {
            await deps.logEvent(buildRequestedEvent(memberId, memberName, mailOk));
          } catch (err) {
            console.error(`[password-reset] ops log failed memberId=${memberId}: ${errClass(err)}`);
          }
        };
      }
    }
  } catch (err) {
    console.error(`[password-reset] request failed: ${errClass(err)}`);
  }

  const wait = remainingPaddingMs(input.startedAt, deps.now());
  if (wait > 0) await deps.sleep(wait);

  // Mail a záznam startují až teď, po doplnění doby (odpověď na ně nečeká).
  if (afterReply) {
    try {
      deps.schedule(afterReply());
    } catch (err) {
      // Mimo Vercel bez kontextu promise prostě doběhne v běžícím procesu.
      console.warn(`[password-reset] schedule nedostupné: ${errClass(err)}`);
    }
  }
  return { ok: true, message: PASSWORD_RESET_RESPONSE_TEXT };
}
