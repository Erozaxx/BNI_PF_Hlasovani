"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { removeContactUseAction, removeHelpAction } from "@/actions/burza";
import { TEXTS } from "@/lib/burza/rules";

/**
 * „Smazat“ záznam pomoci, nebo využití kontaktu (`kind`) s potvrzením (vedení
 * na `/burza/pomoc`).
 */
export function RemoveHelpButton({
  helpId,
  kind = "help",
}: {
  helpId: string;
  kind?: "help" | "contact";
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!window.confirm(kind === "contact" ? TEXTS.contactUseDeleteConfirm : TEXTS.helpDeleteConfirm)) return;
    setLoading(true);
    try {
      const result = kind === "contact" ? await removeContactUseAction(helpId) : await removeHelpAction(helpId);
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
