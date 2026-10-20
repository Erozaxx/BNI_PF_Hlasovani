export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { verifyAttendanceToken } from "@/lib/auth/attendance-magic";
import { getClientIp } from "@/lib/auth/throttle";
import { loadDayPayload } from "@/lib/attendance/day-view";
import { LINK_TEXTS, linkProblemText, type LinkProblem } from "@/lib/attendance/link-page";
import { sheetTitle } from "@/lib/attendance/sheet";
import { AttendanceSheet } from "@/components/attendance/AttendanceSheet";

/**
 * iter-038 (T-003c, arch 9, gate sekce 5): zápis docházky dne přes ranní odkaz.
 * Server komponenta bez iron-session, token je jediná autorita (ověřuje
 * `verifyAttendanceToken` v tomto procesu, ne HTTP voláním API, aby
 * throttle viděl skutečnou IP klienta, jako u `/i/[token]`). Práva odkazu:
 * zápis dnešního dne do uzávěrky, bez oprav a auditu. Stejná komponenta
 * `AttendanceSheet` jako v aplikaci, jen s adresou `/api/d/[token]`.
 */
export default async function AttendanceLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let problem: LinkProblem = "invalid";
  let loaded: Awaited<ReturnType<typeof loadDayPayload>> | null = null;
  let date = "";
  try {
    const verdict = await verifyAttendanceToken(token, getClientIp(await headers()));
    if (verdict.status === "ok") {
      date = verdict.date;
      loaded = await loadDayPayload(verdict.date, {
        permissions: ["attendance.record"],
        memberId: verdict.memberId,
      });
    } else {
      problem = verdict.status;
    }
  } catch {
    loaded = null;
    problem = "invalid";
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-10 text-center">
        <p className="text-base text-text-main">{linkProblemText(problem)}</p>
        {problem === "expired" && (
          <Link
            href="/login"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-text-main hover:bg-background focus:outline-none focus:shadow-focus"
          >
            {LINK_TEXTS.expiredButton}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-text-main">{sheetTitle(date)}</h1>
      <AttendanceSheet endpoint={`/api/d/${token}`} initial={{ ...loaded, audit: null }} />
    </div>
  );
}
