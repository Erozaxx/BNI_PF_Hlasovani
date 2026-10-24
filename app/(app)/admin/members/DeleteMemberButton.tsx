"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteMemberAction } from "@/actions/members";

/** Czech pluralization for "pohovor" (1 / 2-4 / 0, 5+). */
function pohovorLabel(count: number): string {
  if (count === 1) return "pohovor";
  if (count >= 2 && count <= 4) return "pohovory";
  return "pohovorů";
}

export function DeleteMemberButton({
  memberId,
  memberName,
  interviewCount,
  redirectTo,
}: {
  memberId: string;
  memberName: string;
  /** Interviews (any status) that would cascade-delete with this member (R-11). */
  interviewCount: number;
  /** Stránka člena po smazání vede zpět na seznam. */
  redirectTo?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    // R-11: member.id CASCADE deletes interview history too, warn with the
    // count before the irreversible action, don't block it.
    const interviewWarning =
      interviewCount > 0 ? ` Má ${interviewCount} ${pohovorLabel(interviewCount)}.` : "";
    const confirmed = window.confirm(
      `Smazat člena ${memberName}? Vrátit to nepůjde. Smaže se i jeho docházka, omluvy, semafor, hlasy u hostů, pohovory, Burza a jeho případy v Master mindu.${interviewWarning} Když člen jen odchází, použij Deaktivovat.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteMemberAction(memberId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Člen „${memberName}“ byl smazán.`);
        if (redirectTo) router.push(redirectTo);
        router.refresh();
      }
    } catch {
      showToast("error", "Člena se nepodařilo smazat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      className="min-h-[44px]"
      loading={loading}
      onClick={handleDelete}
    >
      Smazat
    </Button>
  );
}
