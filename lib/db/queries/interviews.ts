import { eq, and, or, ne, asc, desc, count, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/neon-http";
import { addMonths, differenceInCalendarDays, isAfter, parseISO } from "date-fns";
import { getSql } from "@/lib/db/client";
import {
  interview,
  interviewQuestion,
  interviewQuestionSnapshot,
  interviewAnswer,
  member,
} from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

export type InterviewType = "month_5" | "month_10";
export type InterviewStatus = "open" | "submitted" | "cancelled";

/**
 * Derive whether a snapshot question applies to an interview's type (arch
 * T-001 5.1). Single source of truth for `type === "month_5" ? appliesMonth5
 * : appliesMonth10` — used by both GET /api/i/[token]/form and the server
 * component app/i/[token]/page.tsx (T-009 review MINOR-1). The two call
 * sites stay duplicated in WHERE they call this from (the server component
 * loads data in-process instead of self-fetching its own API route, see its
 * doc comment — M-1 iter-020), but the derivation rule itself now lives in
 * exactly one place.
 *
 * `type` is typed as `string`, not `InterviewType`, because both call sites
 * pass `interview.type` straight from `getInterviewDetail()` — a plain
 * `text()` column at the Drizzle layer (DB-level CHECK constrains it to
 * "month_5"/"month_10", but that is not reflected in the inferred select
 * type). Anything other than "month_5" falls into the `appliesMonth10`
 * branch, matching the pre-existing ternary this replaces.
 */
export function deriveApplies(
  type: string,
  q: { appliesMonth5: boolean; appliesMonth10: boolean }
): boolean {
  return type === "month_5" ? q.appliesMonth5 : q.appliesMonth10;
}

// ============================================================
// Snapshot founding (arch section 4.1) — the core "create interview" sequence.
// No db.transaction() anywhere (LL-003): sequential statements with WHERE
// guards / ON CONFLICT / repair-on-retry, exactly as specified in the design.
// ============================================================

export type CreateInterviewResult =
  | { status: "created"; interviewId: string; questionCount: number }
  | { status: "repaired"; interviewId: string; questionCount: number }
  | { status: "duplicate"; interviewId: string }
  | { status: "empty_question_set" }
  // iter-021 (T-003 MAJOR-1 fix, sekce 2.2): vraceno JEN při zakládání
  // čerstvého pohovoru (žádný non-cancelled pohovor pro member+type
  // neexistuje) a živá sada nemá pro daný typ jedinou platnou otázku.
  // Existuje-li pohovor k opravě/deduplikaci, řídí se dál handleDuplicateInterview
  // a tenhle status se nikdy nevrátí — repair-on-retry zůstává nezablokovaný.
  | { status: "no_applicable_questions" }
  | { status: "failed" };

type ActiveQuestionRow = {
  id: string;
  text: string;
  questionType: string;
  // iter-021: platnost otázky pro daný typ pohovoru (arch T-001 sekce 4)
  appliesMonth5: boolean;
  appliesMonth10: boolean;
};

/**
 * Re-check snapshot coverage for an interview against the currently active
 * question set, inserting any missing rows (repair-on-retry, MAJOR-1 fix).
 * New rows get position = MAX(existing position) + rank, so they never collide
 * with rows already present. Returns true once every question in
 * `activeQuestions` has a matching snapshot row (per-source EXISTS check —
 * NOT a raw count comparison, so a snapshot that also contains a
 * since-archived question, count > N, is still correctly judged "complete").
 */
async function repairSnapshotCoverage(
  db: ReturnType<typeof getDb>,
  interviewId: string,
  activeQuestions: ActiveQuestionRow[]
): Promise<boolean> {
  const existingRows = await db
    .select({
      sourceQuestionId: interviewQuestionSnapshot.sourceQuestionId,
      position: interviewQuestionSnapshot.position,
    })
    .from(interviewQuestionSnapshot)
    .where(eq(interviewQuestionSnapshot.interviewId, interviewId));

  const existingSourceIds = new Set(
    existingRows
      .map((r) => r.sourceQuestionId)
      .filter((v): v is string => v !== null)
  );

  const missing = activeQuestions.filter((q) => !existingSourceIds.has(q.id));

  if (missing.length === 0) {
    return true;
  }

  const maxPosition = existingRows.reduce((max, r) => Math.max(max, r.position), 0);

  const repairRows = missing.map((q, idx) => ({
    interviewId,
    sourceQuestionId: q.id,
    text: q.text,
    questionType: q.questionType,
    // iter-021: repair kopíruje AKTUÁLNÍ příznaky živé sady (mixed-generation
    // edge case akceptovaný v arch T-001 sekci 4 — identická sémantika jako
    // dnešní editace textu mezi pokusy).
    appliesMonth5: q.appliesMonth5,
    appliesMonth10: q.appliesMonth10,
    position: maxPosition + idx + 1,
  }));

  await db
    .insert(interviewQuestionSnapshot)
    .values(repairRows)
    .onConflictDoNothing({
      target: [
        interviewQuestionSnapshot.interviewId,
        interviewQuestionSnapshot.sourceQuestionId,
      ],
    });

  const recheckRows = await db
    .select({ sourceQuestionId: interviewQuestionSnapshot.sourceQuestionId })
    .from(interviewQuestionSnapshot)
    .where(eq(interviewQuestionSnapshot.interviewId, interviewId));
  const recheckIds = new Set(
    recheckRows.map((r) => r.sourceQuestionId).filter((v): v is string => v !== null)
  );

  return activeQuestions.every((q) => recheckIds.has(q.id));
}

/**
 * Duplicate-create path (arch 8a): the initial INSERT hit the partial UNIQUE
 * (member_id, type) WHERE status <> 'cancelled' (Postgres 23505). Find the
 * existing non-cancelled interview and check whether its snapshot already
 * covers every currently active question:
 *   - complete   → genuine duplicate attempt, caller shows a readable error.
 *   - incomplete → earlier partial failure; repair it and report success.
 */
async function handleDuplicateInterview(
  db: ReturnType<typeof getDb>,
  memberId: string,
  type: InterviewType,
  activeQuestions: ActiveQuestionRow[]
): Promise<CreateInterviewResult> {
  const existing = await db
    .select({ id: interview.id })
    .from(interview)
    .where(
      and(
        eq(interview.memberId, memberId),
        eq(interview.type, type),
        ne(interview.status, "cancelled")
      )
    )
    .limit(1);

  if (existing.length === 0) {
    // Race: constraint reported a conflict but no matching row exists anymore
    // (concurrent delete) — surface as failed so the caller can retry the create.
    return { status: "failed" };
  }

  const interviewId = existing[0].id;

  const existingSnapshotRows = await db
    .select({ sourceQuestionId: interviewQuestionSnapshot.sourceQuestionId })
    .from(interviewQuestionSnapshot)
    .where(eq(interviewQuestionSnapshot.interviewId, interviewId));
  const existingIds = new Set(
    existingSnapshotRows
      .map((r) => r.sourceQuestionId)
      .filter((v): v is string => v !== null)
  );
  const isComplete = activeQuestions.every((q) => existingIds.has(q.id));

  if (isComplete) {
    return { status: "duplicate", interviewId };
  }

  const repaired = await repairSnapshotCoverage(db, interviewId, activeQuestions);
  return repaired
    ? { status: "repaired", interviewId, questionCount: activeQuestions.length }
    : { status: "failed" };
}

/**
 * Create a new interview with a frozen question snapshot (arch section 4.1).
 *
 * Sequence (no db.transaction(), LL-003):
 *   1. Read active questions, deterministic order → N questions, dense-rank
 *      positions 1..N assigned from THIS read (immune to live-set duplicate
 *      positions, R-8).
 *   2. INSERT interview row. Partial UNIQUE (member,type) WHERE status<>'cancelled'
 *      rejects a duplicate active interview → 23505 → repair-on-retry path.
 *   3. Bulk INSERT snapshot rows, ON CONFLICT (interview_id, source_question_id)
 *      DO NOTHING (idempotent, keyed by QUESTION not position — MAJOR-1 fix).
 *   4. Verify COUNT(snapshot) == N. Mismatch → 1 repair insert + re-verify
 *      coverage; still incomplete → DELETE the interview and report failure
 *      (never leaves a permanently broken interview around).
 */
export async function createInterviewWithSnapshot(params: {
  memberId: string;
  type: InterviewType;
  leaderId: string;
  createdBy: string;
}): Promise<CreateInterviewResult> {
  const db = getDb();
  const { memberId, type, leaderId, createdBy } = params;

  const activeQuestions: ActiveQuestionRow[] = await db
    .select({
      id: interviewQuestion.id,
      text: interviewQuestion.text,
      questionType: interviewQuestion.questionType,
      appliesMonth5: interviewQuestion.appliesMonth5,
      appliesMonth10: interviewQuestion.appliesMonth10,
    })
    .from(interviewQuestion)
    .where(eq(interviewQuestion.active, true))
    .orderBy(
      asc(interviewQuestion.position),
      asc(interviewQuestion.createdAt),
      asc(interviewQuestion.id)
    );

  if (activeQuestions.length === 0) {
    return { status: "empty_question_set" };
  }

  // iter-021 guard (T-003 MAJOR-1 fix, sekce 2.2): sada bez jediné otázky
  // platné pro `type` by založila 100% přeškrtnutý formulář. Guard platí
  // JEN pro čerstvé založení — pokud pro (member, type) už existuje
  // non-cancelled pohovor, jde o retry/duplicate a řízení přebírá
  // handleDuplicateInterview beze změny (repair-on-retry nesmí guard
  // zablokovat). Nulová cena na happy path: dodatečný SELECT se provede
  // jen když `applicable.length === 0`.
  const applicable = activeQuestions.filter((q) =>
    type === "month_5" ? q.appliesMonth5 : q.appliesMonth10
  );
  if (applicable.length === 0) {
    const existing = await db
      .select({ id: interview.id })
      .from(interview)
      .where(
        and(
          eq(interview.memberId, memberId),
          eq(interview.type, type),
          ne(interview.status, "cancelled")
        )
      )
      .limit(1);
    if (existing.length > 0) {
      // Stejná větev, do které by vedl 23505: kompletní snapshot → čitelná
      // dedup chyba; nekompletní → repair. Guard se na existující pohovor
      // neaplikuje.
      return handleDuplicateInterview(db, memberId, type, activeQuestions);
    }
    return { status: "no_applicable_questions" };
  }

  let interviewId: string;
  try {
    const inserted = await db
      .insert(interview)
      .values({ memberId, type, leaderId, createdBy, status: "open" })
      .returning({ id: interview.id });
    interviewId = inserted[0].id;
  } catch (err: unknown) {
    const dbErr = err as { code?: string };
    if (dbErr?.code === "23505") {
      return handleDuplicateInterview(db, memberId, type, activeQuestions);
    }
    throw err;
  }

  const snapshotRows = activeQuestions.map((q, idx) => ({
    interviewId,
    sourceQuestionId: q.id,
    text: q.text,
    questionType: q.questionType,
    // iter-021: kopírují se VŠECHNY aktivní otázky vč. příznaků, i ty, které
    // pro `type` neplatí (arch T-001 1.4 — filtr je až read-time, snapshot
    // dál věrně dokumentuje podobu sady při založení).
    appliesMonth5: q.appliesMonth5,
    appliesMonth10: q.appliesMonth10,
    position: idx + 1,
  }));

  await db
    .insert(interviewQuestionSnapshot)
    .values(snapshotRows)
    .onConflictDoNothing({
      target: [
        interviewQuestionSnapshot.interviewId,
        interviewQuestionSnapshot.sourceQuestionId,
      ],
    });

  const countRows = await db
    .select({ value: count() })
    .from(interviewQuestionSnapshot)
    .where(eq(interviewQuestionSnapshot.interviewId, interviewId));
  const currentCount = countRows[0]?.value ?? 0;

  if (currentCount === activeQuestions.length) {
    return { status: "created", interviewId, questionCount: currentCount };
  }

  const repaired = await repairSnapshotCoverage(db, interviewId, activeQuestions);
  if (repaired) {
    return { status: "repaired", interviewId, questionCount: activeQuestions.length };
  }

  // Repair could not achieve coverage — clean up rather than leave a broken row.
  await db.delete(interview).where(eq(interview.id, interviewId));
  return { status: "failed" };
}

// ============================================================
// Basic CRUD / reads
// ============================================================

/**
 * Get the single non-cancelled interview for a member+type, if any.
 * Used by the no-duplicate UX (due-list disables already-covered types) and by
 * the compare view.
 */
export async function getActiveInterviewForMemberType(
  memberId: string,
  type: InterviewType
) {
  const rows = await getDb()
    .select()
    .from(interview)
    .where(
      and(
        eq(interview.memberId, memberId),
        eq(interview.type, type),
        ne(interview.status, "cancelled")
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Count interviews per member (all statuses, incl. any future 'cancelled'
 * rows — the FK is CASCADE so ALL of them would be wiped with the member).
 * One grouped query for every member (iter-020 T-006b, R-11) — used by the
 * member delete confirm dialog to warn "N pohovoru budou smazany" before the
 * irreversible deleteMemberAction. Returns a memberId -> count map; members
 * with zero interviews are simply absent from the map (caller defaults to 0).
 */
export async function getInterviewCountsByMember(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ memberId: interview.memberId, value: count() })
    .from(interview)
    .groupBy(interview.memberId);

  return new Map(rows.map((r) => [r.memberId, r.value]));
}

/**
 * Get a single interview by ID. Returns null if not found.
 */
export async function getInterviewById(id: string) {
  const rows = await getDb().select().from(interview).where(eq(interview.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Get a single interview by ID with member + leader display names — for the
 * admin/mod detail view (read-only).
 */
export async function getInterviewDetail(id: string) {
  const db = getDb();

  const rows = await db
    .select({
      id: interview.id,
      memberId: interview.memberId,
      memberName: member.name,
      type: interview.type,
      status: interview.status,
      leaderId: interview.leaderId,
      createdBy: interview.createdBy,
      createdAt: interview.createdAt,
      submittedAt: interview.submittedAt,
    })
    .from(interview)
    .innerJoin(member, eq(interview.memberId, member.id))
    .where(eq(interview.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  let leaderName: string | null = null;
  if (row.leaderId) {
    const leaderRows = await db
      .select({ name: member.name })
      .from(member)
      .where(eq(member.id, row.leaderId))
      .limit(1);
    leaderName = leaderRows[0]?.name ?? null;
  }

  return { ...row, leaderName };
}

/**
 * List interviews (for the /interviews admin page), newest first, with member +
 * leader display names. Optional status filter.
 */
export async function getInterviewsList(filter?: InterviewStatus) {
  // Self-join on member (once for the interviewee, once for the leader) needs a
  // real SQL alias — referencing the same table twice unaliased is ambiguous.
  const leader = alias(member, "interview_leader");
  const db = getDb();

  return db
    .select({
      id: interview.id,
      memberId: interview.memberId,
      memberName: member.name,
      type: interview.type,
      status: interview.status,
      leaderId: interview.leaderId,
      leaderName: leader.name,
      createdAt: interview.createdAt,
      submittedAt: interview.submittedAt,
    })
    .from(interview)
    .innerJoin(member, eq(interview.memberId, member.id))
    .leftJoin(leader, eq(interview.leaderId, leader.id))
    .where(filter ? eq(interview.status, filter) : undefined)
    .orderBy(desc(interview.createdAt));
}

/**
 * Change the leader for an interview. Guarded to status='open' (arch 8b) — the
 * caller is responsible for sequencing this AFTER revoking the previous link
 * (LL-003 ordering: revoke first, then update leader; revoke is idempotent so a
 * retry after a partial failure is safe).
 * Returns the updated row, or null if not found / not open.
 */
export async function updateInterviewLeader(interviewId: string, newLeaderId: string) {
  const rows = await getDb()
    .update(interview)
    .set({ leaderId: newLeaderId })
    .where(and(eq(interview.id, interviewId), eq(interview.status, "open")))
    .returning({ id: interview.id, leaderId: interview.leaderId });

  return rows[0] ?? null;
}

/**
 * Submit (close) an interview (arch 8e). Idempotent: a retry after the status
 * already flipped to 'submitted' affects 0 rows (returns false), which the
 * caller should treat as "already submitted", not an error.
 */
export async function submitInterview(interviewId: string): Promise<boolean> {
  const rows = await getDb()
    .update(interview)
    .set({ status: "submitted", submittedAt: new Date() })
    .where(and(eq(interview.id, interviewId), eq(interview.status, "open")))
    .returning({ id: interview.id });

  return rows.length > 0;
}

/**
 * Hard delete an interview (arch 8h, T-004a delta 2 — admin+mod, open OR
 * submitted). DB cascade (ON DELETE CASCADE on snapshot/answer/link FKs) removes
 * all dependent rows atomically in this single statement — no application-level
 * sequencing needed (LL-003 satisfied trivially: it's one statement).
 * Idempotent: deleting an already-gone interview affects 0 rows (returns false),
 * which the caller treats as success (target state "does not exist" holds).
 */
export async function deleteInterview(interviewId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(interview)
    .where(eq(interview.id, interviewId))
    .returning({ id: interview.id });

  return rows.length > 0;
}

// ============================================================
// Snapshot questions + answers
// ============================================================

/**
 * Get an interview's snapshot questions LEFT JOINed with the leader's answers,
 * ordered by position. Used by the fill-form (read + write UI) and by the
 * admin read-only detail view.
 */
export async function getInterviewQuestionsWithAnswers(interviewId: string) {
  return getDb()
    .select({
      snapshotId: interviewQuestionSnapshot.id,
      sourceQuestionId: interviewQuestionSnapshot.sourceQuestionId,
      position: interviewQuestionSnapshot.position,
      text: interviewQuestionSnapshot.text,
      questionType: interviewQuestionSnapshot.questionType,
      // iter-021 (T-007): raw per-type flags, read here so callers can derive
      // `applies` against interview.type. Kept raw (not pre-derived) because
      // this same query also feeds the admin detail/compare views (T-008),
      // which need both flags, not just the one for a single type.
      appliesMonth5: interviewQuestionSnapshot.appliesMonth5,
      appliesMonth10: interviewQuestionSnapshot.appliesMonth10,
      answerId: interviewAnswer.id,
      valueText: interviewAnswer.valueText,
      answerUpdatedAt: interviewAnswer.updatedAt,
    })
    .from(interviewQuestionSnapshot)
    .leftJoin(
      interviewAnswer,
      eq(interviewAnswer.snapshotQuestionId, interviewQuestionSnapshot.id)
    )
    .where(eq(interviewQuestionSnapshot.interviewId, interviewId))
    .orderBy(asc(interviewQuestionSnapshot.position));
}

/**
 * Upsert a single answer (arch 8d). Ownership guard (H-7/H-8 IDOR mitigation):
 * the snapshot question must belong to the given interview, checked with an
 * explicit SELECT before the write. A foreign/mismatched snapshotQuestionId
 * yields { success: false } — no row is written, no exception thrown. The
 * composite FK (interview_answer.snapshot_question_id, interview_id) →
 * interview_question_snapshot(id, interview_id) is the second line of defense
 * at the DB level for any write that bypasses this function.
 *
 * iter-021 (arch T-001 5.2): the same guard SELECT is extended with the
 * question's applicability for this interview's type — a snapshot row that
 * does not apply to the interview's type is treated exactly like a
 * foreign/mismatched id (uniform { success: false }, no enumeration signal).
 * UI never renders an input for such a question (T-007), this is the
 * server-side authority that a bypass still can't write past. Old interviews
 * (true/true backfill) always satisfy the OR below, so this is fully
 * backward compatible.
 */
export async function upsertInterviewAnswer(params: {
  interviewId: string;
  snapshotQuestionId: string;
  valueText: string | null;
}): Promise<{ success: boolean }> {
  const db = getDb();
  const { interviewId, snapshotQuestionId, valueText } = params;

  const owned = await db
    .select({ id: interviewQuestionSnapshot.id })
    .from(interviewQuestionSnapshot)
    .innerJoin(interview, eq(interview.id, interviewQuestionSnapshot.interviewId))
    .where(
      and(
        eq(interviewQuestionSnapshot.id, snapshotQuestionId),
        eq(interviewQuestionSnapshot.interviewId, interviewId),
        or(
          and(
            eq(interview.type, "month_5"),
            eq(interviewQuestionSnapshot.appliesMonth5, true)
          ),
          and(
            eq(interview.type, "month_10"),
            eq(interviewQuestionSnapshot.appliesMonth10, true)
          )
        )
      )
    )
    .limit(1);

  if (owned.length === 0) {
    return { success: false };
  }

  await db
    .insert(interviewAnswer)
    .values({ interviewId, snapshotQuestionId, valueText })
    .onConflictDoUpdate({
      target: interviewAnswer.snapshotQuestionId,
      set: {
        valueText: sql`excluded.value_text`,
        updatedAt: new Date(),
      },
    });

  return { success: true };
}

// ============================================================
// Due-list (5/10 months, computed-on-read — arch section 7.2)
// ============================================================

const UPCOMING_WINDOW_DAYS = 14;

export type InterviewDueEntry = {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  joinedAt: string;
  /** Heuristic (arch 7.1): joined_at == created_at::date → likely un-reviewed. */
  joinedAtUnverified: boolean;
  hasMonth5Interview: boolean;
  hasMonth10Interview: boolean;
  due5: boolean;
  due10: boolean;
  /** Days since due5 turned on (i.e. since entering month 5) — not days overdue. */
  due5SinceDays: number | null;
  /** Days since due10 turned on (i.e. since entering month 10) — not days overdue. */
  due10SinceDays: number | null;
  upcoming5: boolean;
  upcoming10: boolean;
};

/**
 * Compute the 5/10-month due-list for every member (arch section 7.2).
 * One query with a LEFT JOIN + aggregation, date math done in TS (date-fns).
 *
 * "Due" fires while the interview is relevant, not once it's overdue: due5
 * turns on when the member enters month 5 of membership (4 completed
 * months) and due10 when they enter month 10 (9 completed months). Per
 * iter-024, this replaced the original "5/10 completed months" threshold,
 * which fired a month too late — the interview is meant to happen during
 * the relevant month, not after it has fully elapsed.
 *
 * "Due" is also a standing condition (due from the date onward, not just on
 * the exact day) — a member stays in the due-list until the interview is
 * created, however long the admin/mod goes without checking.
 */
export async function getInterviewDueList(): Promise<InterviewDueEntry[]> {
  const rows = await getDb()
    .select({
      memberId: member.id,
      memberName: member.name,
      memberEmail: member.email,
      joinedAt: member.joinedAt,
      joinedAtUnverified: sql<boolean>`(${member.joinedAt} = ${member.createdAt}::date)`,
      // COALESCE(..., false) is required: bool_or() over a LEFT JOIN with zero
      // matching interview rows aggregates a single NULL and returns NULL, not
      // false — without this a member with no interviews at all would get
      // hasMonth5Interview/hasMonth10Interview = null instead of false.
      hasMonth5Interview: sql<boolean>`COALESCE(bool_or(${interview.type} = 'month_5' AND ${interview.status} <> 'cancelled'), false)`,
      hasMonth10Interview: sql<boolean>`COALESCE(bool_or(${interview.type} = 'month_10' AND ${interview.status} <> 'cancelled'), false)`,
    })
    .from(member)
    .leftJoin(interview, eq(interview.memberId, member.id))
    .groupBy(member.id, member.name, member.email, member.joinedAt, member.createdAt)
    .orderBy(asc(member.name));

  const today = new Date();

  return rows.map((row) => {
    const joined = parseISO(row.joinedAt);
    // due5Date/due10Date are the dates the member ENTERS the relevant month
    // (4 / 9 completed months), not the dates that month elapses — iter-024.
    const due5Date = addMonths(joined, 4);
    const due10Date = addMonths(joined, 9);

    const due5 = !row.hasMonth5Interview && !isAfter(due5Date, today);
    const due10 = !row.hasMonth10Interview && !isAfter(due10Date, today);

    const upcoming5 =
      !row.hasMonth5Interview &&
      !due5 &&
      differenceInCalendarDays(due5Date, today) <= UPCOMING_WINDOW_DAYS;
    const upcoming10 =
      !row.hasMonth10Interview &&
      !due10 &&
      differenceInCalendarDays(due10Date, today) <= UPCOMING_WINDOW_DAYS;

    return {
      memberId: row.memberId,
      memberName: row.memberName,
      memberEmail: row.memberEmail,
      joinedAt: row.joinedAt,
      joinedAtUnverified: row.joinedAtUnverified,
      hasMonth5Interview: row.hasMonth5Interview,
      hasMonth10Interview: row.hasMonth10Interview,
      due5,
      due10,
      due5SinceDays: due5 ? differenceInCalendarDays(today, due5Date) : null,
      due10SinceDays: due10 ? differenceInCalendarDays(today, due10Date) : null,
      upcoming5,
      upcoming10,
    };
  });
}

// ============================================================
// Compare 5 vs 10 (arch section 4.2) — read-time pairing, no persistence.
// ============================================================

export type CompareInterviewSide = {
  id: string;
  status: InterviewStatus;
  questions: Awaited<ReturnType<typeof getInterviewQuestionsWithAnswers>>;
} | null;

/**
 * Fetch both (month_5, month_10) non-cancelled interviews for a member, each
 * with its snapshot questions + answers. Either side may be null if that
 * interview doesn't exist yet.
 */
export async function getMemberInterviewsForCompare(memberId: string): Promise<{
  month5: CompareInterviewSide;
  month10: CompareInterviewSide;
}> {
  const rows = await getDb()
    .select({ id: interview.id, type: interview.type, status: interview.status })
    .from(interview)
    .where(
      and(
        eq(interview.memberId, memberId),
        inArray(interview.type, ["month_5", "month_10"]),
        ne(interview.status, "cancelled")
      )
    );

  const month5Row = rows.find((r) => r.type === "month_5") ?? null;
  const month10Row = rows.find((r) => r.type === "month_10") ?? null;

  const [month5Questions, month10Questions] = await Promise.all([
    month5Row ? getInterviewQuestionsWithAnswers(month5Row.id) : Promise.resolve([]),
    month10Row ? getInterviewQuestionsWithAnswers(month10Row.id) : Promise.resolve([]),
  ]);

  return {
    month5: month5Row
      ? { id: month5Row.id, status: month5Row.status as InterviewStatus, questions: month5Questions }
      : null,
    month10: month10Row
      ? { id: month10Row.id, status: month10Row.status as InterviewStatus, questions: month10Questions }
      : null,
  };
}

function normalizeQuestionText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

export type PairedQuestionRow = {
  questionText: string;
  answer5: string | null;
  answer10: string | null;
  // iter-021 (arch T-001 sekce 6.2): null = otazka na te strane vubec neni
  // (patri do sekce "Jen v pohovoru X"); false = je ve snapshotu, ale pro
  // tento typ pohovoru neplati (preskrtnout). Tyhle dva stavy nesmi splynout.
  applies5: boolean | null;
  applies10: boolean | null;
};

/**
 * Pure pairing function (arch 4.2) — no DB access. Pairs month_5/month_10
 * snapshot questions primarily by source_question_id, falling back to
 * normalized text when a question was archived and replaced (or has no
 * source_question_id). Ordered by the month_10 snapshot's position (newer
 * structure leads); unmatched rows never disappear, they land in separate
 * onlyIn5 / onlyIn10 lists.
 *
 * iter-021 (arch T-001 6.2): each row also carries applies5/applies10 read
 * straight from each side's OWN snapshot flags — the pairing algorithm itself
 * is unchanged, flags never enter the matching logic.
 */
export function pairInterviewAnswersForCompare(
  month5Questions: Array<{
    sourceQuestionId: string | null;
    text: string;
    position: number;
    valueText: string | null;
    appliesMonth5: boolean;
    appliesMonth10: boolean;
  }>,
  month10Questions: Array<{
    sourceQuestionId: string | null;
    text: string;
    position: number;
    valueText: string | null;
    appliesMonth5: boolean;
    appliesMonth10: boolean;
  }>
): {
  paired: PairedQuestionRow[];
  onlyIn5: PairedQuestionRow[];
  onlyIn10: PairedQuestionRow[];
} {
  const month5BySource = new Map<string, number>();
  const month5ByNormText = new Map<string, number>();
  month5Questions.forEach((q, idx) => {
    if (q.sourceQuestionId && !month5BySource.has(q.sourceQuestionId)) {
      month5BySource.set(q.sourceQuestionId, idx);
    }
    const key = normalizeQuestionText(q.text);
    if (!month5ByNormText.has(key)) {
      month5ByNormText.set(key, idx);
    }
  });

  const used5 = new Set<number>();
  const paired: PairedQuestionRow[] = [];
  const onlyIn10: PairedQuestionRow[] = [];

  const sorted10 = [...month10Questions].sort((a, b) => a.position - b.position);

  for (const q10 of sorted10) {
    let idx5: number | undefined;
    if (q10.sourceQuestionId && month5BySource.has(q10.sourceQuestionId)) {
      idx5 = month5BySource.get(q10.sourceQuestionId);
    } else {
      idx5 = month5ByNormText.get(normalizeQuestionText(q10.text));
    }

    if (idx5 !== undefined && !used5.has(idx5)) {
      used5.add(idx5);
      paired.push({
        questionText: q10.text,
        answer5: month5Questions[idx5].valueText,
        answer10: q10.valueText,
        applies5: month5Questions[idx5].appliesMonth5,
        applies10: q10.appliesMonth10,
      });
    } else {
      onlyIn10.push({
        questionText: q10.text,
        answer5: null,
        answer10: q10.valueText,
        applies5: null,
        applies10: q10.appliesMonth10,
      });
    }
  }

  const onlyIn5: PairedQuestionRow[] = month5Questions
    .map((q, idx) => ({ q, idx }))
    .filter(({ idx }) => !used5.has(idx))
    .map(({ q }) => ({
      questionText: q.text,
      answer5: q.valueText,
      answer10: null,
      applies5: q.appliesMonth5,
      applies10: null,
    }));

  return { paired, onlyIn5, onlyIn10 };
}
