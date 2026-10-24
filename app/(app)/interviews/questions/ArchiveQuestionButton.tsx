"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { setQuestionActiveAction } from "@/actions/interview-questions";

interface ArchiveQuestionButtonProps {
  questionId: string;
  active: boolean;
}

/**
 * Toggle a question between active and archived (soft delete - arch 4.1).
 * Archiving is reversible (no confirm needed on reactivate); archiving itself
 * asks for confirmation because it removes the question from all future
 * interview snapshots (existing snapshots are untouched copies).
 */
export function ArchiveQuestionButton({
  questionId,
  active,
}: ArchiveQuestionButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (active) {
      const confirmed = window.confirm(
        "Archivovat tuhle otázku? Nebude se nabízet v nově založených pohovorech. Už založené pohovory zůstanou beze změny."
      );
      if (!confirmed) return;
    }

    setLoading(true);
    try {
      const result = await setQuestionActiveAction(questionId, !active);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast(
          "success",
          active ? "Otázka je archivovaná." : "Otázka je obnovená."
        );
        router.refresh();
      }
    } catch {
      showToast(
        "error",
        active
          ? "Otázku se nepodařilo archivovat."
          : "Otázku se nepodařilo obnovit."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={active ? "danger" : "secondary"}
      size="sm"
      className="min-h-[44px]"
      loading={loading}
      onClick={handleToggle}
    >
      {active ? "Archivovat" : "Obnovit"}
    </Button>
  );
}
