import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import type { SessionData } from "@/lib/auth/session";

/**
 * Session options for middleware (duplicated from session.ts because
 * middleware runs in Edge runtime and cannot import from lib/auth/session.ts
 * which uses next/headers cookies()).
 */
const sessionOptions = {
  password: process.env.SESSION_SECRET!,
  cookieName: "bni_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  },
};

/** Exact paths that do not require authentication (no prefix matching). */
const PUBLIC_PATHS_EXACT = new Set([
  "/login",
  // iter-032 (arch 6.2, 7.5, LL-005): mezistránky jednorázových odkazů.
  // Přesná shoda platí i pro POST Server Action na téže cestě. Záměrně i
  // tady, i když je větev TOKEN_LINK_PATHS níž chytí dřív (review F-08):
  // seznam veřejných cest má být úplný sám o sobě (LL-005, test 9b).
  "/login/odkaz",
  "/login/heslo",
  "/api/auth/magic",
  "/api/cron/close-voting",
  "/api/cron/renew-tokens",
  "/api/report",
]);

/** Veřejné stránky s jednorázovým tokenem v `?t=` (iter-032). */
const TOKEN_LINK_PATHS = new Set(["/login/odkaz", "/login/heslo"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // iter-032 (N-c): stránky s tokenem v URL se necachují a neposílají Referer.
  if (TOKEN_LINK_PATHS.has(pathname)) {
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  // Allow public paths (exact match only — no prefix matching)
  if (PUBLIC_PATHS_EXACT.has(pathname)) {
    return NextResponse.next();
  }

  // Allow root page (redirects to /login in page.tsx)
  if (pathname === "/") {
    return NextResponse.next();
  }

  // Allow event voting paths (external participants without iron-session)
  if (pathname.startsWith("/e/")) {
    return NextResponse.next();
  }

  // Allow per-meeting magic link paths (members access via token, no iron-session)
  if (pathname.startsWith("/m/") || pathname.startsWith("/api/m/")) {
    return NextResponse.next();
  }

  // Allow timer view pages (public read-only display) — LL-005
  if (pathname.startsWith("/t/")) {
    return NextResponse.next();
  }

  // Allow timer API endpoints (state polling + control) — LL-005
  // Control endpoint (/api/t/[token]/control) is protected by control_token bearer auth in route handler
  if (pathname.startsWith("/api/t/")) {
    return NextResponse.next();
  }

  // Allow interview fill-form magic link paths (leader access via scoped
  // token, no iron-session) — LL-005 (iter-020, T-008)
  if (pathname.startsWith("/i/") || pathname.startsWith("/api/i/")) {
    return NextResponse.next();
  }

  // Public info pages about chapter rules (no session, static) — LL-005 (iter-029)
  // Exact "/pravidla" or anything under "/pravidla/" (incl. /pravidla/zdroje/*.pdf,
  // logo and OG images). NOT "/pravidlaX", NOT "/pravidla-x", NOT "/api/...".
  if (pathname === "/pravidla" || pathname.startsWith("/pravidla/")) {
    return NextResponse.next();
  }

  // Get session from cookie
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  // Not authenticated → redirect to /login
  if (!session.memberId) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only paths: /admin/*
  if (pathname.startsWith("/admin")) {
    if (session.managementRole !== "admin") {
      // Redirect non-admins to dashboard
      const dashboardUrl = new URL("/dashboard", request.url);
      return NextResponse.redirect(dashboardUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public).*)",
  ],
};
