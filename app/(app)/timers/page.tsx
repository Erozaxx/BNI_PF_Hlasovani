import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { listTimers } from "@/lib/db/queries/timers";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { CreateTimerForm } from "./CreateTimerForm";
import { TimerCard } from "./TimerCard";

export default async function AdminTimersPage() {
  const session = await getSession();
  if (!session.managementRole) redirect("/dashboard");
  const timers = await listTimers();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-text-main">Casovace</h1>

      <Card>
        <h2 className="text-sm font-semibold text-text-muted mb-3">
          Novy casovac
        </h2>
        <CreateTimerForm />
      </Card>

      <section>
        <h2 className="text-lg font-semibold text-text-main mb-4">
          Casovace ({timers.length})
        </h2>
        {timers.length > 0 ? (
          <div className="space-y-3">
            {timers.map((t) => (
              <TimerCard key={t.id} timer={t} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              title="Zatim zadne casovace"
              description="Vytvorte prvni casovac pomoci formulare vyse."
            />
          </Card>
        )}
      </section>
    </div>
  );
}
