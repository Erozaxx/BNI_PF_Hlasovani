import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { reorderMembers } from "@/lib/db/queries/members";

function err(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/members/reorder
 *
 * Body: { orderedIds: string[] } — member IDs in the desired display order.
 * Persists display_order = index for each member (sequential UPDATEs, no
 * transaction — LL-003).
 *
 * Auth: admin or moderator session required (management-only, behind session
 * guard in middleware).
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";
  if (!isManagement) {
    return err(401, "Unauthorized");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return err(400, "Invalid JSON body");
  }

  const orderedIds = (body as { orderedIds?: unknown })?.orderedIds;
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.some((x) => typeof x !== "string" || x.length === 0)
  ) {
    return err(400, "orderedIds must be a non-empty array of strings");
  }

  // Guard against duplicate ids (would otherwise produce ambiguous ordering)
  if (new Set(orderedIds).size !== orderedIds.length) {
    return err(400, "orderedIds contains duplicates");
  }

  try {
    await reorderMembers(orderedIds as string[]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[members/reorder] error:", error);
    return err(500, "Failed to reorder members");
  }
}
