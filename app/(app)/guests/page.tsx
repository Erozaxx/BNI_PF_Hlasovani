import Link from "next/link";
import { getGuests } from "@/lib/db/queries/guests";
import { getCategoriesWithGuests } from "@/lib/db/queries/categories";
import { getSession } from "@/lib/auth/session";
import { getLastMeetingDatesForGuests } from "@/lib/db/queries/meetings";
import { GuestCard } from "@/components/guests/GuestCard";
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
  const session = await getSession();
  const categoryFilter = params.category;
  const guests = await getGuests(categoryFilter);
  const categories = await getCategoriesWithGuests();

  const guestIds = guests.map((g) => g.id);
  const lastMeetingDates = guestIds.length > 0
    ? await getLastMeetingDatesForGuests(guestIds)
    : new Map<string, string>();

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
      <CategoryFilter categories={categories} currentCategoryId={categoryFilter} />

      {/* Guest list */}
      {guests.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guests.map((g) => {
            const lastMeetingDate = lastMeetingDates.get(g.id) ?? null;
            return (
              <Link key={g.id} href={`/guests/${g.id}`}>
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
