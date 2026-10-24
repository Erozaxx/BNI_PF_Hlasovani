import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { requirePermissionForRoute } from "@/lib/auth/guards";
import { NO_PERMISSION_MESSAGE, canAny } from "@/lib/auth/permissions";
import { isSameOrigin } from "@/lib/auth/same-origin";
import { MAX_ADVANCE_DAYS } from "@/lib/attendance/rules";
import { UNEXCUSED_TEXTS } from "@/lib/attendance/texts";
import {
  SHEET_TEXTS,
  decideAttendanceWriteMode,
  parseSheetDate,
  parseWriteBody,
  type SheetRow,
} from "@/lib/attendance/sheet";
import { loadDayPayload, writeCanFor } from "@/lib/attendance/day-view";
import {
  getDayMeta,
  listSheetRows,
  setExcuseGuarded,
  writePresenceGuarded,
} from "@/lib/db/queries/attendance";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import { addDaysToDateString, pragueToday } from "@/lib/members/activity";

/**
 * iter-038 (T-003b, arch 6.1, 6.2, 6.4): zápis a čtení docházky dne pro
 * přihlášené správce. GET (polling každých 10 s) chce `attendance.view_all`,
 * POST `attendance.record` nebo `attendance.edit_history`. Režim zápisu
 * (`normal`, `history`, `denied`) rozhoduje server u každého zápisu znovu.
 *
 * `force-dynamic` a žádná cache (LL-004). Zápis je jeden SQL příkaz bez
 * transakce (LL-003). POST kontroluje `Origin` proti hostu.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí odpověď. */
async function safeLog(build: () => OpsEventInput): Promise<void> {
  try {
    await logOpsEvent(build());
  } catch (err) {
    console.error(`[attendance] ops log failed: ${errClass(err)}`);
  }
}

function dateInRange(date: string): boolean {
  return date <= addDaysToDateString(pragueToday(), MAX_ADVANCE_DAYS);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ date: string }> | { date: string } }
) {
  const authz = await requirePermissionForRoute("attendance.view_all", { splitStatus: true });
  if ("response" in authz) return authz.response;

  const date = parseSheetDate((await params).date);
  if (!date || !dateInRange(date)) return json({ error: "Neplatné datum." }, 400);

  try {
    return json(await loadDayPayload(date, authz.session));
  } catch (err) {
    console.error(`[GET /api/attendance] failed: ${errClass(err)}`);
    return json({ error: SHEET_TEXTS.errSave }, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ date: string }> | { date: string } }
) {
  if (
    !isSameOrigin({
      origin: req.headers.get("origin"),
      forwardedHost: req.headers.get("x-forwarded-host"),
      host: req.headers.get("host"),
    })
  ) {
    return json({ error: NO_PERMISSION_MESSAGE }, 403);
  }

  const session = await getSession();
  // 401 bez session, 403 pro přihlášeného bez práva (jako chybný Origin výš).
  if (!session.memberId) return json({ error: NO_PERMISSION_MESSAGE }, 401);
  if (!canAny(session, ["attendance.record", "attendance.edit_history"])) {
    return json({ error: NO_PERMISSION_MESSAGE }, 403);
  }

  const date = parseSheetDate((await params).date);
  if (!date || !dateInRange(date)) return json({ error: "Neplatné datum." }, 400);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "Neplatný vstup." }, 400);
  }
  const parsed = parseWriteBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const body = parsed.value;

  const can = writeCanFor(session);
  const today = pragueToday();

  try {
    const meta = await getDayMeta(date);
    const decision = decideAttendanceWriteMode({
      date,
      today,
      finalized: meta.finalized,
      can,
      op: body.op,
    });
    if (decision.mode === "denied") {
      return json({ result: "denied", message: decision.message ?? SHEET_TEXTS.errClosed }, 403);
    }
    const mode = decision.mode;

    let audited = false;
    let closed = false;
    let inactive = false;
    let conflict = false;
    // iter-041: odmítnutí kvůli času (7:30) nebo souběhu omluvy a „Chyběl(a) bez omluvy“.
    let blocked: string | null = null;

    if (body.op === "presence") {
      const res = await writePresenceGuarded({
        date,
        memberId: body.memberId,
        status: body.status,
        name: body.substituteName,
        expectedVersion: body.expectedVersion,
        actorId: session.memberId,
        mode,
      });
      if (res.result === "ok") audited = res.audited;
      else if (res.result === "day-closed") closed = true;
      else if (res.result === "inactive") inactive = true;
      else if (res.result === "too-early") blocked = UNEXCUSED_TEXTS.tooEarly;
      else if (res.result === "excused-conflict") blocked = UNEXCUSED_TEXTS.excusedConflict;
      else conflict = true;
    } else {
      const res = await setExcuseGuarded({
        date,
        memberId: body.memberId,
        excused: body.excused,
        actorId: session.memberId,
        mode,
      });
      if (res.result === "ok") audited = res.audited;
      else if (res.result === "day-closed") closed = true;
      else if (res.result === "unexcused-conflict") blocked = UNEXCUSED_TEXTS.unexcusedConflict;
      else inactive = true;
    }

    const row: SheetRow | null = (await listSheetRows(date, body.memberId))[0] ?? null;

    if (closed) {
      // Den se mezitím uzavřel: klient dostane nový stav dne a hlášku.
      const metaNow = await getDayMeta(date);
      const again = decideAttendanceWriteMode({
        date,
        today,
        finalized: metaNow.finalized,
        can,
        op: body.op,
      });
      return json(
        { result: "finalized", mode: again.mode, message: again.message ?? SHEET_TEXTS.errClosed, row },
        409
      );
    }
    if (inactive) return json({ result: "inactive", message: SHEET_TEXTS.errInactive, row }, 409);
    if (blocked) return json({ result: "blocked", message: blocked, row }, 409);
    if (conflict) return json({ result: "conflict", row }, 409);

    if (mode === "history" && audited && row) {
      await safeLog(() => ({
        runId: randomUUID(),
        seq: 1,
        source: "gui",
        kind: "attendance.history-edited",
        severity: "info",
        // Security L-1: absence ostatních vidí jen admin, P, VP a správce, ale
        // /status chce jen `ops.view` (i moderátor). Bez jmen, jen technické ID.
        actor: session.memberId,
        memberId: row.memberId,
        meetingDate: date,
        message: "Oprava docházky.",
      }));
    }
    return json({ result: "ok", row });
  } catch (err) {
    console.error(`[POST /api/attendance] failed: ${errClass(err)}`);
    return json({ error: SHEET_TEXTS.errSave }, 500);
  }
}
