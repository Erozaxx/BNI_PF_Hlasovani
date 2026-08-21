import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { runVotingDispatch } from "@/lib/meetings/voting-dispatch";

// Rozesílání ~27 mailů (Resend, 250ms pauza mezi sends) trvá řádově 15s
// (arch iter-026 9.2). Vercel Hobby default limit funkce (10s) by to
// oříznul uprostřed dávky. maxDuration = 60 je strop Hobby plánu — arch 4.1.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

const GUARD_STATUS: Record<string, number> = {
  "not-found": 404,
  "meeting-closed": 409,
  conflict: 409,
  "no-guests": 422,
  "no-recipients": 422,
};

/**
 * POST /api/meetings/[id]/start-voting
 *
 * Jediné místo, kde se hlasování spouští z GUI (arch iter-026 T-001, sekce
 * 4.1). Zakládá chybějící odkazy, překlopí schůzku do 'voting' a rozešle
 * maily — vše přes runVotingDispatch, stejné jádro jako čtvrteční cron.
 *
 * Middleware (LL-005): tahle cesta se DO PUBLIC_PATHS_EXACT nepřidává —
 * zůstává za session cookie stejně jako zbytek /api/meetings/*, protože umí
 * rozeslat 27 mailů.
 *
 * Body (volitelné): { "mode": "start" | "resend" }, default "start".
 * Auth: session s managementRole admin | moderator.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  if (!isManagement) {
    return err(401, "Unauthorized");
  }

  const { id: meetingId } = await params;

  let body: { mode?: string } = {};
  try {
    body = await req.json();
  } catch {
    // prázdné tělo je v pořádku — default "start"
  }
  const mode = body.mode === "resend" ? "resend" : "start";

  const result = await runVotingDispatch(meetingId, {
    mode,
    actor: session.memberId,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: GUARD_STATUS[result.code] ?? 400 });
  }

  // Revalidace v odděleném try/catch — selhání revalidace nesmí schovat
  // úspěšný výsledek dispatchu před klientem.
  try {
    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath("/meetings");
    revalidatePath("/dashboard");
  } catch (e) {
    console.error("[start-voting] revalidatePath failed:", e);
  }

  // Vždy HTTP 200 při ok:true, i když se část mailů nepovedla — dílčí
  // neúspěch je v těle odpovědi (arch 4.1).
  return NextResponse.json(result, { status: 200 });
}
