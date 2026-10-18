"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { confirmOfferAction } from "@/actions/burza";

/** „Platí dál“: vlastník potvrdí, že řádek platí. Posune datum potvrzení. */
export function ConfirmOfferButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const result = await confirmOfferAction();
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      showToast("success", "Díky, řádek platí dál.");
      router.refresh();
    } catch {
      showToast("error", "Potvrzení se nepodařilo uložit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="primary"
      size="sm"
      loading={loading}
      onClick={handleClick}
      className="min-h-[44px]"
    >
      Platí dál
    </Button>
  );
}
