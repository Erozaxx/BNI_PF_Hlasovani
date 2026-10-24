"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import {
  createCategory as dbCreateCategory,
  renameCategory as dbRenameCategory,
  deleteCategory as dbDeleteCategory,
} from "@/lib/db/queries/categories";
import type { ActionResult } from "@/lib/types";

/**
 * Create a new category. Requires admin or moderator role.
 */
export async function createCategoryAction(
  name: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission("categories.create");
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Název je povinný." };
  }

  try {
    const cat = await dbCreateCategory(name.trim());
    revalidatePath("/admin/categories");
    revalidatePath("/guests");
    return { success: true, data: { id: cat.id } };
  } catch (error) {
    console.error("createCategoryAction error:", error);
    return { success: false, error: "Kategorii se nepodařilo vytvořit." };
  }
}

/**
 * Delete a category. Requires admin role.
 * Guests referencing this category will have their categoryId set to NULL.
 */
export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  const auth = await requirePermission("categories.manage");
  if (!auth.success) return auth;

  if (!id || !id.trim()) {
    return { success: false, error: "Neplatná kategorie." };
  }

  try {
    const deleted = await dbDeleteCategory(id);
    if (!deleted) {
      return { success: false, error: "Kategorie nebyla nalezena." };
    }

    revalidatePath("/admin/categories");
    revalidatePath("/guests");
    return { success: true };
  } catch (error) {
    console.error("deleteCategoryAction error:", error);
    return { success: false, error: "Kategorii se nepodařilo smazat." };
  }
}

/**
 * Rename an existing category. Requires admin or moderator role.
 */
export async function renameCategoryAction(
  id: string,
  name: string
): Promise<ActionResult> {
  const auth = await requirePermission("categories.manage");
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Název je povinný." };
  }

  try {
    const updated = await dbRenameCategory(id, name.trim());
    if (!updated) {
      return { success: false, error: "Kategorie nebyla nalezena." };
    }

    revalidatePath("/admin/categories");
    revalidatePath("/guests");
    return { success: true };
  } catch (error) {
    console.error("renameCategoryAction error:", error);
    return { success: false, error: "Kategorii se nepodařilo přejmenovat." };
  }
}
