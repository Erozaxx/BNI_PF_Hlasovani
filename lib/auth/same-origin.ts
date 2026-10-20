/**
 * iter-038 (T-003b, arch 6.1): kontrola hlavičky `Origin` u POST route se
 * session cookie. Čistá funkce bez importů, aby šla otestovat bez Next.
 *
 * Zápis se přijme jen z požadavku, jehož `Origin` má stejný host jako
 * požadavek. Chybějící `Origin` je zamítnutí (fail closed): fetch z prohlížeče
 * ho u POST posílá vždy. Host se bere z `x-forwarded-host` (Vercel), jinak z
 * `host`; porovnává se bez ohledu na velikost písmen.
 */
export function isSameOrigin(input: {
  origin: string | null | undefined;
  forwardedHost?: string | null;
  host?: string | null;
}): boolean {
  const origin = input.origin;
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }
  const first = (input.forwardedHost ?? "").split(",")[0]?.trim().toLowerCase();
  const requestHost = first || (input.host ?? "").trim().toLowerCase();
  if (!requestHost) return false;
  return originHost === requestHost;
}
