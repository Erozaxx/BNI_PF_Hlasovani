"use server";

import { revalidatePath } from "next/cache";
import { requireManagementRole } from "@/lib/auth/guards";
import {
  createGuest as dbCreateGuest,
  updateGuest as dbUpdateGuest,
  updateGuestCategory as dbUpdateGuestCategory,
} from "@/lib/db/queries/guests";
import type { ActionResult } from "@/lib/types";

/**
 * Create a new guest. Requires admin or moderator role.
 */
export async function createGuestAction(
  name: string,
  categoryId: string,
  description?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno hosta je povinne." };
  }

  if (!categoryId) {
    return { success: false, error: "Kategorie je povinna." };
  }

  try {
    const guest = await dbCreateGuest({
      name: name.trim(),
      description: description?.trim() || undefined,
      categoryId,
      createdBy: auth.session.memberId,
    });

    revalidatePath("/guests");
    revalidatePath("/dashboard");
    return { success: true, data: { id: guest.id } };
  } catch (error) {
    console.error("createGuestAction error:", error);
    return { success: false, error: "Nepodarilo se vytvorit hosta." };
  }
}

/**
 * Update an existing guest's name and description. Requires admin or moderator role.
 */
export async function updateGuestAction(
  id: string,
  name: string,
  description?: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno hosta je povinne." };
  }

  try {
    const updated = await dbUpdateGuest(id, {
      name: name.trim(),
      description: description?.trim(),
    });

    if (!updated) {
      return { success: false, error: "Host nebyl nalezen." };
    }

    revalidatePath("/guests");
    revalidatePath(`/guests/${id}`);
    return { success: true };
  } catch (error) {
    console.error("updateGuestAction error:", error);
    return { success: false, error: "Nepodarilo se aktualizovat hosta." };
  }
}

/**
 * Change a guest's category. Requires admin or moderator role.
 */
export async function updateGuestCategoryAction(
  id: string,
  categoryId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!categoryId) {
    return { success: false, error: "Kategorie je povinna." };
  }

  try {
    const updated = await dbUpdateGuestCategory(id, categoryId);

    if (!updated) {
      return { success: false, error: "Host nebyl nalezen." };
    }

    revalidatePath("/guests");
    revalidatePath(`/guests/${id}`);
    return { success: true };
  } catch (error) {
    console.error("updateGuestCategoryAction error:", error);
    return { success: false, error: "Nepodarilo se zmenit kategorii." };
  }
}
