import { eq, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { category } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get all categories ordered by name.
 */
export async function getCategories() {
  return getDb().select().from(category).orderBy(asc(category.name));
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
