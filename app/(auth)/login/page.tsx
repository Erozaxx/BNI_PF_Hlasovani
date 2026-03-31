"use client";

import { useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent, Suspense } from "react";
import { loginAction } from "@/actions/auth";

function LoginFormInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const info = searchParams.get("info");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    startTransition(async () => {
      const result = await loginAction(email, password);
      // loginAction redirects on success; if we get here, it failed
      if (!result.success) {
        setFormError(result.error);
      }
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-card border border-gray-200 p-8">
          <h1 className="text-2xl font-bold text-center mb-6">
            BNI Plzen - Prihlaseni
          </h1>

          {/* URL-based messages */}
          {error === "invalid_token" && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              Odkaz je neplatny nebo vyprsela jeho platnost.
            </div>
          )}
          {info === "new_link_sent" && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
              Tvuj odkaz vyprsela platnost. Novy link ti byl prave odeslan na
              email.
            </div>
          )}

          {/* Form error */}
          {formError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="admin@example.com"
                disabled={isPending}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Heslo
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="••••••••"
                disabled={isPending}
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 px-4 bg-red-600 text-white font-semibold rounded-full hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Prihlasuji..." : "Prihlasit se"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Clenove se prihlasi pomoci magic linku z emailu.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Nacitani...</div>
      </div>
    }>
      <LoginFormInner />
    </Suspense>
  );
}
