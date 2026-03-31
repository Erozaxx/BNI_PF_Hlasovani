import { NextRequest, NextResponse } from "next/server";
import { verifyMagicToken } from "@/lib/auth/magic";

/**
 * GET /api/auth/magic?token=<rawToken>
 *
 * Magic link verification endpoint.
 * - Valid token → create session → redirect /dashboard
 * - Previous token (graceful fallback) → send new link → redirect /login?info=new_link_sent
 * - Invalid/expired/used → redirect /login?error=invalid_token
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(
      new URL("/login?error=invalid_token", request.url)
    );
  }

  try {
    const result = await verifyMagicToken(token);

    switch (result.status) {
      case "ok":
        return NextResponse.redirect(new URL("/dashboard", request.url));

      case "new_link_sent":
        return NextResponse.redirect(
          new URL("/login?info=new_link_sent", request.url)
        );

      case "invalid":
        return NextResponse.redirect(
          new URL("/login?error=invalid_token", request.url)
        );
    }
  } catch (error) {
    console.error("[MAGIC LINK ERROR]", error);
    return NextResponse.redirect(
      new URL("/login?error=invalid_token", request.url)
    );
  }
}
