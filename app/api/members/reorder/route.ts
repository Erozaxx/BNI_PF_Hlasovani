import { NextRequest, NextResponse } from "next/server";
import { requirePermissionForRoute } from "@/lib/auth/guards";
import { getMemberCount, reorderMembers } from "@/lib/db/queries/members";

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
 * Auth: právo `members.manage` (`requirePermissionForRoute` níž), middleware
 * hlídá jen existenci session.
 */
export async function POST(req: NextRequest) {
  const authz = await requirePermissionForRoute("members.manage");
  if ("response" in authz) return authz.response;

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

  // Completeness guard (M-1): the list must cover ALL members. A partial list
  // would leave the missing rows with their old display_order, producing
  // collisions / gaps in the index. Combined with the no-duplicates check
  // above, length equality guarantees a full permutation.
  const memberCount = await getMemberCount();
  if (orderedIds.length !== memberCount) {
    return err(400, "orderedIds must contain every member exactly once");
  }

  try {
    await reorderMembers(orderedIds as string[]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[members/reorder] error:", error);
    return err(500, "Failed to reorder members");
  }
}
