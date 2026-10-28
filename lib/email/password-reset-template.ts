/**
 * iter-043 (arch T-001b bod 7, gate Z1): obsah mailu „odkaz na nové heslo".
 * Čistý modul bez DB a resend. Tyká jako mail pro heslo od admina.
 * URL je jen v `text` u tlačítka, nikdy ve větách.
 */
export interface PasswordResetEmailContent {
  subject: string;
  lines: string[];
  footer: string[];
  text: string;
  buttonLabel: string;
}

export function passwordResetEmailContent(opts: {
  name: string;
  to: string;
  url: string;
  appUrl: string;
}): PasswordResetEmailContent {
  const loginUrl = `${opts.appUrl.replace(/\/+$/, "")}/login`;
  const lines = [
    `Ahoj ${opts.name},`,
    "na přihlášení do aplikace BNI Plzeň někdo požádal o nové heslo k tvému účtu. Jestli jsi to byl(a) ty, nastav si ho odkazem níž.",
    "Odkaz platí 24 hodin a jde použít jen jednou. Po uložení nového hesla budeš rovnou přihlášený(á), na ostatních zařízeních se odhlásíš.",
    `Tvůj přihlašovací e-mail je ${opts.to}. Přihlášení: ${loginUrl}`,
  ];
  const footer = ["Pokud jsi o nové heslo nežádal(a), mail ignoruj. Tvoje současné heslo platí dál."];
  const buttonLabel = "Nastavit nové heslo";
  const text = [...lines, "", `${buttonLabel}: ${opts.url}`, "", ...footer].join("\n");
  return { subject: "BNI Plzeň: odkaz na nové heslo", lines, footer, text, buttonLabel };
}
