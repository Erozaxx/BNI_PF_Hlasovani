"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export interface VoteSummary {
  up: number;
  neutral: number;
  down: number;
  downReasons?: string[];
}

export interface MeetingResultsProps {
  summary: VoteSummary;
  guestName: string;
}

/**
 * Read-only vote result for a single guest in the voting/closed phase.
 * Shows aggregated counts — no individual member names (member page is public).
 * DownReasons are hidden by default and revealed via a collapsible toggle.
 */
export function MeetingResultsView({ summary, guestName }: MeetingResultsProps) {
  const [expanded, setExpanded] = useState(false);
  const total = summary.up + summary.neutral + summary.down;
  const hasDetails = summary.downReasons != null && summary.downReasons.length > 0;

  return (
    <Card className="mt-2 ml-4 bg-background">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
        Vysledky hlasovani — {guestName}
      </h4>
      {total === 0 ? (
        <p className="text-sm text-text-muted">Zadne hlasy nebyly odevzdany.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Badge variant="success">{summary.up}</Badge>
              <span className="text-text-muted">pro</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="neutral">{summary.neutral}</Badge>
              <span className="text-text-muted">nevim</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="danger">{summary.down}</Badge>
              <span className="text-text-muted">proti</span>
            </div>
            <span className="text-text-muted">celkem {total}</span>
          </div>

          {hasDetails && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="mt-2 text-sm text-navy hover:underline focus:outline-none"
            >
              {expanded
                ? "Skryt detaily \u25b2"
                : `Zobrazit detaily (${summary.downReasons!.length} duvodu) \u25bc`}
            </button>
          )}

          {expanded && hasDetails && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">
                Duvody pro hlasovani proti
              </p>
              <ul className="list-disc list-inside space-y-1">
                {summary.downReasons!.map((reason, i) => (
                  <li key={i} className="text-sm text-text-muted">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
