"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteTimerAction } from "@/actions/timers";

interface DeleteTimerButtonProps {
  controlToken: string;
  timerName: string;
}

export function DeleteTimerButton({ controlToken, timerName }: DeleteTimerButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Opravdu chcete smazat casovac "${timerName}"? Tato akce je nevratna.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      await deleteTimerAction(controlToken);
      showToast("success", `Casovac "${timerName}" byl smazan.`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nepodarilo se smazat casovac.";
      showToast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      loading={loading}
      onClick={handleDelete}
    >
      Smazat
    </Button>
  );
}
