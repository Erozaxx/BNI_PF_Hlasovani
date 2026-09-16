import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth/session";
import { getMeetingById } from "@/lib/db/queries/meetings";
import { runVotingDispatch, type DispatchMode } from "@/lib/meetings/voting-dispatch";

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
  // iter-028 (T-005, arch 3.3, 3.5): deliver:"now" mimo den schůzky nebo dřív.
  "not-due": 409,
};

/**
 * POST /api/meetings/[id]/start-voting
 *
 * Jediné místo, kde se hlasování spouští z GUI (arch iter-026 T-001, sekce
 * 4.1; akce a `deliver` rozšířeny iter-028, arch 3.5). Zakládá chybějící
 * odkazy a překlopí schůzku do 'voting' — vše přes runVotingDispatch, stejné
 * jádro jako ranní cron.
 *
 * Middleware (LL-005): tahle cesta se DO PUBLIC_PATHS_EXACT nepřidává —
 * zůstává za session cookie stejně jako zbytek /api/meetings/*, protože umí
 * rozeslat 27 mailů.
 *
 * Body (volitelné), `mode` se IGNORUJE (bezpečný směr pro starý panel po
 * deployi, R12 — `{mode:"resend"}` dostane `action:"start"`, tedy `defer`,
 * žádný mail):
 * - `{}` nebo `{ "action": "start" }`      -> mode:"start",  deliver:"defer"
 * - `{ "action": "send-now" }`             -> mode:"start",  deliver:"now"
 * - `{ "action": "send-now", "resendAll": true }` -> mode:"resend", deliver:"now"
 *
 * `send-now` mimo stav 'voting' vrací 409 PŘED voláním jádra — ruční
 * spuštění (`action:"start"`, `draft`/`active`) tak nemůže poslat mail ani
 * kdyby volající poslal `send-now` rovnou (13. 8. — chyba v týhle části
 * znamená, že odkaz nedostane nikdo z 27 členů). Datum schůzky (jestli je
 * `send-now` vůbec "v čase") hlídá guard `not-due` v jádře.
 *
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

  let body: { action?: string; resendAll?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // prázdné tělo je v pořádku — default "start" (deliver:"defer")
  }
  const isSendNow = body.action === "send-now";
  const resendAll = isSendNow && body.resendAll === true;
  const mode: DispatchMode = resendAll ? "resend" : "start";
  const deliver: "now" | "defer" = isSendNow ? "now" : "defer";

  // arch 3.5: route odmítá send-now mimo 'voting' PŘED voláním jádra — jádro
  // samo by draft/active se dnešním datem propustilo (guard not-due by
  // nezasáhl), a to by ruční tlačítko proměnilo v okamžité rozeslání.
  if (isSendNow) {
    const meetingRow = await getMeetingById(meetingId);
    if (!meetingRow) {
      return err(404, "Schuzka nebyla nalezena.");
    }
    if (meetingRow.status !== "voting") {
      return err(409, "Nejdrive spustte hlasovani.");
    }
  }

  const result = await runVotingDispatch(meetingId, {
    mode,
    deliver,
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
