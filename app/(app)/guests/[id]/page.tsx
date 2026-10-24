import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuestWithNotes } from "@/lib/db/queries/guests";
import { getCategories } from "@/lib/db/queries/categories";
import { getLastMeetingDateForGuest } from "@/lib/db/queries/meetings";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GuestCategoryChanger } from "./GuestCategoryChanger";
import { DeleteGuestButton } from "@/components/guests/DeleteGuestButton";
import { PromoteGuestButton } from "@/components/guests/PromoteGuestButton";
import { NoteList } from "@/components/notes/NoteList";
import { NoteForm } from "@/components/notes/NoteForm";
import { formatWeekdayFull } from "@/lib/attendance/rules";

export default async function GuestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const backUrl = resolvedSearchParams.from ?? "/guests";
  const guest = await getGuestWithNotes(id);

  if (!guest) {
    notFound();
  }

  const session = await requirePageSession();
  const [categories, lastMeetingDate] = await Promise.all([
    getCategories(),
    getLastMeetingDateForGuest(id),
  ]);
  const canManageGuests = can(session, "guests.manage");
  const canPromoteGuests = can(session, "guests.promote");
  const canDeleteGuests = can(session, "guests.delete");

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href={backUrl}>
        <Button variant="link" size="sm">
          &larr; Zpět
        </Button>
      </Link>

      {/* Guest header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">{guest.name}</h1>
          {guest.company && (
            <p className="text-base text-text-muted">{guest.company}</p>
          )}
          <Badge variant="category" className="mt-2">
            {guest.categoryName ?? "Bez kategorie"}
          </Badge>
          {guest.email && (
            <p className="text-sm text-text-muted mt-1">
              <a href={`mailto:${guest.email}`} className="hover:underline">
                {guest.email}
              </a>
            </p>
          )}
          {lastMeetingDate && (
            <p className="text-sm text-text-muted mt-1">
              Naposledy na schůzce: {formatWeekdayFull(lastMeetingDate)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {canPromoteGuests && (
            <PromoteGuestButton
              guestId={guest.id}
              guestName={guest.name}
              hasEmail={!!guest.email}
              redirectTo="/guests"
            />
          )}
          {canDeleteGuests && (
            <DeleteGuestButton guestId={guest.id} guestName={guest.name} />
          )}
        </div>
      </div>

      {/* Description */}
      {guest.description && (
        <Card>
          <h2 className="text-sm font-semibold text-text-muted mb-2">Popis</h2>
          <p className="text-text-main">{guest.description}</p>
        </Card>
      )}

      {/* Category changer - management only */}
      {canManageGuests && (
        <Card>
          <h2 className="text-sm font-semibold text-text-muted mb-3">
            Změna kategorie
          </h2>
          <GuestCategoryChanger
            guestId={guest.id}
            currentCategoryId={guest.categoryId ?? ""}
            categories={categories}
          />
        </Card>
      )}

      {/* Notes */}
      <Card>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Poznámky
        </h2>
        <NoteForm guestId={guest.id} />
        <div className="mt-4">
          <NoteList notes={guest.notes} />
        </div>
      </Card>

      {/* Metadata */}
      <p className="text-xs text-text-muted">
        Přidáno:{" "}
        {new Date(guest.createdAt).toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
