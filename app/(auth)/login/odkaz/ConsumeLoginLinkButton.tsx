"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { consumeLoginLinkAction } from "@/actions/login-link";

export function ConsumeLoginLinkButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    setError(null);
    startTransition(async () => {
      // Úspěch přesměruje na /dashboard (redirect v akci).
      const result = await consumeLoginLinkAction(token);
      if (result && !result.success) setError(result.error);
    });
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
        <Link
          href="/login"
          className="inline-block py-2.5 px-6 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700"
        >
          Na přihlášení
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Kliknutím se přihlásíš na 12 hodin. Odkaz jde použít jen jednou.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="w-full py-2.5 px-4 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Přihlašuji..." : "Přihlásit se"}
      </button>
    </div>
  );
}
