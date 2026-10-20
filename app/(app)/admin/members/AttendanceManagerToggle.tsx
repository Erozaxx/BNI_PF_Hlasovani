"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { setAttendanceManagerAction } from "@/actions/attendance";

/**
 * iter-038 (T-003a, arch 5.3, 15.3, gate sekce 5): přepínač „Správce docházky“
 * na stránce člena. Ukládá se hned po klepnutí cílovým stavem (idempotentní),
 * stav drží komponenta lokálně, žádné `router.refresh()` (LL-017). Bez e-mailu
 * přepínač jde, jen pod ním je věta, že mu ranní odkaz ani report nepřijde.
 */
export function AttendanceManagerToggle({
  memberId,
  initialEnabled,
  hasEmail,
}: {
  memberId: string;
  initialEnabled: boolean;
  hasEmail: boolean;
}) {
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function toggle(target: boolean) {
    setPending(true);
    setError("");
    try {
      const result = await setAttendanceManagerAction(memberId, target);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
        return;
      }
      setEnabled(result.data?.enabled ?? target);
      showToast("success", "Uloženo.");
    } catch {
      setError("Neuložilo se. Zkus to znovu.");
      showToast("error", "Neuložilo se. Zkus to znovu.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={pending}
          onChange={(e) => toggle(e.target.checked)}
          className="h-5 w-5 accent-primary"
        />
        <span className="font-medium text-text-main">Správce docházky</span>
      </label>
      <p className="text-text-muted">
        Zapisuje docházku, vidí docházku všech a dostává ranní odkaz a report.
      </p>
      {!hasEmail && <p className="text-text-muted">Bez e-mailu mu ranní odkaz ani report nepřijde.</p>}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
