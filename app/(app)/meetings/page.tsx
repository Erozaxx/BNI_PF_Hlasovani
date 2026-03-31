import Link from "next/link";
import { getMeetings } from "@/lib/db/queries/meetings";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateMeetingForm } from "./CreateMeetingForm";

export default async function MeetingsPage() {
  const session = await getSession();
  const meetings = await getMeetings();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  const statusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="neutral">Draft</Badge>;
      case "voting":
        return <Badge variant="danger">Hlasovani aktivni</Badge>;
      case "closed":
        return <Badge variant="success">Uzavreno</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
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
        <div className="space-y-3">
          {meetings.map((m) => (
            <Link key={m.id} href={`/meetings/${m.id}`}>
              <Card variant="interactive" className="mb-3">
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
