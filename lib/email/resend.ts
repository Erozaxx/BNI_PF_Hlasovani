import { Resend } from "resend";
import { getMeetingWithGuests } from "@/lib/db/queries/meetings";
import { getVotingResults } from "@/lib/db/queries/votes";
import { getNotesForGuest } from "@/lib/db/queries/notes";
import { getMembers } from "@/lib/db/queries/members";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Data shape for report building.
 */
interface ReportGuestData {
  guestId: string;
  guestName: string;
  categoryName: string | null;
  votes: {
    memberName: string;
    value: string;
    reason: string | null;
  }[];
  voteCounts: { up: number; neutral: number; down: number };
  notes: { text: string; createdAt: Date }[];
}

interface ReportData {
  meetingDate: string;
  guests: ReportGuestData[];
}

/**
 * Build the full report data for a closed meeting.
 */
async function buildReportData(meetingId: string): Promise<ReportData | null> {
  const meeting = await getMeetingWithGuests(meetingId);
  if (!meeting) return null;

  const guests: ReportGuestData[] = [];

  for (const g of meeting.guests) {
    const votes = await getVotingResults(g.guestId, meetingId);
    const notes = await getNotesForGuest(g.guestId);

    const voteCounts = { up: 0, neutral: 0, down: 0 };
    for (const v of votes) {
      if (v.value === "up") voteCounts.up++;
      else if (v.value === "neutral") voteCounts.neutral++;
      else if (v.value === "down") voteCounts.down++;
    }

    guests.push({
      guestId: g.guestId,
      guestName: g.guestName,
      categoryName: g.categoryName,
      votes: votes.map((v) => ({
        memberName: v.memberName,
        value: v.value,
        reason: v.reason,
      })),
      voteCounts,
      notes: notes.map((n) => ({
        text: n.text,
        createdAt: n.createdAt,
      })),
    });
  }

  return { meetingDate: meeting.date, guests };
}

/**
 * Build HTML email body for the voting report.
 */
export function buildReportHtml(data: ReportData): string {
  const voteEmoji = (value: string) => {
    if (value === "up") return "&#128077;";
    if (value === "neutral") return "&#128528;";
    if (value === "down") return "&#128078;";
    return value;
  };

  const guestSections = data.guests
    .map((g) => {
      const categoryLabel = g.categoryName
        ? ` <span style="color:#C69E63;font-size:13px;">[${g.categoryName}]</span>`
        : "";

      const voteSummary = `&#128077; ${g.voteCounts.up} &nbsp; &#128528; ${g.voteCounts.neutral} &nbsp; &#128078; ${g.voteCounts.down}`;

      const voteRows = g.votes
        .map((v) => {
          const reasonCell =
            v.value === "down" && v.reason
              ? `<td style="padding:4px 8px;color:#991b1b;font-size:13px;">${escapeHtml(v.reason)}</td>`
              : `<td style="padding:4px 8px;font-size:13px;color:#999;">-</td>`;
          return `<tr>
            <td style="padding:4px 8px;font-size:13px;">${escapeHtml(v.memberName)}</td>
            <td style="padding:4px 8px;text-align:center;">${voteEmoji(v.value)}</td>
            ${reasonCell}
          </tr>`;
        })
        .join("\n");

      const noteRows =
        g.notes.length > 0
          ? g.notes
              .map(
                (n) =>
                  `<li style="margin-bottom:6px;font-size:13px;">${escapeHtml(n.text)} <span style="color:#999;font-size:11px;">(${formatDate(n.createdAt)})</span></li>`
              )
              .join("\n")
          : '<li style="color:#999;font-size:13px;">Zadne poznamky</li>';

      return `
        <div style="margin-bottom:24px;padding:16px;border:1px solid #E8E8E8;border-radius:12px;">
          <h3 style="margin:0 0 8px;color:#1a1a1a;">${escapeHtml(g.guestName)}${categoryLabel}</h3>
          <p style="margin:4px 0 12px;font-size:14px;">${voteSummary}</p>

          <h4 style="margin:12px 0 6px;font-size:13px;color:#605BE5;">Jmenovite vysledky</h4>
          <table style="border-collapse:collapse;width:100%;">
            <thead>
              <tr style="background:#f5f5f5;">
                <th style="padding:4px 8px;text-align:left;font-size:12px;">Clen</th>
                <th style="padding:4px 8px;text-align:center;font-size:12px;">Hlas</th>
                <th style="padding:4px 8px;text-align:left;font-size:12px;">Duvod</th>
              </tr>
            </thead>
            <tbody>${voteRows}</tbody>
          </table>

          <h4 style="margin:16px 0 6px;font-size:13px;color:#605BE5;">Poznamky</h4>
          <ul style="margin:0;padding-left:20px;">${noteRows}</ul>
        </div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:22px;">BNI Hlasovani - Report</h1>
    <p style="margin:4px 0 0;color:#666;font-size:14px;">Schuzka: ${escapeHtml(data.meetingDate)}</p>
  </div>

  <h2 style="font-size:16px;color:#333;margin-bottom:16px;">Hoste (${data.guests.length})</h2>
  ${guestSections}

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #E8E8E8;text-align:center;">
    <p style="color:#999;font-size:12px;">Automaticky generovany report z BNI Hlasovani</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get admin and moderator email addresses.
 */
async function getManagementEmails(): Promise<string[]> {
  const members = await getMembers();
  return members
    .filter(
      (m) =>
        (m.managementRole === "admin" || m.managementRole === "moderator") &&
        m.email
    )
    .map((m) => m.email!);
}

/**
 * Send a voting report email for a closed meeting.
 * Returns the list of email addresses it was sent to.
 */
export async function sendReport(
  meetingId: string
): Promise<{ sent: number; emails: string[]; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.error("RESEND_API_KEY is not configured");
    return { sent: 0, emails: [], error: "RESEND_API_KEY is not configured" };
  }

  const data = await buildReportData(meetingId);
  if (!data) {
    return { sent: 0, emails: [], error: `Meeting ${meetingId} not found` };
  }

  const emails = await getManagementEmails();
  if (emails.length === 0) {
    return {
      sent: 0,
      emails: [],
      error: "No admin/moderator emails found",
    };
  }

  const html = buildReportHtml(data);

  try {
    const { error } = await resend.emails.send({
      from: `BNI Hlasovani <${process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"}>`,
      to: emails,
      subject: `BNI Report - Schuzka ${data.meetingDate}`,
      html,
    });

    if (error) {
      console.error("Resend send error:", error);
      return {
        sent: 0,
        emails,
        error: `Resend API error: ${error.message}`,
      };
    }

    return { sent: emails.length, emails };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sendReport error:", msg);
    return { sent: 0, emails, error: msg };
  }
}

/**
 * Send a meeting-scoped magic link email to a member via Resend.
 * Used for per-meeting per-member voting access links.
 */
export async function sendMeetingMagicLinkEmail(
  email: string,
  magicLink: string,
  memberName?: string,
  meetingDate?: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const fromField = `BNI Hlasovani <${fromEmail}>`;

  console.info(`[sendMeetingMagicLinkEmail] to=${email} from=${fromField} apiKey=${apiKey ? apiKey.slice(0, 8) + "..." : "MISSING"} keyLength=${apiKey?.length ?? 0}`);

  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured, logging meeting magic link to console");
    console.log(`[MEETING MAGIC LINK] ${email}: ${magicLink}`);
    return { success: true };
  }

  const dateLabel = meetingDate ? ` (${meetingDate})` : "";

  try {
    console.info(`[sendMeetingMagicLinkEmail] calling resend.emails.send to=${email} from=${fromField}`);
    const { data, error } = await resend.emails.send({
      from: fromField,
      to: [email],
      subject: `BNI Hlasovani - Odkaz pro hlasovani${dateLabel}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:20px;">BNI Hlasovani</h1>
  </div>
  <p>Dobry den${memberName ? ` ${escapeHtml(memberName)}` : ""},</p>
  <p>Byl pro vas pripraven odkaz pro hlasovani na schuzi${dateLabel ? ` <strong>${escapeHtml(dateLabel.replace(/[()]/g, "").trim())}</strong>` : ""}. Kliknutim nize pristupite na stranku hlasovani:</p>
  <div style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(magicLink)}" style="display:inline-block;padding:12px 32px;background:#cf2e2e;color:#fff;text-decoration:none;border-radius:30px;font-weight:600;">Prejit na hlasovani</a>
  </div>
  <p style="color:#666;font-size:13px;">Odkaz je osobni a platny po dobu hlasovani.</p>
  <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #E8E8E8;padding-top:12px;">Pokud jste o tento email nezadali, muzete ho ignorovat.</p>
</body>
</html>`,
    });

    if (error) {
      console.error(`[sendMeetingMagicLinkEmail] resend error: to=${email} from=${fromField} error=`, error);
      return { success: false, error: error.message };
    }

    console.info(`[sendMeetingMagicLinkEmail] success: to=${email} id=${data?.id}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[sendMeetingMagicLinkEmail] exception: to=${email} from=${fromField} error=${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * Send a scoped interview magic link email to the interview leader (iter-020,
 * T-008, arch section 8c). Same code path is used for the first send and for
 * every regeneration — the caller (sendInterviewLinkAction) always passes a
 * freshly (re)generated token, so there is nothing "resend"-specific here.
 */
export async function sendInterviewLinkEmail(
  email: string,
  magicLink: string,
  leaderName: string | null,
  memberName: string,
  typeLabel: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const fromField = `BNI Hlasovani <${fromEmail}>`;

  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured, logging interview magic link to console");
    console.log(`[INTERVIEW MAGIC LINK] ${email}: ${magicLink}`);
    return { success: true };
  }

  try {
    console.info(`[sendInterviewLinkEmail] calling resend.emails.send to=${email} from=${fromField}`);
    const { data, error } = await resend.emails.send({
      from: fromField,
      to: [email],
      subject: `BNI Hlasovani - Pohovor (${typeLabel}) - ${memberName}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:20px;">BNI Hlasovani</h1>
  </div>
  <p>Dobry den${leaderName ? ` ${escapeHtml(leaderName)}` : ""},</p>
  <p>Byl pro vas pripraven odkaz na vyplneni pohovoru (<strong>${escapeHtml(typeLabel)}</strong>) se clenem <strong>${escapeHtml(memberName)}</strong>. Kliknutim nize otevrete formular:</p>
  <div style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(magicLink)}" style="display:inline-block;padding:12px 32px;background:#cf2e2e;color:#fff;text-decoration:none;border-radius:30px;font-weight:600;">Vyplnit pohovor</a>
  </div>
  <p style="color:#666;font-size:13px;">Odkaz je platny 30 dni. Odpovedi muzete prubezne ukladat a vratit se k nim pozdeji; po odeslani jsou jen ke cteni.</p>
  <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #E8E8E8;padding-top:12px;">Pokud jste o tento email nezadali, muzete ho ignorovat.</p>
</body>
</html>`,
    });

    if (error) {
      console.error(`[sendInterviewLinkEmail] resend error: to=${email} from=${fromField} error=`, error);
      return { success: false, error: error.message };
    }

    console.info(`[sendInterviewLinkEmail] success: to=${email} id=${data?.id}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[sendInterviewLinkEmail] exception: to=${email} from=${fromField} error=${msg}`);
    return { success: false, error: msg };
  }
}

/**
 * Send a magic link email to a member via Resend.
 */
export async function sendMagicLinkEmail(
  email: string,
  magicLink: string,
  memberName?: string
): Promise<{ success: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.warn("RESEND_API_KEY not configured, logging magic link to console");
    console.log(`[MAGIC LINK] ${email}: ${magicLink}`);
    return { success: true };
  }

  try {
    const { error } = await resend.emails.send({
      from: `BNI Hlasovani <${process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev"}>`,
      to: [email],
      subject: "BNI Hlasovani - Vas pristupovy odkaz",
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:20px;">BNI Hlasovani</h1>
  </div>
  <p>Dobry den${memberName ? ` ${escapeHtml(memberName)}` : ""},</p>
  <p>Kliknutim na tlacitko nize se prihlaste do systemu hlasovani:</p>
  <div style="text-align:center;margin:24px 0;">
    <a href="${escapeHtml(magicLink)}" style="display:inline-block;padding:12px 32px;background:#cf2e2e;color:#fff;text-decoration:none;border-radius:30px;font-weight:600;">Prihlasit se</a>
  </div>
  <p style="color:#666;font-size:13px;">Odkaz je platny 7 dni.</p>
  <p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #E8E8E8;padding-top:12px;">Pokud jste o tento email nezadali, muzete ho ignorovat.</p>
</body>
</html>`,
    });

    if (error) {
      console.error("sendMagicLinkEmail error:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("sendMagicLinkEmail error:", msg);
    return { success: false, error: msg };
  }
}
