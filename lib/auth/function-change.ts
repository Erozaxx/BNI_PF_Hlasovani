/**
 * iter-037 (T-003b): čisté rozhodnutí o změně funkce člena.
 *
 * Slouží jen pro srozumitelnou hlášku. Správnost drží jeden SQL příkaz
 * s pojistkami (`setMemberFunctionGuarded`, CTE s FOR UPDATE). Člen má
 * nejvýš jednu funkci (změna zadání 19. 10.).
 *
 * Heslo: držitel funkce BEZ role má heslo (`hasPasswordAccess`). Při první
 * funkci člen bez hesla dostane zámkový hash a odkaz „nastav si heslo“, při
 * odebrání poslední role i funkce se heslo smaže a zvýší se `session_version`.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 */

export interface FunctionChangeTarget {
  id: string;
  managementRole: string | null;
  email: string | null;
  /** Funkce, kterou člen má teď, nebo `null`. */
  currentFunctionId: string | null;
  /** Aktivní člen s heslem a právem správy členů (admin, nebo funkce s `members.manage`). */
  isActiveManager: boolean;
  /** Cíl má dnes funkci s `members.manage` (při změně se může ztratit). */
  hasManageFunction: boolean;
}

export type FunctionChangeError =
  | "not-found"
  | "function-not-found"
  | "self"
  | "no-email"
  | "last-manager";

export type FunctionChangeDecision =
  | {
      ok: true;
      kind: "noop" | "assign" | "change" | "remove";
      /** Člen bez role dostane po odebrání funkce zrušené heslo (a `session_version + 1`). */
      clearsPassword: boolean;
    }
  | { ok: false; error: FunctionChangeError };

export function decideFunctionChange(input: {
  actorId: string;
  /** Volající má roli admin: jen ten smí měnit vlastní funkci. */
  actorIsAdmin: boolean;
  target: FunctionChangeTarget | null;
  /** Cílová funkce, `null` = odebrat. */
  newFunctionId: string | null;
  /** Cílová funkce existuje (kontrola nahoře, `null` = odebrat). */
  newFunctionExists: boolean;
  /** Cílová funkce má právo `members.manage`. */
  newFunctionGivesMembersManage: boolean;
  /** Aktivní účty se správou členů kromě cíle. */
  otherActiveManagers: number;
}): FunctionChangeDecision {
  const { target, newFunctionId } = input;
  if (!target) return { ok: false, error: "not-found" };
  if (newFunctionId !== null && !input.newFunctionExists) {
    return { ok: false, error: "function-not-found" };
  }
  if (target.id === input.actorId && !input.actorIsAdmin) {
    return { ok: false, error: "self" };
  }

  if (target.currentFunctionId === newFunctionId) {
    return { ok: true, kind: "noop", clearsPassword: false };
  }

  const had = target.currentFunctionId !== null;
  const has = newFunctionId !== null;

  // Přihlášení heslem potřebuje e-mail (přihlašovací jméno).
  if (has && (!target.email || target.email.trim() === "")) {
    return { ok: false, error: "no-email" };
  }

  // Pojistka posledního účtu: cíl dnes správu členů má, po změně by ji neměl
  // (nad rámec role admin) a nikdo jiný ji nemá.
  const staysManager = target.managementRole === "admin" || input.newFunctionGivesMembersManage;
  if (target.isActiveManager && !staysManager && input.otherActiveManagers === 0) {
    return { ok: false, error: "last-manager" };
  }

  if (!had && has) return { ok: true, kind: "assign", clearsPassword: false };
  if (had && has) return { ok: true, kind: "change", clearsPassword: false };
  return { ok: true, kind: "remove", clearsPassword: target.managementRole === null };
}

export function functionChangeErrorText(error: FunctionChangeError): string {
  switch (error) {
    case "not-found":
      return "Člen nebyl nalezen.";
    case "function-not-found":
      return "Funkce mezitím zmizela, obnov stránku.";
    case "self":
      return "Vlastní funkci měnit nejde.";
    case "no-email":
      return "Člen nemá e-mail. Nejdřív mu ho doplň, odkaz pro heslo jde na e-mail.";
    case "last-manager":
      return "Posledního aktivního admina sesadit nejde.";
  }
}
