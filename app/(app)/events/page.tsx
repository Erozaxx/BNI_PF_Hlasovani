import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getEvents } from "@/lib/db/queries/events";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

type EventStatus = "draft" | "active" | "closed" | "done";

const STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Priprava",
  active: "Aktivni",
  closed: "Uzavrena",
  done: "Konana",
};

const STATUS_TABS: Array<{ value: EventStatus | "all"; label: string }> = [
  { value: "all", label: "Vse" },
  { value: "draft", label: "Priprava" },
  { value: "active", label: "Aktivni" },
  { value: "closed", label: "Uzavrena" },
  { value: "done", label: "Konana" },
];

function eventStatusBadge(status: string) {
  switch (status) {
    case "draft":
      return <Badge variant="neutral">{STATUS_LABELS.draft}</Badge>;
    case "active":
      return <Badge variant="danger">{STATUS_LABELS.active}</Badge>;
    case "closed":
      return <Badge variant="warning">{STATUS_LABELS.closed}</Badge>;
    case "done":
      return <Badge variant="success">{STATUS_LABELS.done}</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  if (!isManagement) {
    redirect("/dashboard");
  }

  const { filter: filterParam } = await searchParams;
  const validStatuses: EventStatus[] = ["draft", "active", "closed", "done"];
  const filter =
    filterParam && validStatuses.includes(filterParam as EventStatus)
      ? (filterParam as EventStatus)
      : undefined;

  const events = await getEvents(filter);

  const activeTab = filter ?? "all";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-main">Akce</h1>
        <Link href="/events/new">
          <Button variant="primary" size="sm">
            + Nova akce
          </Button>
        </Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((tab) => {
          const href =
            tab.value === "all" ? "/events" : `/events?filter=${tab.value}`;
          const isActive = activeTab === tab.value;
          return (
            <Link key={tab.value} href={href}>
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  isActive
                    ? "bg-primary text-white border-primary"
                    : "bg-surface text-text-muted border-border hover:bg-background"
                }`}
              >
                {tab.label}
              </button>
            </Link>
          );
        })}
      </div>

      {events.length > 0 ? (
        <div className="space-y-4">
          {events.map((ev) => (
            <Link key={ev.id} href={`/events/${ev.id}`}>
              <Card variant="interactive">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="font-medium text-text-main">{ev.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {eventStatusBadge(ev.status)}
                      <span className="text-xs text-text-muted">
                        {ev.participantCount}{" "}
                        {ev.participantCount === 1 ? "ucastnik" : "ucastniku"}
                      </span>
                      {ev.selectedOptionId && ev.selectedOptionLabel && (
                        <span className="text-xs text-success font-medium">
                          ✓ {ev.selectedOptionLabel}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button variant="link" size="sm">
                    Detail &rarr;
                  </Button>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Zadne akce"
            description={
              filter
                ? `Zadne akce ve stavu „${STATUS_LABELS[filter]}". Zkuste jiny filtr nebo vytvorte novou akci.`
                : "Zatim zadne akce. Vytvorte prvni akci."
            }
          />
        </Card>
      )}
    </div>
  );
}
