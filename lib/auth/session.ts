import { cache } from "react";
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { getMemberAuthState } from "@/lib/db/queries/members";
import { checkSession, type AuthMethod } from "@/lib/auth/session-check";
import { permissionsFor, type Permission } from "@/lib/auth/permissions";
import { EMAIL_LINK_SESSION_HOURS } from "@/lib/auth/login-link-core";

/**
 * Session payload stored in the encrypted iron-session cookie.
 *
 * iter-032 (arch 7.1): `sv` = `member.session_version` v době přihlášení.
 * Cookie z doby před nasazením ho nemá a čte se jako 0 (DB výchozí 0),
 * nikdo se kvůli nasazení neodhlásí.
 */
export interface SessionData {
  memberId: string;
  managementRole: "admin" | "moderator" | null;
  authMethod: AuthMethod;
  name: string;
  sv?: number;
  /**
   * iter-037 (arch 6.3): vypočtená pole, `getSession()` je doplní z DB při
   * každém požadavku. `createSession` je do cookie NEUKLÁDÁ (test 9e), práva
   * se tak po změně funkcí projeví hned, bez nového přihlášení.
   */
  permissions: Permission[];
  functionNames: string[];
}

/**
 * Vstup `createSession`: verze jde zvlášť jako povinný parametr (F13).
 * Vypočtená pole (`permissions`, `functionNames`) do cookie nepatří.
 */
export type NewSession = Omit<SessionData, "sv" | "permissions" | "functionNames">;

/** Cookie name for the session. */
const COOKIE_NAME = "bni_session";

/**
 * Build iron-session options with the appropriate TTL.
 */
function buildSessionOptions(
  ttlSeconds: number = 7 * 24 * 3600
): SessionOptions {
  return {
    password: process.env.SESSION_SECRET!,
    cookieName: COOKIE_NAME,
    ttl: ttlSeconds,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

/** TTL constants in seconds. */
export const SESSION_TTL = {
  magic_link: 7 * 24 * 3600, // 7 days
  password: 8 * 3600, // 8 hours
  email_link: EMAIL_LINK_SESSION_HOURS * 3600, // 12 hours (iter-032, K7)
} as const;

/**
 * Surová cookie bez kontroly proti DB. Jen pro `createSession`,
 * `destroySession` a `getSession` samotnou (7.2).
 */
export async function getRawSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, buildSessionOptions());
}

function emptySession(): SessionData {
  return {
    memberId: "",
    managementRole: null,
    authMethod: "magic_link",
    name: "",
    permissions: [],
    functionNames: [],
  };
}

/**
 * Ověřená session, jeden snímek na požadavek (iter-032, arch 7.2, F5).
 *
 * `React.cache` bez argumentů: cookie i řádek DB ze stejné chvíle. Kontrola
 * `checkSession` (verze, role) proti `member`. Neplatnou session vynuluje
 * jen v paměti, nikdy `save()` ani `destroy()` (Server Component cookie
 * zapisovat nesmí). Chyba DB = nepřihlášeno (fail closed).
 *
 * Vrací prostý objekt, ne iron-session (volající jen čtou pole).
 */
export const getSession = cache(async (): Promise<SessionData> => {
  const raw = await getRawSession();
  if (!raw.memberId) return emptySession();

  const snapshot: SessionData = {
    memberId: raw.memberId,
    managementRole: raw.managementRole ?? null,
    authMethod: raw.authMethod,
    name: raw.name,
    sv: raw.sv,
    permissions: [],
    functionNames: [],
  };

  try {
    const row = await getMemberAuthState(snapshot.memberId);
    const result = checkSession(snapshot, row);
    if (!result.valid || !row) return emptySession();
    snapshot.permissions = [
      ...permissionsFor({
        authMethod: snapshot.authMethod,
        managementRole: snapshot.managementRole,
        functions: row.functions,
      }),
    ];
    snapshot.functionNames = row.functions.map((f) => f.name);
  } catch (err) {
    const cls = err instanceof Error ? err.name : typeof err;
    console.error(`[session] auth state check failed memberId=${snapshot.memberId}: ${cls}`);
    return emptySession();
  }

  return snapshot;
});

/**
 * Create a new session for an authenticated user. `sv` je povinné (F13):
 * TypeScript nepustí žádné volání bez verze, jinak by session s verzí > 0
 * hned po přihlášení neplatila (F1).
 */
export async function createSession(data: NewSession, sv: number): Promise<void> {
  const ttl = SESSION_TTL[data.authMethod];

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    buildSessionOptions(ttl)
  );

  session.memberId = data.memberId;
  session.managementRole = data.managementRole;
  session.authMethod = data.authMethod;
  session.name = data.name;
  session.sv = sv;

  await session.save();
}

/**
 * Destroy the current session (logout).
 */
export async function destroySession(): Promise<void> {
  const session = await getRawSession();
  session.destroy();
}
