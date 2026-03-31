import { createHash, randomUUID } from "crypto";
import {
  getMemberByTokenHash,
  getMemberByPreviousTokenHash,
  updateMagicToken,
} from "@/lib/db/queries/members";
import { createSession } from "@/lib/auth/session";
import { sendMagicLinkEmail } from "@/lib/email/resend";

/**
 * Hash a raw token using SHA-256.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generate a new magic token for a member.
 * Returns the raw token (to be sent in the magic link URL).
 * The SHA-256 hash is stored in the DB.
 */
export async function generateMagicToken(memberId: string): Promise<string> {
  const rawToken = randomUUID();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days

  await updateMagicToken(memberId, tokenHash, expiresAt);

  return rawToken;
}

/**
 * Result type for magic token verification.
 */
export type VerifyResult =
  | { status: "ok"; memberId: string }
  | { status: "new_link_sent" }
  | { status: "invalid" };

/**
 * Verify a magic token from the URL.
 *
 * Flow:
 * 1. Hash the received token
 * 2. Try current token — if valid, create session and mark as used
 * 3. Try previous token (graceful fallback) — generate new token, console.log it
 * 4. Otherwise — invalid
 */
export async function verifyMagicToken(rawToken: string): Promise<VerifyResult> {
  const tokenHash = hashToken(rawToken);

  // Step 1: Try current (valid, non-expired, non-used) token
  const currentMember = await getMemberByTokenHash(tokenHash);
  if (currentMember) {
    // Create session
    await createSession({
      memberId: currentMember.id,
      managementRole: (currentMember.managementRole as "admin" | "moderator") ?? null,
      authMethod: "magic_link",
      name: currentMember.name,
    });

    return { status: "ok", memberId: currentMember.id };
  }

  // Step 2: Try previous token (graceful fallback)
  const prevMember = await getMemberByPreviousTokenHash(tokenHash);
  if (prevMember) {
    // Generate a new token (do NOT create a session — just send new link)
    const newRawToken = await generateMagicToken(prevMember.id);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const newLink = `${appUrl}/api/auth/magic?token=${newRawToken}`;

    // Send new magic link via email (graceful fallback)
    if (prevMember.email) {
      const emailResult = await sendMagicLinkEmail(
        prevMember.email,
        newLink,
        prevMember.name
      );
      if (!emailResult.success) {
        console.error(
          `[MAGIC LINK FALLBACK] Failed to send email to ${prevMember.email}:`,
          emailResult.error
        );
      }
    } else {
      console.warn(
        `[MAGIC LINK FALLBACK] Member ${prevMember.id} has no email — cannot send new link`
      );
    }

    return { status: "new_link_sent" };
  }

  // Step 3: Unknown token
  return { status: "invalid" };
}
