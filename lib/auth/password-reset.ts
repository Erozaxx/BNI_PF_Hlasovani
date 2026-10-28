/**
 * iter-043 (arch T-001b bod 2): skutečné závislosti žádosti „Zapomněl(a) jsem
 * heslo". Pořadí kroků je v `runPasswordResetRequest`
 * (password-reset-request.ts). Žádost nemění heslo ani session člena.
 */
import { waitUntil } from "@vercel/functions";
import { getMemberByEmail } from "@/lib/db/queries/members";
import { upsertPasswordResetLink } from "@/lib/db/queries/login-links";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
import { throttleHit } from "@/lib/auth/throttle";
import { isKnownIp } from "@/lib/auth/login-link-core";
import {
  runPasswordResetRequest,
  type PasswordResetRequestResult,
} from "@/lib/auth/password-reset-request";
import { getAppUrl } from "@/lib/auth/login-link";
import { sendPasswordResetEmail } from "@/lib/email/resend";
import { logOpsEvent } from "@/lib/ops/event-log";

export type RequestPasswordResetResult = PasswordResetRequestResult;

export async function requestPasswordReset(
  rawEmail: string,
  ip: string
): Promise<RequestPasswordResetResult> {
  const startedAt = Date.now();
  if (!isKnownIp(ip)) {
    console.warn("[password-reset] chybí x-forwarded-for, throttle jen na e-mail");
  }
  return runPasswordResetRequest(
    {
      throttleHit,
      findMember: async (email) => {
        const member = await getMemberByEmail(email);
        if (!member) return null;
        return {
          id: member.id,
          name: member.name,
          email: member.email,
          managementRole: member.managementRole,
          hasFunction: member.hasFunction,
          active: isMemberActive(member, pragueToday()),
        };
      },
      upsertLink: upsertPasswordResetLink,
      sendMail: (opts) => sendPasswordResetEmail({ ...opts, appUrl: getAppUrl() }),
      logEvent: logOpsEvent,
      schedule: (task) => waitUntil(task),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
      appUrl: getAppUrl,
    },
    { email: rawEmail, ip, startedAt }
  );
}
