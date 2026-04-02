"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface EventOption {
  id: string;
  label: string;
  voteCount: number;
}

interface Participant {
  id: string;
  memberName: string | null;
  externalName: string | null;
  memberEmail: string | null;
  externalEmail: string | null;
  memberId: string | null;
  voteCount: number;
}

interface EventData {
  id: string;
  title: string;
  status: string;
  selectedOptionId: string | null;
}

interface EventReportProps {
  event: EventData;
  options: EventOption[];
  participants: Participant[];
  votersByOption: Record<string, string[]>;
}

export function EventReport({ event, options, participants, votersByOption }: EventReportProps) {
  // Sort options descending by vote count
  const sortedOptions = [...options].sort((a, b) => b.voteCount - a.voteCount);

  function handleExportCsv() {
    window.open(`/api/events/${event.id}/export/csv`, "_blank");
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-main">
          Report vysledku
        </h2>
        <Button variant="secondary" size="sm" onClick={handleExportCsv}>
          Exportovat CSV
        </Button>
      </div>

      <p className="text-sm text-text-muted mb-4">
        Celkem ucastniku: {participants.length} | Celkem moznosti:{" "}
        {options.length}
      </p>

      <div className="space-y-4">
        {sortedOptions.map((opt, idx) => {
          const isSelected = event.selectedOptionId === opt.id;
          const isFirst = idx === 0 && opt.voteCount > 0;

          return (
            <div
              key={opt.id}
              className={`rounded-lg border p-4 ${
                isSelected
                  ? "border-success bg-success-light"
                  : isFirst
                  ? "border-primary bg-background"
                  : "border-border bg-background"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-text-main">{opt.label}</span>
                  {isSelected && (
                    <span className="text-xs text-success font-semibold">
                      ✓ Vitezny termin
                    </span>
                  )}
                </div>
                <span className="text-sm font-semibold text-text-main">
                  {opt.voteCount}{" "}
                  {opt.voteCount === 1 ? "hlas" : "hlasu"}
                </span>
              </div>

              {/* Voters for this option */}
              {(votersByOption[opt.id]?.length ?? 0) > 0 ? (
                <div className="text-xs text-text-muted flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
                  {votersByOption[opt.id].map((name, i) => (
                    <span key={i}>{name}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-text-muted mt-1">Nikdo nehlasoval</p>
              )}
            </div>
          );
        })}
      </div>

      {sortedOptions.length === 0 && (
        <p className="text-sm text-text-muted">Zadne moznosti.</p>
      )}
    </Card>
  );
}
