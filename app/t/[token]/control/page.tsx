/**
 * /t/[token]/control — Timer control page (server component)
 *
 * [token] is matched against control_token (NOT view_token).
 * Unknown token → notFound() (404, not 403 — do not reveal timer existence).
 *
 * Security: S-002 — Referrer-Policy: no-referrer is set in the parent layout
 * (app/t/[token]/layout.tsx) to prevent control_token from leaking via Referer header.
 */

import { notFound } from "next/navigation";
import { getTimerByControlToken, computeRemaining } from "@/lib/db/queries/timers";
import { ControlPanel } from "./ControlPanel";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function TimerControlPage({ params }: PageProps) {
  const { token } = await params;

  const timer = await getTimerByControlToken(token);
  if (!timer) {
    notFound();
  }

  const remainingSeconds = computeRemaining(timer);

  return (
    <ControlPanel
      token={token}
      name={timer.name}
      status={timer.status as "running" | "paused"}
      remainingSeconds={remainingSeconds}
      displaySeconds={timer.displaySeconds}
      viewToken={timer.viewToken}
    />
  );
}
