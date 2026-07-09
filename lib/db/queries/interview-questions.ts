import { eq, asc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { interviewQuestion } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

/**
 * Get all ACTIVE questions ordered deterministically (position, then createdAt,
 * then id as a final tiebreaker). This exact ordering is what
 * createInterviewWithSnapshot() (lib/db/queries/interviews.ts) uses to assign
 * dense-rank positions when copying into a snapshot — duplicate `position`
 * values in the live set (R-8) can never collide in the copy.
 */
export async function getActiveQuestions() {
  return getDb()
    .select()
    .from(interviewQuestion)
    .where(eq(interviewQuestion.active, true))
    .orderBy(
      asc(interviewQuestion.position),
      asc(interviewQuestion.createdAt),
      asc(interviewQuestion.id)
    );
}

/**
 * Get ALL questions (active + archived) for the editor UI, same deterministic
 * ordering as getActiveQuestions().
 */
export async function getAllQuestions() {
  return getDb()
    .select()
    .from(interviewQuestion)
    .orderBy(
      asc(interviewQuestion.position),
      asc(interviewQuestion.createdAt),
      asc(interviewQuestion.id)
    );
}

/**
 * Get a single question by ID. Returns null if not found.
 */
export async function getQuestionById(id: string) {
  const rows = await getDb()
    .select()
    .from(interviewQuestion)
    .where(eq(interviewQuestion.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Create a new question at the end of the ordering (max(position)+1).
 * Mirrors createMember's displayOrder pattern (lib/db/queries/members.ts).
 */
export async function createQuestion(data: {
  text: string;
  questionType?: string;
}) {
  const results = await getDb()
    .insert(interviewQuestion)
    .values({
      text: data.text,
      questionType: data.questionType ?? "text",
      position: sql`(SELECT COALESCE(MAX(position), 0) + 1 FROM interview_question)`,
    })
    .returning();

  return results[0];
}

/**
 * Update the text of a question. updated_at must be set explicitly (Drizzle has
 * no auto-update).
 */
export async function updateQuestionText(id: string, text: string): Promise<void> {
  await getDb()
    .update(interviewQuestion)
    .set({ text, updatedAt: new Date() })
    .where(eq(interviewQuestion.id, id));
}

/**
 * Archive or reactivate a question (soft delete — preserves source_question_id
 * pairing for existing snapshots, per arch section 4.1).
 */
export async function setQuestionActive(id: string, active: boolean): Promise<void> {
  await getDb()
    .update(interviewQuestion)
    .set({ active, updatedAt: new Date() })
    .where(eq(interviewQuestion.id, id));
}

/**
 * Reorder questions by setting position = index+1 (1-based) for each id in
 * orderedIds. Sequential UPDATEs (LL-003: no db.transaction() — neon-http driver
 * doesn't support it). `position` has no UNIQUE constraint precisely so this can
 * run without transient collisions mid-reorder (same pattern as
 * reorderMembers/display_order, iter-019).
 */
export async function reorderQuestions(orderedIds: string[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(interviewQuestion)
      .set({ position: i + 1, updatedAt: new Date() })
      .where(eq(interviewQuestion.id, orderedIds[i]));
  }
}
