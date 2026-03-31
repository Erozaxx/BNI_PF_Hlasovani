import { eq, asc, and, isNotNull, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { member } from "@/lib/db/schema";

function getDb() { return drizzle(getSql()); }

/**
 * Get all members ordered by name.
 */
export async function getMembers() {
  return getDb().select().from(member).orderBy(asc(member.name));
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
}) {
  const results = await getDb()
    .insert(member)
    .values({
      name: data.name,
      email: data.email || null,
      managementRole: data.managementRole || null,
      passwordHash: data.passwordHash || null,
    })
    .returning();

  return results[0];
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

  // Check expiry and usage
  if (m.tokenUsed) return null;
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
