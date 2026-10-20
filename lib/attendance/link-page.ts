/**
 * iter-038 (T-003c, arch 9.4, gate sekce 5): texty stránky a API ranního odkazu
 * `/d/[token]`. Doslova z gate, bez dlouhé pomlčky. Odpověď je stejná pro
 * každou příčinu daného stavu (žádné vyjmenovávání důvodů, deaktivace je
 * citlivá).
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 */

export type LinkProblem = "expired" | "revoked" | "invalid" | "rate_limited";

export const LINK_TEXTS = {
  expired:
    "Odkaz na zápis docházky už neplatí. Platí 12 hodin od ranního mailu. Docházku najdeš i po přihlášení do aplikace v menu Docházka.",
  expiredButton: "Přihlásit se",
  revoked: "Tenhle odkaz už nefunguje.",
  invalid: "Odkaz není platný. Zkontroluj, že jsi ho zkopíroval(a) celý.",
} as const;

/** Text pro daný stav; blokace throttlem se tváří jako neplatný odkaz. */
export function linkProblemText(problem: LinkProblem): string {
  if (problem === "expired") return LINK_TEXTS.expired;
  if (problem === "revoked") return LINK_TEXTS.revoked;
  return LINK_TEXTS.invalid;
}

/** HTTP stav API pro daný stav: blokace 429, ostatní 401. */
export function linkProblemStatus(problem: LinkProblem): number {
  return problem === "rate_limited" ? 429 : 401;
}
