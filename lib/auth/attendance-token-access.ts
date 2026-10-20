/**
 * iter-038 (T-003c, arch 9.3, test 6): rozhodnutí o přístupu přes ranní odkaz
 * správce docházky `/d/[token]`. Volá ji jen `verifyAttendanceToken`
 * (lib/auth/attendance-magic.ts) po jednom SELECTu, samotné rozhodování je tady
 * jako čistá funkce.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/server ani resend.
 * Bezpečné pro scripts/test-iter-038-attendance.ts (tsx bez DATABASE_URL).
 *
 * Pořadí: neaktivní člen, odebraný příznak nebo `revoked_at` = `revoked`
 * (bez důvodu, deaktivace je citlivá); odkaz, který nikdy neodešel
 * (`sent_at IS NULL`), je pro svět `invalid` (nikdo ho nedostal); pak vypršení
 * nebo jiný den = `expired`.
 */

export type AttendanceTokenStatus = "ok" | "expired" | "revoked" | "invalid";

export interface AttendanceTokenLink {
  id: string;
  memberId: string;
  /** Den odkazu (`YYYY-MM-DD`). */
  attendanceDate: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  sentAt: Date | null;
  /** Člen je aktivní k dnešku (`memberActiveSql`). */
  memberActive: boolean;
  /** Člen má příznak Správce docházky. */
  isManager: boolean;
}

export type AttendanceTokenDecision =
  | { status: "ok"; linkId: string; memberId: string; date: string }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "invalid" };

export function decideAttendanceTokenAccess(i: {
  now: Date;
  /** Dnešek v Praze (`YYYY-MM-DD`). */
  today: string;
  link: AttendanceTokenLink;
}): AttendanceTokenDecision {
  const { now, today, link } = i;
  if (!link.memberActive || !link.isManager || link.revokedAt !== null) {
    return { status: "revoked" };
  }
  if (link.sentAt === null) return { status: "invalid" };
  if (link.expiresAt === null || link.expiresAt.getTime() <= now.getTime()) {
    return { status: "expired" };
  }
  if (link.attendanceDate !== today) return { status: "expired" };
  return { status: "ok", linkId: link.id, memberId: link.memberId, date: link.attendanceDate };
}
