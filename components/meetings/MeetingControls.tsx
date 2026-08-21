"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { closeVotingAction } from "@/actions/meetings";

interface MeetingControlsProps {
  meetingId: string;
  status: string;
}

export function MeetingControls({ meetingId, status }: MeetingControlsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  if (status !== "voting") {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <Button
        variant="danger"
        size="sm"
        onClick={handleCloseVoting}
        loading={loading}
      >
        Uzavrit hlasovani
      </Button>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
