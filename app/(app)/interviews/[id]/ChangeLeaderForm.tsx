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
  /** Leader change is guarded to status='open' (arch 8b) - render read-only otherwise. */
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
        Vedoucího jde změnit jen u otevřeného pohovoru.
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
      setError("Vyber vedoucího.");
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
        showToast("success", "Vedoucí pohovoru je změněný.");
        router.refresh();
      }
    } catch {
      setError("Vedoucího se nepodařilo změnit.");
      showToast("error", "Vedoucího se nepodařilo změnit.");
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
          placeholder="Vyber vedoucího…"
          error={error}
        />
        {selectedLeader && !selectedLeader.email && (
          <p className="text-xs text-warning mt-1">
            Tenhle člen nemá e-mail. Odkaz na vyplnění půjde poslat až po doplnění e-mailu.
          </p>
        )}
      </div>
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        className="min-h-[44px]"
        loading={loading}
        disabled={unchanged}
      >
        Změnit vedoucího
      </Button>
    </form>
  );
}
