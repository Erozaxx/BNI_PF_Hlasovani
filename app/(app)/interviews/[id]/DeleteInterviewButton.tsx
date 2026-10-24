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
      ? `Pohovor obsahuje vyplněné odpovědi (${answeredCount}). Smažou se a vrátit to nepůjde.`
      : "Vrátit to nepůjde.";
    const confirmed = window.confirm(
      `Smazat pohovor (${memberName}, ${typeLabel})? ${warning}`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteInterviewAction(interviewId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", "Pohovor je smazaný.");
        router.push("/interviews");
      }
    } catch {
      showToast("error", "Pohovor se nepodařilo smazat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      className="min-h-[44px]"
      loading={loading}
      onClick={handleDelete}
    >
      Smazat pohovor
    </Button>
  );
}
