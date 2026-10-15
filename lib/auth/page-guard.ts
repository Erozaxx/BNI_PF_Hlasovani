import { redirect } from "next/navigation";
import { getSession, type SessionData } from "@/lib/auth/session";

/**
 * iter-032 (arch 7.3, K10 A+, F6): ochrana stránky v `app/(app)`.
 *
 * Layout se při měkké navigaci znovu nevykresluje, stránka ano. Proto ji
 * volá každá `page.tsx` pod `app/(app)` (statický test v
 * scripts/test-iter-032-access.ts hlídá, že žádná nechybí).
 *
 * - bez ověřené session -> `redirect("/login")`
 * - role nesedí -> `redirect(denyTo)`, výchozí `/dashboard`
 *
 * Díky `React.cache` v `getSession()` je to v rámci požadavku bez dalšího
 * dotazu do DB.
 */
export async function requirePageSession(opts?: {
  role?: "management" | "admin";
  denyTo?: string;
}): Promise<SessionData> {
  const session = await getSession();
  if (!session.memberId) redirect("/login");

  const role = session.managementRole;
  if (opts?.role === "admin" && role !== "admin") {
    redirect(opts.denyTo ?? "/dashboard");
  }
  if (opts?.role === "management" && role !== "admin" && role !== "moderator") {
    redirect(opts.denyTo ?? "/dashboard");
  }

  return session;
}
