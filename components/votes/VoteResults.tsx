import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

interface VoteResultEntry {
  id: string;
  memberId: string;
  memberName: string;
  value: string;
  reason: string | null;
  createdAt: Date;
}

interface VoteResultsProps {
  results: VoteResultEntry[];
  meetingStatus: string;
}

const valueBadge: Record<string, { variant: "success" | "neutral" | "danger"; label: string }> = {
  up: { variant: "success", label: "Pro" },
  neutral: { variant: "neutral", label: "Neutralni" },
  down: { variant: "danger", label: "Proti" },
};

/**
 * Roll-call voting results.
 * Shows each member's vote with their name.
 * Visible to everyone after meeting is closed; admin/mod see during voting.
 */
export function VoteResults({ results, meetingStatus }: VoteResultsProps) {
  if (results.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {meetingStatus === "voting"
          ? "Zatim zadne hlasy."
          : "Nebyly odevzdany zadne hlasy."}
      </p>
    );
  }

  const summary = {
    up: results.filter((r) => r.value === "up").length,
    neutral: results.filter((r) => r.value === "neutral").length,
    down: results.filter((r) => r.value === "down").length,
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-text-main">
          <span className="font-semibold">{summary.up}</span> pro
        </span>
        <span className="text-text-main">
          <span className="font-semibold">{summary.neutral}</span> neutralni
        </span>
        <span className="text-text-main">
          <span className="font-semibold">{summary.down}</span> proti
        </span>
        <span className="text-text-muted">
          (celkem {results.length})
        </span>
      </div>

      {/* Individual votes */}
      <div className="space-y-2">
        {results.map((r) => {
          const badge = valueBadge[r.value] ?? {
            variant: "neutral" as const,
            label: r.value,
          };
          return (
            <Card key={r.id}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-main">
                  {r.memberName}
                </span>
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
              {r.reason && (
                <p className="text-sm text-text-muted mt-1">
                  Duvod: {r.reason}
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
