export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getEventsByRunId } from "@/lib/db/queries/ops-events";
import { deriveRunStatus } from "@/lib/ops/run-status";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeliveryStatusCell } from "../DeliveryStatusCell";
import { kindLabel } from "../EventTable";

const STATE_BADGE: Record<string, BadgeVariant> = {
  ok: "success",
  partial: "warning",
  failed: "danger",
  running: "info",
  stalled: "warning",
  unknown: "neutral",
};

const SEVERITY_BADGE: Record<string, BadgeVariant> = {
  info: "neutral",
  warn: "warning",
  error: "danger",
};

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

/**
 * Detail běhu `/status/[runId]` (arch iter-027 T-001, sekce 7.2, 7.4 krok
 * 5). Časová osa `ORDER BY occurred_at, seq` (přesně to, co `getEventsByRunId`
 * z T-005 vrací) plus `resend_email_id` / `resend_message_id` k okopírování
 * — to je to, s čím moderátor jde za IT příjemce.
 *
 * Stejná role-kontrola jako `/status` (page-level, ne middleware) — tahle
 * stránka je za `/status/...`, ne za `/admin`, takže moderátor sem musí.
 */
export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  if (!isManagement) {
    redirect("/dashboard");
  }

  const { runId } = await params;

  let migrationMissing = false;
  let loadError = false;
  let events: Awaited<ReturnType<typeof getEventsByRunId>> = [];

  try {
    events = await getEventsByRunId(runId);
  } catch (err) {
    const code = (err as { code?: string } | null | undefined)?.code;
    if (code === "42P01") {
      migrationMissing = true;
    } else {
      console.error("[status-run-detail] nepodarilo se nacist beh:", err);
      loadError = true;
    }
  }

  const status = events.length > 0 ? deriveRunStatus(events, new Date()) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-text-main">Detail behu</h1>
        <Link href="/status" className="text-sm text-primary underline">
          ← Zpet na Provoz
        </Link>
      </div>

      {migrationMissing && (
        <Card>
          <EmptyState
            title="Migrace jeste neprobehla"
            description="Tabulka ops_event jeste neexistuje. Spustte migraci iter-027."
          />
        </Card>
      )}

      {loadError && (
        <Card>
          <EmptyState
            title="Data se nepodarilo nacist"
            description="Zkuste stranku znovu nacist za chvili."
          />
        </Card>
      )}

      {!migrationMissing && !loadError && events.length === 0 && (
        <Card>
          <EmptyState
            title="Beh nenalezen"
            description="Pro tenhle run_id neni v logu zadny zaznam."
          />
        </Card>
      )}

      {!migrationMissing && !loadError && events.length > 0 && status && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={STATE_BADGE[status.state] ?? "neutral"}>{status.label}</Badge>
              <code className="text-xs text-text-muted">{runId}</code>
            </div>
          </Card>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-primary text-left">
                    <th className="px-3 py-2 font-semibold">Kdy</th>
                    <th className="px-3 py-2 font-semibold">Druh</th>
                    <th className="px-3 py-2 font-semibold">Clen</th>
                    <th className="px-3 py-2 font-semibold">Zprava</th>
                    <th className="px-3 py-2 font-semibold">Stav u poskytovatele</th>
                    <th className="px-3 py-2 font-semibold">Resend</th>
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
                      <td className="px-3 py-2 max-w-sm">
                        {event.message}
                        {event.detail != null && (
                          <pre className="mt-1 text-xs text-text-muted whitespace-pre-wrap break-all">
                            {JSON.stringify(event.detail)}
                          </pre>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <DeliveryStatusCell
                          eventId={event.id}
                          resendEmailId={event.resendEmailId}
                          initialDeliveryStatus={event.deliveryStatus}
                          initialDeliveryCheckedAt={event.deliveryCheckedAt?.toISOString() ?? null}
                        />
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {event.resendEmailId ? (
                          <div className="space-y-1">
                            <div>
                              <span className="text-text-muted">id: </span>
                              <code className="break-all">{event.resendEmailId}</code>
                            </div>
                            {event.resendMessageId && (
                              <div>
                                <span className="text-text-muted">message-id: </span>
                                <code className="break-all">{event.resendMessageId}</code>
                              </div>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
