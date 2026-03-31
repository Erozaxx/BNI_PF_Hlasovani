import { eq, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as neonSql } from "@/lib/db/client";
import { category } from "@/lib/db/schema";

const db = drizzle(neonSql);

/**
 * Get all categories ordered by name.
 */
export async function getCategories() {
  return db.select().from(category).orderBy(asc(category.name));
}

/**
 * Get a single category by ID.
 */
export async function getCategoryById(id: string) {
  const results = await db
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
  const results = await db
    .insert(category)
    .values({ name })
    .returning();

  return results[0];
}

/**
 * Rename an existing category.
 */
export async function renameCategory(id: string, name: string) {
  const results = await db
    .update(category)
    .set({ name })
    .where(eq(category.id, id))
    .returning();

  return results[0] ?? null;
}
