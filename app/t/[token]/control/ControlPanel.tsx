"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ControlPanelProps {
  token: string;
  name: string;
  status: "running" | "paused";
  remainingSeconds: number;
  displaySeconds: number;
  viewToken: string;
}

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

export function ControlPanel({
  token,
  name,
  status,
  remainingSeconds,
  displaySeconds,
  viewToken,
}: ControlPanelProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [durationInput, setDurationInput] = useState<string>(
    String(displaySeconds)
  );
  const [copied, setCopied] = useState(false);

  const displayed = Math.max(0, Math.min(remainingSeconds, displaySeconds));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleAction = useCallback(
    async (action: string, displaySecondsArg?: number) => {
      setLoading(true);
      try {
        const body: Record<string, unknown> = { action };
        if (displaySecondsArg !== undefined) {
          body.display_seconds = displaySecondsArg;
        }

        const res = await fetch(`/api/t/${token}/control`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.status === 409) {
          showToast("Operace selhala — timer je již v tomto stavu.");
        } else if (res.status === 404) {
          showToast("Časovač nebyl nalezen.");
        } else if (!res.ok) {
          showToast("Neočekávaná chyba. Zkuste to znovu.");
        }
      } catch {
        showToast("Chyba připojení. Zkuste to znovu.");
      } finally {
        router.refresh();
        setLoading(false);
      }
    },
    [token, router]
  );

  const handleSetDuration = () => {
    const val = parseInt(durationInput, 10);
    if (!Number.isInteger(val) || val <= 0 || val > 86400) {
      showToast("Zadejte platný čas v sekundách (1–86400).");
      return;
    }
    handleAction("set_duration", val);
  };

  const handleCopyViewLink = async () => {
    const viewUrl = `${window.location.origin}/t/${viewToken}`;
    try {
      await navigator.clipboard.writeText(viewUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Nepodařilo se zkopírovat odkaz.");
    }
  };

  const isRunning = status === "running";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Toast */}
        {toast && (
          <div className="bg-danger-light border border-danger rounded-lg px-4 py-3 text-sm text-danger">
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-text-main">{name}</h1>
          <p className="text-sm text-text-muted">
            Stav:{" "}
            <span className={isRunning ? "text-success font-medium" : "text-text-muted"}>
              {isRunning ? "Běží" : "Pozastaveno"}
            </span>
          </p>
        </div>

        {/* Countdown display */}
        <div className="text-center">
          <span className="text-6xl font-mono font-bold text-text-main tabular-nums">
            {formatTime(displayed)}
          </span>
        </div>

        {/* Primary controls */}
        <div className="flex gap-3">
          {/* Start / Pause toggle */}
          {isRunning ? (
            <button
              onClick={() => handleAction("pause")}
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-warning text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ⏸ Pauza
            </button>
          ) : (
            <button
              onClick={() => handleAction("start")}
              disabled={loading}
              className="flex-1 py-3 rounded-lg bg-success text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ▶ Spustit
            </button>
          )}

          {/* Reset */}
          <button
            onClick={() => handleAction("reset")}
            disabled={loading}
            className="flex-1 py-3 rounded-lg bg-neutral-200 text-text-main font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ↺ Reset
          </button>
        </div>

        {/* Set duration */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-text-muted">
            ⏱ Nastavit čas (sekundy)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={86400}
              value={durationInput}
              onChange={(e) => setDurationInput(e.target.value)}
              disabled={isRunning || loading}
              title={isRunning ? "Nejprve zastav časovač" : undefined}
              className="flex-1 px-3 py-2 border border-border rounded-lg text-sm text-text-main bg-background disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSetDuration}
              disabled={isRunning || loading}
              title={isRunning ? "Nejprve zastav časovač" : undefined}
              className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Nastavit
            </button>
          </div>
          {isRunning && (
            <p className="text-xs text-text-muted">
              Nejprve zastav časovač pro změnu délky.
            </p>
          )}
        </div>

        {/* Copy view link */}
        <button
          onClick={handleCopyViewLink}
          className="w-full py-2 rounded-lg border border-border text-sm text-text-muted hover:text-text-main transition-colors"
        >
          {copied ? "✓ Odkaz zkopírován" : "Kopírovat zobrazovací odkaz"}
        </button>
      </div>
    </div>
  );
}
