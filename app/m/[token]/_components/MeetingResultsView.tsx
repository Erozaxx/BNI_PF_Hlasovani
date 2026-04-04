import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export interface VoteSummary {
  up: number;
  neutral: number;
  down: number;
}

export interface MeetingResultsProps {
  summary: VoteSummary;
  guestName: string;
}

/**
 * Read-only vote result for a single guest in the closed phase.
 * Shows aggregated counts — no individual member names (member page is public).
 */
export function MeetingResultsView({ summary, guestName }: MeetingResultsProps) {
  const total = summary.up + summary.neutral + summary.down;

  return (
    <Card className="mt-2 ml-4 bg-background">
      <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
        Vysledky hlasovani — {guestName}
      </h4>
      {total === 0 ? (
        <p className="text-sm text-text-muted">Zadne hlasy nebyly odevzdany.</p>
      ) : (
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
      )}
    </Card>
  );
}
