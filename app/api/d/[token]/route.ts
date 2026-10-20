import { NextRequest, NextResponse } from "next/server";
import { verifyAttendanceToken } from "@/lib/auth/attendance-magic";
import { getClientIp } from "@/lib/auth/throttle";
import { loadDayPayload } from "@/lib/attendance/day-view";
import { linkProblemStatus, linkProblemText } from "@/lib/attendance/link-page";
import { SHEET_TEXTS, decideAttendanceWriteMode, parseWriteBody, type SheetRow } from "@/lib/attendance/sheet";
import {
  getDayMeta,
  listSheetRows,
  setExcuseGuarded,
  writePresenceGuarded,
} from "@/lib/db/queries/attendance";
import { pragueToday } from "@/lib/members/activity";

/**
 * iter-038 (T-003c, arch 9.3, 6.1, gate Z4): zápis a čtení docházky dne přes
 * ranní odkaz správce. Token v cestě je jediná autorita; den, správce i práva se
 * berou z ověřeného odkazu, nikdy z požadavku. Odkaz nikdy nedává
 * `attendance.edit_history` (jen režim `normal`: dnes a do uzávěrky), takže
 * po uzávěrce je zápis zamítnutý. Neplatný token jde přes DB throttle (429
 * při blokaci). Cookie se nenese a nevzniká, proto se `Origin` nekontroluje.
 *
 * Odpovědi mají stejný tvar jako `/api/attendance/[date]`, aby `AttendanceSheet`
 * fungoval beze změny. `force-dynamic` a žádná cache (LL-004). Zápis je jeden
 * SQL příkaz bez transakce (LL-003).
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer" } as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** Práva odkazu: zápis dne, nic z oprav a auditu (Z4). */
const LINK_PERMISSIONS = ["attendance.record"] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  try {
    const v = await verifyAttendanceToken(token, getClientIp(req.headers));
    if (v.status !== "ok") {
      return json({ result: "denied", message: linkProblemText(v.status) }, linkProblemStatus(v.status));
    }
    const payload = await loadDayPayload(v.date, {
      permissions: LINK_PERMISSIONS,
      memberId: v.memberId,
    });
    return json({ ...payload, audit: null });
  } catch (err) {
    console.error(`[GET /api/d] failed: ${errClass(err)}`);
    return json({ error: SHEET_TEXTS.errSave }, 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  try {
    // Token se ověřuje dřív než tělo: neověřený klient nenechá server parsovat JSON.
    const v = await verifyAttendanceToken(token, getClientIp(req.headers));
    if (v.status !== "ok") {
      return json({ result: "denied", message: linkProblemText(v.status) }, linkProblemStatus(v.status));
    }

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: "Neplatný vstup." }, 400);
    }

    const parsed = parseWriteBody(raw);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const body = parsed.value;

    const date = v.date;
    const today = pragueToday();
    const can = { record: true, editHistory: false };
    const meta = await getDayMeta(date);
    const decision = decideAttendanceWriteMode({
      date,
      today,
      finalized: meta.finalized,
      can,
      op: body.op,
    });
    if (decision.mode !== "normal") {
      return json({ result: "denied", message: decision.message ?? SHEET_TEXTS.errClosed }, 403);
    }

    let closed = false;
    let inactive = false;
    let conflict = false;

    if (body.op === "presence") {
      const res = await writePresenceGuarded({
        date,
        memberId: body.memberId,
        status: body.status,
        name: body.substituteName,
        expectedVersion: body.expectedVersion,
        actorId: v.memberId,
        mode: "normal",
      });
      if (res.result === "day-closed") closed = true;
      else if (res.result === "inactive") inactive = true;
      else if (res.result === "conflict") conflict = true;
    } else {
      const res = await setExcuseGuarded({
        date,
        memberId: body.memberId,
        excused: body.excused,
        actorId: v.memberId,
        mode: "normal",
      });
      if (res.result === "day-closed") closed = true;
      else if (res.result === "inactive") inactive = true;
    }

    const row: SheetRow | null = (await listSheetRows(date, body.memberId))[0] ?? null;

    if (closed) {
      return json({ result: "finalized", mode: "denied", message: SHEET_TEXTS.errClosed, row }, 409);
    }
    if (inactive) return json({ result: "inactive", message: SHEET_TEXTS.errInactive, row }, 409);
    if (conflict) return json({ result: "conflict", row }, 409);
    return json({ result: "ok", row });
  } catch (err) {
    console.error(`[POST /api/d] failed: ${errClass(err)}`);
    return json({ error: SHEET_TEXTS.errSave }, 500);
  }
}
