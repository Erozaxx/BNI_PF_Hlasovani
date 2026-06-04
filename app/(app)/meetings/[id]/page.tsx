import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeetingWithGuests } from "@/lib/db/queries/meetings";
import { getGuests } from "@/lib/db/queries/guests";
import { getVotingResults } from "@/lib/db/queries/votes";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MeetingControls } from "@/components/meetings/MeetingControls";
import { ReportButton } from "@/components/meetings/ReportButton";
import { DeleteMeetingButton } from "@/components/meetings/DeleteMeetingButton";
import { AddGuestToMeetingForm } from "./AddGuestToMeetingForm";
import { ImportGuestsButton } from "./ImportGuestsButton";
import { ExportListButton } from "./ExportListButton";
import { SortableMeetingGuestList } from "./SortableMeetingGuestList";
import { MeetingActivationControls } from "./MeetingActivationControls";
import { statusLabel } from "@/lib/meetings/statusLabel";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = await getMeetingWithGuests(id);

  if (!meeting) {
    notFound();
  }

  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  const isAdmin = session.managementRole === "admin";

  // Get all guests for the "add guest" dropdown
  const allGuests = isManagement && meeting.status === "draft"
    ? await getGuests()
    : [];

  const assignedGuestIds = new Set(meeting.guests.map((g) => g.guestId));
  const availableGuests = allGuests.filter((g) => !assignedGuestIds.has(g.id));

  // Load voting results for each guest
  // Admin/mod: see during voting and after closed
  // Member: see only after closed
  const showResults =
    meeting.status === "closed" ||
    (meeting.status === "voting" && isManagement);

  const guestResults = showResults
    ? await Promise.all(
        meeting.guests.map(async (g) => ({
          guestId: g.guestId,
          results: await getVotingResults(g.guestId, id),
        }))
      )
    : [];

  // Serialize results to a plain object so it can cross the server→client boundary.
  const resultsByGuest: Record<string, typeof guestResults[number]["results"]> =
    Object.fromEntries(guestResults.map((gr) => [gr.guestId, gr.results]));

  // Reorder allowed for management while the meeting is editable (draft/active).
  const guestsReorderable =
    isManagement &&
    (meeting.status === "draft" || meeting.status === "active");

  const statusBadge = (status: string) => {
    const label = statusLabel[status] ?? status;
    switch (status) {
      case "draft":
        return <Badge variant="neutral">{label}</Badge>;
      case "voting":
        return <Badge variant="danger">{label}</Badge>;
      case "closed":
        return <Badge variant="success">{label}</Badge>;
      default:
        return <Badge variant="neutral">{label}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/meetings">
        <Button variant="link" size="sm">
          &larr; Zpet na schuzky
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            Schuzka {meeting.date}
          </h1>
          <div className="mt-2">{statusBadge(meeting.status)}</div>
          {meeting.location && (
            <p className="text-sm text-text-muted mt-1">
              Misto: {meeting.location}
            </p>
          )}
          {meeting.votingClosesAt && meeting.status === "voting" && (
            <p className="text-sm text-text-muted mt-1">
              Uzavira se:{" "}
              {new Date(meeting.votingClosesAt).toLocaleDateString("cs-CZ", {
                weekday: "long",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isManagement && (
            <MeetingControls
              meetingId={id}
              status={meeting.status}
              guests={meeting.guests.map((g) => ({
                guestId: g.guestId,
                guestName: g.guestName,
              }))}
            />
          )}
          {isManagement && meeting.status === "closed" && (
            <ReportButton meetingId={id} />
          )}
          {isManagement && (
            <ExportListButton meetingId={id} />
          )}
          {isAdmin && (
            <DeleteMeetingButton meetingId={id} meetingDate={meeting.date} />
          )}
        </div>
      </div>

      {/* Add guest / import guests (draft only, management) */}
      {isManagement && meeting.status === "draft" && (
        <Card>
          {availableGuests.length > 0 && (
            <>
              <h2 className="text-sm font-semibold text-text-muted mb-3">
                Pridat hosta
              </h2>
              <AddGuestToMeetingForm
                meetingId={id}
                availableGuests={availableGuests.map((g) => ({
                  id: g.id,
                  name: g.name,
                  categoryName: g.categoryName,
                }))}
              />
              <div className="mt-4 border-t border-border pt-4">
                <h2 className="text-sm font-semibold text-text-muted mb-3">
                  Hromadny import hostu
                </h2>
                <ImportGuestsButton meetingId={id} />
              </div>
            </>
          )}
          {availableGuests.length === 0 && (
            <>
              <h2 className="text-sm font-semibold text-text-muted mb-3">
                Hromadny import hostu
              </h2>
              <ImportGuestsButton meetingId={id} />
            </>
          )}
        </Card>
      )}

      {/* Guests list */}
      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Hoste ({meeting.guests.length})
        </h2>
        {meeting.guests.length > 0 ? (
          <SortableMeetingGuestList
            meetingId={id}
            meetingStatus={meeting.status}
            guests={meeting.guests.map((g) => ({
              guestId: g.guestId,
              guestName: g.guestName,
              categoryName: g.categoryName ?? null,
            }))}
            resultsByGuest={resultsByGuest}
            reorderable={guestsReorderable}
          />
        ) : (
          <Card>
            <EmptyState
              title="Zadni hoste"
              description="Ke schuzce nejsou prirazeni zadni hoste. Pridejte je pomoci formulare vyse."
            />
          </Card>
        )}
      </section>

      {/* Activation controls + MemberLinksManager (management only) */}
      {isManagement && (
        <section>
          <MeetingActivationControls
            meetingId={id}
            meetingDate={meeting.date}
            status={meeting.status}
          />
        </section>
      )}
    </div>
  );
}
