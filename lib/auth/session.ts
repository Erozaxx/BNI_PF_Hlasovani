import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

/**
 * Session payload stored in the encrypted iron-session cookie.
 */
export interface SessionData {
  memberId: string;
  managementRole: "admin" | "moderator" | null;
  authMethod: "magic_link" | "password";
  name: string;
}

/** Cookie name for the session. */
const COOKIE_NAME = "bni_session";

/**
 * Build iron-session options with the appropriate TTL.
 * - magic_link session: 7 days
 * - password session: 8 hours
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
} as const;

/**
 * Get the current session from the cookie store.
 * Returns the iron-session object (may be empty if not logged in).
 */
export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, buildSessionOptions());
}

/**
 * Create a new session for an authenticated user.
 */
export async function createSession(data: SessionData): Promise<void> {
  const ttl =
    data.authMethod === "password"
      ? SESSION_TTL.password
      : SESSION_TTL.magic_link;

  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    buildSessionOptions(ttl)
  );

  session.memberId = data.memberId;
  session.managementRole = data.managementRole;
  session.authMethod = data.authMethod;
  session.name = data.name;

  await session.save();
}

/**
 * Destroy the current session (logout).
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(
    cookieStore,
    buildSessionOptions()
  );
  session.destroy();
}
