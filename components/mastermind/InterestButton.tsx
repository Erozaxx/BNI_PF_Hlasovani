"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { setInterestAction } from "@/actions/mastermind";
import { formatWeekdayDM, interestLabels, type CaseStatus } from "@/lib/mastermind/rules";
import { useRouter } from "next/navigation";

/**
 * iter-033 (arch 7.3, 7.4): „Mám zájem“ / „Přihlásit se“. Drží počet a stav
 * lokálně, volá akci s CÍLOVÝM stavem a převezme `{ interested, count }`
 * ze serveru. Akce nevolá revalidatePath, takže se karty po kliknutí
 * nepřeskládají. Tlačítko nemá `aria-pressed`: popisek se mění a stav nese
 * text u počtu v `role="status"`.
 */
export function InterestButton({
  caseId,
  status,
  initialInterested,
  initialCount,
  internalDate = null,
  onChange,
}: {
  caseId: string;
  status: Exclude<CaseStatus, "presented">;
  initialInterested: boolean;
  initialCount: number;
  /** Datum interní zařazeného případu, ukáže se u stavu přihlášení. */
  internalDate?: string | null;
  onChange?: (interested: boolean, count: number) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const labels = interestLabels(status);
  const [interested, setInterested] = useState(initialInterested);
  const [count, setCount] = useState(initialCount);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const target = !interested;
    setPending(true);
    try {
      const result = await setInterestAction(caseId, target);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      const data = result.data ?? { interested: target, count };
      setInterested(data.interested);
      setCount(data.count);
      onChange?.(data.interested, data.count);
    } catch {
      showToast("error", "Změnu se nepodařilo uložit.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
      <p className="text-sm text-text-main">
        <span>{labels.countText(count)}</span>
        <span className="text-text-muted"> · </span>
        <span role="status" className="font-medium text-success">
          {interested
            ? status === "scheduled" && internalDate
              ? `${labels.stateText} na ${formatWeekdayDM(internalDate)}`
              : labels.stateText
            : ""}
        </span>
      </p>
      <Button
        type="button"
        variant={interested ? "secondary" : "primary"}
        size="sm"
        disabled={pending}
        onClick={handleClick}
        className="min-h-[44px] w-full sm:w-auto"
      >
        {interested ? labels.buttonOff : labels.buttonOn}
      </Button>
    </div>
  );
}
