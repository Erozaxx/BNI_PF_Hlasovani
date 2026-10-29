"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { setPasswordFromLinkAction } from "@/actions/login-link";

const LINK_INVALID_PREFIX = "Odkaz už neplatí";

export function SetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Hesla se neshodují.");
      return;
    }
    if (password.length < 8) {
      setError("Heslo musí mít aspoň 8 znaků.");
      return;
    }
    startTransition(async () => {
      // Úspěch přesměruje na /dashboard (redirect v akci).
      const result = await setPasswordFromLinkAction(token, password, confirm);
      if (result && !result.success) setError(result.error);
    });
  }

  const linkDead = !!error && error.startsWith(LINK_INVALID_PREFIX);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {linkDead ? "Odkaz už neplatí. Požádej admina o nový." : error}
        </div>
      )}
      <div>
        <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
          Nové heslo
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isPending}
          className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="Aspoň 8 znaků"
        />
      </div>
      <div>
        <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
          Heslo znovu
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={isPending}
          className="w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-2.5 px-4 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? "Ukládám..." : "Uložit heslo a přihlásit se"}
      </button>
      {linkDead && (
        <p className="text-center text-sm">
          <Link href="/login" className="text-red-700 underline">
            Na přihlášení
          </Link>
        </p>
      )}
    </form>
  );
}
