import { NextRequest, NextResponse } from "next/server";
import { sendReport } from "@/lib/email/resend";
import { getSession } from "@/lib/auth/session";

/**
 * POST /api/report
 *
 * Builds and sends a voting report email for a closed meeting.
 * Protected by REPORT_SECRET header OR admin session.
 *
 * Body: { meetingId: string }
 */
export async function POST(request: NextRequest) {
  // Auth: Bearer REPORT_SECRET or admin session
  const authorized = await checkAuthorization(request);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { meetingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { meetingId } = body;
  if (!meetingId) {
    return NextResponse.json(
      { error: "meetingId is required" },
      { status: 400 }
    );
  }

  try {
    const result = await sendReport(meetingId);

    if (result.error) {
      console.error(`Report send failed for meeting ${meetingId}:`, result.error);
      return NextResponse.json(
        { error: result.error, sent: result.sent, emails: result.emails },
        { status: 500 }
      );
    }

    return NextResponse.json({
      sent: result.sent,
      emails: result.emails,
    });
  } catch (error) {
    console.error("Report endpoint error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Check authorization via REPORT_SECRET header or admin session.
 */
async function checkAuthorization(request: NextRequest): Promise<boolean> {
  // Check Bearer token
  const authHeader = request.headers.get("authorization");
  const reportSecret = process.env.REPORT_SECRET;
  if (reportSecret && authHeader === `Bearer ${reportSecret}`) {
    return true;
  }

  // Check admin session
  try {
    const session = await getSession();
    if (session.memberId && session.managementRole === "admin") {
      return true;
    }
    // Also allow moderator to trigger reports
    if (session.memberId && session.managementRole === "moderator") {
      return true;
    }
  } catch {
    // Session check failed — not authorized via session
  }

  return false;
}
