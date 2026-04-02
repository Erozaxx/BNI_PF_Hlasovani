import { createHash, randomBytes } from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Generate a raw event token (32 random bytes, hex-encoded).
 */
export function generateEventToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Hash an event token using SHA-256.
 * Stored in event_participant.magic_token_hash.
 */
export function hashEventToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Build a magic link URL for an event participant.
 */
export function buildEventLink(eventId: string, rawToken: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${appUrl}/e/${eventId}?t=${rawToken}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Send event invitation email with magic link via Resend.
 * Gracefully falls back to console.log when RESEND_API_KEY is not set.
 */
export async function sendEventMagicLink(
  email: string,
  name: string,
  eventTitle: string,
  rawToken: string,
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  const link = buildEventLink(eventId, rawToken);

  if (!process.env.RESEND_API_KEY) {
    console.warn(
      `[EVENT MAGIC LINK] RESEND_API_KEY not configured, logging link: ${email}: ${link}`
    );
    return { success: true };
  }

  try {
    const { error } = await resend.emails.send({
      from: `BNI Hlasovani <${process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"}>`,
      to: [email],
      subject: `BNI Hlasovani - Pozvanka: ${eventTitle}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:20px;">BNI Hlasovani</h1>
  </div>
  <p>Dobry den ${escapeHtml(name)},</p>
  <p>Byli jste pozvan/a k ucastI v akci: <strong>${escapeHtml(eventTitle)}</strong></p>
  <p>Kliknutim na tlacitko nize se dostanete na stranku pro hlasovani:</p>
  <div style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 32px;background:#cf2e2e;color:#fff;text-decoration:none;border-radius:30px;font-weight:600;">Zobrazit akci a hlasovat</a>
  </div>
  <p style="color:#666;font-size:13px;">Odkaz je platny po dobu trvani akce.</p>
  <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #E8E8E8;padding-top:12px;">Pokud jste o tento email nezadali, muzete ho ignorovat.</p>
</body>
</html>`,
    });

    if (error) {
      console.error("sendEventMagicLink error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sendEventMagicLink error:", msg);
    return { success: false, error: msg };
  }
}
