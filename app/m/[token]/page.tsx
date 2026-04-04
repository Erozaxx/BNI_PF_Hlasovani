import { MeetingExpired } from "./_components/MeetingExpired";
import { GuestCardMeeting } from "./_components/GuestCardMeeting";
import { Badge } from "@/components/ui/Badge";

interface NoteShape {
  id: string;
  text: string;
  createdAt: string | Date;
}

interface MyVoteShape {
  value: string;
  reason: string | null;
}

interface GuestShape {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  description: string | null;
  categoryName: string | null;
  votingEnabled: boolean;
  notes: NoteShape[];
  myVote: MyVoteShape | null;
}

interface MeetingData {
  phase: "active" | "voting" | "closed";
  meetingDate: string;
  location: string | null;
  memberName: string | null;
  guests: GuestShape[];
}

async function fetchMeetingData(
  token: string
): Promise<MeetingData | null | "expired"> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/m/${token}/meeting`, {
      cache: "no-store",
    });
  } catch {
    return null;
  }

  if (res.status === 401) {
    return "expired";
  }

  if (!res.ok) {
    return null;
  }

  try {
    return (await res.json()) as MeetingData;
  } catch {
    return null;
  }
}

const phaseLabel: Record<string, string> = {
  active: "Aktivni",
  voting: "Hlasovani probiha",
  closed: "Uzavreno",
};

const phaseBadgeVariant: Record<
  string,
  "success" | "danger" | "neutral" | "info"
> = {
  active: "info",
  voting: "danger",
  closed: "success",
};

export default async function MemberMeetingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await fetchMeetingData(token);

  if (data === "expired" || data === null) {
    return <MeetingExpired />;
  }

  const { phase, meetingDate, location, memberName, guests } = data;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-text-main">
              Schuzka {meetingDate}
            </h1>
            <Badge variant={phaseBadgeVariant[phase] ?? "neutral"}>
              {phaseLabel[phase] ?? phase}
            </Badge>
          </div>
          {location && (
            <p className="text-sm text-text-muted">Misto: {location}</p>
          )}
          {memberName && (
            <p className="text-sm text-text-muted">
              Prihlaseny clen: {memberName}
            </p>
          )}
        </div>

        {/* Phase info banner */}
        {phase === "voting" && (
          <div className="bg-danger-light border border-danger rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-danger">
              Hlasovani je spusteno. Odevzdejte svuj hlas ke kazdemu hostu.
            </p>
          </div>
        )}
        {phase === "closed" && (
          <div className="bg-success-light border border-success rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-success">
              Hlasovani bylo uzavreno. Nize vidite vysledky vasich hlasu.
            </p>
          </div>
        )}

        {/* Guests */}
        <section>
          <h2 className="text-lg font-semibold text-text-main mb-4">
            Hoste ({guests.length})
          </h2>
          {guests.length === 0 ? (
            <p className="text-sm text-text-muted">
              Ke schuzce nejsou prirazeni zadni hoste.
            </p>
          ) : (
            <div className="space-y-4">
              {guests.map((g) => (
                <GuestCardMeeting
                  key={g.id}
                  token={token}
                  guestId={g.id}
                  name={g.name}
                  company={g.company}
                  email={g.email}
                  description={g.description}
                  categoryName={g.categoryName}
                  votingEnabled={g.votingEnabled}
                  notes={g.notes}
                  myVote={g.myVote}
                  phase={phase}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
