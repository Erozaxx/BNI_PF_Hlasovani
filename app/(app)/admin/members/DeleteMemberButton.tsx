"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteMemberAction } from "@/actions/members";

/** Czech pluralization for "pohovor" (1 / 2-4 / 0,5+). */
function pohovorLabel(count: number): string {
  if (count === 1) return "pohovor";
  if (count >= 2 && count <= 4) return "pohovory";
  return "pohovoru";
}

export function DeleteMemberButton({
  memberId,
  memberName,
  interviewCount,
}: {
  memberId: string;
  memberName: string;
  /** Interviews (any status) that would cascade-delete with this member (R-11). */
  interviewCount: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    // R-11: member.id CASCADE deletes interview history too — warn with the
    // count before the irreversible action, don't block it.
    const interviewWarning =
      interviewCount > 0
        ? `\n\nUpozorneni: Clen ma ${interviewCount} ${pohovorLabel(interviewCount)} — budou smazany.`
        : "";
    const confirmed = window.confirm(
      `Opravdu smazat clena "${memberName}"? Tato akce je nevratna.${interviewWarning}`
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
