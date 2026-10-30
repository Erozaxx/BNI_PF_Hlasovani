"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { hash } from "bcryptjs";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import { adminTargetError } from "@/lib/auth/admin-protection";
import {
  getMemberAuthState,
  getMemberById,
  resetPasswordGuarded,
  setMemberRoleGuarded,
} from "@/lib/db/queries/members";
import { getManagerContext } from "@/lib/db/queries/member-status";
import {
  assignMemberFunctionGuarded,
  getChapterFunctionById,
  getMemberFunctionId,
  removeMemberFunctionGuarded,
} from "@/lib/db/queries/member-functions";
import {
  decideRoleChange,
  roleChangeErrorText,
  type DbRole,
} from "@/lib/auth/role-change";
import { decideFunctionChange, functionChangeErrorText } from "@/lib/auth/function-change";
import {
  ADMIN_ONLY_MESSAGE,
  decidePasswordReset,
  hasPasswordAccess,
  hasRealPassword,
  isAdminSession,
  mayChangeMember,
  NO_PERMISSION_MESSAGE,
  type PasswordResetDenied,
} from "@/lib/auth/permissions";
import { hasPendingSetPasswordLink } from "@/lib/db/queries/login-links";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
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
 * Roli vedení mění jen admin (rozhodnutí Toma 19. 10.: `access.manage`
 * nedostane žádná funkce, účet admina mění jen admin i přes ostatní práva).
 * iter-043 (gate K13 A): reset hesla a „Poslat znovu“ smí i volající s právem
 * `access.password_reset` (moderátor, Člen výboru, Prezident, Viceprezident),
 * odkaz ke zkopírování zůstává jen adminovi (K15).
 * Bez transakcí (LL-003): každá
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
const FUNCTION_CHANGED_ELSEWHERE = "Funkce se mezitím změnily, obnov stránku.";
/** Gate sekce 5: neaktivnímu členovi se odkaz pro heslo neposílá. */
const INACTIVE_PASSWORD_LINK_TEXT = "Odkaz pro heslo pošli, až bude zase aktivní.";
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

/**
 * T-003b: má člen přístup s heslem (role NEBO funkce)? Vrací označení pro mail
 * (`admin`, `moderator`, nebo `function` u držitele funkce bez role), jinak
 * `null`. Jediné rozhodnutí je `hasPasswordAccess` v lib/auth/permissions.ts.
 */
async function passwordAccessOf(target: {
  id: string;
  managementRole: string | null;
}): Promise<{ role: "admin" | "moderator" | "function" } | null> {
  const state = await getMemberAuthState(target.id);
  const role =
    target.managementRole === "admin" || target.managementRole === "moderator"
      ? target.managementRole
      : null;
  if (!hasPasswordAccess({ managementRole: role, hasFunction: !!state?.hasFunction })) {
    return null;
  }
  return { role: role ?? "function" };
}

/** Hlášky pro důvody z `decidePasswordReset` (texty stejné jako před iter-043). */
function passwordResetDeniedText(reason: PasswordResetDenied): string {
  switch (reason) {
    case "no-permission":
      return NO_PERMISSION_MESSAGE;
    case "self":
      return "Vlastní heslo změníš v Nastavení.";
    case "admin-target":
      return ADMIN_ONLY_MESSAGE;
    case "not-found":
      return "Člen nebyl nalezen.";
    case "no-access":
      return "Heslo mají jen členové vedení.";
  }
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
  role: "admin" | "moderator" | "function";
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
  role: "admin" | "moderator" | "function";
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
  const auth = await requirePermission("access.manage");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  const parsedRole = roleSchema.safeParse(newRole);
  if (!parsedId.success || !parsedRole.success) {
    return { success: false, error: "Neplatný vstup." };
  }

  try {
    const [target, ctx] = await Promise.all([
      getMemberById(parsedId.data),
      getManagerContext(parsedId.data),
    ]);
    // M-1: roli admin přidělí a admina sesadí jen admin. `access.manage` má dnes
    // jen admin, tohle je druhá pojistka v akci a třetí v SQL (setMemberRoleGuarded).
    if (
      !isAdminSession(actor) &&
      (parsedRole.data === "admin" || !mayChangeMember(false, target?.managementRole))
    ) {
      return { success: false, error: ADMIN_ONLY_MESSAGE };
    }
    // iter-037 (T-003b): pojistka „poslední účet se správou členů“. Sesazení
    // admina blokuje jen tehdy, když je cíl dnes aktivní účet se správou členů,
    // správu by po změně neměl (ani přes funkci) a nikdo jiný ji nemá.
    // `decideRoleChange` čeká počet včetně cíle, takže vrací 1 přesně v tomhle
    // případě a jinak aspoň 2.
    const targetLosesManagement =
      !!ctx.target?.isActiveManager && !ctx.targetHasManageFunction;
    const adminCount = ctx.otherActiveManagers + (targetLosesManagement ? 1 : 2);
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

    // T-003b: držitel funkce má heslo i bez role. Při povýšení si ho ponechá
    // (žádný zámkový hash, žádný mail), při sesazení ho smaže SQL jen tomu, kdo
    // nemá ani funkci (`setMemberRoleGuarded` režim `clear`).
    // MIN-1: zámkový hash (čeká na odkaz „nastav si heslo“) není heslo, člen
    // s ním dostane pozvánku znovu.
    const hadPassword = hasRealPassword({
      hasHash: !!target.passwordHash,
      pendingSetPasswordLink: await hasPendingSetPasswordLink(target.id),
    });
    const password =
      decision.kind === "promote" && !hadPassword
        ? ({ mode: "promote", hash: await lockHash() } as const)
        : decision.kind === "promote"
          ? ({ mode: "keep" } as const)
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
    if (decision.kind === "promote" && !hadPassword && row.email && decision.newRole) {
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
      severity: decision.kind === "promote" && !hadPassword && !mailSent ? "warn" : "info",
      actor: actor.name,
      memberId: row.id,
      memberName: row.name,
      code: decision.newRole ?? "none",
      message:
        `${roleLabel(decision.oldRole)} na ${roleLabel(decision.newRole)}` +
        (decision.kind === "promote" && !hadPassword
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
  const auth = await requirePermission("access.password_reset");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };
  if (parsedId.data === actor.memberId) {
    return { success: false, error: "Vlastní heslo změníš v Nastavení." };
  }

  try {
    const denied = await adminTargetError(actor, parsedId.data);
    if (denied) return { success: false, error: denied };

    const target = await getMemberById(parsedId.data);
    // T-003b: heslo má držitel role NEBO funkce.
    const access = target ? await passwordAccessOf(target) : null;
    const decision = decidePasswordReset({
      actorId: actor.memberId,
      actorIsAdmin: isAdminSession(actor),
      actorMayReset: true,
      target: target
        ? { id: target.id, managementRole: target.managementRole, hasPasswordAccess: !!access }
        : null,
    });
    if (!decision.ok || !target || !access) {
      return { success: false, error: passwordResetDeniedText(decision.ok ? "no-access" : decision.reason) };
    }

    const row = await resetPasswordGuarded(target.id, actor.memberId, await lockHash());
    if (!row) return { success: false, error: ROLE_CHANGED_ELSEWHERE };

    // Neaktivnímu se odkaz neposílá (heslo i session jsou už zrušené).
    const mailSent =
      row.email && isMemberActive(target, pragueToday())
        ? await sendSetPasswordLink({
            memberId: row.id,
            email: row.email,
            name: row.name,
            role: access.role,
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
  const auth = await requirePermission("access.password_reset");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };
  if (parsedId.data === actor.memberId) {
    return { success: false, error: "Vlastní heslo změníš v Nastavení." };
  }

  try {
    const denied = await adminTargetError(actor, parsedId.data);
    if (denied) return { success: false, error: denied };

    const target = await getMemberById(parsedId.data);
    if (!target) return { success: false, error: "Člen nebyl nalezen." };
    const access = await passwordAccessOf(target);
    if (!access) {
      return { success: false, error: "Odkaz pro heslo jde jen členovi vedení." };
    }
    if (!target.email) {
      return { success: false, error: "Člen nemá e-mail. Nejdřív mu ho doplň." };
    }
    // Gate sekce 5: neaktivní člen odkaz pro heslo nedostane.
    if (!isMemberActive(target, pragueToday())) {
      return { success: false, error: INACTIVE_PASSWORD_LINK_TEXT };
    }

    const url = await rotateSetPasswordLinkUrl(target.id, {
      allowExpired: true,
      actorId: actor.memberId,
      permission: "access.password_reset",
    });
    if (!url) return { success: true, data: { outcome: "no-active-link" } };

    const mailSent = await mailSetPasswordLink({
      memberId: target.id,
      email: target.email,
      name: target.name,
      role: access.role,
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
  const auth = await requirePermission("access.manage");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };
  if (parsedId.data === actor.memberId) {
    return { success: false, error: "Vlastní heslo změníš v Nastavení." };
  }

  try {
    const denied = await adminTargetError(actor, parsedId.data);
    if (denied) return { success: false, error: denied };

    const target = await getMemberById(parsedId.data);
    if (!target) return { success: false, error: "Člen nebyl nalezen." };
    if (!(await passwordAccessOf(target))) {
      return { success: false, error: "Odkaz pro heslo jde jen členovi vedení." };
    }
    if (!isMemberActive(target, pragueToday())) {
      return { success: false, error: INACTIVE_PASSWORD_LINK_TEXT };
    }

    const url = await rotateSetPasswordLinkUrl(target.id, {
      allowExpired: false,
      actorId: actor.memberId,
      permission: "access.manage",
    });
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

export type SetFunctionResult = {
  changed: boolean;
  kind: "noop" | "assign" | "change" | "remove";
  /** Odkaz „nastav si heslo“ odešel mailem (jen při první funkci člena bez hesla). */
  mailSent: boolean;
  email: string | null;
  /** Člen je neaktivní: odkaz pro heslo se neposílá (výsledkové okno to řekne). */
  linkSkippedInactive: boolean;
  /** Odebrána poslední role i funkce: heslo se smazalo, člen se přihlašuje odkazem z mailu. */
  passwordCleared: boolean;
};

/**
 * Přidělení, změna a odebrání funkce člena (T-003b, bez UI, to je T-003c).
 * `functionId = null` funkci odebere. Člen má nejvýš jednu funkci.
 *
 * Heslo držitele funkce (rozhodnutí 19. 10.): funkce bez role stačí k heslu.
 * První funkce člena bez hesla = zámkový hash + `session_version + 1` + odkaz
 * „nastav si heslo“ (24 h, jednou) mailem, stejně jako povýšení v iter-032.
 * Odebrání poslední role i funkce = heslo pryč, `session_version + 1`, odkazy
 * `set-password` zneplatněné. Změna funkce člena s heslem session nemění
 * (práva se přepočítají při dalším požadavku).
 *
 * Pojistka posledního aktivního účtu se správou členů: nejde odebrat ani
 * vyměnit funkci s `members.manage`, když by nikdo jiný správu členů neměl.
 * Bez transakcí (LL-003): jeden SQL příkaz s pojistkami ve WHERE, mail a log
 * až po něm. `expectedFunctionId` je funkce, kterou volající viděl (souběh).
 */
export async function setMemberFunctionAction(
  memberId: string,
  functionId: string | null,
  expectedFunctionId: string | null
): Promise<ActionResult<SetFunctionResult>> {
  const auth = await requirePermission("access.manage");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  const parsedFn = z.string().uuid().nullable().safeParse(functionId);
  const parsedExpected = z.string().uuid().nullable().safeParse(expectedFunctionId);
  if (!parsedId.success || !parsedFn.success || !parsedExpected.success) {
    return { success: false, error: "Neplatný vstup." };
  }
  const newFunctionId = parsedFn.data;

  try {
    const [target, ctx, currentFunctionId, newFunction] = await Promise.all([
      getMemberById(parsedId.data),
      getManagerContext(parsedId.data),
      getMemberFunctionId(parsedId.data),
      newFunctionId ? getChapterFunctionById(newFunctionId) : Promise.resolve(null),
    ]);
    if (!mayChangeMember(isAdminSession(actor), target?.managementRole)) {
      return { success: false, error: ADMIN_ONLY_MESSAGE };
    }
    // Volající viděl jinou funkci, než je teď v DB (druhá záložka).
    if (currentFunctionId !== parsedExpected.data) {
      return { success: false, error: FUNCTION_CHANGED_ELSEWHERE };
    }

    const actorIsAdmin = isAdminSession(actor);
    const decision = decideFunctionChange({
      actorId: actor.memberId,
      actorIsAdmin,
      target: target
        ? {
            id: target.id,
            managementRole: target.managementRole,
            email: target.email,
            currentFunctionId,
            isActiveManager: !!ctx.target?.isActiveManager,
            hasManageFunction: ctx.targetHasManageFunction,
          }
        : null,
      newFunctionId,
      newFunctionExists: newFunction !== null,
      newFunctionGivesMembersManage: newFunction?.givesMembersManage ?? false,
      otherActiveManagers: ctx.otherActiveManagers,
    });
    if (!decision.ok) return { success: false, error: functionChangeErrorText(decision.error) };
    if (decision.kind === "noop" || !target) {
      return {
        success: true,
        data: {
          changed: false,
          kind: "noop",
          mailSent: false,
          email: target?.email ?? null,
          linkSkippedInactive: false,
          passwordCleared: false,
        },
      };
    }

    const allowSelf = actorIsAdmin;
    const row = newFunctionId
      ? await assignMemberFunctionGuarded({
          targetId: target.id,
          actorId: actor.memberId,
          allowSelf,
          newFunctionId,
          expectedFunctionId: currentFunctionId,
          lockHash: await lockHash(),
        })
      : currentFunctionId
        ? await removeMemberFunctionGuarded({
            targetId: target.id,
            actorId: actor.memberId,
            allowSelf,
            expectedFunctionId: currentFunctionId,
          })
        : null;
    if (!row) return { success: false, error: FUNCTION_CHANGED_ELSEWHERE };

    // Člen bez hesla dostal zámkový hash: odkaz „nastav si heslo“ mailem. Neaktivnímu
    // se neposílá (gate sekce 5), admin ho pošle, až bude zase aktivní.
    let mailSent = false;
    let linkSkippedInactive = false;
    if (row.passwordCreated && row.email) {
      if (isMemberActive(target, pragueToday())) {
        mailSent = await sendSetPasswordLink({
          memberId: row.id,
          email: row.email,
          name: row.name,
          role: target.managementRole === "admin" || target.managementRole === "moderator"
            ? target.managementRole
            : "function",
          reason: "promoted",
          actorName: actor.name,
        });
      } else {
        linkSkippedInactive = true;
      }
    }

    await safeLog(() => ({
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.functions-changed",
      severity: row.passwordCreated && !mailSent && !linkSkippedInactive ? "warn" : "info",
      actor: actor.name,
      memberId: row.id,
      memberName: row.name,
      code: decision.kind,
      message:
        decision.kind === "assign"
          ? "Funkce přidělena" + (row.passwordCreated ? (mailSent ? ", odkaz pro nastavení hesla odeslán" : linkSkippedInactive ? ", odkaz se neposílá, člen je neaktivní" : ", odkaz pro nastavení hesla se nepodařilo odeslat") : "")
          : decision.kind === "change"
            ? "Funkce změněna."
            : "Funkce odebrána" + (row.passwordCleared ? ", heslo smazáno." : "."),
    }));

    revalidatePath("/admin/members");
    return {
      success: true,
      data: {
        changed: true,
        kind: decision.kind,
        mailSent,
        email: row.email,
        linkSkippedInactive,
        passwordCleared: row.passwordCleared,
      },
    };
  } catch (err) {
    console.error(`[setMemberFunctionAction] failed memberId=${memberId}: ${errClass(err)}`);
    if ((err as { code?: string } | null)?.code === "23503") {
      return { success: false, error: "Funkce mezitím zmizela, obnov stránku." };
    }
    return { success: false, error: "Funkci se nepodařilo změnit." };
  }
}
