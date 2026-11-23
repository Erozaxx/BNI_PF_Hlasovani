import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/guards";
import { getExportData } from "@/lib/db/queries/client-situations";
import { buildCsv, csvFilename } from "@/lib/situations/export";

export const dynamic = "force-dynamic";

/**
 * iter-049 (arch 8.3, gate změna 1): CSV tabulka situací pro každého
 * přihlášeného (odkaz i heslo), nepřihlášený 401. Obsahuje jen to, co si
 * přihlášený přečte na `/situace`.
 */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.success) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const data = await getExportData();
  const now = new Date();
  return new NextResponse(buildCsv(data), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
