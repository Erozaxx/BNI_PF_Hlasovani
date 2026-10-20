import type { Metadata } from "next";

/**
 * iter-038 (T-003c, arch 9.3): ranní odkaz správce docházky. Bez navigace
 * aplikace (odkaz nevytváří session), bez indexace. `Cache-Control: no-store`
 * a `Referrer-Policy: no-referrer` nastavuje middleware.
 */
export const metadata: Metadata = {
  title: "BNI Plzeň · Docházka",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function AttendanceLinkLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>;
}
