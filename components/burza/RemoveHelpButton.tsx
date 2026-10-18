"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removeHelpAction } from "@/actions/burza";

/** „Smazat“ záznam pomoci s potvrzením (vedení na `/burza/pomoc`). */
export function RemoveHelpButton({ helpId }: { helpId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!window.confirm("Opravdu smazat záznam pomoci?")) return;
    setLoading(true);
    try {
      const result = await removeHelpAction(helpId);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      showToast("success", "Záznam je smazaný.");
      router.refresh();
    } catch {
      showToast("error", "Záznam se nepodařilo smazat.");
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
