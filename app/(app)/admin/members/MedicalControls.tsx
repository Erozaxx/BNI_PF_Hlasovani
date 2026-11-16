"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { MEDICAL_TEXTS } from "@/lib/members/medical";
import { clearMemberMedicalAction, setMemberMedicalAction } from "@/actions/member-medical";

/**
 * iter-046 (arch 4.4): medical člena. Stav, pole data a tlačítka. Bez
 * `router.refresh()` (LL-017), stav se bere z odpovědi akce. Do klienta jde
 * jen id, období a dnešek, nic dalšího.
 */
interface MedicalControlsProps {
  memberId: string;
  /** „YYYY-MM-DD“ nebo `null`; ukazuje se jen období, které ještě neskončilo. */
  initialUntil: string | null;
  todayPrague: string;
  maxDate: string;
}

export function MedicalControls({ memberId, initialUntil, todayPrague, maxDate }: MedicalControlsProps) {
  const { showToast } = useToast();
  const [until, setUntil] = useState<string | null>(initialUntil);
  const [date, setDate] = useState(initialUntil ?? "");
  const [confirmClear, setConfirmClear] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!date) {
      setError("Vyber datum.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await setMemberMedicalAction(memberId, date);
      if (!res.success) {
        setError(res.error ?? "Medical se nepodařilo uložit.");
        showToast("error", res.error ?? "Medical se nepodařilo uložit.");
        return;
      }
      setUntil(res.data?.medicalUntil ?? date);
      showToast("success", "Medical uložen.");
    } catch {
      setError("Medical se nepodařilo uložit.");
    } finally {
      setLoading(false);
    }
  }

  async function clear() {
    setLoading(true);
    setError("");
    try {
      const res = await clearMemberMedicalAction(memberId);
      if (!res.success) {
        setError(res.error ?? "Medical se nepodařilo zrušit.");
        showToast("error", res.error ?? "Medical se nepodařilo zrušit.");
        return;
      }
      setUntil(null);
      setDate("");
      setConfirmClear(false);
      showToast("success", "Medical zrušen.");
    } catch {
      setError("Medical se nepodařilo zrušit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {until ? (
          <Badge variant="warning">{MEDICAL_TEXTS.stateUntil(until)}</Badge>
        ) : (
          <Badge variant="neutral">{MEDICAL_TEXTS.none}</Badge>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`medical-date-${memberId}`} className="text-sm font-medium">
          {MEDICAL_TEXTS.untilLabel}
        </label>
        <input
          id={`medical-date-${memberId}`}
          type="date"
          value={date}
          min={todayPrague}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full max-w-xs rounded-lg border border-border bg-white px-3 text-base"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" className="min-h-[44px]" loading={loading} onClick={save}>
          {MEDICAL_TEXTS.save}
        </Button>
        {until && !confirmClear && (
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px]"
            disabled={loading}
            onClick={() => setConfirmClear(true)}
          >
            {MEDICAL_TEXTS.clear}
          </Button>
        )}
      </div>
      {confirmClear && (
        <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-3">
          <p>{MEDICAL_TEXTS.confirmClear}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" className="min-h-[44px]" loading={loading} onClick={clear}>
              {MEDICAL_TEXTS.clear}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={loading}
              onClick={() => setConfirmClear(false)}
            >
              Zpět
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
