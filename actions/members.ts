"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { adminTargetError } from "@/lib/auth/admin-protection";
import { ADMIN_ONLY_MESSAGE } from "@/lib/auth/permissions";
import {
  createMember as dbCreateMember,
  getMemberById,
  revokeMagicLinkGuarded,
  deleteMemberGuarded,
  isUniqueViolation,
  updateMemberCompany as dbUpdateMemberCompany,
  updateMemberEmail as dbUpdateMemberEmail,
  updateMemberJoinedAt as dbUpdateMemberJoinedAt,
} from "@/lib/db/queries/members";
import { clearHelpNotesForRecipient } from "@/lib/db/queries/burza";
import { getManagerContext } from "@/lib/db/queries/member-status";
import { getMemberFunctionId } from "@/lib/db/queries/member-functions";
import { isMemberActive, pragueToday } from "@/lib/members/activity";
import { generateMagicToken, generateMagicTokenAs } from "@/lib/auth/magic";
import { sendMagicLinkEmail } from "@/lib/email/resend";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { ActionResult } from "@/lib/types";

const EMAIL_TAKEN_TEXT = "Tenhle e-mail už má jiný člen.";
/** iter-037 (gate sekce 5, T-003b): neaktivnímu členovi odkaz neposíláme. */
const INACTIVE_NO_LINK_TEXT = "Neaktivnímu členovi odkaz neposíláme.";

/**
 * Create a new member. Requires admin role.
 *
 * iter-032 (K8, N7): nový člen vzniká vždy bez role a hesla, roli dostane
 * jen přes setMemberRoleAction (actions/member-access.ts). Parametry
 * managementRole a password akce nepřijímá, jinak by zůstala druhá cesta
 * přímým voláním. Magic token se generuje jako dřív. E-mail ukládá query
 * vrstva normalizovaně (U3).
 */
export async function createMemberAction(
  name: string,
  email?: string,
  company?: string,
  obor?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jméno člena je povinné." };
  }

  try {
    const newMember = await dbCreateMember({
      name: name.trim(),
      email: email ?? null,
      company: company?.trim() || null,
      obor: obor?.trim() || null,
    });

    // Members use magic link for voting access
    await generateMagicToken(newMember.id);

    revalidatePath("/admin/members");
    return { success: true, data: { id: newMember.id } };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: EMAIL_TAKEN_TEXT };
    }
    console.error("createMemberAction error:", error);
    return { success: false, error: "Člena se nepodařilo vytvořit." };
  }
}

/**
 * Generate a magic link for a member. Requires admin role.
 * Returns the full magic link URL.
 */
export async function generateMagicLinkAction(
  memberId: string
): Promise<ActionResult<{ magicLink: string }>> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Člen nebyl nalezen." };
    }
    const denied = await adminTargetError(auth.session, memberId);
    if (denied) return { success: false, error: denied };
    if (!isMemberActive(memberData, pragueToday())) {
      return { success: false, error: INACTIVE_NO_LINK_TEXT };
    }

    const rawToken = await generateMagicTokenAs(memberId, auth.session.memberId);
    if (!rawToken) return { success: false, error: ADMIN_ONLY_MESSAGE };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const magicLink = `${appUrl}/api/auth/magic?token=${rawToken}`;

    revalidatePath("/admin/members");
    return { success: true, data: { magicLink } };
  } catch (error) {
    console.error("generateMagicLinkAction error:", error);
    return { success: false, error: "Odkaz se nepodařilo vytvořit." };
  }
}

/**
 * „Zneplatnit odkaz“ (dřív Revokovat). iter-037 (arch 7.1, K11): jeden příkaz
 * `revokeMagicLinkGuarded` vynuluje oba tokeny, odhlásí člena ze všech zařízení
 * a zneplatní nepoužité přihlašovací odkazy z mailu. Žádný záložní nový odkaz.
 * Přihlásit se člen může dál přes nový odkaz z přihlašovací stránky, zablokovat
 * ho jde deaktivací. Hlasovací odkazy se nemění.
 */
export async function revokeTokenAction(
  memberId: string
): Promise<ActionResult> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;
  const actor = auth.session;

  try {
    const denied = await adminTargetError(actor, memberId);
    if (denied) return { success: false, error: denied };

    const row = await revokeMagicLinkGuarded(memberId, actor.memberId);
    if (!row) {
      return { success: false, error: "Člen nebyl nalezen." };
    }

    // LL-011: vstup se sestaví a zapíše uvnitř try, logOpsEvent sám nevyhodí.
    try {
      await logOpsEvent({
        runId: randomUUID(),
        seq: 1,
        source: "gui",
        kind: "access.magic-link-revoked",
        severity: "info",
        actor: actor.name,
        memberId: row.id,
        memberName: row.name,
        message: "Osobní odkaz zneplatněn.",
      });
    } catch (err) {
      console.error(`[revokeTokenAction] ops log failed: ${err instanceof Error ? err.name : typeof err}`);
    }

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("revokeTokenAction error:", error);
    return { success: false, error: "Odkaz se nepodařilo zneplatnit." };
  }
}

/**
 * Regenerate a magic token and send it to the member's email. Requires admin role.
 * Returns the plain token so the UI can display the link immediately.
 */
export async function sendMagicLinkEmailAction(
  memberId: string
): Promise<ActionResult<{ magicLink: string }>> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Člen nebyl nalezen." };
    }

    const denied = await adminTargetError(auth.session, memberId);
    if (denied) return { success: false, error: denied };

    if (!memberData.email) {
      return { success: false, error: "Člen nemá zadaný e-mail." };
    }
    if (!isMemberActive(memberData, pragueToday())) {
      return { success: false, error: INACTIVE_NO_LINK_TEXT };
    }

    const rawToken = await generateMagicTokenAs(memberId, auth.session.memberId);
    if (!rawToken) return { success: false, error: ADMIN_ONLY_MESSAGE };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const magicLink = `${appUrl}/api/auth/magic?token=${rawToken}`;

    const emailResult = await sendMagicLinkEmail(
      memberData.email,
      magicLink,
      memberData.name
    );

    if (!emailResult.success) {
      return {
        success: false,
        error: emailResult.error ?? "E-mail se nepodařilo odeslat.",
      };
    }

    revalidatePath("/admin/members");
    return { success: true, data: { magicLink } };
  } catch (error) {
    console.error("sendMagicLinkEmailAction error:", error);
    return { success: false, error: "Odkaz se nepodařilo poslat e-mailem." };
  }
}

/**
 * Update company and obor for a member. Requires admin role.
 */
export async function updateMemberCompanyAction(
  memberId: string,
  company: string,
  obor: string
): Promise<ActionResult> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Člen nebyl nalezen." };
    }

    const denied = await adminTargetError(auth.session, memberId);
    if (denied) return { success: false, error: denied };

    const changed = await dbUpdateMemberCompany(
      memberId,
      company.trim() || null,
      obor.trim() || null,
      auth.session.memberId
    );
    if (!changed) return { success: false, error: ADMIN_ONLY_MESSAGE };

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("updateMemberCompanyAction error:", error);
    return { success: false, error: "Firmu a obor se nepodařilo uložit." };
  }
}

/**
 * Update email for a member. Requires admin role.
 *
 * iter-032 (4.4, N5, K13): query vrstva ukládá `lower(trim(email))` a u
 * člena vedení se změnou zvýší `session_version`. Člen vedení bez e-mailu
 * je odmítnutý srozumitelnou hláškou (dřív obecná chyba z CHECKu),
 * duplicitu chytí unikátní index `lower(email)`.
 *
 * Security M-1: změna adresy zneplatní nepoužité odkazy člena v témže
 * příkazu. `revokedLinks` řekne formuláři, že má adminovi připomenout nový
 * odkaz pro heslo.
 */
export async function updateMemberEmailAction(
  memberId: string,
  email: string
): Promise<ActionResult<{ revokedLinks: number; isManagement: boolean }>> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Člen nebyl nalezen." };
    }

    const denied = await adminTargetError(auth.session, memberId);
    if (denied) return { success: false, error: denied };

    // T-003b: e-mail je přihlašovací jméno i u držitele funkce bez role.
    const hasFunction = (await getMemberFunctionId(memberId)) !== null;
    if ((memberData.managementRole || hasFunction) && !(email ?? "").trim()) {
      return {
        success: false,
        error: memberData.managementRole
          ? "Člen vedení musí mít e-mail. Nejdřív mu odeber roli."
          : "Člen s funkcí musí mít e-mail. Nejdřív mu odeber funkci.",
      };
    }

    const updated = await dbUpdateMemberEmail(memberId, email ?? null, auth.session.memberId);
    if (!updated) {
      return { success: false, error: "Člen nebyl nalezen." };
    }

    revalidatePath("/admin/members");
    return {
      success: true,
      data: {
        revokedLinks: updated.revokedLinks,
        isManagement: !!memberData.managementRole || hasFunction,
      },
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: EMAIL_TAKEN_TEXT };
    }
    console.error("updateMemberEmailAction error:", error);
    return { success: false, error: "E-mail se nepodařilo uložit." };
  }
}

/**
 * Update the joined_at (entry date) for a member. Requires admin role
 * (arch 7.1 - deliberately admin-only, not moderator, unlike the interview
 * question editor).
 *
 * Editing this value is also how the "neoverene datum vstupu" indicator on
 * the /interviews due-list clears - that indicator is a zero-schema
 * heuristic (joined_at == created_at::date), so once an admin sets a real
 * entry date it naturally stops matching created_at and disappears.
 */
export async function updateMemberJoinedAtAction(
  memberId: string,
  joinedAt: string
): Promise<ActionResult> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinedAt)) {
    return { success: false, error: "Neplatný formát data. Použij RRRR-MM-DD." };
  }

  const parsed = new Date(`${joinedAt}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { success: false, error: "Neplatné datum." };
  }

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Člen nebyl nalezen." };
    }

    const denied = await adminTargetError(auth.session, memberId);
    if (denied) return { success: false, error: denied };

    const changed = await dbUpdateMemberJoinedAt(memberId, joinedAt, auth.session.memberId);
    if (!changed) return { success: false, error: ADMIN_ONLY_MESSAGE };

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("updateMemberJoinedAtAction error:", error);
    return { success: false, error: "Datum vstupu se nepodařilo uložit." };
  }
}

/**
 * Delete a member. Requires admin role.
 *
 * iter-032 (4.3, N4): sebe ani posledního admina smazat nejde. Hláška
 * vychází z načteného řádku, správnost drží `deleteMemberGuarded` (jeden
 * DELETE s CTE `FOR UPDATE`).
 */
export async function deleteMemberAction(
  memberId: string
): Promise<ActionResult> {
  const auth = await requirePermission("members.delete");
  if (!auth.success) return auth;

  const actorId = auth.session.memberId;
  if (memberId === actorId) {
    return { success: false, error: "Sám sebe smazat nejde." };
  }

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Člen nebyl nalezen." };
    }

    const denied = await adminTargetError(auth.session, memberId);
    if (denied) return { success: false, error: denied };

    // iter-037 (T-003b): poslední aktivní účet se správou členů (admin nebo
    // funkce s `members.manage`) smazat nejde. Hláška hned, ještě před úklidem
    // poznámek z burzy. Správnost drží `deleteMemberGuarded`.
    const ctx = await getManagerContext(memberId);
    if (ctx.target?.isActiveManager && ctx.otherActiveManagers === 0) {
      return { success: false, error: "Posledního aktivního admina smazat nejde." };
    }

    // iter-035 L-2: poznámky k pomoci z burzy, kde je člen příjemcem, se
    // vynulují před smazáním (pak by osiřely). Selhání smazání zastaví
    // (fail closed): radši chyba a opakování než osiřelý text. Bez transakce.
    try {
      await clearHelpNotesForRecipient(memberId);
    } catch (err) {
      console.error(`deleteMemberAction burza cleanup failed: ${err instanceof Error ? err.name : typeof err}`);
      return { success: false, error: "Člena se nepodařilo smazat." };
    }

    const deleted = await deleteMemberGuarded(memberId, actorId);
    if (!deleted) {
      return {
        success: false,
        error: "Člena se nepodařilo smazat, obnov stránku.",
      };
    }

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("deleteMemberAction error:", error);
    return { success: false, error: "Člena se nepodařilo smazat." };
  }
}
