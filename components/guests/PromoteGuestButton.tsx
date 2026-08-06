"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  promoteGuestToMemberAction,
  type PromoteGuestResult,
} from "@/actions/guests";

/**
 * Promote-guest-to-member button. Pattern follows DeleteGuestButton
 * (window.confirm, useToast, router, useState + try/finally). The
 * isSubmitting flag is set once in handlePromote, before the first
 * `await promoteGuestToMemberAction(...)`, and only cleared in that same
 * function's `finally`, after `handleResult` (which may run a second
 * window.confirm + a second, awaited action call for the repair path) has
 * fully settled -- so the button stays disabled across both round-trips and
 * the confirm dialog in between, preventing double-clicks (brief scope IN).
 *
 * Confirm/toast copy is verbatim from arch_iter-022_T-003.md §4 (MINOR-2) and
 * decision_iter-022_T-004.md D-2/D-4 -- do not reword.
 */
export function PromoteGuestButton({
  guestId,
  guestName,
  hasEmail,
  redirectTo,
}: {
  guestId: string;
  guestName: string;
  hasEmail: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function buildConfirmText(): string {
    const lines = [
      `Povysit hosta "${guestName}" na clena?`,
      "",
      "Vznikne novy clen (jmeno, firma, email, obor podle kategorie hosta). Host bude NENAVRATNE smazan a s nim:",
      "",
      "- vsechny poznamky o hostovi",
      "- vsechny hlasy o prijeti hosta, vcetne historie v archivu",
      "- ucast hosta na vsech schuzkach, vcetne nadchazejicich, kde se jeste nehlasovalo",
      "- telefon a popis hosta (clen tato pole nema)",
      "",
    ];

    if (!hasEmail) {
      lines.push(
        "Host nema vyplneny email - clen vznikne bez emailu a nepujde mu poslat hlasovaci odkaz, dokud email nedoplnite v administraci.",
        ""
      );
    }

    lines.push("Tuto akci nelze vzit zpet.");
    return lines.join("\n");
  }

  function buildRepairConfirmText(existingMemberEmail: string): string {
    return [
      `Clen se stejnym jmenem i emailem (${existingMemberEmail}) uz existuje.`,
      "",
      `Novy clen NEVZNIKNE. Host "${guestName}" bude pouze NENAVRATNE smazan, vcetne poznamek, hlasu a ucasti na schuzkach.`,
      "",
      "Pokud jste tohoto clena uz zalozili drive rucne, je to v poradku - potvrzenim se odstrani jen zbytecny zaznam hosta.",
      "",
      "Pokud jde o dva ruzne lidi (napr. sdileny firemni email), akci zruste a nejdriv upravte email hosta.",
      "",
      "Smazat hosta bez vytvoreni noveho clena?",
    ].join("\n");
  }

  async function handleResult(result: PromoteGuestResult): Promise<void> {
    if (result.success) {
      if (result.repaired) {
        showToast(
          "success",
          `Host "${guestName}" byl odstranen. Novy clen nevznikl - clen se stejnym jmenem a emailem uz existoval.`
        );
      } else {
        showToast(
          "success",
          `Host "${guestName}" byl povysen na clena. Clen zatim nema prihlasovaci odkaz - vygeneruje ho admin v sekci Clenove.`
        );
      }
      if (redirectTo) {
        router.push(redirectTo);
      }
      return;
    }

    if ("repairConfirmationRequired" in result) {
      const confirmedRepair = window.confirm(
        buildRepairConfirmText(result.existingMemberEmail)
      );
      if (!confirmedRepair) return;

      const repairResult = await promoteGuestToMemberAction(guestId, {
        confirmRepair: true,
      });
      await handleResult(repairResult);
      return;
    }

    showToast("error", result.error);
  }

  async function handlePromote() {
    const confirmed = window.confirm(buildConfirmText());
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const result = await promoteGuestToMemberAction(guestId);
      await handleResult(result);
    } catch {
      showToast("error", "Nepodarilo se povysit hosta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={isSubmitting}
      onClick={handlePromote}
    >
      Povysit na clena
    </Button>
  );
}
