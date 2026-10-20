import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAppUrl } from "@/lib/auth/login-link";
import { runAttendanceCron } from "@/lib/attendance/cron";

/**
 * iter-038 (T-003c, arch 11, gate Z1): cron docházky. Vercel Hobby spouští cron
 * kdykoli během hodiny, proto `vercel.json` má sedm rozvrhů a o to, co se má
 * udělat, rozhoduje `planAttendanceCron(now)` z pražského času (ráno 6:00 až
 * 11:59 ranní odkazy a záchrana včerejška, večer od 17:00 uzavření dne a
 * report, jinak nic). Hlavička `x-vercel-cron-schedule` se jen loguje.
 *
 * Handler je tenký obal nad `runAttendanceCron`; čas nejde přepsat žádným
 * parametrem požadavku (QA volá jádro skriptem). Chráněno `CRON_SECRET`
 * stejně jako `close-voting`. Odpověď nenese jména ani adresy.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Porovnání tajemství konstantním časem (jen tahle route, `close-voting` se nemění). */
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handler(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  if (!secretMatches(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log(
    `attendance cron: schedule=${request.headers.get("x-vercel-cron-schedule") ?? "n/a"}`
  );

  try {
    const result = await runAttendanceCron(new Date(), { appUrl: getAppUrl() });
    return NextResponse.json(result);
  } catch (err) {
    const cls = err instanceof Error ? err.name : typeof err;
    console.error(`attendance cron failed: ${cls}`);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}

/** Vercel cron sends GET requests. */
export async function GET(request: NextRequest) {
  return handler(request);
}

/** Keep POST for manual/programmatic invocation. */
export async function POST(request: NextRequest) {
  return handler(request);
}
