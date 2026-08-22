import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeliveryStatusCell } from "./DeliveryStatusCell";
import type { opsEvent } from "@/lib/db/schema";

export type OpsEventDbRow = typeof opsEvent.$inferSelect;

interface EventTableProps {
  events: OpsEventDbRow[];
  hasActiveFilter: boolean;
  prevHref: string | null;
  nextHref: string | null;
}

const SEVERITY_BADGE: Record<string, BadgeVariant> = {
  info: "neutral",
  warn: "warning",
  error: "danger",
};

/**
 * Český popisek pro `kind` (3.3) — "Výsledek aplikace" ve sloupci Druh
 * (7.4 krok 3: "Odeslano" místo syrového `email.sent`). Sdílené i s
 * `[runId]/page.tsx` (detail běhu), aby obě místa ukazovala stejné slovo.
 * Neznámý/budoucí `kind` (R13) se ukáže doslovně, ne skryje.
 */
export const KIND_LABELS: Record<string, string> = {
  "cron.started": "Cron zahajen",
  "cron.finished": "Cron dokoncen",
  "cron.failed": "Cron selhal",
  "cron.phase-failed": "Faze cronu selhala",
  "meeting.closed": "Schuzka uzavrena",
  "dispatch.started": "Zahajeno",
  "dispatch.guard-failed": "Guard",
  "dispatch.failed": "Chyba",
  "dispatch.finished": "Dokonceno",
  "email.sent": "Odeslano",
  "email.failed": "Chyba",
  "email.skipped": "Preskoceno",
  "warning.sent": "Varovani odeslano",
  "warning.failed": "Varovani selhalo",
  "report.sent": "Report odeslan",
  "report.failed": "Report selhal",
  "retention.purged": "Retence",
  "migration.applied": "Migrace",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** "22. 8. 2026 07:00" — Europe/Prague vždy (R9). */
function formatEventTime(date: Date): string {
  const day = date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
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

function formatMeetingDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

/**
 * Pruh 3 „Události" (arch iter-027 T-001, sekce 7.2, 7.4). Tahle tabulka je
 * to, co case Kateřiny Černé ukazuje krok za krokem: vyfiltrováno na
 * člena, nejnovější nahoře, s Resend stavem doplněným klientsky
 * (`<DeliveryStatusCell/>`) po namountování — stránka samotná se renderuje
 * jen z databáze (D5).
 */
export function EventTable({ events, hasActiveFilter, prevHref, nextHref }: EventTableProps) {
  if (events.length === 0) {
    return (
      <Card>
        <EmptyState
          title={hasActiveFilter ? "Zadne udalosti pro tento filtr" : "Zatim zadne udalosti"}
          description="Log zacina dnem nasazeni. Starsi behy se zpetne nedopocitavaji."
        />
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-text-muted mb-3">Udalosti</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary text-left">
              <th className="px-3 py-2 font-semibold">Kdy</th>
              <th className="px-3 py-2 font-semibold">Druh</th>
              <th className="px-3 py-2 font-semibold">Clen</th>
              <th className="px-3 py-2 font-semibold">Schuzka</th>
              <th className="px-3 py-2 font-semibold">Adresa</th>
              <th className="px-3 py-2 font-semibold">Zprava</th>
              <th className="px-3 py-2 font-semibold">Stav u poskytovatele</th>
              <th className="px-3 py-2 font-semibold" aria-label="Beh"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, idx) => (
              <tr
                key={event.id}
                className={`border-b border-border align-top ${idx % 2 === 1 ? "bg-background" : ""}`}
              >
                <td className="px-3 py-2 whitespace-nowrap text-text-muted">
                  {formatEventTime(event.occurredAt)}
                </td>
                <td className="px-3 py-2">
                  <Badge variant={SEVERITY_BADGE[event.severity] ?? "neutral"}>
                    {kindLabel(event.kind)}
                  </Badge>
                </td>
                <td className="px-3 py-2">{event.memberName ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {event.meetingDate ? formatMeetingDate(event.meetingDate) : "—"}
                </td>
                <td className="px-3 py-2">{event.email ?? "—"}</td>
                <td className="px-3 py-2 max-w-xs">{event.message}</td>
                <td className="px-3 py-2">
                  <DeliveryStatusCell
                    eventId={event.id}
                    resendEmailId={event.resendEmailId}
                    initialDeliveryStatus={event.deliveryStatus}
                    initialDeliveryCheckedAt={event.deliveryCheckedAt?.toISOString() ?? null}
                  />
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/status/${event.runId}`}
                    className="text-primary text-xs underline focus:outline-none focus:shadow-focus"
                  >
                    beh →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(prevHref || nextHref) && (
        <div className="flex items-center justify-between mt-4 text-sm">
          {prevHref ? (
            <Link href={prevHref} className="text-primary underline">
              ← Novejsi
            </Link>
          ) : (
            <span />
          )}
          {nextHref ? (
            <Link href={nextHref} className="text-primary underline">
              Starsi →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </Card>
  );
}
