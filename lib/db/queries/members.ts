import { eq, asc, and, isNotNull, ne, gte, sql, count } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { member } from "@/lib/db/schema";
import { normalizeEmailForStorage } from "@/lib/auth/login-link-core";

function getDb() { return drizzle(getSql()); }

/**
 * Postgres 23505 (unique_violation), typicky unikátní index
 * `member_email_lower_unique` (iter-032, K13). Stejný vzor jako ostatní
 * akce v repu (`err.code`).
 */
export function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "23505";
}

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
  email?: string | null;
  company?: string | null;
  obor?: string | null;
  joinedAt?: string | null;
}) {
  // iter-032 (K8): nový člen vzniká vždy bez role a hesla, roli dostane jen
  // přes setMemberRoleGuarded. U3 (K13): e-mail jen normalizovaně, prázdný
  // jako NULL.
  const results = await getDb()
    .insert(member)
    .values({
      name: data.name,
      email: normalizeEmailForStorage(data.email),
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

/**
 * Změna e-mailu (iter-032, 4.4, U3). Ukládá `lower(trim(email))`, prázdný
 * jako NULL. U člena vedení se změnou e-mailu (přihlašovací jméno) zvýší
 * `session_version`. Člen vedení bez e-mailu neprojde CHECKem
 * `member_management_requires_credentials`, akce to hlídá hláškou předem.
 *
 * Security M-1: když se adresa opravdu změní, všechny nepoužité odkazy
 * člena (`login` i `set-password`) přestanou platit v tomtéž příkazu. Odkaz
 * poslaný na překlep v adrese tak po opravě nikoho nepřihlásí. Jeden
 * příkaz s datově modifikujícím CTE, bez transakce (LL-003). Vrací, jestli
 * se adresa změnila a kolik odkazů přestalo platit; `null` = člen neexistuje.
 * CTE se jmenuje `prev`, ne `old`: PostgreSQL 18 má v RETURNING vlastní
 * alias `old` a jméno by se s ním potkalo.
 */
export async function updateMemberEmail(
  memberId: string,
  email: string | null
): Promise<{ changed: boolean; revokedLinks: number } | null> {
  const normalized = normalizeEmailForStorage(email);
  const result = await getDb().execute<{ changed: boolean; revoked_links: number }>(sql`
    WITH prev AS (
      SELECT id, email FROM member WHERE id = ${memberId}::uuid FOR UPDATE
    ), upd AS (
      UPDATE member m SET
        email = ${normalized}::text,
        session_version = CASE
          WHEN m.management_role IS NOT NULL
           AND prev.email IS DISTINCT FROM ${normalized}::text
          THEN m.session_version + 1
          ELSE m.session_version END
      FROM prev
      WHERE m.id = prev.id
      RETURNING m.id, (prev.email IS DISTINCT FROM ${normalized}::text) AS changed
    ), revoked AS (
      UPDATE member_login_link SET used_at = now()
      WHERE member_id IN (SELECT id FROM upd WHERE changed)
        AND used_at IS NULL
      RETURNING id
    )
    SELECT upd.changed, (SELECT count(*)::int FROM revoked) AS revoked_links
    FROM upd
  `);
  const row = result.rows[0];
  if (!row) return null;
  return { changed: !!row.changed, revokedLinks: Number(row.revoked_links) };
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
 * Find a member by email address, case-insensitive (iter-032, K13, N9).
 * Used for admin/moderator password login and the member login link request.
 * Unikátní index `member_email_lower_unique` drží shodu nejvýš jednu.
 */
export async function getMemberByEmail(email: string) {
  const results = await getDb()
    .select()
    .from(member)
    .where(sql`lower(${member.email}) = lower(trim(${email}))`)
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
 * Delete a member by ID. Bez pojistek, jen pro skripty. Akce používá
 * `deleteMemberGuarded` (iter-032, N4).
 */
export async function deleteMember(id: string) {
  await getDb().delete(member).where(eq(member.id, id));
}

// ============================================================
// iter-032: role, hesla vedení, revokace session (arch 4.3, 5, 7.2)
// Bez transakcí (LL-003): každá změna je jeden příkaz s pojistkami
// ve WHERE. Pojistku posledního admina drží CTE s FOR UPDATE (F11).
// ============================================================

/** `session_version` a role pro `getSession()`, jeden SELECT podle PK. */
export async function getMemberAuthState(
  memberId: string
): Promise<{ sessionVersion: number; managementRole: string | null } | null> {
  const rows = await getDb()
    .select({
      sessionVersion: member.sessionVersion,
      managementRole: member.managementRole,
    })
    .from(member)
    .where(eq(member.id, memberId))
    .limit(1);
  return rows[0] ?? null;
}

export async function countAdmins(): Promise<number> {
  const rows = await getDb()
    .select({ value: count() })
    .from(member)
    .where(eq(member.managementRole, "admin"));
  return rows[0]?.value ?? 0;
}

type GuardedMemberRow = { id: string; email: string | null; name: string };

/**
 * Změna role jedním příkazem (4.3 krok 5). Vrátí `null`, když neprošla
 * některá pojistka: cíl je volající, role se mezitím změnila
 * (`expectedOldRole`), povýšení bez e-mailu, nebo by zmizel poslední admin.
 *
 * `password`: `promote` = zámkový hash, `keep` = beze změny (switch),
 * `clear` = NULL (demote, K5). `session_version` se zvýší vždy.
 *
 * CTE `admins` se vyhodnotí jen tam, kde se na něj podmínka odkazuje, tedy
 * když nová role není admin. Jen tehdy hrozí ztráta posledního admina.
 *
 * `IS NOT DISTINCT FROM 'admin'` místo `= 'admin'` z návrhu 4.3: u člena
 * bez role je `NULL = 'admin'` NULL, `NOT (NULL AND true)` je taky NULL a
 * WHERE by řádek vyřadil. Povýšení by pak při jediném adminovi vždy
 * vrátilo 0 řádků.
 *
 * Security L-5: povýšení i sesazení (`promote`, `clear`) zneplatní
 * nepoužité odkazy `set-password` v tomtéž příkazu, ne až v kroku mailu.
 * Přepnutí role (`keep`) odkazy nechává: člen, který heslo ještě nenastavil,
 * by jinak zůstal se zámkovým hashem bez odkazu.
 */
export async function setMemberRoleGuarded(input: {
  targetId: string;
  actorId: string;
  expectedOldRole: "admin" | "moderator" | null;
  newRole: "admin" | "moderator" | null;
  password: { mode: "promote"; hash: string } | { mode: "keep" } | { mode: "clear" };
}): Promise<GuardedMemberRow | null> {
  const { targetId, actorId, expectedOldRole, newRole, password } = input;

  const roleValue = newRole === null ? sql`NULL` : sql`${newRole}::text`;
  const passwordValue =
    password.mode === "promote"
      ? sql`${password.hash}::text`
      : password.mode === "clear"
        ? sql`NULL`
        : sql`password_hash`;
  const expectedRoleCond =
    expectedOldRole === null
      ? sql`management_role IS NULL`
      : sql`management_role = ${expectedOldRole}::text`;
  const emailCond =
    newRole === null ? sql`` : sql`AND email IS NOT NULL AND email <> ''`;
  const lastAdminCond =
    newRole === "admin"
      ? sql``
      : sql`AND NOT (management_role IS NOT DISTINCT FROM 'admin'
                     AND (SELECT count(*) FROM admins) <= 1)`;

  const revokeLinks =
    password.mode === "keep"
      ? sql``
      : sql`, revoked AS (
          UPDATE member_login_link SET used_at = now()
          WHERE member_id IN (SELECT id FROM upd)
            AND purpose = 'set-password'
            AND used_at IS NULL
        )`;

  const result = await getDb().execute<GuardedMemberRow>(sql`
    WITH admins AS (
      SELECT id FROM member WHERE management_role = 'admin' ORDER BY id FOR UPDATE
    ), upd AS (
      UPDATE member SET
        management_role = ${roleValue},
        password_hash   = ${passwordValue},
        session_version = session_version + 1
      WHERE id = ${targetId}::uuid
        AND id <> ${actorId}::uuid
        AND ${expectedRoleCond}
        ${emailCond}
        ${lastAdminCond}
      RETURNING id, email, name
    )${revokeLinks}
    SELECT id, email, name FROM upd
  `);
  return result.rows[0] ?? null;
}

/**
 * Smazání člena s pojistkami (4.3, N4): ne sám sebe, ne posledního admina.
 * Vrací `true`, když řádek zmizel.
 */
export async function deleteMemberGuarded(
  targetId: string,
  actorId: string
): Promise<boolean> {
  const result = await getDb().execute<{ id: string }>(sql`
    WITH admins AS (
      SELECT id FROM member WHERE management_role = 'admin' ORDER BY id FOR UPDATE
    )
    DELETE FROM member
    WHERE id = ${targetId}::uuid
      AND id <> ${actorId}::uuid
      AND NOT (management_role IS NOT DISTINCT FROM 'admin'
               AND (SELECT count(*) FROM admins) <= 1)
    RETURNING id
  `);
  return result.rows.length > 0;
}

/**
 * Reset hesla vedení (5.3): zámkový hash, nová verze session. Jen člen
 * s rolí, nikdy volající. Staré heslo i všechny session končí hned.
 *
 * Security L-5: nepoužité odkazy `set-password` přestanou platit v tomtéž
 * příkazu. Reset tak funguje jako nouzové zablokování i tehdy, když
 * následné vystavení odkazu nebo mail selže.
 */
export async function resetPasswordGuarded(
  targetId: string,
  actorId: string,
  lockHash: string
): Promise<GuardedMemberRow | null> {
  const result = await getDb().execute<GuardedMemberRow>(sql`
    WITH upd AS (
      UPDATE member SET
        password_hash   = ${lockHash}::text,
        session_version = session_version + 1
      WHERE id = ${targetId}::uuid
        AND id <> ${actorId}::uuid
        AND management_role IS NOT NULL
      RETURNING id, email, name
    ), revoked AS (
      UPDATE member_login_link SET used_at = now()
      WHERE member_id IN (SELECT id FROM upd)
        AND purpose = 'set-password'
        AND used_at IS NULL
    )
    SELECT id, email, name FROM upd
  `);
  return result.rows[0] ?? null;
}

/**
 * Uloží hash hesla člena vedení a zvýší verzi session (5.2 bod 5, 5.4).
 * Nula řádků = člen mezitím přišel o roli (nebo neexistuje).
 */
export async function setOwnPassword(
  memberId: string,
  passwordHash: string
): Promise<{ sessionVersion: number; managementRole: string; name: string } | null> {
  const rows = await getDb()
    .update(member)
    .set({
      passwordHash,
      sessionVersion: sql`${member.sessionVersion} + 1`,
    })
    .where(and(eq(member.id, memberId), isNotNull(member.managementRole)))
    .returning({
      sessionVersion: member.sessionVersion,
      managementRole: member.managementRole,
      name: member.name,
    });
  const row = rows[0];
  if (!row || !row.managementRole) return null;
  return { sessionVersion: row.sessionVersion, managementRole: row.managementRole, name: row.name };
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

/**
 * Get admin and moderator members with a non-null, non-empty email —
 * recipients for the čtvrteční varovný mail (iter-026, arch 7.2) and, since
 * it filters in SQL and returns name + role too, the new backing
 * implementation for `getManagementEmails()` in lib/email/resend.ts (which
 * used to load *every* member via getMembers() and filter in JS — two
 * definitions of "management" would otherwise drift apart).
 *
 * `ne(member.email, "")` alongside `isNotNull` — review MINOR-2 (T-006r):
 * bez něj by jeden admin/moderátor s prázdným řetězcem místo NULL prošel do
 * `to` pole volání Resendu a mohl shodit celý varovný mail pro všechny
 * příjemce. Stejná podmínka jako `voting-dispatch.ts` (`!!m.email`) a
 * `voting-plan.ts` (`!member.memberEmail`) jinde ve stejném PR.
 */
export async function getManagementRecipients(): Promise<
  { memberId: string; name: string; email: string; role: string }[]
> {
  const rows = await getDb()
    .select({
      memberId: member.id,
      name: member.name,
      email: member.email,
      role: member.managementRole,
    })
    .from(member)
    .where(
      and(
        sql`${member.managementRole} IN ('admin', 'moderator')`,
        isNotNull(member.email),
        ne(member.email, "")
      )
    );

  return rows.map((r) => ({
    memberId: r.memberId,
    name: r.name,
    email: r.email as string,
    role: r.role as string,
  }));
}
