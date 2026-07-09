"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteInterviewAction } from "@/actions/interviews";

interface DeleteInterviewButtonProps {
  interviewId: string;
  memberName: string;
  typeLabel: string;
  /** submitted interviews get an extra "nevratne" warning with the answer count (R-12). */
  isSubmitted: boolean;
  answeredCount: number;
}

export function DeleteInterviewButton({
  interviewId,
  memberName,
  typeLabel,
  isSubmitted,
  answeredCount,
}: DeleteInterviewButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const warning = isSubmitted
      ? `Pohovor obsahuje ${answeredCount} vyplnenych odpovedi — budou nevratne smazany.`
      : "Tato akce je nevratna.";
    const confirmed = window.confirm(
      `Opravdu smazat pohovor (${memberName}, ${typeLabel})? ${warning}`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteInterviewAction(interviewId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", "Pohovor byl smazan.");
        router.push("/interviews");
      }
    } catch {
      showToast("error", "Nepodarilo se smazat pohovor.");
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
      Smazat pohovor
    </Button>
  );
}
