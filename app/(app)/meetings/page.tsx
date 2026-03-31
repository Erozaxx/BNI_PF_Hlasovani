import Link from "next/link";
import { getMeetings, getMeetingWithGuests } from "@/lib/db/queries/meetings";
import { getUserVotesForMeeting } from "@/lib/db/queries/votes";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GuestCardInteractive } from "@/components/guests/GuestCardInteractive";
import { CreateMeetingForm } from "./CreateMeetingForm";
import { statusLabel } from "@/lib/meetings/statusLabel";

export default async function MeetingsPage() {
  const session = await getSession();
  const meetings = await getMeetings();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  // For voting meetings: load voting-enabled guests + user's votes
  const votingMeetings = meetings.filter((m) => m.status === "voting");
  const votingMeetingsData = await Promise.all(
    votingMeetings.map(async (m) => {
      const withGuests = await getMeetingWithGuests(m.id);
      const votedGuestIds =
        session.memberId && withGuests
          ? await getUserVotesForMeeting(session.memberId, m.id)
          : new Set<string>();
      return {
        meetingId: m.id,
        guests: (withGuests?.guests ?? []).filter((g) => g.votingEnabled),
        votedGuestIds,
      };
    })
  );
  const votingDataByMeeting = new Map(
    votingMeetingsData.map((d) => [d.meetingId, d])
  );

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-text-main">Schuzky</h1>
      </div>

      {isManagement && (
        <Card>
          <h2 className="text-sm font-semibold text-text-muted mb-3">
            Nova schuzka
          </h2>
          <CreateMeetingForm />
        </Card>
      )}

      {meetings.length > 0 ? (
        <div className="space-y-4">
          {meetings.map((m) => {
            const votingData = votingDataByMeeting.get(m.id);
            const hasVotingGuests = votingData && votingData.guests.length > 0;

            return (
              <div key={m.id} className="space-y-3">
                {/* Meeting header card */}
                <Link href={`/meetings/${m.id}`}>
                  <Card variant="interactive">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <p className="font-medium text-text-main">
                          Schuzka {m.date}
                        </p>
                        <div className="mt-1">{statusBadge(m.status)}</div>
                      </div>
                      <Button variant="link" size="sm">
                        Detail &rarr;
                      </Button>
                    </div>
                  </Card>
                </Link>

                {/* Quick voting cards for voting meetings */}
                {hasVotingGuests && session.memberId && (
                  <div className="pl-4 border-l-2 border-primary/30">
                    <p className="text-sm font-semibold text-text-muted mb-3">
                      Hlasovani ({votingData.guests.length}{" "}
                      {votingData.guests.length === 1 ? "host" : "hoste"})
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {votingData.guests.map((g) => (
                        <GuestCardInteractive
                          key={g.guestId}
                          guest={{
                            id: g.guestId,
                            name: g.guestName,
                            description: g.guestDescription,
                            categoryName: g.categoryName,
                          }}
                          votingMeetingId={m.id}
                          alreadyVoted={votingData.votedGuestIds.has(g.guestId)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Zatim zadne schuzky"
            description="Vytvorte prvni schuzku pomoci formulare vyse."
          />
        </Card>
      )}
    </div>
  );
}
