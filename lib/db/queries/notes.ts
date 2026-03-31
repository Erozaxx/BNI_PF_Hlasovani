import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as neonSql } from "@/lib/db/client";
import { note } from "@/lib/db/schema";

const db = drizzle(neonSql);

/**
 * Get all notes for a guest. Returns ONLY id, text, createdAt.
 * NEVER returns member_id — notes are anonymous by design.
 */
export async function getNotesForGuest(guestId: string) {
  return db
    .select({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
    })
    .from(note)
    .where(eq(note.guestId, guestId))
    .orderBy(desc(note.createdAt));
}

/**
 * Create a new anonymous note for a guest.
 * member_id is stored for audit but NEVER exposed via getNotesForGuest.
 */
export async function createNote(
  memberId: string,
  guestId: string,
  text: string
) {
  const results = await db
    .insert(note)
    .values({
      memberId,
      guestId,
      text,
    })
    .returning({
      id: note.id,
      text: note.text,
      createdAt: note.createdAt,
    });

  return results[0];
}
