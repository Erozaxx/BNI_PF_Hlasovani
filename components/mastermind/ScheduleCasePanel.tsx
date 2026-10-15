"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { scheduleCaseAction } from "@/actions/mastermind";
import { formatDM, formatWeekdayDM, type ThursdayOption } from "@/lib/mastermind/rules";

/**
 * Panel „Zařadit na“ (jen vedení, jen u navrženého případu, 7.3, Z1, Z3, Z4).
 * Položka výběru je jen datum („čt 22. 10.“), zakázané čtvrtky mají
 * „(otevřená)“ nebo „(obsazeno)“. Poznámka o lhůtě je vedle výběru, ne v textu
 * položky, a nic nezakazuje.
 */
export function ScheduleCasePanel({
  caseId,
  options,
}: {
  caseId: string;
  options: ThursdayOption[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = options.find((o) => o.date === date) ?? null;

  async function handleSchedule() {
    if (!date) return;
    setLoading(true);
    try {
      const result = await scheduleCaseAction(caseId, date);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      showToast("success", `Zařazeno na ${formatWeekdayDM(date)}.`);
      router.refresh();
    } catch {
      showToast("error", "Případ se nepodařilo zařadit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-background p-3 space-y-3">
      <label htmlFor={`schedule-${caseId}`} className="block text-sm font-medium text-text-main">
        Zařadit na
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          id={`schedule-${caseId}`}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full sm:w-auto rounded-lg border border-border bg-white px-3 text-base text-text-main focus:outline-none focus:border-primary focus:shadow-focus"
        >
          <option value="">Vyber čtvrtek</option>
          {options.map((o) => (
            <option key={o.date} value={o.date} disabled={o.state !== "free"}>
              {formatWeekdayDM(o.date)}
              {o.state === "open-meeting" ? " (otevřená)" : o.state === "taken" ? " (obsazeno)" : ""}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          loading={loading}
          disabled={!date || loading}
          onClick={handleSchedule}
          className="min-h-[44px]"
        >
          Zařadit
        </Button>
      </div>
      {selected?.shortNotice && (
        <p className="text-xs text-text-muted">Méně než 14 dní: {formatDM(selected.date)}</p>
      )}
    </div>
  );
}
