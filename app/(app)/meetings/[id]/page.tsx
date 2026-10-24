import Link from "next/link";
import { notFound } from "next/navigation";
import { getMeetingWithGuests } from "@/lib/db/queries/meetings";
import { getGuests } from "@/lib/db/queries/guests";
import { getVotingResults } from "@/lib/db/queries/votes";
import { getActiveMembers } from "@/lib/db/queries/members";
import { getMeetingLinkRows } from "@/lib/db/queries/meeting-member-links";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { DEFAULT_CHAPTER_SETTINGS } from "@/lib/chapter/settings";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { MeetingControls } from "@/components/meetings/MeetingControls";
import { StartVotingPanel } from "@/components/meetings/StartVotingPanel";
import { ReportButton } from "@/components/meetings/ReportButton";
import { DeleteMeetingButton } from "@/components/meetings/DeleteMeetingButton";
import { AddGuestToMeetingForm } from "./AddGuestToMeetingForm";
import { ImportGuestsButton } from "./ImportGuestsButton";
import { ExportListButton } from "./ExportListButton";
import { SortableMeetingGuestList } from "./SortableMeetingGuestList";
import { MemberLinksManager } from "./MemberLinksManager";
import { statusLabel } from "@/lib/meetings/statusLabel";
import { SHEET_TEXTS } from "@/lib/attendance/sheet";
import { formatWeekdayFull } from "@/lib/attendance/rules";

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

  const session = await requirePageSession();
  const isManagement = can(session, "meetings.manage");
  const canDeleteMeeting = can(session, "meetings.delete");

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

  // Data pro StartVotingPanel (iter-026, arch 2.6/#4 a 8.3): "X z Y členů" a
  // disabled tlačítko u schůzky bez hostů. Obě hodnoty jsou levné SELECTy
  // (getMembers/getMeetingLinkRows už repo používá jinde), žádný nový dotaz
  // nad rámec toho, co na stránce běží i tak (MemberLinksManager
  // čte tutéž informaci přes GET /member-links).
  const hasGuests = meeting.guests.length > 0;
  let membersWithEmailCount = 0;
  let initialLinkEmailSentCount = 0;
  // iter-042 (BK3): konec hlasování v textu pod Spustit se počítá podle dne z nastavení.
  let regularWeekday = DEFAULT_CHAPTER_SETTINGS.meetingWeekday;
  if (isManagement) {
    const [allMembers, linkRows, chapterSettings] = await Promise.all([
      // iter-037 (T-003b, arch 5.3): "X z Y" počítá jen aktivní členy.
      getActiveMembers(),
      getMeetingLinkRows(id),
      getChapterSettings(),
    ]);
    regularWeekday = chapterSettings.meetingWeekday;
    membersWithEmailCount = allMembers.filter((m) => !!m.email).length;
    const sentByMember = new Map(
      linkRows.map((l) => [l.memberId, l.linkEmailSentAt !== null])
    );
    initialLinkEmailSentCount = allMembers.filter(
      (m) => !!m.email && sentByMember.get(m.id) === true
    ).length;
  }

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
        <Button variant="link" size="sm" className="min-h-[44px]">
          &larr; Zpět na schůzky
        </Button>
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-main">
            Schůzka {formatWeekdayFull(meeting.date)}
          </h1>
          <div className="mt-2">{statusBadge(meeting.status)}</div>
          {meeting.location && (
            <p className="text-sm text-text-muted mt-1">
              Místo: {meeting.location}
            </p>
          )}
          {can(session, "attendance.view_all") && (
            <Link
              href={`/dochazka/zapis?d=${meeting.date}`}
              className="mt-1 inline-flex min-h-[44px] items-center text-sm text-navy hover:underline focus:outline-none focus:shadow-focus"
            >
              {SHEET_TEXTS.meetingLink}
            </Link>
          )}
          {meeting.votingClosesAt && meeting.status === "voting" && (
            <p className="text-sm text-text-muted mt-1">
              Uzavírá se:{" "}
              {formatWeekdayFull(
                new Date(meeting.votingClosesAt).toLocaleDateString("sv-SE", {
                  timeZone: "Europe/Prague",
                })
              )}{" "}
              {new Date(meeting.votingClosesAt).toLocaleTimeString("cs-CZ", {
                timeZone: "Europe/Prague",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {isManagement && (
            <MeetingControls meetingId={id} status={meeting.status} />
          )}
          {isManagement && meeting.status === "closed" && (
            <ReportButton meetingId={id} />
          )}
          {isManagement && (
            <ExportListButton meetingId={id} />
          )}
          {canDeleteMeeting && (
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
                Přidat hosta
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
                  Hromadný import hostů
                </h2>
                <ImportGuestsButton meetingId={id} />
              </div>
            </>
          )}
          {availableGuests.length === 0 && (
            <>
              <h2 className="text-sm font-semibold text-text-muted mb-3">
                Hromadný import hostů
              </h2>
              <ImportGuestsButton meetingId={id} />
            </>
          )}
        </Card>
      )}

      {/* Guests list */}
      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Hosté ({meeting.guests.length})
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
              title="Žádní hosté"
              description="Ke schůzce nejsou přiřazení žádní hosté. Přidej je ve formuláři výše."
            />
          </Card>
        )}
      </section>

      {/* Spuštění hlasování + MemberLinksManager (management only), iter-026 */}
      {isManagement && (
        <section className="space-y-4">
          <StartVotingPanel
            meetingId={id}
            status={meeting.status}
            hasGuests={hasGuests}
            meetingDate={meeting.date}
            initialLinkEmailSentCount={initialLinkEmailSentCount}
            membersWithEmailCount={membersWithEmailCount}
            regularWeekday={regularWeekday}
          />
          {(meeting.status === "active" ||
            meeting.status === "voting" ||
            meeting.status === "closed") && (
            <MemberLinksManager meetingId={id} meetingDate={meeting.date} />
          )}
        </section>
      )}
    </div>
  );
}
