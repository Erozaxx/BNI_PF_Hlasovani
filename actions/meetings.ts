"use server";

import { revalidatePath } from "next/cache";
import { requireManagementRole, requireAdmin } from "@/lib/auth/guards";
import {
  createMeeting as dbCreateMeeting,
  deleteMeeting as dbDeleteMeeting,
  addGuestToMeeting as dbAddGuestToMeeting,
  removeGuestFromMeeting as dbRemoveGuestFromMeeting,
  getMeetingById,
  updateMeetingStatus,
  getMeetingGuestIds,
  setVotingEnabled,
  hasActiveOrVotingMeeting,
} from "@/lib/db/queries/meetings";
import type { ActionResult } from "@/lib/types";

/**
 * Create a new meeting. Requires admin or moderator role.
 */
export async function createMeetingAction(
  date: string,
  location?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!date) {
    return { success: false, error: "Datum schuzky je povinne." };
  }

  try {
    const mtg = await dbCreateMeeting(date, location);
    revalidatePath("/meetings");
    return { success: true, data: { id: mtg.id } };
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError?.code === "23505") {
      return { success: false, error: `Schuzka na datum ${date} jiz existuje.` };
    }
    console.error("createMeetingAction error:", error);
    return { success: false, error: "Nepodarilo se vytvorit schuzku." };
  }
}

/**
 * Delete a meeting and all related data (votes, meeting_guests). Requires admin role.
 */
export async function deleteMeetingAction(
  meetingId: string
): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schuzka nebyla nalezena." };
    }

    await dbDeleteMeeting(meetingId);
    revalidatePath("/meetings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("deleteMeetingAction error:", error);
    return { success: false, error: "Nepodarilo se smazat schuzku." };
  }
}

/**
 * Add a guest to a meeting. Requires admin or moderator role.
 * Meeting must be in 'draft' status.
 */
export async function addGuestToMeetingAction(
  meetingId: string,
  guestId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schuzka nebyla nalezena." };
    }
    if (mtg.status !== "draft") {
      return {
        success: false,
        error: "Hosty lze prirazovat pouze ke schuzkam ve stavu draft.",
      };
    }

    await dbAddGuestToMeeting(meetingId, guestId);
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("addGuestToMeetingAction error:", error);
    return { success: false, error: "Nepodarilo se pridat hosta ke schuzce." };
  }
}

/**
 * Remove a guest from a meeting. Requires admin or moderator role.
 */
export async function removeGuestFromMeetingAction(
  meetingId: string,
  guestId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    await dbRemoveGuestFromMeeting(meetingId, guestId);
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("removeGuestFromMeetingAction error:", error);
    return {
      success: false,
      error: "Nepodarilo se odebrat hosta ze schuzky.",
    };
  }
}

/**
 * Open voting for a meeting. Requires admin or moderator role.
 * Accepts a list of guest IDs to enable for voting (must be a non-empty subset of meeting's guests).
 * Sets voting_enabled per guest, then sets status to 'voting' with the voting window closing time
 * (next Wednesday 23:59 in Europe/Prague).
 */
export async function openVotingAction(
  meetingId: string,
  votingGuestIds: string[]
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schuzka nebyla nalezena." };
    }
    if (mtg.status !== "draft") {
      return {
        success: false,
        error: "Hlasovani lze spustit pouze u schuzky ve stavu draft.",
      };
    }

    // Max-1-active guard: no other meeting may be active or voting (excluding self)
    const conflict = await hasActiveOrVotingMeeting(meetingId);
    if (conflict) {
      return {
        success: false,
        error: "Jiz existuje aktivni nebo hlasovaci schuzka. Nejdrive ji uzavrete.",
      };
    }

    // Krok 0: Subset validace (B-001) — každý ID musí patřit k této schůzce
    const meetingGuestIds = await getMeetingGuestIds(meetingId);
    for (const id of votingGuestIds) {
      if (!meetingGuestIds.has(id)) {
        return { success: false, error: "Neplatny host pro tuto schuzku." };
      }
    }

    // Krok 1: Validace min. počtu
    if (votingGuestIds.length === 0) {
      return { success: false, error: "Nelze spustit hlasovani bez hostu." };
    }

    // Krok 2: Nastavit voting_enabled
    await setVotingEnabled(meetingId, votingGuestIds);

    // Krok 3: Aktualizovat status schůzky
    const now = new Date();
    // Calculate next Wednesday 23:59 CET/CEST
    const daysUntilWednesday = (3 - now.getUTCDay() + 7) % 7 || 7;
    const closesAt = new Date(now);
    closesAt.setUTCDate(now.getUTCDate() + daysUntilWednesday);
    closesAt.setUTCHours(22, 59, 59, 0); // ~23:59 CET

    await updateMeetingStatus(meetingId, {
      status: "voting",
      votingOpenAt: now,
      votingClosesAt: closesAt,
    });

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath("/meetings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("openVotingAction error:", error);
    return { success: false, error: "Nepodarilo se spustit hlasovani." };
  }
}

/**
 * Close voting for a meeting. Requires admin or moderator role.
 */
export async function closeVotingAction(
  meetingId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schuzka nebyla nalezena." };
    }
    if (mtg.status !== "voting") {
      return {
        success: false,
        error: "Uzavrit lze pouze schuzku s aktivnim hlasovanim.",
      };
    }

    await updateMeetingStatus(meetingId, { status: "closed" });

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath("/meetings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("closeVotingAction error:", error);
    return { success: false, error: "Nepodarilo se uzavrit hlasovani." };
  }
}
