"use client";

/**
 * TimerDisplay — Client Component for the public timer display page.
 *
 * Receives initial SSR data as props (no loading flash).
 * Polling pattern (S-003): AbortController + isFetching guard, every 3s.
 * Optimistic countdown: local 1s interval between server polls for smooth UX.
 * GUI computation: displayed_remaining = max(0, min(remaining_seconds, displaySeconds))
 */

import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimerState {
  name: string;
  status: "running" | "paused";
  remaining_seconds: number;
  display_seconds: number;
  updated_at: string;
}

interface TimerDisplayProps {
  token: string;
  initialName: string;
  initialStatus: "running" | "paused";
  initialRemainingSeconds: number;
  displaySeconds: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function computeDisplayed(remaining: number, display: number): number {
  return Math.max(0, Math.min(remaining, display));
}

function countdownColorClass(isRunning: boolean, remaining: number): string {
  if (!isRunning) return "text-gray-400";
  if (remaining <= 5) return "text-red-400";
  if (remaining <= 10) return "text-yellow-400";
  return "text-green-400";
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TimerDisplay({
  token,
  initialName,
  initialStatus,
  initialRemainingSeconds,
  displaySeconds,
}: TimerDisplayProps) {
  const initialDisplayed = computeDisplayed(initialRemainingSeconds, displaySeconds);

  const [timerData, setTimerData] = useState<TimerState>({
    name: initialName,
    status: initialStatus,
    remaining_seconds: initialRemainingSeconds,
    display_seconds: displaySeconds,
    updated_at: "",
  });
  const [displayedRemaining, setDisplayedRemaining] = useState<number>(initialDisplayed);

  // Refs for the optimistic countdown to read without stale closures
  const serverDisplayedRef = useRef<number>(initialDisplayed);
  const statusRef = useRef<"running" | "paused">(initialStatus);

  // ── Polling effect (S-003: AbortController + isFetching) ──────────────────
  useEffect(() => {
    let isFetching = false;
    const controller = new AbortController();

    async function poll() {
      if (isFetching) return;
      isFetching = true;
      try {
        const res = await fetch(`/api/t/${token}/state`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          // Keep previous state visible on transient errors
          return;
        }
        const data: TimerState = await res.json();
        const displayed = computeDisplayed(
          data.remaining_seconds,
          data.display_seconds
        );
        serverDisplayedRef.current = displayed;
        statusRef.current = data.status;
        setDisplayedRemaining(displayed);
        setTimerData(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Timer fetch error:", err);
        }
      } finally {
        isFetching = false;
      }
    }

    // Fire immediately on mount, then every 3s
    void poll();
    const interval = setInterval(() => void poll(), 3000);

    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [token]);

  // ── Optimistic 1s countdown for smooth UX ─────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      if (statusRef.current !== "running") return;
      // Do not tick during grace period (server remaining still above display cap)
      if (serverDisplayedRef.current >= displaySeconds) return;
      setDisplayedRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  const isRunning = timerData.status === "running";
  const isExpired = displayedRemaining === 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-950 px-4">
      {/* Timer name */}
      <h1 className="text-2xl sm:text-3xl font-semibold text-gray-200 mb-10 text-center">
        {timerData.name}
      </h1>

      {/* Countdown display */}
      {isExpired ? (
        <p
          className="text-6xl sm:text-8xl font-bold text-red-400 tracking-widest"
          aria-live="polite"
        >
          Čas vypršel
        </p>
      ) : (
        <p
          className={`text-8xl sm:text-[12rem] font-mono font-bold tracking-widest tabular-nums ${countdownColorClass(isRunning, displayedRemaining)}`}
          aria-live="polite"
          aria-label={`Zbývající čas: ${formatTime(displayedRemaining)}`}
        >
          {formatTime(displayedRemaining)}
        </p>
      )}

      {/* Status badge */}
      <div className="mt-8">
        {isExpired ? null : isRunning ? (
          <span className="inline-block px-4 py-1 rounded-full text-sm font-medium bg-green-900 text-green-300">
            Běží
          </span>
        ) : (
          <span className="inline-block px-4 py-1 rounded-full text-sm font-medium bg-gray-800 text-gray-400">
            Pozastaveno
          </span>
        )}
      </div>
    </div>
  );
}
