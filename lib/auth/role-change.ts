/**
 * iter-032 (arch T-001, sekce 4.3 krok 3) — čisté rozhodnutí o změně role.
 *
 * Slouží jen pro srozumitelnou hlášku. Správnost drží jeden SQL příkaz
 * s pojistkami (`setMemberRoleGuarded`, CTE s FOR UPDATE).
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 */

export type RoleChoice = "none" | "moderator" | "admin";
export type DbRole = "admin" | "moderator" | null;

export interface RoleChangeTarget {
  id: string;
  managementRole: string | null;
  email: string | null;
}

export type RoleChangeDecision =
  | { ok: true; kind: "promote" | "switch" | "demote" | "noop"; oldRole: DbRole; newRole: DbRole }
  | { ok: false; error: "not-found" | "self" | "last-admin" | "no-email" };

export function roleChoiceToDb(choice: RoleChoice): DbRole {
  return choice === "none" ? null : choice;
}

function toDbRole(value: string | null): DbRole {
  return value === "admin" || value === "moderator" ? value : null;
}

export function decideRoleChange(input: {
  actorId: string;
  target: RoleChangeTarget | null;
  newRole: RoleChoice;
  /**
   * Počet aktivních účtů se správou členů (role admin nebo funkce s
   * `members.manage`) VČETNĚ cíle, když o správu členů přijde. T-003b:
   * volající (`setMemberRoleAction`) počítá `ostatní + 1`, když cíl správu
   * členů ztrácí, jinak aspoň 2, takže `<= 1` blokuje právě poslední účet.
   */
  adminCount: number;
}): RoleChangeDecision {
  const { actorId, target, adminCount } = input;
  if (!target) return { ok: false, error: "not-found" };
  if (target.id === actorId) return { ok: false, error: "self" };

  const oldRole = toDbRole(target.managementRole);
  const newRole = roleChoiceToDb(input.newRole);

  if (oldRole === newRole) return { ok: true, kind: "noop", oldRole, newRole };

  // Admin přichází o roli admina (demote i switch na moderátora).
  if (oldRole === "admin" && adminCount <= 1) {
    return { ok: false, error: "last-admin" };
  }

  if (oldRole === null) {
    if (!target.email || target.email.trim() === "") {
      return { ok: false, error: "no-email" };
    }
    return { ok: true, kind: "promote", oldRole, newRole };
  }

  if (newRole === null) return { ok: true, kind: "demote", oldRole, newRole };
  return { ok: true, kind: "switch", oldRole, newRole };
}

/** Česká hláška pro chybu rozhodnutí. */
export function roleChangeErrorText(
  error: "not-found" | "self" | "last-admin" | "no-email"
): string {
  switch (error) {
    case "not-found":
      return "Člen nebyl nalezen.";
    case "self":
      return "Vlastní roli měnit nejde.";
    case "last-admin":
      return "Posledního aktivního admina sesadit nejde.";
    case "no-email":
      return "Člen nemá e-mail. Nejdřív mu ho doplň, odkaz pro nastavení hesla jde na e-mail.";
  }
}
