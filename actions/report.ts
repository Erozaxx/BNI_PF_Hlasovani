"use server";

import { requireManagementRole } from "@/lib/auth/guards";
import { sendReport } from "@/lib/email/resend";
import { getMeetingById } from "@/lib/db/queries/meetings";
import type { ActionResult } from "@/lib/types";

/**
 * Manually trigger a report for a specific meeting.
 * Requires admin or moderator role.
 */
export async function triggerReportAction(
  meetingId: string
): Promise<ActionResult<{ sent: number; emails: string[] }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!meetingId) {
    return { success: false, error: "meetingId je povinne." };
  }

  try {
    const meeting = await getMeetingById(meetingId);
    if (!meeting) {
      return { success: false, error: "Schuzka nebyla nalezena." };
    }

    if (meeting.status !== "closed") {
      return {
        success: false,
        error: "Report lze generovat pouze pro uzavrenou schuzku.",
      };
    }

    const result = await sendReport(meetingId);

    if (result.error) {
      return {
        success: false,
        error: `Odeslani reportu selhalo: ${result.error}`,
      };
    }

    return {
      success: true,
      data: { sent: result.sent, emails: result.emails },
    };
  } catch (error) {
    console.error("triggerReportAction error:", error);
    return {
      success: false,
      error: "Nepodarilo se odeslat report.",
    };
  }
}
