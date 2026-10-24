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
    if (!confirm("Uzavřít hlasování? Vrátit to nepůjde.")) {
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
        showToast("success", "Hlasování je uzavřené.");
        router.refresh();
      }
    } catch {
      setError("Hlasování se nepodařilo uzavřít.");
      showToast("error", "Hlasování se nepodařilo uzavřít.");
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
        className="min-h-[44px]"
      >
        Uzavřít hlasování
      </Button>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
