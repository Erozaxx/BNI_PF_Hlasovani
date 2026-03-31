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
      `Opravdu smazat hosta "${guestName}"? Budou smazany i vsechny poznamky a hlasy tohoto hosta.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteGuestAction(guestId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Host "${guestName}" byl smazan.`);
        router.push("/guests");
      }
    } catch {
      showToast("error", "Nepodarilo se smazat hosta.");
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
      Smazat hosta
    </Button>
  );
}
