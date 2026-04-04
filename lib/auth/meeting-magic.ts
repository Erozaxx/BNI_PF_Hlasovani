import { createHash, randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meetingMemberLink, meeting } from "@/lib/db/schema";

function getDb() {
  return drizzle(getSql());
}

/**
 * Hash a raw token using SHA-256.
 */
export function hashMeetingToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Result types for meeting token verification.
 */
export type VerifyMeetingTokenResult =
  | { status: "ok"; memberId: string; meetingId: string; linkId: string }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "invalid" };

/**
 * Verify a meeting magic token.
 *
 * Returns { status: "ok", memberId, meetingId, linkId } on success.
 * Returns appropriate error status otherwise.
 */
export async function verifyMeetingToken(
  rawToken: string
): Promise<VerifyMeetingTokenResult> {
  const tokenHash = hashMeetingToken(rawToken);

  const rows = await getDb()
    .select({
      id: meetingMemberLink.id,
      meetingId: meetingMemberLink.meetingId,
      memberId: meetingMemberLink.memberId,
      expiresAt: meetingMemberLink.expiresAt,
      revokedAt: meetingMemberLink.revokedAt,
    })
    .from(meetingMemberLink)
    .where(eq(meetingMemberLink.tokenHash, tokenHash))
    .limit(1);

  if (rows.length === 0) {
    return { status: "invalid" };
  }

  const link = rows[0];

  if (link.revokedAt !== null) {
    return { status: "revoked" };
  }

  if (link.expiresAt !== null && link.expiresAt < new Date()) {
    return { status: "expired" };
  }

  return {
    status: "ok",
    memberId: link.memberId,
    meetingId: link.meetingId,
    linkId: link.id,
  };
}

/**
 * Generate a new meeting magic link row for a member.
 * Inserts a new row — call only when no row exists yet (on activate).
 * Returns the raw token (to be sent via email or returned to admin).
 */
export async function generateMeetingToken(
  meetingId: string,
  memberId: string
): Promise<string> {
  const rawToken = randomUUID();
  const tokenHash = hashMeetingToken(rawToken);

  await getDb()
    .insert(meetingMemberLink)
    .values({
      meetingId,
      memberId,
      tokenHash,
      // expiresAt is NULL until voting opens
      expiresAt: null,
      revokedAt: null,
    })
    .onConflictDoNothing();

  return rawToken;
}

/**
 * Regenerate a meeting magic token for a member.
 * UPDATE the existing row (preserves UNIQUE constraint on meeting_id, member_id).
 * Returns the new raw token, or null if no link exists for this member/meeting.
 */
export async function regenerateMeetingToken(
  meetingId: string,
  memberId: string
): Promise<string | null> {
  const rawToken = randomUUID();
  const tokenHash = hashMeetingToken(rawToken);

  const updated = await getDb()
    .update(meetingMemberLink)
    .set({
      tokenHash,
      createdAt: new Date(),
      revokedAt: null,
    })
    .where(
      and(
        eq(meetingMemberLink.meetingId, meetingId),
        eq(meetingMemberLink.memberId, memberId)
      )
    )
    .returning({ id: meetingMemberLink.id });

  if (updated.length === 0) {
    return null;
  }

  return rawToken;
}

/**
 * Revoke a meeting magic token for a member (soft-revoke: set revoked_at = now()).
 * Returns true if the link was found and updated, false otherwise.
 */
export async function revokeMeetingToken(
  meetingId: string,
  memberId: string
): Promise<boolean> {
  const updated = await getDb()
    .update(meetingMemberLink)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(meetingMemberLink.meetingId, meetingId),
        eq(meetingMemberLink.memberId, memberId)
      )
    )
    .returning({ id: meetingMemberLink.id });

  return updated.length > 0;
}

/**
 * Set expires_at on all links for a meeting.
 * Called when transitioning to voting phase.
 */
export async function setMeetingLinksExpiry(
  meetingId: string,
  expiresAt: Date
): Promise<void> {
  await getDb()
    .update(meetingMemberLink)
    .set({ expiresAt })
    .where(eq(meetingMemberLink.meetingId, meetingId));
}

/**
 * Get a single meeting member link row.
 * Returns null if not found.
 */
export async function getMeetingMemberLink(
  meetingId: string,
  memberId: string
) {
  const rows = await getDb()
    .select()
    .from(meetingMemberLink)
    .where(
      and(
        eq(meetingMemberLink.meetingId, meetingId),
        eq(meetingMemberLink.memberId, memberId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Build the magic link URL for a member using the raw token.
 */
export function buildMeetingMagicUrl(rawToken: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/m/${rawToken}`;
}
