import { NextResponse } from "next/server";
import { requirePermissionForRoute } from "@/lib/auth/guards";
import { getExportData } from "@/lib/db/queries/client-situations";
import { buildSituaceJson, serializeForHtml } from "@/lib/situations/export";

export const dynamic = "force-dynamic";

/**
 * iter-049 (arch 8.1): `situace.json` pro build mapy. Jen `situations.manage`
 * (bez session 401, bez práva 403). Serializace přes `serializeForHtml`, text
 * člena nesmí v `<script type="application/json">` nic otevřít ani zavřít (R13).
 */
export async function GET() {
  const authz = await requirePermissionForRoute("situations.manage", { splitStatus: true });
  if ("response" in authz) return authz.response;

  const data = await getExportData();
  const body = serializeForHtml(buildSituaceJson(data, new Date()));
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="situace.json"',
      "Cache-Control": "no-store",
    },
  });
}
