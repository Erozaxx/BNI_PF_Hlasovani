// SECURITY BOUNDARY — S-002
// Timer pages are token-authenticated via URL (control_token / view_token).
// Referrer-Policy: no-referrer prevents token leakage via Referer header to external origins.
// No iron-session required — tokens in the URL are the authentication mechanism.

import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  // S-002: prevent control_token from leaking in Referer header to external sites
  other: { referrer: "no-referrer" },
};

export default function TimerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
