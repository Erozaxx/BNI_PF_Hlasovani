import Link from "next/link";
import { getMeetings } from "@/lib/db/queries/meetings";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateMeetingForm } from "./CreateMeetingForm";
import { statusLabel } from "@/lib/meetings/statusLabel";

export default async function MeetingsPage() {
  const session = await getSession();
  const meetings = await getMeetings();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

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
          {meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
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
          ))}
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
