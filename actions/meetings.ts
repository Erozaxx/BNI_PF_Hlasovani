"use server";

import { revalidatePath } from "next/cache";
import { requireManagementRole } from "@/lib/auth/guards";
import {
  createMeeting as dbCreateMeeting,
  addGuestToMeeting as dbAddGuestToMeeting,
  removeGuestFromMeeting as dbRemoveGuestFromMeeting,
  getMeetingById,
  updateMeetingStatus,
} from "@/lib/db/queries/meetings";
import type { ActionResult } from "@/lib/types";

/**
 * Create a new meeting. Requires admin or moderator role.
 */
export async function createMeetingAction(
  date: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!date) {
    return { success: false, error: "Datum schuzky je povinne." };
  }

  try {
    const mtg = await dbCreateMeeting(date);
    revalidatePath("/meetings");
    return { success: true, data: { id: mtg.id } };
  } catch (error) {
    console.error("createMeetingAction error:", error);
    return { success: false, error: "Nepodarilo se vytvorit schuzku." };
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
 * Sets status to 'voting' and calculates the voting window closing time
 * (next Wednesday 23:59 in Europe/Prague).
 */
export async function openVotingAction(
  meetingId: string
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
