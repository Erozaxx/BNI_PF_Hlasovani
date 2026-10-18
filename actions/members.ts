"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  createMember as dbCreateMember,
  getMemberById,
  updateTokenUsed,
  deleteMemberGuarded,
  isUniqueViolation,
  updateMemberCompany as dbUpdateMemberCompany,
  updateMemberEmail as dbUpdateMemberEmail,
  updateMemberJoinedAt as dbUpdateMemberJoinedAt,
} from "@/lib/db/queries/members";
import { clearHelpNotesForRecipient } from "@/lib/db/queries/burza";
import { generateMagicToken } from "@/lib/auth/magic";
import { sendMagicLinkEmail } from "@/lib/email/resend";
import type { ActionResult } from "@/lib/types";

const EMAIL_TAKEN_TEXT = "Tenhle e-mail už má jiný člen.";

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
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno clena je povinne." };
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
    return { success: false, error: "Nepodarilo se vytvorit clena." };
  }
}

/**
 * Generate a magic link for a member. Requires admin role.
 * Returns the full magic link URL.
 */
export async function generateMagicLinkAction(
  memberId: string
): Promise<ActionResult<{ magicLink: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    const rawToken = await generateMagicToken(memberId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const magicLink = `${appUrl}/api/auth/magic?token=${rawToken}`;

    revalidatePath("/admin/members");
    return { success: true, data: { magicLink } };
  } catch (error) {
    console.error("generateMagicLinkAction error:", error);
    return { success: false, error: "Nepodarilo se vygenerovat odkaz." };
  }
}

/**
 * Revoke a member's magic token. Requires admin role.
 */
export async function revokeTokenAction(
  memberId: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    await updateTokenUsed(memberId);

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("revokeTokenAction error:", error);
    return { success: false, error: "Nepodarilo se revokovat odkaz." };
  }
}

/**
 * Regenerate a magic token and send it to the member's email. Requires admin role.
 * Returns the plain token so the UI can display the link immediately.
 */
export async function sendMagicLinkEmailAction(
  memberId: string
): Promise<ActionResult<{ magicLink: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    if (!memberData.email) {
      return { success: false, error: "Clen nema zadany email." };
    }

    const rawToken = await generateMagicToken(memberId);
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
        error: emailResult.error ?? "Nepodarilo se odeslat email.",
      };
    }

    revalidatePath("/admin/members");
    return { success: true, data: { magicLink } };
  } catch (error) {
    console.error("sendMagicLinkEmailAction error:", error);
    return { success: false, error: "Nepodarilo se odeslat odkaz emailem." };
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
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    await dbUpdateMemberCompany(
      memberId,
      company.trim() || null,
      obor.trim() || null
    );

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("updateMemberCompanyAction error:", error);
    return { success: false, error: "Nepodarilo se aktualizovat firmu/obor." };
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
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    if (memberData.managementRole && !(email ?? "").trim()) {
      return {
        success: false,
        error: "Člen vedení musí mít e-mail. Nejdřív mu odeber roli.",
      };
    }

    const updated = await dbUpdateMemberEmail(memberId, email ?? null);
    if (!updated) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    revalidatePath("/admin/members");
    return {
      success: true,
      data: { revokedLinks: updated.revokedLinks, isManagement: !!memberData.managementRole },
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { success: false, error: EMAIL_TAKEN_TEXT };
    }
    console.error("updateMemberEmailAction error:", error);
    return { success: false, error: "Nepodarilo se aktualizovat email." };
  }
}

/**
 * Update the joined_at (entry date) for a member. Requires admin role
 * (arch 7.1 — deliberately admin-only, not moderator, unlike the interview
 * question editor).
 *
 * Editing this value is also how the "neoverene datum vstupu" indicator on
 * the /interviews due-list clears — that indicator is a zero-schema
 * heuristic (joined_at == created_at::date), so once an admin sets a real
 * entry date it naturally stops matching created_at and disappears.
 */
export async function updateMemberJoinedAtAction(
  memberId: string,
  joinedAt: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(joinedAt)) {
    return { success: false, error: "Neplatny format data. Pouzijte format RRRR-MM-DD." };
  }

  const parsed = new Date(`${joinedAt}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return { success: false, error: "Neplatne datum." };
  }

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    await dbUpdateMemberJoinedAt(memberId, joinedAt);

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("updateMemberJoinedAtAction error:", error);
    return { success: false, error: "Nepodarilo se aktualizovat datum vstupu." };
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
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  const actorId = auth.session.memberId;
  if (memberId === actorId) {
    return { success: false, error: "Sám sebe smazat nejde." };
  }

  try {
    const memberData = await getMemberById(memberId);
    if (!memberData) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    // iter-035 L-2: poznámky k pomoci z burzy, kde je člen příjemcem, se
    // vynulují před smazáním (pak by osiřely). Selhání smazání zastaví
    // (fail closed): radši chyba a opakování než osiřelý text. Bez transakce.
    try {
      await clearHelpNotesForRecipient(memberId);
    } catch (err) {
      console.error(`deleteMemberAction burza cleanup failed: ${err instanceof Error ? err.name : typeof err}`);
      return { success: false, error: "Nepodarilo se smazat clena." };
    }

    const deleted = await deleteMemberGuarded(memberId, actorId);
    if (!deleted) {
      return {
        success: false,
        error:
          memberData.managementRole === "admin"
            ? "Posledního admina smazat nejde."
            : "Clena se nepodarilo smazat, obnov stranku.",
      };
    }

    revalidatePath("/admin/members");
    return { success: true };
  } catch (error) {
    console.error("deleteMemberAction error:", error);
    return { success: false, error: "Nepodarilo se smazat clena." };
  }
}
