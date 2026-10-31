"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  deleteSemaforMonthAction,
  deleteSemaforRowAction,
  removeSemaforAliasAction,
} from "@/actions/semafor";
import { deleteActivityAction, deleteOwnThanksAction, deletePointAction } from "@/actions/semafor-points";
import {
  POINT_TEXTS,
  SEMAFOR_TEXTS,
  deleteActivityConfirmText,
  deleteMonthConfirmText,
  deletePointConfirmText,
  deleteRowConfirmText,
} from "@/lib/semafor/texts";

/**
 * iter-041 (arch 5.9, gate Z6): mazání v semaforu. Dvoukrokové tlačítko v místě
 * (žádný modal), cíle klepnutí aspoň 44 px, na 390 px se zalomí. Po akci se
 * stránka obnoví přes `revalidatePath` na serveru, žádný `router.refresh()`.
 */
export function ConfirmDelete({
  label,
  question,
  run,
  small,
}: {
  label: string;
  question: string | null;
  run: () => Promise<{ success: boolean; error?: string }>;
  small?: boolean;
}) {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  async function go() {
    setPending(true);
    try {
      const res = await run();
      if (!res.success) showToast("error", res.error ?? SEMAFOR_TEXTS.errSaveFailed);
    } catch {
      showToast("error", SEMAFOR_TEXTS.errSaveFailed);
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (question === null) {
    return (
      <Button type="button" variant="secondary" size="sm" className="min-h-[44px]" disabled={pending} onClick={go}>
        {label}
      </Button>
    );
  }
  if (!confirming) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className={`min-h-[44px] ${small ? "text-xs" : ""}`}
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
    );
  }
  return (
    <div className="space-y-2" role="group" aria-label={label}>
      <p className="text-sm text-text-main">{question}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="danger" size="sm" className="min-h-[44px]" disabled={pending} onClick={go}>
          {SEMAFOR_TEXTS.confirmYes}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          {SEMAFOR_TEXTS.confirmNo}
        </Button>
      </div>
    </div>
  );
}

export function DeleteRowButton({ month, memberId, name }: { month: string; memberId: string; name: string }) {
  return (
    <ConfirmDelete
      label={SEMAFOR_TEXTS.deleteRow}
      question={deleteRowConfirmText(name, month)}
      run={() => deleteSemaforRowAction(month, memberId)}
      small
    />
  );
}

export function DeleteMonthButton({ month }: { month: string }) {
  return (
    <ConfirmDelete
      label={SEMAFOR_TEXTS.deleteMonth}
      question={deleteMonthConfirmText(month)}
      run={() => deleteSemaforMonthAction(month)}
    />
  );
}

export function RemoveAliasButton({ nameKey }: { nameKey: string }) {
  return (
    <ConfirmDelete
      label={SEMAFOR_TEXTS.aliasRemove}
      question={null}
      run={() => removeSemaforAliasAction(nameKey)}
      small
    />
  );
}

// ── iter-044: vlastní body ───────────────────────────────────

/** Smazání záznamu vedením (moderace, `deletePointAction`). */
export function DeletePointButton({ pointId, category, name }: { pointId: string; category: string; name: string }) {
  return (
    <ConfirmDelete
      label={POINT_TEXTS.deletePoint}
      question={deletePointConfirmText(category, name)}
      run={() => deletePointAction(pointId)}
      small
    />
  );
}

/** Smazání akce a všech jejích bodů (`deleteActivityAction`). */
export function DeleteActivityButton({ activityId, title, participants }: { activityId: string; title: string; participants: number }) {
  return (
    <ConfirmDelete
      label={POINT_TEXTS.deleteActivity}
      question={deleteActivityConfirmText(title, participants)}
      run={() => deleteActivityAction(activityId)}
      small
    />
  );
}

/** Autor smaže své poděkování (`deleteOwnThanksAction`, bez větve práva). */
export function DeleteOwnThanksButton({ pointId, name }: { pointId: string; name: string }) {
  return (
    <ConfirmDelete
      label={POINT_TEXTS.deletePoint}
      question={deletePointConfirmText("Poděkování", name)}
      run={() => deleteOwnThanksAction(pointId)}
      small
    />
  );
}
