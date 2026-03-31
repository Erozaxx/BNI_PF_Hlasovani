import { NextRequest, NextResponse } from "next/server";
import { getExpiredVotingMeetings } from "@/lib/db/queries/votes";
import { updateMeetingStatus } from "@/lib/db/queries/meetings";
import { sendReport } from "@/lib/email/resend";
import { getMembers } from "@/lib/db/queries/members";
import { generateMagicToken } from "@/lib/auth/magic";
import { sendMagicLinkEmail } from "@/lib/email/resend";

/**
 * Internal handler for /api/cron/close-voting
 *
 * 1. Closes all meetings whose voting window has expired (voting_closes_at < NOW()).
 * 2. Sends a report email for each closed meeting.
 * 3. Renews expiring magic tokens (< 1 day) — integrated here because Vercel Hobby
 *    allows only 1 cron job.
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

  try {
    // ── Phase 1: Close expired voting meetings ──
    const expiredMeetings = await getExpiredVotingMeetings();

    const closedIds: string[] = [];
    const errors: string[] = [];

    for (const mtg of expiredMeetings) {
      try {
        await updateMeetingStatus(mtg.id, { status: "closed" });
        closedIds.push(mtg.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`Failed to close meeting ${mtg.id}:`, msg);
        errors.push(`close ${mtg.id}: ${msg}`);
      }
    }

    if (closedIds.length > 0) {
      console.log(
        `close-voting cron: closed ${closedIds.length}/${expiredMeetings.length} meetings`
      );
    }

    // ── Phase 2: Send report for each newly closed meeting ──
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

    // ── Phase 3: Renew expiring tokens ──
    const tokenRenewalResult = await renewExpiringTokens();

    return NextResponse.json({
      closed: closedIds.length,
      closedIds: closedIds.length > 0 ? closedIds : undefined,
      reports: reportResults.length > 0 ? reportResults : undefined,
      tokenRenewal: tokenRenewalResult,
      errors: errors.length > 0 ? errors : undefined,
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
