"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteMemberAction } from "@/actions/members";

export function DeleteMemberButton({
  memberId,
  memberName,
}: {
  memberId: string;
  memberName: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Opravdu smazat clena "${memberName}"? Tato akce je nevratna.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteMemberAction(memberId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Clen "${memberName}" byl smazan.`);
        router.refresh();
      }
    } catch {
      showToast("error", "Nepodarilo se smazat clena.");
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
      Smazat
    </Button>
  );
}
