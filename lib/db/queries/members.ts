import { eq, asc, and, isNotNull, gte, sql } from "drizzle-orm";
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
 */
export async function createMember(data: {
  name: string;
  email?: string;
  managementRole?: string | null;
  passwordHash?: string | null;
  company?: string | null;
  obor?: string | null;
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
 * Reorder members by setting display_order = index for each id in orderedIds.
 * Sequential UPDATEs (LL-003: no db.transaction in Vercel serverless).
 * Each UPDATE is guarded by WHERE id = <id> and is idempotent on retry.
 */
export async function reorderMembers(orderedIds: string[]): Promise<void> {
  const db = getDb();
  for (let i = 0; i < orderedIds.length; i++) {
    await db
      .update(member)
      .set({ displayOrder: i })
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
