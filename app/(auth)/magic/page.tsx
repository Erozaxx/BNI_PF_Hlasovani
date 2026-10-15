"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function MagicPageInner() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const info = searchParams.get("info");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-card border border-gray-200 p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Magic Link</h1>

          {error === "invalid_token" && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <p className="font-medium mb-1">Neplatný odkaz</p>
              <p className="text-sm">
                Odkaz je neplatný, vypršela jeho platnost nebo už byl použit.
                Požádejte administrátora o nový odkaz.
              </p>
            </div>
          )}

          {info === "new_link_sent" && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
              <p className="font-medium mb-1">Nový odkaz odeslán</p>
              <p className="text-sm">
                Tvůj původní odkaz již není platný. Nový přihlašovací odkaz ti
                byl právě odeslán na e-mail. Zkontroluj svou schránku.
              </p>
            </div>
          )}

          {!error && !info && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
              <p className="text-sm">
                Ověřuji přihlašovací odkaz...
              </p>
            </div>
          )}

          <a
            href="/login"
            className="mt-6 inline-block text-sm text-primary-600 hover:text-primary-800 underline"
          >
            Zpět na přihlášení
          </a>
        </div>
      </div>
    </div>
  );
}

export default function MagicPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Načítání...</div>
      </div>
    }>
      <MagicPageInner />
    </Suspense>
  );
}
