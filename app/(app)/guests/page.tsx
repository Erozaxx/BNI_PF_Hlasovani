import Link from "next/link";
import { getGuests } from "@/lib/db/queries/guests";
import { getCategories } from "@/lib/db/queries/categories";
import { getSession } from "@/lib/auth/session";
import {
  getActiveVotingMeeting,
  getUserVotesForMeeting,
} from "@/lib/db/queries/votes";
import {
  getGuestIdsForMeeting,
  getLastMeetingDatesForGuests,
} from "@/lib/db/queries/meetings";
import { GuestCard } from "@/components/guests/GuestCard";
import { GuestCardInteractive } from "@/components/guests/GuestCardInteractive";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const categoryFilter = params.category;
  const guests = await getGuests(categoryFilter);
  const categories = await getCategories();

  const activeMeeting = await getActiveVotingMeeting();
  const guestIds = guests.map((g) => g.id);

  const [votedGuestIds, activeMeetingGuestIds, lastMeetingDates] = await Promise.all([
    activeMeeting && session.memberId
      ? getUserVotesForMeeting(session.memberId, activeMeeting.id)
      : Promise.resolve(new Set<string>()),
    activeMeeting
      ? getGuestIdsForMeeting(activeMeeting.id)
      : Promise.resolve(new Set<string>()),
    guestIds.length > 0
      ? getLastMeetingDatesForGuests(guestIds)
      : Promise.resolve(new Map<string, string>()),
  ]);

  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-main">Hoste</h1>
        {isManagement && (
          <Link href="/guests/new">
            <Button variant="primary" size="sm">
              + Pridat hosta
            </Button>
          </Link>
        )}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <Link href="/guests">
          <Badge variant={!categoryFilter ? "danger" : "neutral"}>Vse</Badge>
        </Link>
        {categories.map((cat) => (
          <Link key={cat.id} href={`/guests?category=${cat.id}`}>
            <Badge
              variant={categoryFilter === cat.id ? "category" : "neutral"}
            >
              {cat.name}
            </Badge>
          </Link>
        ))}
      </div>

      {/* Guest list */}
      {guests.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guests.map((g) => {
            const inActiveMeeting = activeMeeting && activeMeetingGuestIds.has(g.id);
            const lastMeetingDate = lastMeetingDates.get(g.id) ?? null;
            return inActiveMeeting ? (
              <GuestCardInteractive
                key={g.id}
                guest={{ ...g, lastMeetingDate }}
                votingMeetingId={activeMeeting.id}
                alreadyVoted={votedGuestIds.has(g.id)}
              />
            ) : (
              <Link key={g.id} href={`/guests/${g.id}`}>
                <GuestCard
                  name={g.name}
                  description={g.description}
                  categoryName={g.categoryName}
                  lastMeetingDate={lastMeetingDate}
                  interactive
                />
              </Link>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Zadni hoste nenalezeni"
            description="Zkuste zmenit filtr kategorie nebo pridejte noveho hosta."
          />
        </Card>
      )}
    </div>
  );
}
