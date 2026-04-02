import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface EventData {
  id: string;
  title: string;
  description: string | null;
  selectedOptionId: string | null;
  closedAt: Date | null;
}

interface OptionData {
  id: string;
  label: string;
  voteCount: number;
}

interface ResultsViewProps {
  event: EventData;
  options: OptionData[];
  myVotedOptionIds: string[];
}

export function ResultsView({
  event,
  options,
  myVotedOptionIds,
}: ResultsViewProps) {
  // Sort options by vote count descending
  const sorted = [...options].sort((a, b) => b.voteCount - a.voteCount);
  const maxVotes = sorted.length > 0 ? sorted[0].voteCount : 0;

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="warning">Uzavreno</Badge>
          </div>
          <h1 className="text-2xl font-bold text-text-main">{event.title}</h1>
          {event.description && (
            <p className="text-text-muted mt-1">{event.description}</p>
          )}
          {event.closedAt && (
            <p className="text-xs text-text-muted mt-2">
              Uzavreno:{" "}
              {new Date(event.closedAt).toLocaleDateString("cs-CZ", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>

        {/* Selected option highlight */}
        {event.selectedOptionId && (
          <Card variant="highlighted">
            <div className="flex items-center gap-2">
              <span className="text-lg">&#10003;</span>
              <div>
                <p className="text-xs font-medium text-primary uppercase tracking-wide mb-0.5">
                  Vybrany termin
                </p>
                <p className="font-semibold text-text-main">
                  {options.find((o) => o.id === event.selectedOptionId)
                    ?.label ?? ""}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Results list */}
        <div className="flex flex-col gap-3">
          {sorted.map((option) => {
            const isSelected = option.id === event.selectedOptionId;
            const isMyVote = myVotedOptionIds.includes(option.id);
            const isTopVote = option.voteCount === maxVotes && maxVotes > 0;
            const pct =
              maxVotes > 0
                ? Math.round((option.voteCount / maxVotes) * 100)
                : 0;

            return (
              <div
                key={option.id}
                className={`
                  rounded-card p-4 border-2 bg-surface shadow-card
                  ${
                    isSelected
                      ? "border-primary"
                      : isMyVote
                      ? "border-primary/50"
                      : "border-border"
                  }
                `.trim()}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="font-medium text-text-main truncate">
                      {option.label}
                    </span>
                    {isSelected && (
                      <span className="shrink-0 text-xs font-semibold text-primary">
                        &#10003; Vybrany termin
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMyVote && (
                      <Badge variant="info">Vas hlas</Badge>
                    )}
                    {isTopVote && !isSelected && (
                      <Badge variant="success">Nejvice hlasu</Badge>
                    )}
                    <Badge variant="neutral">{option.voteCount} hlasu</Badge>
                  </div>
                </div>

                {/* Vote bar */}
                <div className="h-1.5 bg-background rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      isSelected ? "bg-primary" : "bg-border"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <p className="text-center text-text-muted py-8">
              Zadne moznosti nebyly pridany.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
