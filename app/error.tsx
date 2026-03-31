"use client";

import { Button } from "@/components/ui/Button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <svg
            className="w-16 h-16 text-danger mx-auto"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-text-main mb-2">
          Neco se pokazilo
        </h1>
        <p className="text-text-muted mb-6">
          Doslo k neocekavane chybe. Zkuste to prosim znovu nebo se vratte na
          hlavni stranku.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="primary" onClick={reset}>
            Zkusit znovu
          </Button>
          <Button variant="secondary" onClick={() => (window.location.href = "/dashboard")}>
            Na hlavni stranku
          </Button>
        </div>
      </div>
    </div>
  );
}
