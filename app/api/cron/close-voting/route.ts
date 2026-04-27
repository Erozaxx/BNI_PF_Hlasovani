import { NextRequest, NextResponse } from "next/server";
import { getExpiredVotingMeetings } from "@/lib/db/queries/votes";
import { updateMeetingStatus } from "@/lib/db/queries/meetings";
import { sendReport } from "@/lib/email/resend";
import { getMembers } from "@/lib/db/queries/members";
import { generateMagicToken } from "@/lib/auth/magic";
import { sendMagicLinkEmail, sendMeetingMagicLinkEmail } from "@/lib/email/resend";
import {
  getActiveMeetingsForDate,
  getPendingMorningEmailLinks,
  markMorningEmailSent,
} from "@/lib/db/queries/meeting-member-links";
import { regenerateMeetingToken, buildMeetingMagicUrl } from "@/lib/auth/meeting-magic";

/**
 * Get today's date string in CET/CEST (Europe/Prague) timezone.
 * Returns "YYYY-MM-DD" using the Swedish locale format (ISO-like).
 */
function todayInCET(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

/**
 * Internal handler for /api/cron/close-voting
 *
 * Vercel Hobby: 1 cron job, runs once daily at 04:00 UTC (≈ 5:00 CET / 6:00 CEST).
 *
 * Phase A: Morning email — send meeting magic link emails to all members of active
 *          meetings scheduled today where morningEmailSentAt IS NULL (idempotent).
 *          Voting activation (12:00 CET) is manual-only — admin uses the UI button.
 * Phase C: Close expired voting — meetings in 'voting' status past their votingClosesAt.
 *          Sends report email for each closed meeting.
 * Phase E: Renew expiring member tokens — existing logic.
 *
 * Protected by CRON_SECRET — Vercel sends this header automatically for cron jobs.
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

  const today = todayInCET();

  console.log(`close-voting cron: today=${today}`);

  try {
    // ── Phase A: Morning emails ──
    const morningEmailResult = await sendMorningEmails(today);

    // ── Phase C: Close expired voting meetings ──
    const expiredMeetings = await getExpiredVotingMeetings();

    const closedIds: string[] = [];
    const closeErrors: string[] = [];

    for (const mtg of expiredMeetings) {
      try {
        await updateMeetingStatus(mtg.id, { status: "closed" });
        closedIds.push(mtg.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to close meeting ${mtg.id}:`, msg);
        closeErrors.push(`close ${mtg.id}: ${msg}`);
      }
    }

    if (closedIds.length > 0) {
      console.log(
        `close-voting cron: closed ${closedIds.length}/${expiredMeetings.length} meetings`
      );
    }

    // ── Phase C: Send report for each newly closed meeting ──
    const reportResults: { meetingId: string; sent: number; error?: string }[] = [];

    for (const meetingId of closedIds) {
      try {
        const result = await sendReport(meetingId);
        reportResults.push({
          meetingId,
          sent: result.sent,
          error: result.error,
        });
        if (result.error) {
          console.error(`Report for meeting ${meetingId} failed:`, result.error);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Report for meeting ${meetingId} error:`, msg);
        reportResults.push({ meetingId, sent: 0, error: msg });
      }
    }

    // Token expiry for meeting_member_link is enforced at verification time — no active cleanup needed.

    // ── Phase E: Renew expiring tokens ──
    const tokenRenewalResult = await renewExpiringTokens();

    return NextResponse.json({
      morningEmails: morningEmailResult,
      closed: closedIds.length,
      closedIds: closedIds.length > 0 ? closedIds : undefined,
      reports: reportResults.length > 0 ? reportResults : undefined,
      tokenRenewal: tokenRenewalResult,
      errors: closeErrors.length > 0 ? closeErrors : undefined,
    });
  } catch (error) {
    console.error("close-voting cron error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Phase A: Send morning magic link emails for active meetings scheduled today.
 * Idempotent via morningEmailSentAt IS NULL check — safe to run once daily.
 * Uses Promise.allSettled to send all emails concurrently (non-blocking per member).
 */
async function sendMorningEmails(
  today: string
): Promise<{ skipped?: string; meetingsProcessed?: number; sent: number; errors?: string[] }> {
  const activeMeetings = await getActiveMeetingsForDate(today);
  if (activeMeetings.length === 0) {
    return { skipped: "no active meetings today", sent: 0 };
  }

  let totalSent = 0;
  const allErrors: string[] = [];

  for (const mtg of activeMeetings) {
    const pendingLinks = await getPendingMorningEmailLinks(mtg.id);

    if (pendingLinks.length === 0) {
      console.log(`morning email: meeting ${mtg.id} — no pending links`);
      continue;
    }

    // Send sequentially with 250ms delay to stay under Resend rate limit (5 req/s)
    for (const link of pendingLinks) {
      try {
        if (!link.memberEmail) {
          throw new Error(`member ${link.memberId} has no email`);
        }

        const rawToken = await regenerateMeetingToken(link.meetingId, link.memberId);
        if (!rawToken) {
          throw new Error(`regenerate token failed for member ${link.memberId}`);
        }

        const magicUrl = buildMeetingMagicUrl(rawToken);

        const emailResult = await sendMeetingMagicLinkEmail(
          link.memberEmail,
          magicUrl,
          link.memberName ?? undefined,
          mtg.date
        );

        if (!emailResult.success) {
          throw new Error(`email send failed: ${emailResult.error}`);
        }

        await markMorningEmailSent(link.linkId, new Date());
        totalSent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`morning email error for meeting ${mtg.id}:`, msg);
        allErrors.push(`meeting ${mtg.id}: ${msg}`);
      }

      // 250ms delay between sends — Resend limit is 5 req/s
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (totalSent > 0) {
    console.log(`morning email: sent ${totalSent} emails`);
  }

  return {
    meetingsProcessed: activeMeetings.length,
    sent: totalSent,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

/**
 * Renew magic tokens expiring within the next 24 hours.
 * Integrated into close-voting because Vercel Hobby has a 1 cron job limit.
 */
async function renewExpiringTokens(): Promise<{
  renewed: number;
  errors?: string[];
}> {
  try {
    const members = await getMembers();
    const now = new Date();
    const oneDayFromNow = new Date(now.getTime() + 24 * 3600 * 1000);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const expiringMembers = members.filter((m) => {
      if (m.managementRole) return false;
      if (!m.tokenExpiresAt) return false;
      if (m.tokenUsed) return false;
      return m.tokenExpiresAt < oneDayFromNow && m.tokenExpiresAt > now;
    });

    if (expiringMembers.length === 0) {
      return { renewed: 0 };
    }

    const renewed: string[] = [];
    const errors: string[] = [];

    for (const m of expiringMembers) {
      try {
        const newRawToken = await generateMagicToken(m.id);
        const magicLink = `${appUrl}/api/auth/magic?token=${newRawToken}`;

        if (m.email) {
          const emailResult = await sendMagicLinkEmail(
            m.email,
            magicLink,
            m.name
          );
          if (!emailResult.success) {
            errors.push(`${m.id}: email failed - ${emailResult.error}`);
            continue;
          }
        }

        renewed.push(m.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`${m.id}: ${msg}`);
      }
    }

    if (renewed.length > 0) {
      console.log(
        `token renewal: renewed ${renewed.length}/${expiringMembers.length}`
      );
    }

    return {
      renewed: renewed.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Token renewal error:", msg);
    return { renewed: 0, errors: [msg] };
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
