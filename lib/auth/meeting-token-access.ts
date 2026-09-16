/**
 * iter-028 (T-006, arch 4.5, 8.1, D4 C) — rozhodnutí o přístupu přes
 * hlasovací token, sdílené hlavní cestou (odkaz nalezený v
 * `meeting_member_link`) i aliasem z připomínky (nalezený v
 * `meeting_member_reminder`). Volá ji jen `verifyMeetingToken`
 * (lib/auth/meeting-magic.ts) po dvou různých SELECTech — samotné
 * rozhodování je tady, jako čistá funkce.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/server ani resend
 * — `import type` z lib/auth/meeting-magic je typový odkaz, tsc ho při
 * isolatedModules zcela odstraní. Bezpečné pro
 * scripts/test-meeting-token.ts (tsx bez DATABASE_URL).
 *
 * Pořadí (4.5, krok 3): `link_token_hash !== l.token_hash` (jen u aliasu z
 * připomínky — přegenerování zneplatní i alias, N-6 se tím nerozšiřuje) →
 * invalid; `revoked_at` → revoked; `expires_at < now` → expired; jinak ok
 * s `linkId`/`memberId`/`meetingId` Z ŘÁDKU ODKAZU (`link`), nikdy z
 * připomínky — přesně ten řádek, který vidí i hlavní cesta.
 *
 * Hlavní cesta (`source: { kind: "link" }`) volá tuhle funkci se stejnými
 * daty, která by jinak vyhodnocovala inline — nejde o extra dotaz (čistá
 * funkce, žádné I/O), jen o jedno místo pravdy pro revoked/expired/ok, které
 * V3 ověřuje beze změny chování.
 */
import type { VerifyMeetingTokenResult } from "./meeting-magic";

export type TokenSource =
  | { kind: "link" }
  | { kind: "reminder"; linkTokenHash: string | null };

export interface MeetingTokenAccessLink {
  id: string;
  meetingId: string;
  memberId: string;
  tokenHash: string;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

export function decideMeetingTokenAccess(i: {
  source: TokenSource;
  now: Date;
  link: MeetingTokenAccessLink;
}): VerifyMeetingTokenResult {
  const { source, now, link } = i;

  if (source.kind === "reminder" && source.linkTokenHash !== link.tokenHash) {
    return { status: "invalid" };
  }

  if (link.revokedAt !== null) {
    return { status: "revoked" };
  }

  if (link.expiresAt !== null && link.expiresAt < now) {
    return { status: "expired" };
  }

  return {
    status: "ok",
    memberId: link.memberId,
    meetingId: link.meetingId,
    linkId: link.id,
  };
}
