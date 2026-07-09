"use server";

import { revalidatePath } from "next/cache";
import { requireManagementRole } from "@/lib/auth/guards";
import {
  createInterviewWithSnapshot,
  deleteInterview as dbDeleteInterview,
  getInterviewById,
  getInterviewDetail,
  getInterviewQuestionsWithAnswers,
  getMemberInterviewsForCompare,
  pairInterviewAnswersForCompare,
  updateInterviewLeader as dbUpdateInterviewLeader,
  type InterviewType,
} from "@/lib/db/queries/interviews";
import { getMemberById } from "@/lib/db/queries/members";
import {
  generateOrRegenerateInterviewToken,
  buildInterviewUrl,
  getInterviewLinkStatus,
  markInterviewLinkSent,
  revokeInterviewToken,
} from "@/lib/auth/interview-magic";
import { sendInterviewLinkEmail } from "@/lib/email/resend";
import {
  buildInterviewCompareReportHtml,
  buildInterviewReportHtml,
  sendInterviewReportEmail,
} from "@/lib/email/interview-report";
import type { ActionResult } from "@/lib/types";

// Admin/mod interview management (arch sections 6, 8, 10; T-004a). Every
// action here requires admin OR moderator (requireManagementRole) — there is
// no session-based mutation path onto interview_answer anywhere in this file:
// answers are read-only for mod/admin, the leader fills them in via the
// scoped magic link (T-008), structurally, not just hidden in the UI.

const INTERVIEWS_PATH = "/interviews";

const TYPE_LABELS: Record<InterviewType, string> = {
  month_5: "5 mesicu",
  month_10: "10 mesicu",
};

// Anti-spam guard (arch section 5, M-2 analogy): minimum time between two
// link sends for the same interview, to protect against accidental double-clicks.
const RESEND_MIN_INTERVAL_MS = 60 * 1000;

/**
 * Found a new interview with a frozen question snapshot (arch 4.1 / 8a).
 * Leader defaults to the founding admin/mod in the caller's UI, but any
 * member id can be passed (leader can be changed to another member at
 * creation time). Duplicate (member, type) hits the partial UNIQUE index and
 * comes back as a readable error — never a 500 (T-004a delta 3).
 */
export async function createInterviewAction(
  memberId: string,
  type: InterviewType,
  leaderId: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!memberId) {
    return { success: false, error: "Vyberte clena." };
  }
  if (type !== "month_5" && type !== "month_10") {
    return { success: false, error: "Neplatny typ pohovoru." };
  }
  if (!leaderId) {
    return { success: false, error: "Vyberte vedouciho pohovoru." };
  }

  try {
    const memberExists = await getMemberById(memberId);
    if (!memberExists) {
      return { success: false, error: "Clen nebyl nalezen." };
    }
    const leaderExists = await getMemberById(leaderId);
    if (!leaderExists) {
      return { success: false, error: "Vedouci nebyl nalezen." };
    }

    const result = await createInterviewWithSnapshot({
      memberId,
      type,
      leaderId,
      createdBy: auth.session.memberId,
    });

    switch (result.status) {
      case "created":
      case "repaired":
        revalidatePath(INTERVIEWS_PATH);
        return { success: true, data: { id: result.interviewId } };
      case "duplicate":
        // Readable dedup error (T-004a delta 3, arch 8a) — never a 500.
        return {
          success: false,
          error: `Pohovor ${TYPE_LABELS[type]} pro tohoto clena uz existuje. Nejdrive smazte stavajici pohovor.`,
        };
      case "empty_question_set":
        return {
          success: false,
          error:
            "Sada otazek pro pohovory je prazdna. Pred zalozenim pridejte alespon jednu otazku v sekci Pohovory > Sprava otazek.",
        };
      case "failed":
      default:
        return {
          success: false,
          error: "Zalozeni pohovoru se nepovedlo, zkuste to prosim znovu.",
        };
    }
  } catch (error) {
    console.error("createInterviewAction error:", error);
    return { success: false, error: "Nepodarilo se zalozit pohovor." };
  }
}

/**
 * Change the leader of an interview (arch 8b). Guarded to status='open' —
 * once submitted the leader is frozen. Sequence (LL-003, no db.transaction()):
 * revoke any existing link first (idempotent no-op when none exists yet —
 * link generation itself is T-008), then update the leader row.
 */
export async function updateInterviewLeaderAction(
  interviewId: string,
  newLeaderId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!newLeaderId) {
    return { success: false, error: "Vyberte vedouciho." };
  }

  try {
    const existing = await getInterviewById(interviewId);
    if (!existing) {
      return { success: false, error: "Pohovor nebyl nalezen." };
    }
    if (existing.status !== "open") {
      return {
        success: false,
        error: "Vedouciho lze zmenit jen u otevreneho pohovoru.",
      };
    }

    const leaderExists = await getMemberById(newLeaderId);
    if (!leaderExists) {
      return { success: false, error: "Vedouci nebyl nalezen." };
    }

    // Revoke first (arch 8b ordering): the previous leader's link must die
    // before handing the interview to someone new; revoke is idempotent, so
    // a retry after a partial failure here is always safe.
    await revokeInterviewToken(interviewId);

    const updated = await dbUpdateInterviewLeader(interviewId, newLeaderId);
    if (!updated) {
      return {
        success: false,
        error:
          "Pohovor mezitim prestal byt otevreny, vedouciho se nepodarilo zmenit.",
      };
    }

    revalidatePath(INTERVIEWS_PATH);
    revalidatePath(`${INTERVIEWS_PATH}/${interviewId}`);
    return { success: true };
  } catch (error) {
    console.error("updateInterviewLeaderAction error:", error);
    return { success: false, error: "Nepodarilo se zmenit vedouciho." };
  }
}

/**
 * Generate (first send) or regenerate (re-send/rotate) the interview's scoped
 * magic link and email it to the current leader (arch 8c, T-008). This is
 * intentionally a SINGLE action for both cases: generateOrRegenerateInterviewToken
 * is a single UPSERT on the interview_id-unique interview_link row, so "send"
 * and "regenerate and send" are exactly the same code path — the previous
 * token_hash is overwritten atomically with no fallback (H-9). The caller UI
 * only changes the button label depending on whether a link already exists.
 *
 * Order (LL-003): the token is (re)generated first — if the email send then
 * fails, the admin/mod can simply click again (regeneration is harmless,
 * there is no "previous token" to lose). last_sent_at is only stamped after a
 * confirmed successful send.
 */
export async function sendInterviewLinkAction(
  interviewId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const detail = await getInterviewDetail(interviewId);
    if (!detail) {
      return { success: false, error: "Pohovor nebyl nalezen." };
    }
    if (detail.status !== "open") {
      return {
        success: false,
        error: "Odkaz lze odeslat jen u otevreneho pohovoru.",
      };
    }
    if (!detail.leaderId) {
      return {
        success: false,
        error: "Pohovoru neni prirazen vedouci.",
      };
    }

    const leader = await getMemberById(detail.leaderId);
    if (!leader) {
      return { success: false, error: "Vedouci nebyl nalezen." };
    }
    if (!leader.email) {
      return {
        success: false,
        error: "Vedouci nema email — doplnte ho v sekci Clenove.",
      };
    }

    // Anti-spam guard: refuse a resend within RESEND_MIN_INTERVAL_MS of the
    // last successful send (protects against double-click, not a security
    // control — mod/admin is already authenticated via session).
    const linkStatus = await getInterviewLinkStatus(interviewId);
    if (
      linkStatus?.lastSentAt &&
      Date.now() - linkStatus.lastSentAt.getTime() < RESEND_MIN_INTERVAL_MS
    ) {
      return {
        success: false,
        error: "Link byl odeslan pred chvili, zkuste to prosim za minutu.",
      };
    }

    const rawToken = await generateOrRegenerateInterviewToken(
      interviewId,
      detail.leaderId
    );
    const url = buildInterviewUrl(rawToken);

    const sendResult = await sendInterviewLinkEmail(
      leader.email,
      url,
      leader.name,
      detail.memberName,
      TYPE_LABELS[detail.type as InterviewType] ?? detail.type
    );

    if (!sendResult.success) {
      return {
        success: false,
        error: `Token byl vygenerovan, ale odeslani emailu selhalo: ${sendResult.error ?? "neznama chyba"}. Zkuste odeslat znovu.`,
      };
    }

    await markInterviewLinkSent(interviewId, new Date());

    revalidatePath(`${INTERVIEWS_PATH}/${interviewId}`);
    return { success: true };
  } catch (error) {
    console.error("sendInterviewLinkAction error:", error);
    return { success: false, error: "Nepodarilo se odeslat link." };
  }
}

/**
 * Hard delete an interview (arch 8h, T-004a delta 2). Admin + moderator, NO
 * status guard — works for open AND submitted, per the human-gate decision
 * ("bez ohledu na stav"). The DB cascade (snapshot/answers/link) runs
 * atomically inside the single DELETE in deleteInterview() — LL-003 is
 * satisfied trivially, there is no application-level sequencing here.
 */
export async function deleteInterviewAction(
  interviewId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getInterviewById(interviewId);
    if (!existing) {
      return { success: false, error: "Pohovor nebyl nalezen." };
    }

    // Return value ignored on purpose: 0 rows affected (double-click / race
    // with a concurrent delete) still means the target state "pohovor
    // neexistuje" holds (arch 8h) — that is success, not an error.
    await dbDeleteInterview(interviewId);

    revalidatePath(INTERVIEWS_PATH);
    return { success: true };
  } catch (error) {
    console.error("deleteInterviewAction error:", error);
    return { success: false, error: "Nepodarilo se smazat pohovor." };
  }
}

// ============================================================
// Reports (arch section 8g, T-004a/T-003 MINOR-3 signatures, T-009). Two
// separate actions on purpose — different guards and different inputs, a
// compare report is keyed by member (a pair of interviews), not by a single
// interview id. Both mail an arbitrary recipient member (never a free-text
// email) and never include a magic link.
// ============================================================

/**
 * Send a single interview's report by email to an arbitrary recipient member
 * (arch 8g). Guarded to status='submitted' — an in-progress (open) interview
 * has no stable report to send, answers can still change until submit.
 */
export async function sendInterviewReportAction(
  interviewId: string,
  recipientMemberId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!recipientMemberId) {
    return { success: false, error: "Vyberte prijemce." };
  }

  try {
    const detail = await getInterviewDetail(interviewId);
    if (!detail) {
      return { success: false, error: "Pohovor nebyl nalezen." };
    }
    if (detail.status !== "submitted") {
      return {
        success: false,
        error: "Report lze odeslat jen u odeslaneho (submitted) pohovoru.",
      };
    }

    const recipient = await getMemberById(recipientMemberId);
    if (!recipient) {
      return { success: false, error: "Prijemce nebyl nalezen." };
    }
    if (!recipient.email) {
      return { success: false, error: "Vybrany prijemce nema email." };
    }

    const questions = await getInterviewQuestionsWithAnswers(interviewId);
    const typeLabel = TYPE_LABELS[detail.type as InterviewType] ?? detail.type;

    const html = buildInterviewReportHtml({
      memberName: detail.memberName,
      typeLabel,
      leaderName: detail.leaderName,
      createdAt: detail.createdAt,
      submittedAt: detail.submittedAt,
      questions: questions.map((q) => ({ text: q.text, valueText: q.valueText })),
    });

    const sendResult = await sendInterviewReportEmail(
      recipient.email,
      `BNI Hlasovani - Report pohovoru: ${detail.memberName} (${typeLabel})`,
      html
    );

    if (!sendResult.success) {
      return {
        success: false,
        error: `Odeslani reportu selhalo: ${sendResult.error ?? "neznama chyba"}. Zkuste to prosim znovu.`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("sendInterviewReportAction error:", error);
    return { success: false, error: "Nepodarilo se odeslat report." };
  }
}

/**
 * Send the 5-vs-10 compare report for a member by email to an arbitrary
 * recipient (arch sections 4.2 / 8g). Requires BOTH interviews to exist and
 * be 'submitted' (T-003 decision) — comparing against an in-progress
 * interview would show answers that can still change underneath the report.
 */
export async function sendInterviewCompareReportAction(
  memberId: string,
  recipientMemberId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!recipientMemberId) {
    return { success: false, error: "Vyberte prijemce." };
  }

  try {
    const member = await getMemberById(memberId);
    if (!member) {
      return { success: false, error: "Clen nebyl nalezen." };
    }

    const { month5, month10 } = await getMemberInterviewsForCompare(memberId);
    if (!month5 || !month10) {
      return {
        success: false,
        error:
          "Porovnavaci report vyzaduje zalozene oba pohovory (5 i 10 mesicu).",
      };
    }
    if (month5.status !== "submitted" || month10.status !== "submitted") {
      return {
        success: false,
        error:
          "Porovnavaci report lze odeslat, jen kdyz jsou oba pohovory odeslane (submitted).",
      };
    }

    const recipient = await getMemberById(recipientMemberId);
    if (!recipient) {
      return { success: false, error: "Prijemce nebyl nalezen." };
    }
    if (!recipient.email) {
      return { success: false, error: "Vybrany prijemce nema email." };
    }

    const { paired, onlyIn5, onlyIn10 } = pairInterviewAnswersForCompare(
      month5.questions,
      month10.questions
    );

    const html = buildInterviewCompareReportHtml({
      memberName: member.name,
      paired,
      onlyIn5,
      onlyIn10,
    });

    const sendResult = await sendInterviewReportEmail(
      recipient.email,
      `BNI Hlasovani - Porovnani pohovoru: ${member.name} (5 vs 10 mesicu)`,
      html
    );

    if (!sendResult.success) {
      return {
        success: false,
        error: `Odeslani reportu selhalo: ${sendResult.error ?? "neznama chyba"}. Zkuste to prosim znovu.`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("sendInterviewCompareReportAction error:", error);
    return {
      success: false,
      error: "Nepodarilo se odeslat porovnavaci report.",
    };
  }
}
