import { eq, asc, and, isNotNull, gte, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { member } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get all members ordered by drag&drop display order, then creation time.
 * displayOrder is backfilled (migration) and always set on insert, so it is
 * effectively non-null; createdAt is a stable tiebreaker.
 */
export async function getMembers() {
  return getDb()
    .select()
    .from(member)
    .orderBy(asc(member.displayOrder), asc(member.createdAt));
}

/**
 * Get a single member by ID.
 */
export async function getMemberById(id: string) {
  const results = await getDb()
    .select()
    .from(member)
    .where(eq(member.id, id))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Create a new member.
 *
 * joinedAt (iter-020, MAJOR-3): optional "YYYY-MM-DD" entry date, normally
 * sourced from the XLSX import's "Datum vstupu" column. When omitted/null the
 * column is left out of the insert values entirely so the schema's own
 * default (CURRENT_DATE) applies — the import must never be blocked by a
 * missing entry date.
 */
export async function createMember(data: {
  name: string;
  email?: string;
  managementRole?: string | null;
  passwordHash?: string | null;
  company?: string | null;
  obor?: string | null;
  joinedAt?: string | null;
}) {
  const results = await getDb()
    .insert(member)
    .values({
      name: data.name,
      email: data.email || null,
      managementRole: data.managementRole || null,
      passwordHash: data.passwordHash || null,
      company: data.company || null,
      obor: data.obor || null,
      ...(data.joinedAt ? { joinedAt: data.joinedAt } : {}),
      // New members go to the end of the global order (max+1).
      // COALESCE(MAX,0)+1 yields 1 for the first member. Subquery resolves at
      // INSERT time; concurrent admin creates are rare and ties break on createdAt.
      displayOrder: sql`(SELECT COALESCE(MAX(display_order), 0) + 1 FROM member)`,
    })
    .returning();

  return results[0];
}

/**
 * Update company and obor for a member.
 */
export async function updateMemberCompany(
  memberId: string,
  company: string | null,
  obor: string | null
) {
  await getDb()
    .update(member)
    .set({ company, obor })
    .where(eq(member.id, memberId));
}

export async function updateMemberEmail(
  memberId: string,
  email: string | null
) {
  await getDb()
    .update(member)
    .set({ email })
    .where(eq(member.id, memberId));
}

/**
 * Update the joined_at (entry date) for a member. Admin-only at the action
 * layer (arch 7.1) — this query itself has no guard, callers must enforce it.
 * `joinedAt` is a "YYYY-MM-DD" string (DATE column, no timezone).
 */
export async function updateMemberJoinedAt(
  memberId: string,
  joinedAt: string
) {
  await getDb()
    .update(member)
    .set({ joinedAt })
    .where(eq(member.id, memberId));
}

/**
 * Find a member by email address.
 * Used for admin/moderator password login.
 */
export async function getMemberByEmail(email: string) {
  const results = await getDb()
    .select()
    .from(member)
    .where(eq(member.email, email))
    .limit(1);

  return results[0] ?? null;
}

/**
 * Find a member by email, case-insensitive and trimmed (iter-022, arch T-003
 * MINOR-3). Used by promoteGuestToMemberAction's duplicate pre-check instead
 * of getMemberByEmail, so a guest email differing only by case/whitespace
 * still lands in the repair/conflict branch instead of a raw INSERT that
 * would hit the (case-sensitive) member_email_unique constraint.
 *
 * getMemberByEmail itself is NOT touched -- it backs admin/moderator login
 * and changing its semantics is out of scope for this feature.
 *
 * NULL member emails never match (lower(trim(NULL)) is NULL), so members
 * without an email correctly fall outside this lookup.
 */
export async function findMemberByEmailInsensitive(email: string) {
  const results = await getDb()
    .select()
    .from(member)
    .where(sql`lower(trim(${member.email})) = lower(trim(${email}))`)
    .limit(1);

  return results[0] ?? null;
}

/**
 * Find a member by name, case-insensitive and trimmed (iter-022, arch T-001
 * 7.1 / T-003 §7). Used by promoteGuestToMemberAction for guests without an
 * email: member.name has no UNIQUE constraint, so this is the only signal
 * available to block a promotion that would otherwise silently create a
 * same-named duplicate member.
 */
export async function findMemberByNameInsensitive(name: string) {
  const results = await getDb()
    .select()
    .from(member)
    .where(sql`lower(trim(${member.name})) = lower(trim(${name}))`)
    .limit(1);

  return results[0] ?? null;
}

/**
 * Find a member by current magic token hash.
 * Only returns members with a valid (non-expired, non-used) token.
 */
export async function getMemberByTokenHash(tokenHash: string) {
  const results = await getDb()
    .select()
    .from(member)
    .where(eq(member.magicTokenHash, tokenHash))
    .limit(1);

  const m = results[0] ?? null;
  if (!m) return null;

  // Check expiry only — token is valid for its full 7-day lifetime
  if (!m.tokenExpiresAt || m.tokenExpiresAt < new Date()) return null;

  return m;
}

/**
 * Find a member by previous token hash (graceful fallback).
 * Only returns a match if previous_token_expires_at is set and
 * the previous token expired no more than 7 days ago.
 */
export async function getMemberByPreviousTokenHash(tokenHash: string) {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);

  const results = await getDb()
    .select()
    .from(member)
    .where(
      and(
        eq(member.previousTokenHash, tokenHash),
        isNotNull(member.previousTokenExpiresAt),
        gte(member.previousTokenExpiresAt, sevenDaysAgo)
      )
    )
    .limit(1);

  return results[0] ?? null;
}

/**
 * Mark a token as used (single-use enforcement).
 */
export async function updateTokenUsed(memberId: string) {
  await getDb()
    .update(member)
    .set({ tokenUsed: true })
    .where(eq(member.id, memberId));
}

/**
 * Update password hash for a member (used for password change).
 */
export async function updatePasswordHash(memberId: string, passwordHash: string) {
  await getDb()
    .update(member)
    .set({ passwordHash })
    .where(eq(member.id, memberId));
}

/**
 * Delete a member by ID.
 */
export async function deleteMember(id: string) {
  await getDb().delete(member).where(eq(member.id, id));
}

/**
 * Count all members. Used to enforce the "complete list" guard in the
 * reorder endpoint (M-1).
 */
export async function getMemberCount(): Promise<number> {
  const rows = await getDb().select({ value: count() }).from(member);
  return rows[0]?.value ?? 0;
}

/**
 * Reorder members by setting display_order = index+1 (1-based) for each id in
 * orderedIds. 1-based matches the insert (COALESCE(MAX,0)+1) and migration
 * backfill (ROW_NUMBER) schemes, keeping display_order consistent (M-2).
 * Sequential UPDATEs (LL-003: no db.transaction in Vercel serverless).
 * Each UPDATE is guarded by WHERE id = <id> and is idempotent on retry.
 */
export async function reorderMembers(orderedIds: string[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(member)
      .set({ displayOrder: i + 1 })
      .where(eq(member.id, orderedIds[i]));
  }
}

/**
 * Get all members with only the fields needed for import preview.
 * More efficient than getMembers() when full member data is not required.
 */
export async function getMembersForImport(): Promise<
  { id: string; name: string; obor: string | null }[]
> {
  return getDb()
    .select({ id: member.id, name: member.name, obor: member.obor })
    .from(member)
    .orderBy(asc(member.name));
}

/**
 * Update only the obor field for a member.
 * Used during bulk import to avoid accidentally overwriting other fields.
 */
export async function updateMemberObor(
  memberId: string,
  obor: string | null
): Promise<void> {
  await getDb()
    .update(member)
    .set({ obor })
    .where(eq(member.id, memberId));
}

/**
 * Update magic token for a member (used during token generation/renewal).
 * Moves current token to previous before setting the new one.
 * Uses a single atomic UPDATE to avoid race conditions in serverless.
 */
export async function updateMagicToken(
  memberId: string,
  newTokenHash: string,
  expiresAt: Date
) {
  await getDb()
    .update(member)
    .set({
      previousTokenHash: sql`${member.magicTokenHash}`,
      previousTokenExpiresAt: sql`${member.tokenExpiresAt}`,
      magicTokenHash: newTokenHash,
      tokenExpiresAt: expiresAt,
      tokenUsed: false,
    })
    .where(eq(member.id, memberId));
}
