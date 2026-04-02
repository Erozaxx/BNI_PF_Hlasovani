import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import {
  getEventById,
  getEventOptions,
  getEventParticipants,
} from "@/lib/db/queries/events";
import { Button } from "@/components/ui/Button";
import { EventDetail } from "./_components/EventDetail";
import { EventOptionsManager } from "./_components/EventOptionsManager";
import { ParticipantsManager } from "./_components/ParticipantsManager";
import { AddParticipantForm } from "./_components/AddParticipantForm";
import { EventReport } from "./_components/EventReport";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;

  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  const isAdmin = session.managementRole === "admin";

  if (!isManagement) {
    redirect("/dashboard");
  }

  const [ev, options, participants] = await Promise.all([
    getEventById(eventId),
    getEventOptions(eventId),
    getEventParticipants(eventId),
  ]);

  if (!ev) {
    notFound();
  }

  const canEdit = ev.status === "draft" || ev.status === "active";
  const showReport = ev.status === "closed" || ev.status === "done";

  return (
    <div className="space-y-6 max-w-4xl">
      <Link href="/events">
        <Button variant="link" size="sm">
          &larr; Zpet na akce
        </Button>
      </Link>

      <EventDetail event={ev} isAdmin={isAdmin} />

      <EventOptionsManager
        event={ev}
        options={options}
        canEdit={canEdit}
      />

      {canEdit && (
        <AddParticipantForm eventId={eventId} />
      )}

      <ParticipantsManager
        event={ev}
        participants={participants}
        canEdit={canEdit}
      />

      {showReport && (
        <EventReport event={ev} options={options} participants={participants} />
      )}
    </div>
  );
}
