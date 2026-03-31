"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { createNote } from "@/lib/db/queries/notes";
import type { ActionResult } from "@/lib/types";

const noteSchema = z.object({
  text: z
    .string()
    .min(1, "Poznamka nesmi byt prazdna.")
    .max(2000, "Poznamka muze mit maximalne 2000 znaku."),
});

/**
 * Create an anonymous note for a guest.
 * Any authenticated member can add a note at any time.
 */
export async function createNoteAction(
  guestId: string,
  text: string
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  const parsed = noteSchema.safeParse({ text });
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Neplatna poznamka.";
    return { success: false, error: firstError };
  }

  if (!guestId) {
    return { success: false, error: "Host nebyl specifikovan." };
  }

  try {
    await createNote(auth.session.memberId, guestId, parsed.data.text);

    revalidatePath(`/guests/${guestId}`);
    return { success: true };
  } catch (error) {
    console.error("createNoteAction error:", error);
    return { success: false, error: "Nepodarilo se ulozit poznamku." };
  }
}
