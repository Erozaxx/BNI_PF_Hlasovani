"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireManagementRole, requireAdmin } from "@/lib/auth/guards";
import {
  createGuest as dbCreateGuest,
  updateGuest as dbUpdateGuest,
  updateGuestCategory as dbUpdateGuestCategory,
  deleteGuest as dbDeleteGuest,
  getGuestById,
} from "@/lib/db/queries/guests";
import { addGuestToMeeting, isGuestInVotingMeeting } from "@/lib/db/queries/meetings";
import {
  createMember as dbCreateMember,
  findMemberByEmailInsensitive,
  findMemberByNameInsensitive,
} from "@/lib/db/queries/members";
import type { ActionResult } from "@/lib/types";

/**
 * Create a new guest. Requires admin or moderator role.
 * Optionally add the guest to a meeting by passing addToMeetingId.
 */
export async function createGuestAction(
  name: string,
  categoryId: string,
  description?: string,
  addToMeetingId?: string,
  company?: string,
  email?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno hosta je povinne." };
  }

  if (!categoryId) {
    return { success: false, error: "Kategorie je povinna." };
  }

  try {
    const guest = await dbCreateGuest({
      name: name.trim(),
      company: company?.trim() || undefined,
      email: email?.trim() || undefined,
      description: description?.trim() || undefined,
      categoryId,
      createdBy: auth.session.memberId,
    });

    if (addToMeetingId) {
      try {
        await addGuestToMeeting(addToMeetingId, guest.id);
      } catch (meetingError) {
        console.error("createGuestAction: addGuestToMeeting error:", meetingError);
        // Non-fatal: guest was created, just not added to meeting
      }
    }

    revalidatePath("/guests");
    revalidatePath("/dashboard");
    if (addToMeetingId) {
      revalidatePath(`/meetings/${addToMeetingId}`);
    }
    return { success: true, data: { id: guest.id } };
  } catch (error) {
    console.error("createGuestAction error:", error);
    return { success: false, error: "Nepodarilo se vytvorit hosta." };
  }
}

/**
 * Update an existing guest's name and description. Requires admin or moderator role.
 */
export async function updateGuestAction(
  id: string,
  name: string,
  description?: string,
  company?: string,
  email?: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno hosta je povinne." };
  }

  try {
    const updated = await dbUpdateGuest(id, {
      name: name.trim(),
      company: company?.trim(),
      email: email?.trim(),
      description: description?.trim(),
    });

    if (!updated) {
      return { success: false, error: "Host nebyl nalezen." };
    }

    revalidatePath("/guests");
    revalidatePath(`/guests/${id}`);
    return { success: true };
  } catch (error) {
    console.error("updateGuestAction error:", error);
    return { success: false, error: "Nepodarilo se aktualizovat hosta." };
  }
}

/**
 * Delete a guest and all related data (notes, votes, meeting_guests). Requires admin role.
 */
export async function deleteGuestAction(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    await dbDeleteGuest(id);
    revalidatePath("/guests");
    revalidatePath("/dashboard");
    revalidatePath("/meetings", "layout");
    return { success: true };
  } catch (error) {
    console.error("deleteGuestAction error:", error);
    return { success: false, error: "Nepodarilo se smazat hosta." };
  }
}

/**
 * Change a guest's category. Requires admin or moderator role.
 */
export async function updateGuestCategoryAction(
  id: string,
  categoryId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!categoryId) {
    return { success: false, error: "Kategorie je povinna." };
  }

  try {
    const updated = await dbUpdateGuestCategory(id, categoryId);

    if (!updated) {
      return { success: false, error: "Host nebyl nalezen." };
    }

    revalidatePath("/guests");
    revalidatePath(`/guests/${id}`);
    return { success: true };
  } catch (error) {
    console.error("updateGuestCategoryAction error:", error);
    return { success: false, error: "Nepodarilo se zmenit kategorii." };
  }
}

const promoteGuestSchema = z.object({
  guestId: z.string().uuid("Neplatne ID hosta."),
});

/**
 * Discriminated union result for promoteGuestToMemberAction (arch
 * arch_iter-022_T-001.md §7, updated by arch_iter-022_T-003.md §2.2 —
 * MAJOR-1 repair confirmation). T-006 (UI) reads `repaired` to pick the
 * right success toast; it never receives a message string from here for the
 * success case -- toast copy (incl. D-4's "member has no login link yet"
 * line and the repair-success toast) lives in T-006, not in this action.
 */
export type PromoteGuestResult =
  | { success: true; memberId: string; repaired: boolean }
  | { success: false; repairConfirmationRequired: true; existingMemberEmail: string }
  | { success: false; error: string };

/**
 * Create a member from a guest's data (arch §1 mapping table).
 * name/company/email are 1:1; categoryName snapshots into member.obor;
 * phone/description are dropped (member has no matching columns); joinedAt
 * is left out so the schema default (CURRENT_DATE) applies; managementRole/
 * passwordHash/magic token are never set here (Scope OUT -- unlike
 * createMemberAction, this never calls generateMagicToken, D-4).
 */
async function createMemberFromGuest(guestData: {
  name: string;
  company: string | null;
  email: string | null;
  categoryName: string | null;
}) {
  return dbCreateMember({
    name: guestData.name.trim(),
    email: guestData.email?.trim() || undefined,
    company: guestData.company?.trim() || null,
    obor: guestData.categoryName || null,
  });
}

/**
 * Promote a guest to a full member: INSERT a member from the guest's data,
 * then DELETE the guest (CASCADE removes notes/votes/meeting_guest rows).
 * Requires admin or moderator role (arch §3 -- deliberate asymmetry vs.
 * deleteGuestAction, which is admin-only; not a bug, see arch §3 / R-7).
 *
 * Order is always INSERT member -> DELETE guest, NEVER reversed (LL-003, no
 * db.transaction). The worst reachable failure state is "member created,
 * guest still exists" (manually fixable, no data loss); "guest deleted,
 * member never created" is not reachable by this code path.
 *
 * Repair mode (arch T-003 MAJOR-1): if a member with the same email AND the
 * same name (case-insensitive, trimmed) already exists, this call does NOT
 * delete anything and does NOT create anything -- it returns
 * repairConfirmationRequired with the existing member's email so the UI can
 * show a second, explicit confirmation (T-006). Only a second call with
 * opts.confirmRepair = true proceeds to delete the guest. That second call
 * re-runs every check in this function from scratch (auth, guest lookup,
 * voting-meeting guard, duplicate pre-check) -- it does not trust anything
 * decided by the first call. If the situation changed in between (member
 * deleted, guest deleted, voting opened), the fresh checks catch it and the
 * confirmRepair flag is simply not consumed.
 */
export async function promoteGuestToMemberAction(
  guestId: string,
  opts?: { confirmRepair?: boolean }
): Promise<PromoteGuestResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  const parsed = promoteGuestSchema.safeParse({ guestId });
  if (!parsed.success) {
    const firstError = parsed.error.errors[0]?.message ?? "Neplatny vstup.";
    return { success: false, error: firstError };
  }

  const confirmRepair = opts?.confirmRepair ?? false;

  try {
    const guestData = await getGuestById(guestId);
    if (!guestData) {
      return { success: false, error: "Host nebyl nalezen." };
    }

    if (await isGuestInVotingMeeting(guestId)) {
      return {
        success: false,
        error:
          "Host je na schuzce s prave bezicim hlasovanim. Pockejte na uzavreni hlasovani a akci opakujte.",
      };
    }

    const guestName = guestData.name.trim();
    const guestEmail = guestData.email?.trim() || null;

    let memberId: string;
    let repaired = false;

    if (guestEmail) {
      const existingByEmail = await findMemberByEmailInsensitive(guestEmail);

      if (existingByEmail) {
        const sameName =
          existingByEmail.name.trim().toLowerCase() === guestName.toLowerCase();

        if (!sameName) {
          return {
            success: false,
            error: `Clen s emailem ${existingByEmail.email} uz existuje pod jinym jmenem. Zkontrolujte email hosta, nebo clena zalozte rucne.`,
          };
        }

        if (!confirmRepair) {
          // Read-only so far: nothing written or deleted. UI must re-call
          // with confirmRepair: true after an explicit second confirmation.
          return {
            success: false,
            repairConfirmationRequired: true,
            existingMemberEmail: existingByEmail.email ?? guestEmail,
          };
        }

        // Confirmed repair: member already exists, skip INSERT entirely.
        memberId = existingByEmail.id;
        repaired = true;
      } else {
        const created = await createMemberFromGuest({
          name: guestName,
          company: guestData.company,
          email: guestEmail,
          categoryName: guestData.categoryName,
        });
        memberId = created.id;
      }
    } else {
      const existingByName = await findMemberByNameInsensitive(guestName);
      if (existingByName) {
        return {
          success: false,
          error: `Clen se jmenem "${guestName}" uz existuje. Host nema email, takze nelze rozlisit, jestli jde o tehoz cloveka nebo o jmenovce. Pokud je to jmenovec, zalozte clena rucne v sekci Clenove (stejne jmeno je povolene) a hosta pak smazte. Pokud uz clen vznikl drivejsim povysenim, nechte hosta smazat adminem.`,
        };
      }

      const created = await createMemberFromGuest({
        name: guestName,
        company: guestData.company,
        email: null,
        categoryName: guestData.categoryName,
      });
      memberId = created.id;
    }

    // The only irreversible step. Reached only after a member is confirmed
    // to exist (just created, or the repair match) -- never before.
    try {
      await dbDeleteGuest(guestId);
    } catch (deleteError) {
      console.error(
        "promoteGuestToMemberAction: delete guest failed after member existed:",
        deleteError
      );
      return {
        success: false,
        error:
          "Clen byl vytvoren, ale hosta se nepodarilo smazat. Opakujte akci - dokonci smazani hosta.",
      };
    }

    // D-6: one line per successful promotion -- not an audit trail (Vercel
    // log retention is short), but enough to answer "kam zmizel ten host".
    console.info(
      `promoteGuestToMemberAction: guest ${guestId} "${guestName}" -> member ${memberId} (repaired=${repaired})`
    );

    // MINOR-4: this try/catch is nested inside the main try, placed after the
    // guest is already deleted -- a revalidation failure is caught right here
    // and never reaches the outer catch, so it can't turn an
    // already-successful promotion into an error shown to the user.
    try {
      revalidatePath("/guests");
      revalidatePath(`/guests/${guestId}`);
      revalidatePath("/dashboard");
      revalidatePath("/meetings", "layout");
      revalidatePath("/archive");
      revalidatePath("/admin/members");
      revalidatePath("/interviews", "layout");
    } catch (revalidateError) {
      console.error("promoteGuestToMemberAction: revalidace selhala", revalidateError);
    }

    return { success: true, memberId, repaired };
  } catch (error) {
    console.error("promoteGuestToMemberAction error:", error);
    return {
      success: false,
      error: "Nepodarilo se vytvorit clena. Host zustal beze zmeny, akci opakujte.",
    };
  }
}
