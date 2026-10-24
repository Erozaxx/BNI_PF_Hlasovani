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
      `Povýšit hosta "${guestName}" na člena?`,
      "",
      "Vznikne nový člen (jméno, firma, e-mail, obor podle kategorie hosta). Host bude NENÁVRATNĚ smazán a s ním:",
      "",
      "- všechny poznámky o hostovi",
      "- všechny hlasy o přijetí hosta, včetně historie v archivu",
      "- účast hosta na všech schůzkách, včetně nadcházejících, kde se ještě nehlasovalo",
      "- telefon a popis hosta (člen tato pole nemá)",
      "",
    ];

    if (!hasEmail) {
      lines.push(
        "Host nemá vyplněný e-mail. Člen vznikne bez e-mailu a nepůjde mu poslat hlasovací odkaz, dokud e-mail nedoplníš v sekci Členové.",
        ""
      );
    }

    lines.push("Tuto akci nelze vzít zpět.");
    return lines.join("\n");
  }

  function buildRepairConfirmText(existingMemberEmail: string): string {
    return [
      `Člen se stejným jménem i e-mailem (${existingMemberEmail}) už existuje.`,
      "",
      `Nový člen NEVZNIKNE. Host "${guestName}" bude pouze NENÁVRATNĚ smazán, včetně poznámek, hlasů a účasti na schůzkách.`,
      "",
      "Pokud jsi tohoto člena už založil(a) dříve ručně, je to v pořádku. Potvrzením se odstraní jen zbytečný záznam hosta.",
      "",
      "Pokud jde o dva různé lidi (např. sdílený firemní e-mail), akci zruš a nejdřív uprav e-mail hosta.",
      "",
      "Smazat hosta bez vytvoření nového člena?",
    ].join("\n");
  }

  async function handleResult(result: PromoteGuestResult): Promise<void> {
    if (result.success) {
      if (result.repaired) {
        showToast(
          "success",
          `Host "${guestName}" byl odstraněn. Nový člen nevznikl, člen se stejným jménem a e-mailem už existoval.`
        );
      } else {
        showToast(
          "success",
          `Host "${guestName}" byl povýšen na člena. Člen se přihlásí sám na přihlašovací stránce svým e-mailem. Admin v sekci Členové ověří, že e-mail sedí.`
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
      showToast("error", "Nepodařilo se povýšit hosta.");
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
      className="min-h-[44px]"
    >
      Povýšit na člena
    </Button>
  );
}
