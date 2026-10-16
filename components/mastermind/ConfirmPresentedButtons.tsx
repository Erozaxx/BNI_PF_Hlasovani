"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  confirmPresentedAction,
  undoPresentedAction,
  unscheduleCaseAction,
} from "@/actions/mastermind";

/**
 * Tlačítka vedení u zařazeného a proběhlého případu (K13, 7.2).
 * - `scheduled`: „Proběhlo“ (jen když je `canConfirm`, tj. v den interní
 *   nebo po ní) a „Vrátit do zásobníku“.
 * - `presented`: „Vrátit potvrzení“ s potvrzovacím dotazem, jen na opravu
 *   překlepu (v logu `warn`).
 */
export function ConfirmPresentedButtons({
  caseId,
  mode,
  canConfirm,
}: {
  caseId: string;
  mode: "scheduled" | "presented";
  canConfirm: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<null | "confirm" | "unschedule" | "undo">(null);

  async function run(
    kind: "confirm" | "unschedule" | "undo",
    call: () => Promise<{ success: boolean; error?: string }>,
    okText: string
  ) {
    setBusy(kind);
    try {
      const result = await call();
      if (!result.success) {
        showToast("error", result.error ?? "Akci se nepodařilo provést.");
      } else {
        showToast("success", okText);
      }
      router.refresh();
    } catch {
      showToast("error", "Akci se nepodařilo provést.");
    } finally {
      setBusy(null);
    }
  }

  if (mode === "presented") {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={busy === "undo"}
        disabled={busy !== null}
        className="min-h-[44px]"
        onClick={() => {
          if (!window.confirm("Vrátit potvrzení, že proběhlo? Používej jen na opravu překlepu.")) {
            return;
          }
          void run("undo", () => undoPresentedAction(caseId), "Potvrzení je vrácené.");
        }}
      >
        Vrátit potvrzení
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      {canConfirm && (
        <Button
          type="button"
          size="sm"
          loading={busy === "confirm"}
          disabled={busy !== null}
          className="min-h-[44px]"
          onClick={() => void run("confirm", () => confirmPresentedAction(caseId), "Potvrzeno, že proběhlo.")}
        >
          Proběhlo
        </Button>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={busy === "unschedule"}
        disabled={busy !== null}
        className="min-h-[44px]"
        onClick={() => void run("unschedule", () => unscheduleCaseAction(caseId), "Případ je zpátky v zásobníku.")}
      >
        Vrátit do zásobníku
      </Button>
    </div>
  );
}
