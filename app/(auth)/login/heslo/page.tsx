import type { Metadata } from "next";
import { SetPasswordForm } from "./SetPasswordForm";

/**
 * iter-032 (arch 5.2, K12 B): nastavení hesla vedení odkazem z mailu. GET
 * jen vykreslí formulář, nic nespotřebuje ani nečte z DB. Odkaz se
 * spotřebuje až odesláním formuláře (setPasswordFromLinkAction).
 * Middleware: veřejná cesta, Cache-Control: no-store (N-c).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nastavení hesla, BNI Plzeň",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-card border border-gray-200 p-6 sm:p-8">
          <h1 className="text-2xl font-bold text-center mb-2">Nastav si heslo</h1>
          <p className="text-sm text-gray-600 text-center mb-6">
            Heslo pro správu BNI Plzeň. Po uložení budeš rovnou přihlášený(á).
          </p>
          <SetPasswordForm token={token} />
        </div>
      </div>
    </div>
  );
}
