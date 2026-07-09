import { Resend } from "resend";
import type { PairedQuestionRow } from "@/lib/db/queries/interviews";

const resend = new Resend(process.env.RESEND_API_KEY);

// escapeHtml here intentionally ALSO escapes the apostrophe — lib/email/resend.ts
// and lib/events/magic-link.ts do not (pentest iter-019 M-6, POTVRZEN: "casovana
// bomba" because those callers only interpolate names/labels). This module
// interpolates free-text interview answers into the same HTML, so an
// unescaped apostrophe is a live risk here, not a theoretical one.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function formatDate(value: Date | string): string {
  return new Date(value).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function hasText(value: string | null): value is string {
  return value !== null && value.trim() !== "";
}

/** One question + its (possibly empty) answer, rendered as a bordered block. */
function answerBlock(text: string, valueText: string | null): string {
  const answered = hasText(valueText);
  return `
    <div style="margin-bottom:12px;padding:12px 16px;border:1px solid #E8E8E8;border-radius:12px;">
      <p style="margin:0 0 6px;font-size:13px;font-weight:600;color:#1a1a1a;">${escapeHtml(text)}</p>
      <p style="margin:0;font-size:13px;white-space:pre-wrap;color:${answered ? "#1a1a1a" : "#999"};">${answered ? escapeHtml(valueText as string) : "Bez odpovedi"}</p>
    </div>`;
}

function htmlShell(title: string, subtitle: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="text-align:center;padding:16px 0;border-bottom:3px solid #cf2e2e;margin-bottom:24px;">
    <h1 style="margin:0;color:#cf2e2e;font-size:22px;">${escapeHtml(title)}</h1>
    <p style="margin:4px 0 0;color:#666;font-size:14px;">${escapeHtml(subtitle)}</p>
  </div>
  ${bodyHtml}
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #E8E8E8;text-align:center;">
    <p style="color:#999;font-size:12px;">Automaticky generovany report z BNI Hlasovani</p>
  </div>
</body>
</html>`;
}

export interface InterviewReportQuestion {
  text: string;
  valueText: string | null;
}

export interface InterviewReportData {
  memberName: string;
  typeLabel: string;
  leaderName: string | null;
  createdAt: Date | string;
  submittedAt: Date | string | null;
  questions: InterviewReportQuestion[];
}

/**
 * Build the single-interview report (arch section 8g). Used both for the
 * admin/mod "Nahled" on the interview detail page and as the exact HTML body
 * sendInterviewReportAction mails out — same function, same output, so the
 * preview is never out of sync with what actually gets sent. Report contains
 * no magic link (arch 8g).
 */
export function buildInterviewReportHtml(data: InterviewReportData): string {
  const meta = `
    <table style="width:100%;margin-bottom:24px;font-size:13px;">
      <tbody>
        <tr><td style="padding:2px 8px 2px 0;color:#666;">Vedouci pohovoru:</td><td style="padding:2px 0;">${data.leaderName ? escapeHtml(data.leaderName) : "-"}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#666;">Zalozeno:</td><td style="padding:2px 0;">${formatDate(data.createdAt)}</td></tr>
        <tr><td style="padding:2px 8px 2px 0;color:#666;">Odeslano:</td><td style="padding:2px 0;">${data.submittedAt ? formatDate(data.submittedAt) : "-"}</td></tr>
      </tbody>
    </table>`;

  const questionsHtml =
    data.questions.length > 0
      ? data.questions.map((q) => answerBlock(q.text, q.valueText)).join("\n")
      : `<p style="font-size:13px;color:#999;">Tento pohovor nema zadne otazky v zamrazenem snapshotu.</p>`;

  return htmlShell(
    "BNI Hlasovani - Pohovor",
    `${data.memberName} - ${data.typeLabel}`,
    `${meta}<h2 style="font-size:16px;color:#333;margin-bottom:12px;">Otazky a odpovedi</h2>${questionsHtml}`
  );
}

export interface InterviewCompareReportData {
  memberName: string;
  paired: PairedQuestionRow[];
  onlyIn5: PairedQuestionRow[];
  onlyIn10: PairedQuestionRow[];
}

/**
 * Build the 5-vs-10 compare report (arch sections 4.2 / 8g): one table for
 * questions paired across both interviews, plus two extra sections for
 * questions that only exist in one side. Rows already arrive paired/ordered
 * from pairInterviewAnswersForCompare() (T-005) — this module only renders
 * them, it does no pairing logic of its own.
 */
export function buildInterviewCompareReportHtml(
  data: InterviewCompareReportData
): string {
  const answerCell = (value: string | null) => {
    const answered = hasText(value);
    return `<td style="padding:6px 8px;font-size:13px;white-space:pre-wrap;vertical-align:top;color:${answered ? "#1a1a1a" : "#999"};">${answered ? escapeHtml(value as string) : "Bez odpovedi"}</td>`;
  };

  const pairedTable =
    data.paired.length > 0
      ? `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:6px 8px;text-align:left;font-size:12px;">Otazka</th>
              <th style="padding:6px 8px;text-align:left;font-size:12px;">Odpoved 5 m</th>
              <th style="padding:6px 8px;text-align:left;font-size:12px;">Odpoved 10 m</th>
            </tr>
          </thead>
          <tbody>
            ${data.paired
              .map(
                (row) => `<tr style="border-bottom:1px solid #E8E8E8;">
                  <td style="padding:6px 8px;font-size:13px;font-weight:600;vertical-align:top;">${escapeHtml(row.questionText)}</td>
                  ${answerCell(row.answer5)}
                  ${answerCell(row.answer10)}
                </tr>`
              )
              .join("\n")}
          </tbody>
        </table>`
      : `<p style="font-size:13px;color:#999;margin-bottom:24px;">Zadne sparovane otazky.</p>`;

  const onlySection = (
    title: string,
    rows: PairedQuestionRow[],
    side: "5" | "10"
  ): string =>
    rows.length > 0
      ? `<h3 style="font-size:14px;color:#333;margin:0 0 8px;">${escapeHtml(title)}</h3>
         ${rows
           .map((row) =>
             answerBlock(row.questionText, side === "5" ? row.answer5 : row.answer10)
           )
           .join("\n")}`
      : "";

  const onlyIn5Html = onlySection("Jen v pohovoru 5 mesicu", data.onlyIn5, "5");
  const onlyIn10Html = onlySection("Jen v pohovoru 10 mesicu", data.onlyIn10, "10");

  return htmlShell(
    "BNI Hlasovani - Porovnani pohovoru",
    `${data.memberName} - 5 vs 10 mesicu`,
    `${pairedTable}${onlyIn5Html}${onlyIn10Html}`
  );
}

/**
 * Send a pre-built interview report email to an arbitrary recipient (arch 8g:
 * report may go to "komukoli z clenu", not just mod/admin — the recipient
 * check itself lives in the calling action). Shared by both
 * sendInterviewReportAction and sendInterviewCompareReportAction; the only
 * difference between the two call sites is which build*Html function
 * produced `html` and what the subject line says. Falls back to a console
 * log when RESEND_API_KEY is not configured (same pattern as every other
 * function in lib/email/*).
 */
export async function sendInterviewReportEmail(
  email: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
  const fromField = `BNI Hlasovani <${fromEmail}>`;

  if (!apiKey) {
    console.warn(
      "RESEND_API_KEY not configured, logging interview report send to console"
    );
    console.log(`[INTERVIEW REPORT] to=${email} subject=${subject}`);
    return { success: true };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: fromField,
      to: [email],
      subject,
      html,
    });

    if (error) {
      console.error(
        `[sendInterviewReportEmail] resend error: to=${email} error=`,
        error
      );
      return { success: false, error: error.message };
    }

    console.info(`[sendInterviewReportEmail] success: to=${email} id=${data?.id}`);
    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(
      `[sendInterviewReportEmail] exception: to=${email} error=${msg}`
    );
    return { success: false, error: msg };
  }
}
