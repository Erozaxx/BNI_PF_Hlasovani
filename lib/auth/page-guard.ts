import { redirect } from "next/navigation";
import { getSession, type SessionData } from "@/lib/auth/session";
import { can, canAny, hasPasswordSession, type Permission } from "@/lib/auth/permissions";

/**
 * iter-032 (arch 7.3, K10 A+, F6): ochrana stránky v `app/(app)`.
 *
 * Layout se při měkké navigaci znovu nevykresluje, stránka ano. Proto ji
 * volá každá `page.tsx` pod `app/(app)` (statický test v
 * scripts/test-iter-032-access.ts hlídá, že žádná nechybí).
 *
 * - bez ověřené session -> `redirect("/login")`
 * - chybí právo -> `redirect(denyTo)`, výchozí `/dashboard`
 *
 * iter-037 (arch 6.3): volba `role` zmizela, stránka se ptá na konkrétní
 * právo (`permission`), na jedno z více (`anyOf`) nebo chce session s heslem
 * (`passwordSession`).
 *
 * Díky `React.cache` v `getSession()` je to v rámci požadavku bez dalšího
 * dotazu do DB.
 */
export async function requirePageSession(opts?: {
  permission?: Permission;
  anyOf?: Permission[];
  passwordSession?: boolean;
  denyTo?: string;
}): Promise<SessionData> {
  const session = await getSession();
  if (!session.memberId) redirect("/login");

  const deny = opts?.denyTo ?? "/dashboard";
  if (opts?.permission && !can(session, opts.permission)) redirect(deny);
  if (opts?.anyOf && !canAny(session, opts.anyOf)) redirect(deny);
  // T-003b: session s heslem a přístupem = role NEBO funkce.
  if (opts?.passwordSession && !hasPasswordSession(session)) {
    redirect(deny);
  }

  return session;
}
