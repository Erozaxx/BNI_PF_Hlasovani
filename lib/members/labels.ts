/**
 * iter-037 (T-003c): čisté pomocníky pro UI správy členů. Bez DB, bez Reactu,
 * ať jdou hlídat testem bez databáze.
 */
import { formatCzDate } from "@/lib/members/activity";

export const ROLE_LABELS = {
  admin: "Admin",
  moderator: "Moderátor",
} as const;

export function roleLabel(role: string | null | undefined): string | null {
  if (role === "admin") return ROLE_LABELS.admin;
  if (role === "moderator") return ROLE_LABELS.moderator;
  return null;
}

/**
 * Text v záhlaví za jménem: funkce člena a role. Prezident s rolí admin je
 * „Prezident, admin“, jen admin „admin“, jen moderátor „moderátor“, běžný
 * člen bez role `null` (nic se nezobrazí). Přihlášení odkazem z mailu dává jen
 * práva člena, proto se u něj nezobrazí nic, ani funkce z DB (QA nález 1).
 */
export function sessionHeaderLabel(input: {
  managementRole: string | null | undefined;
  functionNames?: readonly string[];
  authMethod?: string;
}): string | null {
  if (input.authMethod !== undefined && input.authMethod !== "password") return null;
  const parts: string[] = [...(input.functionNames ?? [])];
  if (input.managementRole === "admin") parts.push("admin");
  else if (input.managementRole === "moderator") parts.push("moderátor");
  return parts.length > 0 ? parts.join(", ") : null;
}

export type PersonalLinkState =
  | { kind: "valid"; label: string }
  | { kind: "expired"; label: string }
  | { kind: "revoked"; label: string }
  | { kind: "none"; label: string };

/**
 * Stav osobního odkazu pro admina (gate, sekce 5): „Platný do 24. 10.“,
 * „Zneplatněný“, „Žádný“. Po „Zneplatnit odkaz“ je hash `NULL` a
 * `token_used = true`. Odkaz s uplynulou platností (hash je, ale vypršel)
 * dostane vlastní štítek „Vypršel“, ať se nevydává za platný.
 */
export function personalLinkState(
  m: {
    magicTokenHash: string | null;
    tokenExpiresAt: Date | string | null;
    tokenUsed: boolean;
  },
  now: Date = new Date()
): PersonalLinkState {
  if (m.tokenUsed) return { kind: "revoked", label: "Zneplatněný" };
  if (!m.magicTokenHash) return { kind: "none", label: "Žádný" };
  const exp = m.tokenExpiresAt ? new Date(m.tokenExpiresAt) : null;
  if (exp && exp.getTime() <= now.getTime()) return { kind: "expired", label: "Vypršel" };
  if (!exp) return { kind: "valid", label: "Platný" };
  const day = exp.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const [d, mo] = formatCzDate(day).split(". ");
  return { kind: "valid", label: `Platný do ${d}. ${mo}.` };
}
