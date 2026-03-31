import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { ArchiveGuest } from "@/lib/db/queries/archive";

interface ArchiveGuestCardProps {
  guest: ArchiveGuest;
}

export function ArchiveGuestCard({ guest }: ArchiveGuestCardProps) {
  const { voteSummary } = guest;

  return (
    <Card>
      <div className="space-y-3">
        {/* Header: name + category */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-text-main text-lg">{guest.name}</h3>
          {guest.categoryName && (
            <Badge variant="category">{guest.categoryName}</Badge>
          )}
        </div>

        {/* Description */}
        {guest.description && (
          <p className="text-sm text-text-muted">{guest.description}</p>
        )}

        {/* Meetings */}
        <div>
          <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
            Schuzky
          </h4>
          <div className="flex flex-wrap gap-1">
            {guest.meetings.map((m) => (
              <Badge key={m.id} variant="neutral">
                {formatDate(m.date)}
              </Badge>
            ))}
          </div>
        </div>

        {/* Vote summary */}
        {voteSummary.total > 0 && (
          <div>
            <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
              Hlasovani
            </h4>
            <div className="flex gap-3 text-sm">
              <span className="text-success font-medium">
                +{voteSummary.up}
              </span>
              <span className="text-text-muted font-medium">
                ~{voteSummary.neutral}
              </span>
              <span className="text-danger font-medium">
                -{voteSummary.down}
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        {guest.notes.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-1">
              Poznamky ({guest.notes.length})
            </h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {guest.notes.map((n) => (
                <div
                  key={n.id}
                  className="text-sm bg-background rounded-lg p-2"
                >
                  <p className="text-text-main">{n.text}</p>
                  <p className="text-xs text-text-muted mt-1">
                    {n.createdAt.toLocaleDateString("cs-CZ", {
                      day: "numeric",
                      month: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
