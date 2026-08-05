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
 * iter-021: appliesMonth5/appliesMonth10 default to true (both checkboxes
 * checked by default in the editor, arch T-001 7.1) — the DB column default
 * already covers an omitted value, the optional params just let a caller be
 * explicit without a second UPDATE.
 */
export async function createQuestion(data: {
  text: string;
  questionType?: string;
  appliesMonth5?: boolean;
  appliesMonth10?: boolean;
}) {
  const results = await getDb()
    .insert(interviewQuestion)
    .values({
      text: data.text,
      questionType: data.questionType ?? "text",
      appliesMonth5: data.appliesMonth5 ?? true,
      appliesMonth10: data.appliesMonth10 ?? true,
      position: sql`(SELECT COALESCE(MAX(position), 0) + 1 FROM interview_question)`,
    })
    .returning();

  return results[0];
}

/**
 * Update a question's text AND both applicability flags in one statement
 * (arch T-001 7.2 / T-003 section 7 — assigned to T-005 as a query-layer
 * function; the T-006 editor UI + `actions/interview-questions.ts` wire this
 * as the sole text/flags update path). One UPDATE = no transient false/false
 * row; the DB CHECK (`interview_question_applies_check`) still guards any
 * caller that bypasses the intended "validate aspoň jeden in the action"
 * flow. updated_at set explicitly, same convention as the rest of this file.
 */
export async function updateQuestion(
  id: string,
  data: { text: string; appliesMonth5: boolean; appliesMonth10: boolean }
): Promise<void> {
  await getDb()
    .update(interviewQuestion)
    .set({
      text: data.text,
      appliesMonth5: data.appliesMonth5,
      appliesMonth10: data.appliesMonth10,
      updatedAt: new Date(),
    })
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
