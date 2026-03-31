import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { getCategories } from "@/lib/db/queries/categories";
import {
  getArchivedMeetings,
  getGuestsForMeetings,
  getGuestsForDateRange,
} from "@/lib/db/queries/archive";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ArchiveFilters } from "@/components/archive/ArchiveFilters";
import { ArchiveGuestCard } from "@/components/archive/ArchiveGuestCard";

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    meeting?: string | string[];
    category?: string;
  }>;
}) {
  // Auth check
  await getSession();

  const params = await searchParams;

  const dateFrom = params.from ?? "";
  const dateTo = params.to ?? "";
  const meetingParam = params.meeting;
  const selectedMeetings = Array.isArray(meetingParam)
    ? meetingParam
    : meetingParam
      ? [meetingParam]
      : [];
  const categoryFilter = params.category ?? "";

  // Load filter options
  const [archivedMeetings, categories] = await Promise.all([
    getArchivedMeetings(),
    getCategories(),
  ]);

  // Determine which query to run based on active filters
  const hasDateFilter = dateFrom && dateTo;
  const hasMeetingFilter = selectedMeetings.length > 0;
  const hasAnyFilter = hasDateFilter || hasMeetingFilter;

  let guests: Awaited<ReturnType<typeof getGuestsForMeetings>> = [];

  if (hasDateFilter) {
    const result = await getGuestsForDateRange(
      dateFrom,
      dateTo,
      categoryFilter || undefined
    );
    guests = result.guests;
  } else if (hasMeetingFilter) {
    guests = await getGuestsForMeetings(
      selectedMeetings,
      categoryFilter || undefined
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Archiv hostu</h1>

      {/* Filters */}
      <Card>
        <Suspense fallback={<div className="text-text-muted">Nacitani...</div>}>
          <ArchiveFilters
            meetings={archivedMeetings}
            categories={categories}
          />
        </Suspense>
      </Card>

      {/* Results */}
      {hasAnyFilter ? (
        guests.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Nalezeno {guests.length}{" "}
              {guests.length === 1
                ? "host"
                : guests.length < 5
                  ? "hoste"
                  : "hostu"}
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {guests.map((g) => (
                <ArchiveGuestCard key={g.id} guest={g} />
              ))}
            </div>
          </div>
        ) : (
          <Card>
            <EmptyState
              title="Zadni hoste nenalezeni"
              description="Zadni hoste neodpovidaji zvolenym filtrum."
            />
          </Card>
        )
      ) : (
        <Card>
          <p className="text-text-muted">
            Zvolte casove obdobi nebo vyberte konkretni schuzky pro zobrazeni
            archivu hostu.
          </p>
        </Card>
      )}
    </div>
  );
}
