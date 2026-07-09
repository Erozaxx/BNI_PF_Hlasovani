import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { meeting as meetingTable, meetingMemberLink } from "@/lib/db/schema";
import { getExpiredVotingMeetings } from "@/lib/db/queries/votes";
import { updateMeetingStatus } from "@/lib/db/queries/meetings";
import { sendReport } from "@/lib/email/resend";
import { getMembers } from "@/lib/db/queries/members";
import { generateMagicToken } from "@/lib/auth/magic";
import { sendMagicLinkEmail, sendMeetingMagicLinkEmail } from "@/lib/email/resend";
import {
  getActiveMeetingsForDate,
  getActiveMeetingLinks,
  getPendingMorningEmailLinks,
  markMorningEmailSent,
} from "@/lib/db/queries/meeting-member-links";
import { regenerateMeetingToken, buildMeetingMagicUrl } from "@/lib/auth/meeting-magic";
import { cleanupStaleThrottleRows } from "@/lib/auth/throttle";

function getDb() {
  return drizzle(getSql());
}

// Phase B (cron) uses a "next Wednesday 23:59:59 Europe/Prague" voting close window,
// NOT the fixed 48h window. The manual endpoint activate-voting/route.ts keeps 48h.
const TOKEN_EXPIRY_EXTRA_MS = 24 * 60 * 60 * 1000; // +24h buffer AFTER votingClosesAt

/**
 * Get the CZ-local weekday name (Europe/Prague) for the current instant.
 * Returns e.g. "Thursday".
 */
function weekdayInCET(): string {
  return new Date().toLocaleDateString("en-US", {
    timeZone: "Europe/Prague",
    weekday: "long",
  });
}

/**
 * Get today's date string in CET/CEST (Europe/Prague) timezone.
 * Returns "YYYY-MM-DD" using the Swedish locale format (ISO-like).
 */
function todayInCET(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

/**
 * Compute the UTC instant for "next Wednesday 23:59:59 Europe/Prague" relative to `now`.
 *
 * Phase B activation runs on a Thursday (CZ), so the target is Thursday + 6 days,
 * but the day delta is computed robustly from the CZ-local weekday (target = Wednesday)
 * rather than hard-coding +6. If `now` is already CZ-Wednesday, this returns the
 * Wednesday 7 days out (delta normalized to 1..7 so it's always strictly in the future
 * relative to the start of today).
 *
 * DST-safe: derives the target CZ wall-clock date, then corrects a UTC guess by the
 * actual Europe/Prague offset (CEST UTC+2 in summer, CET UTC+1 in winter).
 */
function nextWednesday2359InPrague(now: Date): Date {
  // CZ-local weekday index 0..6 (Sun..Sat) for `now`.
  const czWeekdayName = now.toLocaleDateString("en-US", {
    timeZone: "Europe/Prague",
    weekday: "long",
  });
  const weekdayIndex: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const todayIdx = weekdayIndex[czWeekdayName];
  const WEDNESDAY = 3;
  // Days until the NEXT Wednesday (1..7), never 0 — always a future Wednesday.
  const daysUntilWed = ((WEDNESDAY - todayIdx + 7) % 7) || 7;

  // Target CZ calendar date (YYYY-MM-DD) for that Wednesday.
  const czTodayStr = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const [y, m, d] = czTodayStr.split("-").map(Number);
  // Build at UTC noon to avoid date rollover near midnight, then add the day delta.
  const targetMidUtc = new Date(Date.UTC(y, m - 1, d + daysUntilWed, 12, 0, 0));
  const targetDateStr = targetMidUtc.toLocaleDateString("sv-SE", {
    timeZone: "Europe/Prague",
  });
  const [ty, tm, td] = targetDateStr.split("-").map(Number);

  // Treat "targetDate 23:59:59" as if it were UTC, then correct by the Prague offset
  // so the resulting UTC instant renders as 23:59:59 wall-clock in Europe/Prague.
  const guess = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59));
  // Prague offset (ms) for this instant: same instant rendered in Prague minus in UTC.
  // CEST (summer) → +2h, CET (winter) → +1h.
  const inPrague = new Date(
    guess.toLocaleString("en-US", { timeZone: "Europe/Prague" })
  );
  const inUtc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  const offsetMs = inPrague.getTime() - inUtc.getTime();
  return new Date(guess.getTime() - offsetMs);
}

/**
 * Internal handler for /api/cron/close-voting
 *
 * Vercel Hobby: 1 cron job, runs once daily at 05:00 UTC.
 *   Summer (CEST, UTC+2): 05:00 UTC = 07:00 local — the intended Thursday 7:00 run.
 *   Winter (CET, UTC+1):  05:00 UTC = 06:00 local — DST drift, accepted (no comments in vercel.json).
 *
 * Phase A: Morning email — DISABLED. Kept as a stub; do not re-enable without product sign-off.
 * Phase B: Thursday auto-activation — on Thursdays only, transition today's active meeting
 *          to 'voting' (votingOpenAt=now, votingClosesAt=next Wed 23:59:59 Europe/Prague,
 *          link expiresAt=votingClosesAt+24h) and email every member with an active link
 *          a voting magic link.
 *          Idempotent via WHERE status='active' guard — a second run the same day is a no-op.
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
    // ── Phase A: Morning emails (disabled) ──
    const morningEmailResult = { skipped: "disabled", sent: 0 };

    // ── Phase B: Thursday auto-activation ──
    const thursdayActivationResult = await activateThursdayMeetings(today);

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

    // ── Housekeeping: stale auth_throttle row cleanup (MINOR-1, T-013) ──
    // Best-effort, sequential DELETE (no db.transaction() — LL-003). Own
    // try/catch so a failure here never fails the cron's main logic above.
    try {
      await cleanupStaleThrottleRows();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("close-voting cron: throttle cleanup failed:", msg);
    }

    return NextResponse.json({
      morningEmails: morningEmailResult,
      thursdayActivation: thursdayActivationResult,
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
 * Phase B: On Thursdays, auto-activate today's active meeting into 'voting' and
 * email every member (with an active link) a voting magic link.
 *
 * Voting window (differs from the manual activate-voting endpoint, which stays at 48h):
 *   - votingOpenAt = now
 *   - votingClosesAt = next Wednesday 23:59:59 Europe/Prague (DST-aware UTC instant)
 *   - meeting_member_link.expiresAt = votingClosesAt + 24h
 *   - no transaction (LL-003): sequential UPDATEs, status='active' WHERE guard for idempotence.
 *
 * Idempotence: the status guard means a second run the same Thursday updates 0 rows,
 * so no emails are re-sent.
 */
async function activateThursdayMeetings(today: string): Promise<{
  skipped?: string;
  activated?: number;
  sent?: number;
  errors?: string[];
}> {
  const weekday = weekdayInCET();
  if (weekday !== "Thursday") {
    return { skipped: "not Thursday" };
  }

  const meetings = await getActiveMeetingsForDate(today);
  if (meetings.length === 0) {
    return { skipped: "no active meetings today", activated: 0, sent: 0 };
  }

  let activatedCount = 0;
  let totalSent = 0;
  const allErrors: string[] = [];

  for (const mtg of meetings) {
    try {
      const now = new Date();
      const votingOpenAt = now;
      // Voting closes at the next Wednesday 23:59:59 Europe/Prague (DST-aware UTC instant).
      // Activation runs Thursday (CZ) → target is that Thursday + 6 days, but the day
      // delta is derived from the CZ weekday so it never relies on a hard-coded +6.
      const votingClosesAt = nextWednesday2359InPrague(now);
      // Keep the +24h buffer AFTER voting closes (not after now).
      const expiresAt = new Date(votingClosesAt.getTime() + TOKEN_EXPIRY_EXTRA_MS);
      console.log(
        `thursday-activation: meeting ${mtg.id} votingClosesAt=${votingClosesAt.toISOString()} ` +
          `(expected Wed 23:59:59 Europe/Prague), expiresAt=${expiresAt.toISOString()}`
      );

      // Transition active -> voting. WHERE status='active' guard makes this idempotent:
      // a repeat run the same day updates 0 rows and we skip emailing.
      const updated = await getDb()
        .update(meetingTable)
        .set({ status: "voting", votingOpenAt, votingClosesAt })
        .where(
          and(
            eq(meetingTable.id, mtg.id),
            eq(meetingTable.status, "active")
          )
        )
        .returning({ id: meetingTable.id });

      if (updated.length === 0) {
        console.log(
          `thursday-activation: meeting ${mtg.id} already transitioned — skipping emails`
        );
        continue;
      }

      // Separate UPDATE: set link expiry on all member links (no transaction — LL-003).
      await getDb()
        .update(meetingMemberLink)
        .set({ expiresAt })
        .where(eq(meetingMemberLink.meetingId, mtg.id));

      activatedCount++;
      console.log(
        `thursday-activation: meeting ${mtg.id} activated votingOpenAt=${votingOpenAt.toISOString()}`
      );

      // Email every member with an active link, regenerating a fresh token per member.
      const links = await getActiveMeetingLinks(mtg.id);
      for (const link of links) {
        try {
          if (!link.memberEmail) {
            throw new Error(`member ${link.memberId} has no email`);
          }

          const rawToken = await regenerateMeetingToken(
            link.meetingId,
            link.memberId
          );
          if (!rawToken) {
            throw new Error(
              `regenerate token failed for member ${link.memberId}`
            );
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

          totalSent++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`thursday-activation email error for meeting ${mtg.id}:`, msg);
          allErrors.push(`meeting ${mtg.id}: ${msg}`);
        }

        // 250ms delay between sends — Resend limit is 5 req/s.
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`thursday-activation error for meeting ${mtg.id}:`, msg);
      allErrors.push(`meeting ${mtg.id}: ${msg}`);
    }
  }

  return {
    activated: activatedCount,
    sent: totalSent,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
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
