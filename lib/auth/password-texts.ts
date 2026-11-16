/**
 * iter-046 (arch 11, gate změna 6): texty přihlášení heslem a vlastního hesla.
 *
 * Čistý modul bez importů (bezpečný i pro klientské komponenty, `login-link-core`
 * tahá `node:crypto`). Bez em dash, bez jmen (test 35b).
 */

export const LOGIN_TEXTS = {
  /** Pod polem hesla v kroku 2 přihlášení. Krok vidí i člen se zámkem po resetu. */
  passwordHint: "Heslo nemáš nebo jsi ho zapomněl(a)? Přihlas se odkazem níž.",
} as const;

export const PASSWORD_TEXTS = {
  setTitle: "Nastavit heslo",
  setIntro: "Pak se přihlásíš e-mailem a heslem. Odkaz z mailu funguje dál.",
  changeTitle: "Změna hesla",
  viaLink: "Heslo si nastavíš odkazem z mailu. Když odkaz nemáš, nový ti pošle někdo z vedení.",
  /** Hláška akce v režimu via-link (vedení bez hesla). */
  viaLinkError: "Heslo si nastavíš odkazem z mailu. Nový ti pošle někdo z vedení.",
  forgotten: "Když heslo zapomeneš, napiš někomu z vedení. Pošle ti odkaz pro nové.",
  dashboardCard: "Nastav si heslo a příště se přihlásíš bez odkazu z mailu.",
  saved: "Heslo je uložené.",
  changed: "Heslo je změněné.",
  setButton: "Nastavit heslo",
  menuSet: "Nastavit heslo",
  menuChange: "Heslo",
  // Seznam pro reset (`/admin/members`, gate změna 3).
  listTitle: "Hesla členů",
  listIntro:
    "Členovi, který zapomněl heslo, tady pošleš odkaz pro nové. Jeho dosavadní heslo hned přestane platit a odhlásí se.",
  noEmailBadge: "bez e-mailu",
  noEmailError: "Člen nemá e-mail. Nejdřív mu ho doplň.",
  confirmReset: (name: string) =>
    `Poslat ${name} odkaz pro nové heslo? Zneplatní se i jeho osobní odkaz, nový přijde s další rozesílkou.`,
} as const;

/** Kontrolní mail po nastavení nebo změně hesla (gate změna 2, R6). */
export const PASSWORD_NOTICE_TEXTS = {
  subject: "BNI Plzeň: heslo je nastavené",
  lines: [
    "K tvému účtu v aplikaci si právě někdo nastavil heslo. Když jsi to byl(a) ty, nic nedělej. Když ne, napiš hned někomu z vedení, heslo ti zruší.",
  ],
} as const;
