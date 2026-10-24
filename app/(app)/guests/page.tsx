import Link from "next/link";
import { getGuests } from "@/lib/db/queries/guests";
import { getCategoriesWithGuests } from "@/lib/db/queries/categories";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { getLastMeetingDatesForGuests } from "@/lib/db/queries/meetings";
import { GuestCard } from "@/components/guests/GuestCard";
import { PromoteGuestButton } from "@/components/guests/PromoteGuestButton";
import { CategoryFilter } from "@/components/guests/CategoryFilter";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const session = await requirePageSession();
  const categoryFilter = params.category;
  const guests = await getGuests(categoryFilter);
  const categories = await getCategoriesWithGuests();

  const guestIds = guests.map((g) => g.id);
  const lastMeetingDates = guestIds.length > 0
    ? await getLastMeetingDatesForGuests(guestIds)
    : new Map<string, string>();

  const canManageGuests = can(session, "guests.manage");
  const canPromoteGuests = can(session, "guests.promote");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-main">Hosté</h1>
        {canManageGuests && (
          <Link href="/guests/new">
            <Button variant="primary" size="sm">
              + Přidat hosta
            </Button>
          </Link>
        )}
      </div>

      {/* Category filter */}
      <CategoryFilter categories={categories} currentCategoryId={categoryFilter} />

      {/* Guest list */}
      {guests.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guests.map((g) => {
            const lastMeetingDate = lastMeetingDates.get(g.id) ?? null;
            return (
              <div key={g.id} className="flex flex-col gap-2">
                <Link href={`/guests/${g.id}`}>
                  <GuestCard
                    name={g.name}
                    company={g.company}
                    email={g.email}
                    description={g.description}
                    categoryName={g.categoryName}
                    lastMeetingDate={lastMeetingDate}
                    interactive
                  />
                </Link>
                {canPromoteGuests && (
                  <PromoteGuestButton
                    guestId={g.id}
                    guestName={g.name}
                    hasEmail={!!g.email}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Žádní hosté nenalezeni"
            description="Zkus změnit filtr kategorie, nebo přidej nového hosta."
          />
        </Card>
      )}
    </div>
  );
}
