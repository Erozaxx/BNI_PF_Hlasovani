"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  createMember as dbCreateMember,
  getMemberById,
  updateTokenUsed,
} from "@/lib/db/queries/members";
import { generateMagicToken } from "@/lib/auth/magic";
import { sendMagicLinkEmail } from "@/lib/email/resend";
import { hash } from "bcryptjs";
import type { ActionResult } from "@/lib/types";

/**
 * Create a new member. Requires admin role.
 *
 * - Regular members (no managementRole): auto-generate magic token for voting access
 * - Admin/moderator: require password, hash it (bcrypt cost 12); no magic token generated
 */
export async function createMemberAction(
  name: string,
  email?: string,
  managementRole?: string | null,
  password?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno clena je povinne." };
  }

  const isManagement = !!managementRole;

  if (isManagement) {
    if (!email?.trim()) {
      return { success: false, error: "Pro admin/moderator roli je nutny email." };
    }
    if (!password || password.length < 8) {
      return { success: false, error: "Pro admin/moderator roli je nutne zadat heslo (min. 8 znaku)." };
    }
  }

  try {
    let passwordHash: string | null = null;
    if (isManagement && password) {
      passwordHash = await hash(password, 12);
    }

    const newMember = await dbCreateMember({
      name: name.trim(),
      email: email?.trim() || undefined,
      managementRole: managementRole || null,
      passwordHash,
    });

    if (!isManagement) {
      // Regular members use magic link for voting access
      await generateMagicToken(newMember.id);
    }

    revalidatePath("/admin/members");
    return { success: true, data: { id: newMember.id } };
  } catch (error) {
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
