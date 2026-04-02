"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { addParticipantAction } from "@/actions/events";

interface AddParticipantFormProps {
  eventId: string;
}

export function AddParticipantForm({ eventId }: AddParticipantFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const result = await addParticipantAction(
        eventId,
        name,
        email || undefined
      );
      if (!result.success) {
        setError(result.error);
      } else {
        setName("");
        setEmail("");
        setSuccessMsg("Ucastnik pridan." + (email ? " Pozvanka odeslana." : ""));
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-text-muted mb-3">
        Pridat externiho ucastnika
      </h2>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              label="Jmeno *"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jan Novak"
              required
              disabled={isPending}
            />
          </div>
          <div className="flex-1">
            <Input
              label="Email (volitelny)"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jan@example.com"
              disabled={isPending}
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        )}
        {successMsg && (
          <p className="text-sm text-success" role="status">
            {successMsg}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={isPending}
          disabled={!name.trim()}
        >
          Pridat ucastnika
        </Button>
      </form>
    </Card>
  );
}
