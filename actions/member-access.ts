"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/guards";
import {
  countAdmins,
  getMemberById,
  resetPasswordGuarded,
  setMemberRoleGuarded,
} from "@/lib/db/queries/members";
import {
  decideRoleChange,
  roleChangeErrorText,
  type DbRole,
} from "@/lib/auth/role-change";
import {
  getAppUrl,
  issueSetPasswordLink,
  rotateSetPasswordLinkUrl,
} from "@/lib/auth/login-link";
import { sendSetPasswordLinkEmail } from "@/lib/email/resend";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import type { ActionResult } from "@/lib/types";

/**
 * iter-032 (arch 4, 5.2, 5.3; gate K1 A, K4 B, K9 A, K12 B, U1, U7).
 *
 * Roli a hesla vedení mění jen admin. Bez transakcí (LL-003): každá
 * změna je jeden SQL příkaz s pojistkami ve WHERE, mail a log až po něm.
 * Heslo se mailem nikdy neposílá, jen odkaz „nastav si heslo" (24 h, jednou).
 * Odkaz se adminovi nevrací nikdy automaticky, jen na výslovný klik přes
 * issueSetPasswordLinkForCopyAction (U1).
 *
 * T-006r (security M-2, review F-02): „Poslat znovu" a odkaz ke zkopírování
 * jen vymění token nepoužitého odkazu, který vznikl povýšením nebo resetem.
 * Heslo ani session nemění. Když člen nepoužitý odkaz nemá (heslo si už
 * nastavil), obě akce odmítnou a admin musí vědomě dát reset.
 */

const memberIdSchema = z.string().uuid();
const roleSchema = z.enum(["none", "moderator", "admin"]);

const ROLE_CHANGED_ELSEWHERE = "Role se mezitím změnila, obnov stránku.";
const NO_ACTIVE_LINK_COPY_TEXT =
  "Člen nemá platný odkaz pro nastavení hesla. Nejdřív mu pošli odkaz pro nové heslo.";

/** Zámkový hash: náhodné tajemství se hned zahodí, žádné heslo k němu neprojde. */
async function lockHash(): Promise<string> {
  return hash(randomBytes(32).toString("hex"), 12);
}

function roleLabel(role: DbRole): string {
  if (role === "admin") return "admin";
  if (role === "moderator") return "moderátor";
  return "člen";
}

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(build: () => OpsEventInput): Promise<void> {
  try {
    await logOpsEvent(build());
  } catch (err) {
    console.error(`[member-access] ops log failed: ${errClass(err)}`);
  }
}

/** Vytvoří odkaz pro heslo a pošle mail. Selhání nevrací změnu role/hesla. */
async function sendSetPasswordLink(opts: {
  memberId: string;
  email: string;
  name: string;
  role: "admin" | "moderator";
  reason: "promoted" | "reset";
  actorName: string;
}): Promise<boolean> {
  try {
    const url = await issueSetPasswordLink(opts.memberId);
    return await mailSetPasswordLink({ ...opts, url });
  } catch (err) {
    console.error(`[member-access] set-password link failed memberId=${opts.memberId}: ${errClass(err)}`);
    return false;
  }
}

/** Pošle mail s už vystaveným odkazem. Nikdy nevyhodí. */
async function mailSetPasswordLink(opts: {
  memberId: string;
  email: string;
  name: string;
  role: "admin" | "moderator";
  reason: "promoted" | "reset" | "resend";
  actorName: string;
  url: string;
}): Promise<boolean> {
  try {
    const result = await sendSetPasswordLinkEmail({
      memberId: opts.memberId,
      to: opts.email,
      name: opts.name,
      url: opts.url,
      reason: opts.reason,
      role: opts.role,
      actorName: opts.actorName,
      appUrl: getAppUrl(),
    });
    return result.success;
  } catch (err) {
    console.error(`[member-access] set-password mail failed memberId=${opts.memberId}: ${errClass(err)}`);
    return false;
  }
}

export type SetRoleResult = {
  changed: boolean;
  kind: "promote" | "switch" | "demote" | "noop";
  mailSent: boolean;
  email: string | null;
};

/**
 * Změna role (4.3). Promote: zámkový hash + odkaz pro heslo + mail. Switch:
 * hash beze změny, člen se musí znovu přihlásit. Demote: heslo se smaže
 * (K5). Vždy se zvýší session_version.
 */
export async function setMemberRoleAction(
  memberId: string,
  newRole: "none" | "moderator" | "admin"
): Promise<ActionResult<SetRoleResult>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  const parsedRole = roleSchema.safeParse(newRole);
  if (!parsedId.success || !parsedRole.success) {
    return { success: false, error: "Neplatný vstup." };
  }

  try {
    const [target, adminCount] = await Promise.all([
      getMemberById(parsedId.data),
      countAdmins(),
    ]);
    const decision = decideRoleChange({
      actorId: actor.memberId,
      target: target
        ? { id: target.id, managementRole: target.managementRole, email: target.email }
        : null,
      newRole: parsedRole.data,
      adminCount,
    });
    if (!decision.ok) return { success: false, error: roleChangeErrorText(decision.error) };
    if (decision.kind === "noop" || !target) {
      return {
        success: true,
        data: { changed: false, kind: "noop", mailSent: false, email: target?.email ?? null },
      };
    }

    const password =
      decision.kind === "promote"
        ? ({ mode: "promote", hash: await lockHash() } as const)
        : decision.kind === "demote"
          ? ({ mode: "clear" } as const)
          : ({ mode: "keep" } as const);

    const row = await setMemberRoleGuarded({
      targetId: target.id,
      actorId: actor.memberId,
      expectedOldRole: decision.oldRole,
      newRole: decision.newRole,
      password,
    });
    if (!row) return { success: false, error: ROLE_CHANGED_ELSEWHERE };

    let mailSent = false;
    if (decision.kind === "promote" && row.email && decision.newRole) {
      mailSent = await sendSetPasswordLink({
        memberId: row.id,
        email: row.email,
        name: row.name,
        role: decision.newRole,
        reason: "promoted",
        actorName: actor.name,
      });
    }

    await safeLog(() => ({
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.role-changed",
      severity: decision.kind === "promote" && !mailSent ? "warn" : "info",
      actor: actor.name,
      memberId: row.id,
      memberName: row.name,
      code: decision.newRole ?? "none",
      message:
        `${roleLabel(decision.oldRole)} na ${roleLabel(decision.newRole)}` +
        (decision.kind === "promote"
          ? mailSent
            ? ", odkaz pro nastavení hesla odeslán"
            : ", odkaz pro nastavení hesla se nepodařilo odeslat"
          : ""),
    }));

    revalidatePath("/admin/members");
    return {
      success: true,
      data: { changed: true, kind: decision.kind, mailSent, email: row.email },
    };
  } catch (err) {
    console.error(`[setMemberRoleAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Roli se nepodařilo změnit." };
  }
}

/**
 * Reset hesla člena vedení (5.3), slouží i jako nouzové zablokování:
 * zámkový hash, nová verze session a zneplatnění nepoužitých odkazů jedním
 * příkazem (L-5), pak nový odkaz a mail. U sebe ne, vlastní heslo se mění
 * v Nastavení. „Poslat znovu" je od T-006r samostatná akce níž.
 */
export async function resetMemberPasswordAction(
  memberId: string
): Promise<ActionResult<{ mailSent: boolean; email: string | null }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };
  if (parsedId.data === actor.memberId) {
    return { success: false, error: "Vlastní heslo změníš v Nastavení." };
  }

  try {
    const target = await getMemberById(parsedId.data);
    if (!target) return { success: false, error: "Člen nebyl nalezen." };
    if (target.managementRole !== "admin" && target.managementRole !== "moderator") {
      return { success: false, error: "Heslo mají jen členové vedení." };
    }

    const row = await resetPasswordGuarded(target.id, actor.memberId, await lockHash());
    if (!row) return { success: false, error: ROLE_CHANGED_ELSEWHERE };

    const mailSent = row.email
      ? await sendSetPasswordLink({
          memberId: row.id,
          email: row.email,
          name: row.name,
          role: target.managementRole,
          reason: "reset",
          actorName: actor.name,
        })
      : false;

    await safeLog(() => ({
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.password-reset",
      severity: mailSent ? "info" : "warn",
      actor: actor.name,
      memberId: row.id,
      memberName: row.name,
      message: mailSent
        ? "Heslo zrušeno, odkaz pro nové heslo odeslán."
        : "Heslo zrušeno, odkaz pro nové heslo se nepodařilo odeslat.",
    }));

    revalidatePath("/admin/members");
    return { success: true, data: { mailSent, email: row.email } };
  } catch (err) {
    console.error(`[resetMemberPasswordAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Heslo se nepodařilo zrušit." };
  }
}

export type ResendSetPasswordResult =
  | { outcome: "sent"; mailSent: boolean; email: string | null }
  | { outcome: "no-active-link" };

/**
 * „Poslat znovu" ve výsledkovém okně (review F-02, odchylka 3). Vymění token
 * nepoužitého odkazu (i prošlého, člen 24 h nestihl) a pošle mail. Heslo ani
 * verzi session nemění, takže heslo, které si člen mezitím nastavil, zůstane.
 * Když nepoužitý odkaz není, vrátí `no-active-link` a nic nezmění: okno pak
 * nabídne vědomý reset s potvrzením adresy.
 */
export async function resendSetPasswordLinkAction(
  memberId: string
): Promise<ActionResult<ResendSetPasswordResult>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };
  if (parsedId.data === actor.memberId) {
    return { success: false, error: "Vlastní heslo změníš v Nastavení." };
  }

  try {
    const target = await getMemberById(parsedId.data);
    if (!target) return { success: false, error: "Člen nebyl nalezen." };
    const role = target.managementRole;
    if (role !== "admin" && role !== "moderator") {
      return { success: false, error: "Odkaz pro heslo jde jen členovi vedení." };
    }
    if (!target.email) {
      return { success: false, error: "Člen nemá e-mail. Nejdřív mu ho doplň." };
    }

    const url = await rotateSetPasswordLinkUrl(target.id, { allowExpired: true });
    if (!url) return { success: true, data: { outcome: "no-active-link" } };

    const mailSent = await mailSetPasswordLink({
      memberId: target.id,
      email: target.email,
      name: target.name,
      role,
      reason: "resend",
      actorName: actor.name,
      url,
    });

    await safeLog(() => ({
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.password-link-resent",
      severity: mailSent ? "info" : "warn",
      actor: actor.name,
      memberId: target.id,
      memberName: target.name,
      message: mailSent
        ? "Odkaz pro nastavení hesla poslán znovu."
        : "Odkaz pro nastavení hesla se nepodařilo poslat znovu.",
    }));

    return { success: true, data: { outcome: "sent", mailSent, email: target.email } };
  } catch (err) {
    console.error(`[resendSetPasswordLinkAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Odkaz se nepodařilo poslat." };
  }
}

/**
 * U1 (K4 B): odkaz „nastav si heslo" ke zkopírování, jen na výslovný klik.
 * Security M-2: jen když má člen nepoužitý a neprošlý odkaz z povýšení nebo
 * resetu. Ten dostane nový token, odkaz z mailu tím přestane platit. Jinak
 * chyba, nic se nezmění. URL se vrátí jednou a nikam se neukládá ani
 * neloguje, na /status je jen záznam o kliku.
 */
export async function issueSetPasswordLinkForCopyAction(
  memberId: string
): Promise<ActionResult<{ url: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };
  if (parsedId.data === actor.memberId) {
    return { success: false, error: "Vlastní heslo změníš v Nastavení." };
  }

  try {
    const target = await getMemberById(parsedId.data);
    if (!target) return { success: false, error: "Člen nebyl nalezen." };
    if (target.managementRole !== "admin" && target.managementRole !== "moderator") {
      return { success: false, error: "Odkaz pro heslo jde jen členovi vedení." };
    }

    const url = await rotateSetPasswordLinkUrl(target.id, { allowExpired: false });
    if (!url) return { success: false, error: NO_ACTIVE_LINK_COPY_TEXT };

    await safeLog(() => ({
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.password-link-copied",
      severity: "info",
      actor: actor.name,
      memberId: target.id,
      memberName: target.name,
      message: "Admin si zobrazil odkaz pro nastavení hesla ke zkopírování.",
    }));

    return { success: true, data: { url } };
  } catch (err) {
    console.error(`[issueSetPasswordLinkForCopyAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Odkaz se nepodařilo vytvořit." };
  }
}
