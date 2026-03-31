import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { guest, category, note } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get all guests with their category, ordered by creation date desc.
 * Optionally filter by category ID.
 */
export async function getGuests(categoryId?: string) {
  const query = getDb()
    .select({
      id: guest.id,
      name: guest.name,
      description: guest.description,
      categoryId: guest.categoryId,
      categoryName: category.name,
      createdAt: guest.createdAt,
    })
    .from(guest)
    .leftJoin(category, eq(guest.categoryId, category.id))
    .orderBy(desc(guest.createdAt));

  if (categoryId) {
    return query.where(eq(guest.categoryId, categoryId));
  }

  return query;
}

/**
 * Get a single guest by ID with category info.
 */
export async function getGuestById(id: string) {
  const results = await getDb()
    .select({
      id: guest.id,
      name: guest.name,
      description: guest.description,
      categoryId: guest.categoryId,
      categoryName: category.name,
      createdAt: guest.createdAt,
      createdBy: guest.createdBy,
    })
    .from(guest)
    .leftJoin(category, eq(guest.categoryId, category.id))
    .where(eq(guest.id, id))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Get a guest with their notes (anonymized - no member info).
 * Notes sorted by creation date desc.
 */
export async function getGuestWithNotes(id: string) {
  const guestData = await getGuestById(id);
  if (!guestData) return null;

  const notes = await getDb()
    .select({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
    })
    .from(note)
    .where(eq(note.guestId, id))
    .orderBy(desc(note.createdAt));

  return { ...guestData, notes };
}

/**
 * Insert a new guest.
 */
export async function createGuest(data: {
  name: string;
  description?: string;
  categoryId?: string;
  createdBy?: string;
}) {
  const results = await getDb()
    .insert(guest)
    .values({
      name: data.name,
      description: data.description || null,
      categoryId: data.categoryId || null,
      createdBy: data.createdBy || null,
    })
    .returning();

  return results[0];
}

/**
 * Update a guest's name and description.
 */
export async function updateGuest(
  id: string,
  data: { name: string; description?: string }
) {
  const results = await getDb()
    .update(guest)
    .set({
      name: data.name,
      description: data.description ?? null,
    })
    .where(eq(guest.id, id))
    .returning();

  return results[0] ?? null;
}

/**
 * Update a guest's category.
 */
export async function updateGuestCategory(id: string, categoryId: string) {
  const results = await getDb()
    .update(guest)
    .set({ categoryId })
    .where(eq(guest.id, id))
    .returning();

  return results[0] ?? null;
}
