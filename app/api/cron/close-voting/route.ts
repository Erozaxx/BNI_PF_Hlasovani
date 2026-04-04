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
  activateMeetingVoting,
} from "@/lib/db/queries/meeting-member-links";
import { regenerateMeetingToken, buildMeetingMagicUrl, setMeetingLinksExpiry } from "@/lib/auth/meeting-magic";

/**
 * Get today's date string in CET/CEST (Europe/Prague) timezone.
 * Returns "YYYY-MM-DD" using the Swedish locale format (ISO-like).
 */
function todayInCET(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

/**
 * Get the current hour (0–23) in CET/CEST (Europe/Prague) timezone.
 */
function currentHourInCET(): number {
  const hourStr = new Date().toLocaleString("en-US", {
    timeZone: "Europe/Prague",
    hour: "numeric",
    hour12: false,
  });
  return parseInt(hourStr, 10);
}

/**
 * Internal handler for /api/cron/close-voting
 *
 * Phase A: Morning email (5:00 CET) — send meeting magic link emails to all members
 *          where morningEmailSentAt IS NULL (idempotent).
 * Phase B: Activate voting (12:00 CET) — transition active meetings to 'voting',
 *          set votingOpenAt, votingClosesAt (+48h), and set expires_at on all links (+72h).
 * Phase C: Close expired voting — meetings in 'voting' status past their votingClosesAt.
 *          Sends report email for each closed meeting.
 * Phase D: Log expired tokens — meeting_member_link expiry is enforced at verification time;
 *          no active cleanup needed. Log count for observability.
 * Phase E: Renew expiring member tokens — existing logic, Vercel Hobby 1-cron constraint.
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

  const cetHour = currentHourInCET();
  const today = todayInCET();

  console.log(`close-voting cron: cetHour=${cetHour}, today=${today}`);

  try {
    // ── Phase A: Morning emails (5:00 CET) ──
    const morningEmailResult = await sendMorningEmails(cetHour, today);

    // ── Phase B: Activate voting (12:00 CET) ──
    const votingActivationResult = await activateVotingForToday(cetHour, today);

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

    // ── Phase D: Log token expiry (enforced at verification time, no cleanup needed) ──
    console.log("close-voting cron: Phase D — token expiry enforced at verification time, no active cleanup");

    // ── Phase E: Renew expiring tokens ──
    const tokenRenewalResult = await renewExpiringTokens();

    return NextResponse.json({
      morningEmails: morningEmailResult,
      votingActivation: votingActivationResult,
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
 * Only fires when cetHour === 5. Idempotent via morningEmailSentAt IS NULL check.
 * Uses Promise.allSettled to send all emails concurrently (non-blocking per member).
 */
async function sendMorningEmails(
  cetHour: number,
  today: string
): Promise<{ skipped?: string; meetingsProcessed?: number; sent: number; errors?: string[] }> {
  if (cetHour !== 5) {
    return { skipped: `not 5:00 CET (current CET hour: ${cetHour})`, sent: 0 };
  }

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

    // Send all emails for this meeting concurrently with Promise.allSettled
    const sendResults = await Promise.allSettled(
      pendingLinks.map(async (link) => {
        if (!link.memberEmail) {
          throw new Error(`member ${link.memberId} has no email`);
        }

        // Regenerate token to get a fresh raw token for URL construction.
        // Raw tokens are not stored in DB (only hashes), so we must regenerate.
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

        // Mark as sent immediately after success (idempotency per Addendum A2)
        await markMorningEmailSent(link.linkId, new Date());

        return link.memberId;
      })
    );

    for (const result of sendResults) {
      if (result.status === "fulfilled") {
        totalSent++;
      } else {
        const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        console.error(`morning email error for meeting ${mtg.id}:`, msg);
        allErrors.push(`meeting ${mtg.id}: ${msg}`);
      }
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
 * Phase B: Activate voting for active meetings scheduled today at 12:00 CET.
 * Idempotent — activateMeetingVoting checks status='active' before transitioning.
 * After transition, sets expires_at on all meeting_member_link rows to votingOpenAt + 72h.
 */
async function activateVotingForToday(
  cetHour: number,
  today: string
): Promise<{ skipped?: string; activated: number; errors?: string[] }> {
  if (cetHour !== 12) {
    return { skipped: `not 12:00 CET (current CET hour: ${cetHour})`, activated: 0 };
  }

  const activeMeetings = await getActiveMeetingsForDate(today);
  if (activeMeetings.length === 0) {
    return { skipped: "no active meetings today", activated: 0 };
  }

  let activated = 0;
  const errors: string[] = [];

  for (const mtg of activeMeetings) {
    try {
      const updated = await activateMeetingVoting(mtg.id);
      if (!updated) {
        // Already transitioned (not status='active') — idempotent skip
        console.log(`activate voting: meeting ${mtg.id} already transitioned, skipping`);
        continue;
      }

      // Set expires_at on all links = votingOpenAt + 72h
      if (updated.votingOpenAt) {
        const expiresAt = new Date(updated.votingOpenAt.getTime() + 72 * 3600 * 1000);
        await setMeetingLinksExpiry(mtg.id, expiresAt);
      }

      activated++;
      console.log(`activate voting: meeting ${mtg.id} → voting, closesAt=${updated.votingClosesAt?.toISOString()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`activate voting error for meeting ${mtg.id}:`, msg);
      errors.push(`meeting ${mtg.id}: ${msg}`);
    }
  }

  return {
    activated,
    errors: errors.length > 0 ? errors : undefined,
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
