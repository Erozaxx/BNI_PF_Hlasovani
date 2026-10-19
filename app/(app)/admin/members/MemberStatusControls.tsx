"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import {
  deactivateMemberAction,
  reactivateMemberAction,
  updateDeactivationAction,
} from "@/actions/member-status";

/**
 * iter-037 (T-003c, arch 8.2, gate Z1): stav člena, deaktivace na stránce
 * člena. Jen s právem `members.deactivate`. Bez poznámky k důvodu.
 *
 * `inactiveLabel` je „Neaktivní do 30. 11. 2026“ / „Neaktivní do odvolání“
 * (`null` = aktivní). `currentUntil` je „YYYY-MM-DD“ nebo `null` (do odvolání).
 * `todayPrague` je minimum pro pole data.
 */

type UntilMode = "forever" | "date";

interface MemberStatusControlsProps {
  memberId: string;
  inactiveLabel: string | null;
  currentUntil: string | null;
  /** „Deaktivoval(a) {jméno}, 19. 10. 2026“, jen u neaktivního. */
  deactivatedInfo: string | null;
  todayPrague: string;
  isSelf: boolean;
}

type Mode = "idle" | "form" | "confirm" | "edit";

const SUMMARY =
  "Člen se hned odhlásí a nepřihlásí se odkazem ani heslem. Nedostane odkazy k hlasování, připomínky ani pozvánky na akce a nepočítá se mezi hlasující. Jeho karty v Burze a témata v Master mindu nebudou vidět, naplánované téma se vrátí do zásobníku. Data i funkce zůstanou.";

export function MemberStatusControls({
  memberId,
  inactiveLabel,
  currentUntil,
  deactivatedInfo,
  todayPrague,
  isSelf,
}: MemberStatusControlsProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>("idle");
  const [untilMode, setUntilMode] = useState<UntilMode>(currentUntil ? "date" : "forever");
  const [date, setDate] = useState(currentUntil ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isInactive = inactiveLabel !== null;
  const until = untilMode === "date" ? date : null;

  function close() {
    setMode("idle");
    setError("");
  }

  function validate(): boolean {
    if (untilMode === "date" && !date) {
      setError("Vyber datum.");
      return false;
    }
    setError("");
    return true;
  }

  async function run(fn: () => Promise<{ success: boolean; error?: string }>, ok: () => void) {
    setLoading(true);
    setError("");
    try {
      const res = await fn();
      if (!res.success) {
        setError(res.error ?? "Změna se nepodařila.");
        showToast("error", res.error ?? "Změna se nepodařila.");
        return;
      }
      ok();
      router.refresh();
    } catch {
      setError("Změna se nepodařila.");
      showToast("error", "Změna se nepodařila.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    let unscheduled = 0;
    await run(
      async () => {
        const res = await deactivateMemberAction(memberId, { until });
        if (res.success && res.data) unscheduled = res.data.unscheduled;
        return res;
      },
      () => {
        setMode("idle");
        showToast(
          "success",
          unscheduled > 0
            ? "Člen je neaktivní. Naplánované téma v Master mindu se vrátilo do zásobníku."
            : "Člen je neaktivní."
        );
      }
    );
  }

  async function handleUpdate() {
    await run(
      () => updateDeactivationAction(memberId, { until }),
      () => {
        setMode("idle");
        showToast("success", "Změna uložena.");
      }
    );
  }

  async function handleReactivate() {
    await run(
      () => reactivateMemberAction(memberId),
      () => {
        setMode("idle");
        showToast("success", "Člen je zase aktivní.");
      }
    );
  }

  const form = (
    <div className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="sr-only">Délka neaktivity</legend>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="radio"
            name={`until-${memberId}`}
            checked={untilMode === "forever"}
            onChange={() => setUntilMode("forever")}
            className="h-5 w-5"
          />
          Do odvolání
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <input
            type="radio"
            name={`until-${memberId}`}
            checked={untilMode === "date"}
            onChange={() => setUntilMode("date")}
            className="h-5 w-5"
          />
          Do data
        </label>
      </fieldset>
      {untilMode === "date" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`until-date-${memberId}`} className="text-sm font-medium">
            Neaktivní do (včetně)
          </label>
          <input
            id={`until-date-${memberId}`}
            type="date"
            value={date}
            min={todayPrague}
            onChange={(e) => setDate(e.target.value)}
            className="h-11 w-full max-w-xs rounded-lg border border-border bg-white px-3 text-base"
          />
          <p className="text-xs text-text-muted">
            Další den je člen zase aktivní, nic nemusíš dělat.
          </p>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isInactive ? (
          <Badge variant="warning">{inactiveLabel}</Badge>
        ) : (
          <Badge variant="success">Aktivní</Badge>
        )}
      </div>
      {isInactive && deactivatedInfo && (
        <p className="text-sm text-text-muted">{deactivatedInfo}</p>
      )}

      {!isInactive && mode === "idle" && (
        <>
          {isSelf ? (
            <p className="text-xs text-text-muted">Sám sebe deaktivovat nejde.</p>
          ) : (
            <Button
              variant="danger"
              size="sm"
              className="min-h-[44px]"
              onClick={() => {
                setUntilMode("forever");
                setDate("");
                setMode("form");
              }}
            >
              Deaktivovat
            </Button>
          )}
        </>
      )}

      {!isInactive && mode === "form" && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-3">
          {form}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              className="min-h-[44px]"
              onClick={() => validate() && setMode("confirm")}
            >
              Pokračovat
            </Button>
            <Button variant="secondary" size="sm" className="min-h-[44px]" onClick={close}>
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {!isInactive && mode === "confirm" && (
        <div className="rounded-lg border border-border bg-background p-3 text-sm space-y-3">
          <p>{SUMMARY}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              className="min-h-[44px]"
              loading={loading}
              onClick={handleDeactivate}
            >
              Deaktivovat
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={loading}
              onClick={close}
            >
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {isInactive && mode === "idle" && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            className="min-h-[44px]"
            loading={loading}
            onClick={handleReactivate}
          >
            Aktivovat hned
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px]"
            disabled={loading}
            onClick={() => {
              setUntilMode(currentUntil ? "date" : "forever");
              setDate(currentUntil ?? "");
              setMode("edit");
            }}
          >
            Změnit
          </Button>
        </div>
      )}

      {isInactive && mode === "edit" && (
        <div className="rounded-lg border border-border bg-background p-3 space-y-3">
          {form}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              className="min-h-[44px]"
              loading={loading}
              onClick={() => validate() && handleUpdate()}
            >
              Uložit
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="min-h-[44px]"
              disabled={loading}
              onClick={close}
            >
              Zrušit
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
