/**
 * iter-037 (rozhodnutí Toma 19. 10., M-1): účet s rolí admin smí měnit jen
 * admin. Tohle je srozumitelná hláška na úrovni akce, správnost drží SQL
 * podmínka `actorMayChangeSql` v každém zápisu (lib/db/queries/member-active.ts).
 *
 * NENÍ čistý modul (čte člena z DB). Čisté pravidlo je v permissions.ts
 * (`isAdminSession`, `mayChangeMember`).
 */
import { getMemberById } from "@/lib/db/queries/members";
import {
  ADMIN_ONLY_MESSAGE,
  isAdminSession,
  mayChangeMember,
} from "@/lib/auth/permissions";
import type { AuthMethod } from "@/lib/auth/session-check";

/**
 * `null` = volající smí cíl měnit, jinak česká hláška. Neexistující cíl vrací
 * `null` (akce si to ohlásí sama po svém načtení).
 */
export async function adminTargetError(
  actor: { authMethod?: AuthMethod; managementRole?: string | null },
  targetId: string
): Promise<string | null> {
  if (isAdminSession(actor)) return null;
  const target = await getMemberById(targetId);
  if (!target) return null;
  return mayChangeMember(false, target.managementRole) ? null : ADMIN_ONLY_MESSAGE;
}
