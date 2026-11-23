import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * iter-049 (review T-006 M-1): sonda platnosti přihlášení pro editor klientských
 * situací. Klient ji volá jen po výjimce z akce, aby rozlišil vypršelé přihlášení
 * od výpadku sítě. Bez session vrací 401 JSON (middleware ji nepřesměruje na
 * /login, LL-005), s platnou 200. Žádná data, žádná identita.
 */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) {
    return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
