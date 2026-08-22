import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RunState } from "@/lib/ops/run-status";

export interface RunListItem {
  runId: string;
  /** Čas nejstarší události běhu (typicky `*.started`) — kdy běh začal. */
  startedAt: Date;
  /** "cron" nebo jméno člověka, který ho spustil. */
  actorLabel: string;
  /** "Schuzka 27. 8." nebo "—", když se ke schůzce nedostal (guard `not-found`). */
  meetingLabel: string;
  state: RunState;
  label: string;
}

const STATE_BADGE: Record<RunState, BadgeVariant> = {
  ok: "success",
  partial: "warning",
  failed: "danger",
  running: "info",
  stalled: "warning",
  unknown: "neutral",
};

/** "22. 8. 07:00" — den. měsíc. HH:MM, Europe/Prague vždy (R9). */
function formatRunTime(date: Date): string {
  const day = date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Prague",
  });
  const time = date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Prague",
  });
  return `${day} ${time}`;
}

/**
 * Pruh 1 „Poslední běhy" (arch iter-027 T-001, sekce 7.2). Jeden řádek =
 * jeden `run_id`. Tenhle řádek, ne detail, je celý smysl stránky: řádek s
 * `stalled` je přesně to, co 13. 8. 2026 nikdo neviděl.
 */
export function RunList({ runs }: { runs: RunListItem[] }) {
  if (runs.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Zatim zadne bezy"
          description="Log zacina dnem nasazeni. Starsi behy se zpetne nedopocitavaji."
        />
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-text-muted mb-3">Posledni behy</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary text-left">
              <th className="px-3 py-2 font-semibold">Kdy</th>
              <th className="px-3 py-2 font-semibold">Kdo</th>
              <th className="px-3 py-2 font-semibold">Schuzka</th>
              <th className="px-3 py-2 font-semibold">Stav</th>
              <th className="px-3 py-2 font-semibold" aria-label="Detail"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run, idx) => (
              <tr
                key={run.runId}
                className={`border-b border-border ${idx % 2 === 1 ? "bg-background" : ""}`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-text-muted">
                  {formatRunTime(run.startedAt)}
                </td>
                <td className="px-3 py-2">{run.actorLabel}</td>
                <td className="px-3 py-2">{run.meetingLabel}</td>
                <td className="px-3 py-2">
                  <Badge variant={STATE_BADGE[run.state]}>{run.label}</Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/status/${run.runId}`}
                    className="text-primary text-xs underline focus:outline-none focus:shadow-focus"
                  >
                    detail →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
