import { createHash, randomBytes } from "crypto";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { memberActiveSql } from "@/lib/db/queries/member-active";
import { throttleCheck, throttleFail } from "@/lib/auth/throttle";
import { pragueToday } from "@/lib/members/activity";
import { decideAttendanceTokenAccess } from "./attendance-token-access";

/**
 * iter-038 (T-003c, arch 9.3, gate Z4): ranní odkaz `/d/[token]` pro správce
 * docházky. Token je 256 bitů (`randomBytes(32)` v base64url), v DB je jen
 * SHA-256. Odkaz NEVYTVÁŘÍ session: dává jen zápis a čtení docházky svého dne
 * a nikdy `attendance.edit_history`. Ověření je jeden SELECT s JOIN na
 * `member`; neplatný token jde přes DB throttle (jako pohovory, LL-005).
 *
 * Opakované použití do vypršení je povolené (stránka, polling, zápisy).
 * Bez transakcí (LL-003).
 */

function getDb() {
  return drizzle(getSql());
}

/** Prefix cest pro throttle (`attendance-link:<ip>`). */
export const ATTENDANCE_THROTTLE_SCOPE = "attendance-link";

/** Tvar tokenu: 32 bajtů v base64url = 43 znaků. */
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export function generateAttendanceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAttendanceToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function buildAttendanceLinkUrl(appUrl: string, rawToken: string): string {
  return `${appUrl.replace(/\/+$/, "")}/d/${rawToken}`;
}

export type VerifyAttendanceTokenResult =
  | { status: "ok"; linkId: string; memberId: string; memberName: string; date: string }
  | { status: "expired" }
  | { status: "revoked" }
  | { status: "invalid" }
  | { status: "rate_limited" };

function isoSql(col: SQL): SQL {
  return sql`to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null;
}

export async function verifyAttendanceToken(
  rawToken: string,
  ip: string,
  now: Date = new Date()
): Promise<VerifyAttendanceTokenResult> {
  const key = `${ATTENDANCE_THROTTLE_SCOPE}:${ip}`;
  if ((await throttleCheck(key)).blocked) return { status: "rate_limited" };

  if (typeof rawToken !== "string" || !TOKEN_FORMAT.test(rawToken)) {
    await throttleFail(key);
    return { status: "invalid" };
  }

  const result = await getDb().execute<{
    id: string;
    member_id: string;
    member_name: string;
    d: string;
    expires_at: string | null;
    revoked_at: string | null;
    sent_at: string | null;
    active: boolean;
    is_manager: boolean;
  }>(sql`
    SELECT l.id, l.member_id, m.name AS member_name, l.attendance_date::text AS d,
           ${isoSql(sql`l.expires_at`)} AS expires_at,
           ${isoSql(sql`l.revoked_at`)} AS revoked_at,
           ${isoSql(sql`l.sent_at`)} AS sent_at,
           ${memberActiveSql("m")} AS active,
           (m.attendance_manager_since IS NOT NULL) AS is_manager
    FROM attendance_link l
    JOIN member m ON m.id = l.member_id
    WHERE l.token_hash = ${hashAttendanceToken(rawToken)}
    LIMIT 1
  `);
  const row = result.rows[0];
  if (!row) {
    await throttleFail(key);
    return { status: "invalid" };
  }

  const decision = decideAttendanceTokenAccess({
    now,
    today: pragueToday(now),
    link: {
      id: row.id,
      memberId: row.member_id,
      attendanceDate: row.d,
      expiresAt: toDate(row.expires_at),
      revokedAt: toDate(row.revoked_at),
      sentAt: toDate(row.sent_at),
      memberActive: Boolean(row.active),
      isManager: Boolean(row.is_manager),
    },
  });
  if (decision.status !== "ok") return { status: decision.status };

  // `last_used_at` nejvýš jednou za minutu, ne při každém pollu. Best effort.
  try {
    await getDb().execute(sql`
      UPDATE attendance_link SET last_used_at = now()
      WHERE id = ${decision.linkId}::uuid
        AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')
    `);
  } catch {
    // Nezdar zápisu času použití nesmí shodit zápis docházky.
  }
  return {
    status: "ok",
    linkId: decision.linkId,
    memberId: decision.memberId,
    memberName: row.member_name,
    date: decision.date,
  };
}
