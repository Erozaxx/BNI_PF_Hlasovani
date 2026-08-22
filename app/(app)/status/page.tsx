export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getMembers } from "@/lib/db/queries/members";
import { getMeetings } from "@/lib/db/queries/meetings";
import {
  getEventsByRunId,
  getRecentRunIds,
  listOpsEvents,
  type OpsEventFilter,
} from "@/lib/db/queries/ops-events";
import { deriveRunStatus } from "@/lib/ops/run-status";
import type { OpsEventSeverity } from "@/lib/ops/types";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusFilters } from "./StatusFilters";
import { RunList, type RunListItem } from "./RunList";
import { EventTable, type OpsEventDbRow } from "./EventTable";

const RUNS_LIMIT = 10;
const EVENTS_PAGE_SIZE = 50;
const DEFAULT_WINDOW_DAYS = 30;

function isSeverity(value: string | undefined): value is OpsEventSeverity {
  return value === "info" || value === "warn" || value === "error";
}

/** `<input type="date">` -> `Date` na hranici dne. Filtr je na den přesný,
 * ne na vteřinu — dost pro "za poslední 3 týdny", což je jediné použití. */
function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const parsed = new Date(`${value}${suffix}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/** "Schuzka 27. 8." (7.2 doslova). */
function formatMeetingLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `Schuzka ${d}. ${m}.`;
}

interface StatusPageSearchParams {
  member?: string;
  meeting?: string;
  severity?: string;
  from?: string;
  to?: string;
  page?: string;
}

/**
 * /status (arch iter-027 T-001, sekce 7). Admin i moderator — middleware jen
 * session-gatuje (LL-005 výjimka, viz brief scope OUT), role se kontroluje
 * TADY, stejný vzor jako app/(app)/interviews/page.tsx.
 *
 * Stránka se renderuje JEN z databáze (D5) — Resend se odtud nikdy nevolá,
 * to dělá až klientská <DeliveryStatusCell/> po namountování. Chybějící
 * tabulka ops_event (migrace ještě neproběhla, 11.5) se nesmí projevit
 * pádem stránky (7.3) — celý blok dotazů je proto v try/catch.
 */
export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<StatusPageSearchParams>;
}) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  if (!isManagement) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const severity = isSeverity(params.severity) ? params.severity : undefined;

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const from = parseDateParam(params.from) ?? defaultFrom;
  const to = parseDateParam(params.to, true);

  const eventsPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const eventsOffset = (eventsPage - 1) * EVENTS_PAGE_SIZE;

  const hasActiveFilter = !!(
    params.member ||
    params.meeting ||
    severity ||
    params.from ||
    params.to
  );

  let migrationMissing = false;
  let loadError = false;
  let members: { id: string; name: string }[] = [];
  let meetings: { id: string; date: string }[] = [];
  let runs: RunListItem[] = [];
  let events: OpsEventDbRow[] = [];
  let hasMoreEvents = false;

  try {
    const [memberRows, meetingRows] = await Promise.all([getMembers(), getMeetings()]);
    members = memberRows.map((m) => ({ id: m.id, name: m.name }));
    meetings = meetingRows.map((m) => ({ id: m.id, date: m.date }));
    const memberNameById = new Map(members.map((m) => [m.id, m.name]));

    const runSummaries = await getRecentRunIds(RUNS_LIMIT);
    runs = await Promise.all(
      runSummaries.map(async (summary): Promise<RunListItem> => {
        const runEvents = await getEventsByRunId(summary.runId);
        if (runEvents.length === 0) {
          return {
            runId: summary.runId,
            startedAt: summary.lastOccurredAt,
            actorLabel: "?",
            meetingLabel: "—",
            state: "unknown",
            label: "Bez zaznamu",
          };
        }
        const status = deriveRunStatus(runEvents, now);
        const meetingDate = runEvents.find((e) => e.meetingDate)?.meetingDate ?? null;
        const actor = runEvents[0].actor;
        const actorLabel =
          actor === "cron" ? "cron" : actor ? (memberNameById.get(actor) ?? "Rucne") : "Rucne";
        return {
          runId: summary.runId,
          startedAt: runEvents[0].occurredAt,
          actorLabel,
          meetingLabel: meetingDate ? formatMeetingLabel(meetingDate) : "—",
          state: status.state,
          label: status.label,
        };
      })
    );

    const filter: OpsEventFilter = {
      memberId: params.member || undefined,
      meetingId: params.meeting || undefined,
      severity,
      from,
      to,
    };
    // O jeden víc, než se ukáže (EVENTS_PAGE_SIZE + 1) — jednoduchý způsob,
    // jak poznat "existuje další stránka", bez druhého COUNT(*) dotazu.
    const fetched = await listOpsEvents(filter, EVENTS_PAGE_SIZE + 1, eventsOffset);
    hasMoreEvents = fetched.length > EVENTS_PAGE_SIZE;
    events = fetched.slice(0, EVENTS_PAGE_SIZE);
  } catch (err) {
    const code = (err as { code?: string } | null | undefined)?.code;
    if (code === "42P01") {
      // Tabulka ops_event ještě neexistuje (migrace neproběhla, 11.5) —
      // přesně ten stav, který stránka MUSÍ ustát bez pádu (7.3).
      migrationMissing = true;
    } else {
      console.error("[status-page] nepodarilo se nacist data:", err);
      loadError = true;
    }
  }

  function buildEventsHref(page: number): string {
    const qs = new URLSearchParams();
    if (params.member) qs.set("member", params.member);
    if (params.meeting) qs.set("meeting", params.meeting);
    if (severity) qs.set("severity", severity);
    if (params.from) qs.set("from", params.from);
    if (params.to) qs.set("to", params.to);
    if (page > 1) qs.set("page", String(page));
    const qsStr = qs.toString();
    return qsStr ? `/status?${qsStr}` : "/status";
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Provoz</h1>

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

      {!migrationMissing && !loadError && (
        <>
          <StatusFilters
            members={members}
            meetings={meetings}
            current={{
              member: params.member,
              meeting: params.meeting,
              severity: params.severity,
              from: params.from,
              to: params.to,
            }}
            hasActiveFilter={hasActiveFilter}
          />
          <RunList runs={runs} />
          <EventTable
            events={events}
            hasActiveFilter={hasActiveFilter}
            prevHref={eventsPage > 1 ? buildEventsHref(eventsPage - 1) : null}
            nextHref={hasMoreEvents ? buildEventsHref(eventsPage + 1) : null}
          />
        </>
      )}
    </div>
  );
}
