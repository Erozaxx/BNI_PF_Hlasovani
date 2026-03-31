"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { openVotingAction, closeVotingAction } from "@/actions/meetings";

interface Guest {
  guestId: string;
  guestName: string;
}

interface MeetingControlsProps {
  meetingId: string;
  status: string;
  guests: Guest[];
}

export function MeetingControls({ meetingId, status, guests }: MeetingControlsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<"idle" | "select-guests">("idle");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    guests.map((g) => g.guestId)
  );

  function handleToggleGuest(guestId: string) {
    setSelectedIds((prev) =>
      prev.includes(guestId)
        ? prev.filter((id) => id !== guestId)
        : [...prev, guestId]
    );
  }

  async function handleConfirmVoting() {
    if (selectedIds.length === 0) return;
    setLoading(true);
    setError("");
    try {
      const result = await openVotingAction(meetingId, selectedIds);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", "Hlasovani bylo spusteno.");
        setStep("idle");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se spustit hlasovani.");
      showToast("error", "Nepodarilo se spustit hlasovani.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCloseVoting() {
    if (!confirm("Opravdu chcete uzavrit hlasovani? Tuto akci nelze vratit.")) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await closeVotingAction(meetingId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", "Hlasovani bylo uzavreno.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se uzavrit hlasovani.");
      showToast("error", "Nepodarilo se uzavrit hlasovani.");
    } finally {
      setLoading(false);
    }
  }

  if (status === "draft" && step === "select-guests") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold text-text-main">
          Vyberte hosty pro hlasovani
        </p>
        <div className="flex flex-col gap-2">
          {guests.map((g) => (
            <label key={g.guestId} className="flex items-center gap-2 text-sm text-text-main cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.includes(g.guestId)}
                onChange={() => handleToggleGuest(g.guestId)}
                className="accent-primary"
              />
              {g.guestName}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Button
            variant="primary"
            size="sm"
            onClick={handleConfirmVoting}
            loading={loading}
            disabled={selectedIds.length === 0}
          >
            {selectedIds.length === 0 ? "Vyberte alespon jednoho hosta" : "Potvrdit a spustit"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setStep("idle")}
            disabled={loading}
          >
            Zrusit
          </Button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {status === "draft" && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => setStep("select-guests")}
          loading={loading}
        >
          Spustit hlasovani
        </Button>
      )}

      {status === "voting" && (
        <Button
          variant="danger"
          size="sm"
          onClick={handleCloseVoting}
          loading={loading}
        >
          Uzavrit hlasovani
        </Button>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
