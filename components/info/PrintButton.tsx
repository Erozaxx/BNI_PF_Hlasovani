"use client";

/** Odkaz „Vytisknout" (arch 9). Bez JS se nezobrazí, v tisku je skrytý. */
import { useEffect, useState } from "react";

export function PrintButton({ label }: { label: string }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="info-print-button rounded text-sm font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
    >
      {label}
    </button>
  );
}
