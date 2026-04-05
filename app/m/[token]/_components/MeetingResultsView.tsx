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

export interface VoteDetailItem {
  memberName: string;
  value: string; // "up" | "neutral" | "down"
  reason: string | null;
}

export interface MeetingResultsProps {
  summary: VoteSummary;
  guestName: string;
  voteDetail: VoteDetailItem[];
}

const voteEmoji: Record<string, string> = {
  up: "👍",
  neutral: "🤷",
  down: "👎",
};

/**
 * Read-only vote result for a single guest in the voting/closed phase.
 * Shows aggregated counts (always visible) + collapsible named vote detail.
 */
export function MeetingResultsView({
  summary,
  guestName,
  voteDetail,
}: MeetingResultsProps) {
  const [expanded, setExpanded] = useState(false);
  const total = summary.up + summary.neutral + summary.down;
  const hasVotes = voteDetail.length > 0;

  return (
    <Card className="mt-2 ml-4 bg-background">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
        Vysledky hlasovani — {guestName}
      </h4>
      {total === 0 ? (
        <p className="text-sm text-text-muted">Zadne hlasy nebyly odevzdany.</p>
      ) : (
        <>
          {/* Aggregate counts — always visible */}
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

          {/* Expand/collapse trigger — only if there are votes */}
          {hasVotes && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              className="mt-2 text-sm text-navy hover:underline focus:outline-none"
            >
              {expanded
                ? "Skryt kdo jak hlasoval \u25b2"
                : `Zobrazit kdo jak hlasoval (${voteDetail.length}) \u25bc`}
            </button>
          )}

          {/* Collapsible named vote detail */}
          {expanded && hasVotes && (
            <div className="mt-3 space-y-1">
              {voteDetail.map((v, i) => (
                <div key={`${v.memberName}-${i}`} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0">{voteEmoji[v.value] ?? "?"}</span>
                  <span className="font-medium text-text-main">{v.memberName}</span>
                  {v.value === "down" && v.reason && (
                    <span className="text-text-muted">— {v.reason}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
