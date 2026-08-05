"use server";

import { revalidatePath } from "next/cache";
import { requireManagementRole } from "@/lib/auth/guards";
import {
  createQuestion as dbCreateQuestion,
  updateQuestion as dbUpdateQuestion,
  setQuestionActive as dbSetQuestionActive,
  reorderQuestions as dbReorderQuestions,
  getQuestionById,
  getAllQuestions,
} from "@/lib/db/queries/interview-questions";
import type { ActionResult } from "@/lib/types";

// Global editor for the interview question set (arch section 6/9, T-004a delta 1).
// Every action here is available to admin AND moderator — requireManagementRole,
// never requireAdmin (that guard stays reserved for member.joined_at edits, out
// of this task's scope).

const QUESTIONS_PATH = "/interviews/questions";
const MAX_TEXT_LENGTH = 1000;

function validateText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return "Text otazky je povinny.";
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    return `Text otazky muze mit nejvyse ${MAX_TEXT_LENGTH} znaku.`;
  }
  return null;
}

/**
 * Server-side mirror of the UI checkbox validation (arch T-001 1.2 / 7.2):
 * a question that applies to neither interview type is a meaningless state
 * (unfillable and struck through everywhere). UI validation is not authority.
 */
function validateApplies(
  appliesMonth5: boolean,
  appliesMonth10: boolean
): string | null {
  if (!appliesMonth5 && !appliesMonth10) {
    return "Otazka musi platit alespon pro jeden typ pohovoru.";
  }
  return null;
}

/**
 * Create a new question at the end of the ordering. Requires admin or moderator role.
 * appliesMonth5/appliesMonth10 default to true (both checkboxes checked by
 * default in the editor, arch T-001 7.1).
 */
export async function createQuestionAction(
  text: string,
  appliesMonth5: boolean = true,
  appliesMonth10: boolean = true
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  const validationError = validateText(text);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const appliesError = validateApplies(appliesMonth5, appliesMonth10);
  if (appliesError) {
    return { success: false, error: appliesError };
  }

  try {
    const created = await dbCreateQuestion({
      text: text.trim(),
      appliesMonth5,
      appliesMonth10,
    });
    revalidatePath(QUESTIONS_PATH);
    return { success: true, data: { id: created.id } };
  } catch (error) {
    console.error("createQuestionAction error:", error);
    return { success: false, error: "Nepodarilo se vytvorit otazku." };
  }
}

/**
 * Update the text and applicability flags of an existing question. Requires
 * admin or moderator role. Existing snapshots (already-founded interviews) are
 * copies and are unaffected — only future interviews pick up the new values.
 *
 * One call updates text + both flags atomically (arch T-001 7.2 — a separate
 * flags-only action was rejected, the "aspoň jeden true" validation needs
 * both flags together).
 */
export async function updateQuestionAction(
  id: string,
  text: string,
  appliesMonth5: boolean,
  appliesMonth10: boolean
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  const validationError = validateText(text);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const appliesError = validateApplies(appliesMonth5, appliesMonth10);
  if (appliesError) {
    return { success: false, error: appliesError };
  }

  try {
    const existing = await getQuestionById(id);
    if (!existing) {
      return { success: false, error: "Otazka nebyla nalezena." };
    }

    await dbUpdateQuestion(id, {
      text: text.trim(),
      appliesMonth5,
      appliesMonth10,
    });
    revalidatePath(QUESTIONS_PATH);
    return { success: true };
  } catch (error) {
    console.error("updateQuestionAction error:", error);
    return { success: false, error: "Nepodarilo se upravit otazku." };
  }
}

/**
 * Archive (soft delete) or reactivate a question. Requires admin or moderator
 * role. Archiving never removes the row — source_question_id pairing for
 * existing snapshots (arch section 4.1/4.2) stays intact; it only excludes the
 * question from future interview snapshots.
 */
export async function setQuestionActiveAction(
  id: string,
  active: boolean
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getQuestionById(id);
    if (!existing) {
      return { success: false, error: "Otazka nebyla nalezena." };
    }

    await dbSetQuestionActive(id, active);
    revalidatePath(QUESTIONS_PATH);
    return { success: true };
  } catch (error) {
    console.error("setQuestionActiveAction error:", error);
    return {
      success: false,
      error: active
        ? "Nepodarilo se obnovit otazku."
        : "Nepodarilo se archivovat otazku.",
    };
  }
}

/**
 * Persist a new order for ALL questions (active + archived — the editor lists
 * both). Sequential UPDATEs, no db.transaction() (LL-003); `position` has no
 * UNIQUE constraint precisely so this can run without transient collisions
 * mid-reorder (same pattern as reorderMembers/display_order, iter-019).
 *
 * Completeness guard (mirrors /api/members/reorder): the list must be a full
 * permutation of every existing question id, otherwise the missing rows would
 * keep their old position and produce collisions/gaps.
 */
export async function reorderQuestionsAction(
  orderedIds: string[]
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (
    !Array.isArray(orderedIds) ||
    orderedIds.some((id) => typeof id !== "string" || id.length === 0)
  ) {
    return { success: false, error: "Neplatny seznam otazek." };
  }

  if (new Set(orderedIds).size !== orderedIds.length) {
    return { success: false, error: "Seznam otazek obsahuje duplicity." };
  }

  try {
    const all = await getAllQuestions();
    const knownIds = new Set(all.map((q) => q.id));

    if (
      orderedIds.length !== all.length ||
      !orderedIds.every((id) => knownIds.has(id))
    ) {
      return {
        success: false,
        error: "Seznam otazek musi obsahovat prave vsechny existujici otazky.",
      };
    }

    await dbReorderQuestions(orderedIds);
    revalidatePath(QUESTIONS_PATH);
    return { success: true };
  } catch (error) {
    console.error("reorderQuestionsAction error:", error);
    return { success: false, error: "Nepodarilo se ulozit poradi otazek." };
  }
}
