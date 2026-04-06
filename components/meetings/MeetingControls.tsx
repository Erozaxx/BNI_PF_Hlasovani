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

  async function handleStartVoting() {
    if (!confirm("Spustit hlasování pro všechny hosty?")) return;
    setLoading(true);
    setError("");
    try {
      const result = await openVotingAction(meetingId, guests.map((g) => g.guestId));
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", "Hlasování bylo spuštěno.");
        router.refresh();
      }
    } catch {
      setError("Nepodařilo se spustit hlasování.");
      showToast("error", "Nepodařilo se spustit hlasování.");
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

  return (
    <div className="flex flex-wrap gap-3 items-center">
      {status === "draft" && (
        <Button
          variant="primary"
          size="sm"
          onClick={handleStartVoting}
          loading={loading}
        >
          Spustit hlasování
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
