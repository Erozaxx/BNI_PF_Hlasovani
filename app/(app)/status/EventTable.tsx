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
 * Český popisek pro `kind` (3.3) - "Výsledek aplikace" ve sloupci Druh
 * (7.4 krok 3: "Odesláno" místo syrového `email.sent`). Sdílené i s
 * `[runId]/page.tsx` (detail běhu), aby obě místa ukazovala stejné slovo.
 * Neznámý/budoucí `kind` (R13) se ukáže doslovně, ne skryje.
 */
export const KIND_LABELS: Record<string, string> = {
  "cron.started": "Automatický běh zahájen",
  "cron.finished": "Automatický běh dokončen",
  "cron.failed": "Automatický běh selhal",
  "cron.phase-failed": "Krok automatického běhu selhal",
  "meeting.closed": "Schůzka uzavřena",
  "dispatch.started": "Zahájeno",
  "dispatch.guard-failed": "Pojistka",
  "dispatch.failed": "Chyba",
  "dispatch.finished": "Dokončeno",
  "email.sent": "Odesláno",
  "email.failed": "Chyba",
  "email.skipped": "Přeskočeno",
  "warning.sent": "Varování odesláno",
  "warning.failed": "Varování selhalo",
  "report.sent": "Report odeslán",
  "report.failed": "Report selhal",
  "retention.purged": "Úklid starých záznamů",
  "migration.applied": "Migrace",
  // iter-028 (T-006, arch 7)
  "reminder.sent": "Připomínka odeslána",
  "reminder.failed": "Připomínka selhala",
  "reminder.round": "Kolo připomínek",
  // iter-032 (K9, review F-04): změny přístupu z /admin/members a /login/heslo
  "access.role-changed": "Změna role",
  "access.password-reset": "Heslo zrušeno",
  "access.password-set": "Heslo nastaveno",
  "access.password-link-copied": "Odkaz ke zkopírování",
  "access.password-link-resent": "Odkaz poslán znovu",
  // iter-037 (gate sekce 5)
  "access.member-deactivated": "Deaktivace člena",
  "access.member-reactivated": "Návrat člena",
  "access.magic-link-revoked": "Zneplatnění odkazu",
  "access.functions-changed": "Změna funkcí",
  "access.email-changed": "Změna e-mailu vedení",
  // iter-038 (arch 14)
  "access.attendance-manager-changed": "Změna správce docházky",
  "attendance.history-edited": "Oprava docházky",
  "attendance.internal-created": "Interní schůzka založena",
  "attendance.internal-cancelled": "Interní schůzka zrušena",
  "attendance.link-sent": "Odkaz na docházku odeslán",
  "attendance.link-failed": "Odkaz na docházku neodešel",
  "attendance.link-skipped": "Odkaz na docházku přeskočen",
  "attendance.day-finalized": "Den docházky uzavřen",
  "attendance.report-sent": "Report docházky odeslán",
  "attendance.report-failed": "Report docházky neodešel",
  "attendance.report-skipped": "Report docházky přeskočen",
  // iter-033 (arch 10.1): zásobník Master mind
  "mastermind.scheduled": "Master mind: zařazeno",
  "mastermind.unscheduled": "Master mind: vráceno do zásobníku",
  "mastermind.presented": "Master mind: proběhlo",
  "mastermind.presented-undone": "Master mind: potvrzení vráceno",
  "mastermind.removed": "Master mind: případ odstraněn",
  // iter-035 (arch 10, Z6): Burza pomoci
  "burza.offer-by-management": "Burza: řádek zapsalo vedení",
  "burza.offer-removed": "Burza: řádek smazán vedením",
  "burza.help-removed": "Burza: záznam pomoci smazán",
  "burza.contact-by-management": "Burza: kontakt zapsalo vedení",
  "burza.contact-use-removed": "Burza: využití kontaktu smazáno",
  // iter-041 (arch 10): semafor
  "semafor.imported": "Semafor: import uložen",
  "semafor.month-deleted": "Semafor: měsíc smazán",
  "semafor.row-deleted": "Semafor: řádek smazán",
  "semafor.alias-removed": "Semafor: párování smazáno",
  // iter-042: nastavení chapteru
  "settings.changed": "Nastavení chapteru změněno",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind;
}

/** "22. 8. 2026 07:00" - Europe/Prague vždy (R9). */
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
 * (`<DeliveryStatusCell/>`) po namountování - stránka samotná se renderuje
 * jen z databáze (D5).
 */
export function EventTable({ events, hasActiveFilter, prevHref, nextHref }: EventTableProps) {
  if (events.length === 0) {
    return (
      <Card>
        <EmptyState
          title={hasActiveFilter ? "Žádné události pro tento filtr" : "Zatím žádné události"}
          description="Záznamy začínají dnem nasazení. Starší běhy se zpětně nedopočítávají."
        />
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-text-muted mb-3">Události</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary text-left">
              <th className="px-3 py-2 font-semibold">Kdy</th>
              <th className="px-3 py-2 font-semibold">Druh</th>
              <th className="px-3 py-2 font-semibold">Člen</th>
              <th className="px-3 py-2 font-semibold">Schůzka</th>
              <th className="px-3 py-2 font-semibold">Adresa</th>
              <th className="px-3 py-2 font-semibold">Zpráva</th>
              <th className="px-3 py-2 font-semibold">Stav u poskytovatele</th>
              <th className="px-3 py-2 font-semibold" aria-label="Běh"></th>
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
                <td className="px-3 py-2">{event.memberName ?? "–"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {event.meetingDate ? formatMeetingDate(event.meetingDate) : "–"}
                </td>
                <td className="px-3 py-2">{event.email ?? "–"}</td>
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
                    běh →
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
              ← Novější
            </Link>
          ) : (
            <span />
          )}
          {nextHref ? (
            <Link href={nextHref} className="text-primary underline">
              Starší →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </Card>
  );
}
