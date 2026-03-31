import { NextRequest, NextResponse } from "next/server";
import { getMembers } from "@/lib/db/queries/members";
import { generateMagicToken } from "@/lib/auth/magic";
import { sendMagicLinkEmail } from "@/lib/email/resend";

/**
 * Internal handler for /api/cron/renew-tokens
 *
 * Renews magic tokens for members whose token expires within 1 day.
 * Generates a new token, stores previous_token_hash for graceful fallback,
 * and sends the new magic link via email.
 *
 * Protected by CRON_SECRET (Authorization: Bearer).
 */
async function handler(request: NextRequest) {
  // Verify CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured");
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 }
    );
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const members = await getMembers();
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 3600 * 1000);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Find members with tokens expiring within 1 day
    const expiringMembers = members.filter((m) => {
      if (!m.tokenExpiresAt) return false;
      if (m.tokenUsed) return false; // Already used, no need to renew
      return m.tokenExpiresAt < oneDayFromNow && m.tokenExpiresAt > now;
    });

    if (expiringMembers.length === 0) {
      return NextResponse.json({
        renewed: 0,
        message: "No expiring tokens",
      });
    }

    const renewed: string[] = [];
    const errors: string[] = [];

    for (const m of expiringMembers) {
      try {
        // generateMagicToken already moves current to previous
        const newRawToken = await generateMagicToken(m.id);
        const magicLink = `${appUrl}/api/auth/magic?token=${newRawToken}`;

        if (m.email) {
          const emailResult = await sendMagicLinkEmail(
            m.email,
            magicLink,
            m.name
          );
          if (!emailResult.success) {
            errors.push(
              `${m.id}: email send failed - ${emailResult.error}`
            );
            continue;
          }
        } else {
          console.warn(`Member ${m.id} (${m.name}) has no email — token renewed but not sent`);
        }

        renewed.push(m.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to renew token for member ${m.id}:`, msg);
        errors.push(`${m.id}: ${msg}`);
      }
    }

    console.log(
      `renew-tokens: renewed ${renewed.length}/${expiringMembers.length} tokens`
    );

    return NextResponse.json({
      renewed: renewed.length,
      renewedIds: renewed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("renew-tokens error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** Vercel cron sends GET requests. */
export async function GET(request: NextRequest) {
  return handler(request);
}

/** Keep POST for manual/programmatic invocation. */
export async function POST(request: NextRequest) {
  return handler(request);
}
