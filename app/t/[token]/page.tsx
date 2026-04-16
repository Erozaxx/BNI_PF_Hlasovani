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
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const mini = sp["mini"] === "1";

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
      mini={mini}
    />
  );
}
