// SECURITY BOUNDARY
// This layout segment is isolated from the main application (app/(app)/).
// Rules:
//   1. No <Link> or <a> tags pointing to /(app)/ routes (e.g. /dashboard, /events, /admin).
//   2. No imports from components shared with the main app that render navigation.
//   3. Iron-session is NOT required — external participants access /e/ without a session.
//   4. A BNI member with a valid iron-session may also access /e/ — this is intentional.
//      They retain access to /(app)/ routes via direct URL; no cross-navigation from /e/.
// See: security_fixes_spec_iter-007.md, S-02, S-04.

import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
