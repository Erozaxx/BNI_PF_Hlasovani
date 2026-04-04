import Link from "next/link";
import { getMeetings, getLastMeetingDatesForGuests } from "@/lib/db/queries/meetings";
import { getGuests } from "@/lib/db/queries/guests";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DashboardPage() {
  const session = await getSession();
  const meetings = await getMeetings();
  const guests = await getGuests();

  const recentGuests = guests.slice(0, 4);
  const recentGuestIds = recentGuests.map((g) => g.id);
  const lastMeetingDates = recentGuestIds.length > 0
    ? await getLastMeetingDatesForGuests(recentGuestIds)
    : new Map<string, string>();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  const upcomingMeeting = meetings.find(
    (m) => m.status === "draft" || m.status === "active" || m.status === "voting"
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-text-main">Dashboard</h1>

      {/* Meeting status */}
      {upcomingMeeting ? (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className="text-text-main font-medium">
                Schuzka: {upcomingMeeting.date}
              </p>
              <Badge variant="category" className="mt-1">
                {upcomingMeeting.status}
              </Badge>
            </div>
            <Link href={`/meetings/${upcomingMeeting.id}`}>
              <Button variant="secondary" size="sm">
                Zobrazit
              </Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {/* Quick actions for management */}
      {isManagement && (
        <div className="flex flex-wrap gap-3">
          <Link href="/guests/new">
            <Button variant="secondary" size="sm">
              + Novy host
            </Button>
          </Link>
          <Link href="/meetings">
            <Button variant="secondary" size="sm">
              Schuzky
            </Button>
          </Link>
        </div>
      )}

      {/* Recent guests */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text-main">
            Posledni hoste
          </h2>
          <Link href="/guests">
            <Button variant="link" size="sm">
              Zobrazit vse
            </Button>
          </Link>
        </div>

        {recentGuests.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentGuests.map((g) => (
              <Link key={g.id} href={`/guests/${g.id}`}>
                <Card variant="interactive">
                  <h3 className="font-medium text-text-main">{g.name}</h3>
                  <Badge variant="category" className="mt-2">
                    {g.categoryName ?? "[bez kategorie]"}
                  </Badge>
                  {lastMeetingDates.get(g.id) && (
                    <p className="text-xs text-text-muted mt-2">
                      Posl. schůzka: {lastMeetingDates.get(g.id)}
                    </p>
                  )}
                  {g.description && (
                    <p className="text-sm text-text-muted mt-2 line-clamp-2">
                      {g.description}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="Zatim zadni hoste"
              description="Hoste se zobrazi po jejich pridani do systemu."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
