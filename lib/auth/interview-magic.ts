import { createHash, randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { interviewLink, interview } from "@/lib/db/schema";
import { throttleCheck, throttleFail } from "@/lib/auth/throttle";

function getDb() {
  return drizzle(getSql());
}

/**
 * Scoped magic link token for interviews ("Pohovory se členy", iter-020).
 * Modeled on lib/auth/meeting-magic.ts, with decisions specific to this domain
 * (see arch_iter-020_T-001.md section 5):
 *   - 256-bit entropy: randomBytes(32).toString("hex") (H-1 lesson — not randomUUID).
 *   - TTL 30 days, NOT NULL (H-3 lesson — token must never live forever).
 *   - Multi-use within TTL; write access dies once interview.status !== 'open'.
 *   - Regeneration = UPDATE of the same row (interview_id UNIQUE) — old hash stops
 *     existing atomically, NO previous-token fallback (H-9 lesson).
 *   - Verify integrates DB-backed throttle (H-4 lesson) and returns a uniform
 *     "invalid" for every failure mode (no status enumeration, EN-001 practice).
 */

export const INTERVIEW_LINK_TTL_DAYS = 30;
const TOKEN_FORMAT_REGEX = /^[0-9a-f]{64}$/;
const THROTTLE_SCOPE = "i-verify";

/**
 * Generate a raw interview token (32 random bytes, hex-encoded = 256 bit).
 */
export function generateInterviewToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash a raw interview token using SHA-256 for deterministic DB lookup.
 * (Not bcrypt — see lib/events/magic-link.ts hashEventToken for the rationale;
 * same threat model applies here.)
 */
export function hashInterviewToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Build the fill-form magic link URL for an interview leader.
 */
export function buildInterviewUrl(rawToken: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/i/${rawToken}`;
}

/**
 * Generate (first send) or regenerate (re-send/rotate) the scoped magic link
 * for an interview. interview_id is UNIQUE on interview_link → this is a single
 * UPSERT that is exactly the same code path for both cases (H-9): the previous
 * token_hash is overwritten atomically and stops existing immediately, with no
 * fallback grace period.
 *
 * Returns the raw token (send via email; the raw value is never persisted).
 */
export async function generateOrRegenerateInterviewToken(
  interviewId: string,
  leaderId: string
): Promise<string> {
  const rawToken = generateInterviewToken();
  const tokenHash = hashInterviewToken(rawToken);
  const expiresAt = new Date(
    Date.now() + INTERVIEW_LINK_TTL_DAYS * 24 * 3600 * 1000
  );

  await getDb()
    .insert(interviewLink)
    .values({ interviewId, leaderId, tokenHash, expiresAt })
    .onConflictDoUpdate({
      target: interviewLink.interviewId,
      set: {
        leaderId,
        tokenHash,
        createdAt: new Date(),
        expiresAt,
        revokedAt: null,
      },
    });

  return rawToken;
}

/**
 * Revoke the magic link for an interview (soft-revoke: set revoked_at = now()).
 * Idempotent — revoking an already-revoked or non-existent link is a safe no-op.
 * Returns true if a link row existed and was updated.
 */
export async function revokeInterviewToken(interviewId: string): Promise<boolean> {
  const updated = await getDb()
    .update(interviewLink)
    .set({ revokedAt: new Date() })
    .where(eq(interviewLink.interviewId, interviewId))
    .returning({ id: interviewLink.id });

  return updated.length > 0;
}

/**
 * Get the current link status for an interview (for admin/mod UI: "aktivní do /
 * revokován / expirován"). Returns null if no link has ever been generated.
 */
export async function getInterviewLinkStatus(interviewId: string) {
  const rows = await getDb()
    .select({
      id: interviewLink.id,
      leaderId: interviewLink.leaderId,
      createdAt: interviewLink.createdAt,
      expiresAt: interviewLink.expiresAt,
      revokedAt: interviewLink.revokedAt,
      lastSentAt: interviewLink.lastSentAt,
    })
    .from(interviewLink)
    .where(eq(interviewLink.interviewId, interviewId))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Mark that the link email was just sent successfully (anti-spam guard input —
 * the min-60s-between-sends check itself belongs to the calling action, T-008).
 */
export async function markInterviewLinkSent(
  interviewId: string,
  sentAt: Date
): Promise<void> {
  await getDb()
    .update(interviewLink)
    .set({ lastSentAt: sentAt })
    .where(eq(interviewLink.interviewId, interviewId));
}

export type VerifyInterviewTokenResult =
  | {
      status: "ok";
      interviewId: string;
      leaderId: string;
      interviewStatus: string;
    }
  | { status: "invalid" }
  | { status: "rate_limited" };

/**
 * Verify a raw interview magic token (arch section 5.1 algorithm).
 *
 * Steps: format precheck → throttle check (before DB lookup) → hash + lookup
 * (join interview for status) → revoked? → expired? → interview cancelled? → ok.
 * Every failure path is a uniform "invalid" (no enumeration, EN-001) except the
 * throttle block itself, which is reported distinctly so the caller can return
 * HTTP 429 instead of 401. Every failure that reaches a DB lookup records a
 * throttle failure; the format precheck also counts (cheap noise filter, M-4).
 *
 * The caller derives interview_id / leader_id from the token server-side — never
 * from client-supplied IDs (H-7/H-8 IDOR mitigation).
 */
export async function verifyInterviewToken(
  rawToken: string,
  ip: string
): Promise<VerifyInterviewTokenResult> {
  const throttleKey = `${THROTTLE_SCOPE}:${ip}`;

  if (!TOKEN_FORMAT_REGEX.test(rawToken)) {
    await throttleFail(throttleKey);
    return { status: "invalid" };
  }

  const { blocked } = await throttleCheck(throttleKey);
  if (blocked) {
    return { status: "rate_limited" };
  }

  const tokenHash = hashInterviewToken(rawToken);

  const rows = await getDb()
    .select({
      interviewId: interviewLink.interviewId,
      leaderId: interviewLink.leaderId,
      expiresAt: interviewLink.expiresAt,
      revokedAt: interviewLink.revokedAt,
      interviewStatus: interview.status,
    })
    .from(interviewLink)
    .innerJoin(interview, eq(interviewLink.interviewId, interview.id))
    .where(eq(interviewLink.tokenHash, tokenHash))
    .limit(1);

  const link = rows[0];

  if (!link) {
    await throttleFail(throttleKey);
    return { status: "invalid" };
  }

  if (link.revokedAt !== null) {
    await throttleFail(throttleKey);
    return { status: "invalid" };
  }

  if (link.expiresAt < new Date()) {
    await throttleFail(throttleKey);
    return { status: "invalid" };
  }

  if (link.interviewStatus === "cancelled") {
    await throttleFail(throttleKey);
    return { status: "invalid" };
  }

  return {
    status: "ok",
    interviewId: link.interviewId,
    leaderId: link.leaderId,
    interviewStatus: link.interviewStatus,
  };
}
