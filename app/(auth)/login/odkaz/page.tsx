import type { Metadata } from "next";
import { ConsumeLoginLinkButton } from "./ConsumeLoginLinkButton";

/**
 * iter-032 (arch 6.2): mezistránka odkazu člena. GET jen vykreslí tlačítko,
 * nic nespotřebuje ani nečte z DB (skenery pošty odkazy otevírají předem).
 * Odkaz se spotřebuje až POSTem přes consumeLoginLinkAction.
 * Middleware: veřejná cesta, Cache-Control: no-store (N-c).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Přihlášení do BNI Plzeň",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function LoginLinkPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const params = await searchParams;
  const token = typeof params.t === "string" ? params.t : "";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-card border border-gray-200 p-6 sm:p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Přihlásit se do BNI Plzeň</h1>
          <ConsumeLoginLinkButton token={token} />
        </div>
      </div>
    </div>
  );
}
