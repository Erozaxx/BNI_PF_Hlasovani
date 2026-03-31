"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  createMember as dbCreateMember,
  getMemberById,
  updateTokenUsed,
} from "@/lib/db/queries/members";
import { generateMagicToken } from "@/lib/auth/magic";
import type { ActionResult } from "@/lib/types";

/**
 * Create a new member. Requires admin role.
 */
export async function createMemberAction(
  name: string,
  email?: string,
  managementRole?: string | null
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno clena je povinne." };
  }

  try {
    const newMember = await dbCreateMember({
      name: name.trim(),
      email: email?.trim() || undefined,
      managementRole: managementRole || null,
    });

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
