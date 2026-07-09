"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { updateInterviewLeaderAction } from "@/actions/interviews";

interface MemberOption {
  id: string;
  name: string;
  email: string | null;
}

interface ChangeLeaderFormProps {
  interviewId: string;
  currentLeaderId: string | null;
  members: MemberOption[];
  /** Leader change is guarded to status='open' (arch 8b) — render read-only otherwise. */
  disabled: boolean;
}

export function ChangeLeaderForm({
  interviewId,
  currentLeaderId,
  members,
  disabled,
}: ChangeLeaderFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [leaderId, setLeaderId] = useState(currentLeaderId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (disabled) {
    return (
      <p className="text-sm text-text-muted">
        Vedouciho lze zmenit jen u otevreneho pohovoru.
      </p>
    );
  }

  const options = members.map((m) => ({
    value: m.id,
    label: m.email ? m.name : `${m.name} (bez emailu)`,
  }));

  const selectedLeader = members.find((m) => m.id === leaderId);
  const unchanged = leaderId === (currentLeaderId ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leaderId) {
      setError("Vyberte vedouciho.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await updateInterviewLeaderAction(interviewId, leaderId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", "Vedouci pohovoru byl zmenen.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se zmenit vedouciho.");
      showToast("error", "Nepodarilo se zmenit vedouciho.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 items-start sm:items-end"
    >
      <div className="flex-1 min-w-0">
        <Select
          name="leaderId"
          value={leaderId}
          onChange={(e) => setLeaderId(e.target.value)}
          options={options}
          placeholder="Vyberte vedouciho..."
          error={error}
        />
        {selectedLeader && !selectedLeader.email && (
          <p className="text-xs text-warning mt-1">
            Tento clen nema email — odkaz na vyplneni pujde poslat az po
            doplneni emailu.
          </p>
        )}
      </div>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        loading={loading}
        disabled={unchanged}
      >
        Zmenit vedouciho
      </Button>
    </form>
  );
}
