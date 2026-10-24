"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteMeetingAction } from "@/actions/meetings";
import { formatWeekdayFull } from "@/lib/attendance/rules";

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
      `Smazat schůzku ${formatWeekdayFull(meetingDate)}? Vrátit to nepůjde. Smažou se i všechny hlasy a přiřazení hostů.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteMeetingAction(meetingId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Schůzka ${formatWeekdayFull(meetingDate)} je smazaná.`);
        router.push("/meetings");
      }
    } catch {
      showToast("error", "Schůzku se nepodařilo smazat.");
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
      className="min-h-[44px]"
    >
      Smazat schůzku
    </Button>
  );
}
