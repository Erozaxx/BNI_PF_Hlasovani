// SECURITY BOUNDARY (iter-029, arch_iter-029_T-001 sekce 4)
// Veřejné info stránky o pravidlech chapteru, bez přihlášení.
// Rules:
//   1. Žádné <Link> ani <a> do aplikace /(app)/ (/dashboard, /meetings, /admin …).
//   2. Pod app/pravidla/ NIKDY nevytvářet route.ts ani server action. Middleware
//      pouští /pravidla a /pravidla/* bez session, takže by byly veřejné.
//   3. Stránky jsou statické (build time): žádné cookies(), headers(), getSession()
//      ani čtení DB. Obsah je v content/pravidla/*.ts.
//   4. Přihlášený člen vidí stejnou stránku, session se tu nečte.

import type { Metadata } from "next";
import { Patrick_Hand } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import "./pravidla.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL;

/**
 * Ruční písmo textů minikomiksů (T-010k), latin-ext kvůli ĚŠČŘŽÝÁÍÉŮÚ.
 * Stáhne se při buildu, na klienta jde z vlastní domény.
 */
const comicFont = Patrick_Hand({
  weight: "400",
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-info-comic",
  fallback: ["Comic Sans MS", "Chalkboard SE", "cursive"],
});

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: { template: "%s · Pravidla chapteru", default: TEMPLATE_TEXTS.hub.title },
  description: TEMPLATE_TEXTS.hub.lead,
  ...(appUrl ? { metadataBase: new URL(appUrl) } : {}),
};

/**
 * Zapne sticky režim jen tam, kde je IntersectionObserver. Běží při
 * parsování HTML, takže sticky nebliká. Atribut jde na obal info stránek
 * (ne na <html> z kořenového layoutu), obal má suppressHydrationWarning.
 */
const SCROLLY_SCRIPT =
  "(function(){var s=document.currentScript;if(s&&s.parentElement&&'IntersectionObserver' in window){s.parentElement.setAttribute('data-scrolly','on');}})();";

export default function PravidlaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`info-root ${comicFont.variable} flex-1 bg-surface text-text-main`}
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: SCROLLY_SCRIPT }} />
      <div className="info-brand-bar" aria-hidden="true" />
      <header className="info-site-header mx-auto w-full max-w-5xl px-4 pt-4 md:px-8">
        <Link
          href="/pravidla"
          className="inline-block rounded focus:outline-none focus-visible:shadow-focus"
        >
          <Image
            src="/pravidla/logo-bni-pilsner-fountains.svg"
            alt="BNI Pilsner Fountains"
            width={121}
            height={36}
            priority
            unoptimized
            className="info-logo h-9 w-auto lg:h-12"
          />
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-16 md:px-8">{children}</main>
    </div>
  );
}
