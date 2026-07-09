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
 * Toggle a question between active and archived (soft delete — arch 4.1).
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
        "Archivovat tuto otazku? Nebude nabizena v nove zalozenych pohovorech. Jiz zalozene pohovory zustanou beze zmeny."
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
          active ? "Otazka byla archivovana." : "Otazka byla obnovena."
        );
        router.refresh();
      }
    } catch {
      showToast(
        "error",
        active
          ? "Nepodarilo se archivovat otazku."
          : "Nepodarilo se obnovit otazku."
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
      loading={loading}
      onClick={handleToggle}
    >
      {active ? "Archivovat" : "Obnovit"}
    </Button>
  );
}
