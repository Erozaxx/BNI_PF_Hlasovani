import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { Card } from "@/components/ui/Card";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { EventForm } from "./_components/EventForm";

export default async function NewEventPage() {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  if (!isManagement) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <Link href="/events">
        <Button variant="link" size="sm">
          &larr; Zpet na akce
        </Button>
      </Link>

      <h1 className="text-2xl font-bold text-text-main">Nova akce</h1>

      <Card>
        <EventForm />
      </Card>
    </div>
  );
}
