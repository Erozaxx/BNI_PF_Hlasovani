import { notFound } from "next/navigation";
import { getTimerByViewToken, computeRemaining } from "@/lib/db/queries/timers";
import { TimerDisplay } from "./TimerDisplay";

/**
 * /t/[token] — Public timer display page (view_token)
 *
 * Server Component: fetches timer data on the server and calls notFound()
 * for missing tokens (renders app/not-found.tsx). Initial data is passed to
 * the TimerDisplay Client Component, which handles polling and optimistic countdown.
 */

export default async function TimerViewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const timer = await getTimerByViewToken(token);
  if (!timer) notFound();

  const remainingSeconds = computeRemaining(timer);

  return (
    <TimerDisplay
      token={token}
      initialName={timer.name}
      initialStatus={timer.status as "running" | "paused"}
      initialRemainingSeconds={remainingSeconds}
      displaySeconds={timer.displaySeconds}
    />
  );
}
