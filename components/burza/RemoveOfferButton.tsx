"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removeOfferAction } from "@/actions/burza";

/**
 * „Smazat“ řádek v burze s potvrzením. Vlastník svůj, vedení kterýkoli.
 * `goTo` je cesta po smazání (formulář vedení se vrací na přehled).
 */
export function RemoveOfferButton({
  memberId,
  own,
  goTo,
}: {
  memberId: string;
  own: boolean;
  goTo?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    const confirmed = window.confirm(
      own ? "Opravdu smazat tvůj řádek v burze?" : "Opravdu smazat řádek člena v burze?"
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      const result = await removeOfferAction(memberId);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      showToast("success", "Řádek je smazaný.");
      if (goTo) router.push(goTo);
      router.refresh();
    } catch {
      showToast("error", "Řádek se nepodařilo smazat.");
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
      Smazat
    </Button>
  );
}
