"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteGuestAction } from "@/actions/guests";

export function DeleteGuestButton({
  guestId,
  guestName,
}: {
  guestId: string;
  guestName: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Smazat hosta "${guestName}"? Vrátit to nepůjde. Smažou se i všechny jeho poznámky a hlasy.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteGuestAction(guestId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Host "${guestName}" je smazaný.`);
        router.push("/guests");
      }
    } catch {
      showToast("error", "Hosta se nepodařilo smazat.");
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
      Smazat hosta
    </Button>
  );
}
