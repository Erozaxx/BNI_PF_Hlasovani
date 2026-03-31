"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteMeetingAction } from "@/actions/meetings";

export function DeleteMeetingButton({
  meetingId,
  meetingDate,
}: {
  meetingId: string;
  meetingDate: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Opravdu smazat schuzku ${meetingDate}? Budou smazany i vsechny hlasy a prirazeni hoste.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteMeetingAction(meetingId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Schuzka ${meetingDate} byla smazana.`);
        router.push("/meetings");
      }
    } catch {
      showToast("error", "Nepodarilo se smazat schuzku.");
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
      Smazat schuzku
    </Button>
  );
}
