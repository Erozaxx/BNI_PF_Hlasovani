import { eq, asc, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { category, guest } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get all categories ordered by name.
 */
export async function getCategories() {
  return getDb().select().from(category).orderBy(asc(category.name));
}

/**
 * Get only categories that have at least one guest assigned.
 * Used for filter UI to avoid showing empty categories.
 */
export async function getCategoriesWithGuests() {
  return getDb()
    .selectDistinct({ id: category.id, name: category.name, createdAt: category.createdAt })
    .from(category)
    .innerJoin(guest, eq(guest.categoryId, category.id))
    .where(isNotNull(guest.categoryId))
    .orderBy(asc(category.name));
}

/**
 * Get a single category by ID.
 */
export async function getCategoryById(id: string) {
  const results = await getDb()
    .select()
    .from(category)
    .where(eq(category.id, id))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Create a new category.
 */
export async function createCategory(name: string) {
  const results = await getDb()
    .insert(category)
    .values({ name })
    .returning();

  return results[0];
}

/**
 * Rename an existing category.
 */
export async function renameCategory(id: string, name: string) {
  const results = await getDb()
    .update(category)
    .set({ name })
    .where(eq(category.id, id))
    .returning();

  return results[0] ?? null;
}

/**
 * Delete a category by ID.
 * Guests referencing this category will have categoryId set to NULL (FK onDelete: set null).
 */
export async function deleteCategory(id: string): Promise<boolean> {
  const results = await getDb()
    .delete(category)
    .where(eq(category.id, id))
    .returning({ id: category.id });

  return results.length > 0;
}
