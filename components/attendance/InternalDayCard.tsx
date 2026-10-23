"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cancelInternalDayAction, createInternalDayAction } from "@/actions/attendance-internal";
import { INTERNAL_TEXTS, internalCardView } from "@/lib/attendance/internal";

/**
 * iter-040 (T-003, arch 7.1, gate Z3): karta „Interní schůzka“ pod panelem
 * vybraného dne v kalendáři člena i v Omluvách. Vykresluje se jen
 * s `attendance.internal_manage` (rodič), obsah určuje čistá `internalCardView`.
 * Zrušení je dvoukrokové tlačítko v kartě (žádný modal), cíle klepnutí aspoň
 * 44 px, na 390 px se zalomí. Stav drží rodič (`onChanged`), žádný
 * `router.refresh()` (LL-017). Klient neví, jestli na den byla omluva (Z1):
 * `absencesDeleted` je pravidlo ze serveru, toast je vždy stejný.
 */

export interface InternalDayCardProps {
  date: string;
  now: Date;
  hasMeeting: boolean;
  hasInternal: boolean;
  onChanged: (date: string, state: "internal" | "none" | "meeting", absencesDeleted: boolean) => void;
}

export function InternalDayCard({ date, now, hasMeeting, hasInternal, onChanged }: InternalDayCardProps) {
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const view = internalCardView({ now, date, hasMeeting, hasInternal });
  if (view.kind === "hidden") return null;

  async function run(kind: "create" | "cancel") {
    setPending(true);
    setError(null);
    try {
      const result =
        kind === "create" ? await createInternalDayAction(date) : await cancelInternalDayAction(date);
      if (!result.success) {
        setError(result.error);
        setConfirming(false);
        return;
      }
      const data = result.data;
      if (data) {
        showToast("success", data.message);
        onChanged(date, data.state, data.absencesDeleted);
      }
      setConfirming(false);
    } catch {
      setError(INTERNAL_TEXTS.errGeneric);
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-2 text-base font-semibold text-text-main">{INTERNAL_TEXTS.title}</h2>
      {view.lines.map((line, i) => (
        <p
          key={i}
          className={`text-sm ${view.muted && i === view.lines.length - 1 ? "text-text-muted" : "text-text-main"}`}
        >
          {line}
        </p>
      ))}

      {view.button === "create" && (
        <Button
          type="button"
          size="sm"
          className="mt-3 min-h-[44px]"
          disabled={pending}
          onClick={() => run("create")}
        >
          {INTERNAL_TEXTS.create}
        </Button>
      )}

      {view.button === "cancel" && !confirming && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3 min-h-[44px]"
          disabled={pending}
          onClick={() => {
            setError(null);
            setConfirming(true);
          }}
        >
          {INTERNAL_TEXTS.cancel}
        </Button>
      )}

      {view.button === "cancel" && confirming && (
        <div className="mt-3 space-y-2" role="group" aria-label={INTERNAL_TEXTS.cancel}>
          <p className="text-sm text-text-main">{view.confirm}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              className="min-h-[44px]"
              disabled={pending}
              onClick={() => run("cancel")}
            >
              {INTERNAL_TEXTS.confirmYes}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={pending}
              onClick={() => setConfirming(false)}
            >
              {INTERNAL_TEXTS.confirmNo}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
