import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuestWithNotes } from "@/lib/db/queries/guests";
import { getCategories } from "@/lib/db/queries/categories";
import {
  getActiveVotingMeetingsForGuest,
  getVoteForGuestInMeeting,
} from "@/lib/db/queries/votes";
import { getLastMeetingDateForGuest } from "@/lib/db/queries/meetings";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { GuestCategoryChanger } from "./GuestCategoryChanger";
import { DeleteGuestButton } from "@/components/guests/DeleteGuestButton";
import { VoteForm } from "@/components/guests/VoteForm";
import { NoteList } from "@/components/notes/NoteList";
import { NoteForm } from "@/components/notes/NoteForm";

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

  const session = await getSession();
  const [categories, lastMeetingDate] = await Promise.all([
    getCategories(),
    getLastMeetingDateForGuest(id),
  ]);
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  const isAdmin = session.managementRole === "admin";

  // Get active voting meetings for this guest + user's existing vote
  const votingMeetings = session.memberId
    ? await getActiveVotingMeetingsForGuest(id)
    : [];

  const votingData = await Promise.all(
    votingMeetings.map(async (vm) => {
      const existingVote = session.memberId
        ? await getVoteForGuestInMeeting(session.memberId, id, vm.meetingId)
        : null;
      return { ...vm, existingVote };
    })
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href={backUrl}>
        <Button variant="link" size="sm">
          &larr; Zpet
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
            {guest.categoryName ?? "[bez kategorie]"}
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
              Naposledy na schůzce: {lastMeetingDate}
            </p>
          )}
        </div>
        {isAdmin && (
          <DeleteGuestButton guestId={guest.id} guestName={guest.name} />
        )}
      </div>

      {/* Description */}
      {guest.description && (
        <Card>
          <h2 className="text-sm font-semibold text-text-muted mb-2">Popis</h2>
          <p className="text-text-main">{guest.description}</p>
        </Card>
      )}

      {/* Category changer - management only */}
      {isManagement && (
        <Card>
          <h2 className="text-sm font-semibold text-text-muted mb-3">
            Zmena kategorie
          </h2>
          <GuestCategoryChanger
            guestId={guest.id}
            currentCategoryId={guest.categoryId ?? ""}
            categories={categories}
          />
        </Card>
      )}

      {/* Voting */}
      {votingData.length > 0 &&
        votingData.map((vm) => (
          <Card key={vm.meetingId}>
            <h2 className="text-lg font-semibold text-text-main mb-2">
              Hlasovani &mdash; schuzka {vm.meetingDate}
            </h2>
            <VoteForm
              guestId={id}
              meetingId={vm.meetingId}
              existingVote={vm.existingVote}
              votingOpen={true}
            />
          </Card>
        ))}

      {/* Notes */}
      <Card>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Poznamky
        </h2>
        <NoteForm guestId={guest.id} />
        <div className="mt-4">
          <NoteList notes={guest.notes} />
        </div>
      </Card>

      {/* Metadata */}
      <p className="text-xs text-text-muted">
        Pridano:{" "}
        {new Date(guest.createdAt).toLocaleDateString("cs-CZ", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
