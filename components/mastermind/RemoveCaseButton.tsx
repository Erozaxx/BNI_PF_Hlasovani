"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removeCaseAction } from "@/actions/mastermind";
import { UI_TEXTS } from "@/lib/mastermind/rules";

/** „Smazat případ“ (dřív „Stáhnout“, K6): autor jen navržený, vedení i zařazený. Zájmy se smažou s ním. */
export function RemoveCaseButton({
  caseId,
  scheduled,
}: {
  caseId: string;
  scheduled: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    const confirmed = window.confirm(
      scheduled
        ? UI_TEXTS.removeConfirmScheduled
        : UI_TEXTS.removeConfirmProposed
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      const result = await removeCaseAction(caseId);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      showToast("success", UI_TEXTS.removed);
      router.refresh();
    } catch {
      showToast("error", UI_TEXTS.removeFailed);
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
      onClick={handleRemove}
      className="min-h-[44px]"
    >
      {UI_TEXTS.removeButton}
    </Button>
  );
}
