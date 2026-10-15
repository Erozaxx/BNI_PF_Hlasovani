"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removeCaseAction } from "@/actions/mastermind";

/** „Stáhnout“ případ: autor jen navržený, vedení i zařazený. Zájmy se smažou s ním. */
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
        ? "Opravdu stáhnout zařazený případ? Přihlášení posluchači o něm přijdou."
        : "Opravdu stáhnout případ? Zájem ostatních se smaže."
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
      showToast("success", "Případ je stažený.");
      router.refresh();
    } catch {
      showToast("error", "Případ se nepodařilo stáhnout.");
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
      Stáhnout
    </Button>
  );
}
