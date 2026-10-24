"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import {
  createMeeting as dbCreateMeeting,
  deleteMeeting as dbDeleteMeeting,
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
  date: string,
  location?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePermission("meetings.manage");
  if (!auth.success) return auth;

  if (!date) {
    return { success: false, error: "Datum schůzky je povinné." };
  }

  try {
    const mtg = await dbCreateMeeting(date, location);
    revalidatePath("/meetings");
    return { success: true, data: { id: mtg.id } };
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError?.code === "23505") {
      return { success: false, error: `Schůzka na datum ${date} už existuje.` };
    }
    console.error("createMeetingAction error:", error);
    return { success: false, error: "Schůzku se nepodařilo vytvořit." };
  }
}

/**
 * Delete a meeting and all related data (votes, meeting_guests). Requires admin role.
 */
export async function deleteMeetingAction(
  meetingId: string
): Promise<ActionResult> {
  const auth = await requirePermission("meetings.delete");
  if (!auth.success) return auth;

  try {
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schůzka nebyla nalezena." };
    }

    await dbDeleteMeeting(meetingId);
    revalidatePath("/meetings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("deleteMeetingAction error:", error);
    return { success: false, error: "Schůzku se nepodařilo smazat." };
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
  const auth = await requirePermission("meetings.manage");
  if (!auth.success) return auth;

  try {
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schůzka nebyla nalezena." };
    }
    if (mtg.status !== "draft") {
      return {
        success: false,
        error: "Hosty jde přidávat jen ke schůzce, která ještě nemá spuštěné hlasování.",
      };
    }

    await dbAddGuestToMeeting(meetingId, guestId);
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("addGuestToMeetingAction error:", error);
    return { success: false, error: "Hosta se nepodařilo přidat ke schůzce." };
  }
}

/**
 * Remove a guest from a meeting. Requires admin or moderator role.
 */
export async function removeGuestFromMeetingAction(
  meetingId: string,
  guestId: string
): Promise<ActionResult> {
  const auth = await requirePermission("meetings.manage");
  if (!auth.success) return auth;

  try {
    await dbRemoveGuestFromMeeting(meetingId, guestId);
    revalidatePath(`/meetings/${meetingId}`);
    return { success: true };
  } catch (error) {
    console.error("removeGuestFromMeetingAction error:", error);
    return {
      success: false,
      error: "Hosta se nepodařilo odebrat ze schůzky.",
    };
  }
}

/**
 * Close voting for a meeting. Requires admin or moderator role.
 */
export async function closeVotingAction(
  meetingId: string
): Promise<ActionResult> {
  const auth = await requirePermission("meetings.manage");
  if (!auth.success) return auth;

  try {
    const mtg = await getMeetingById(meetingId);
    if (!mtg) {
      return { success: false, error: "Schůzka nebyla nalezena." };
    }
    if (mtg.status !== "voting") {
      return {
        success: false,
        error: "Uzavřít jde jen schůzku, kde hlasování běží.",
      };
    }

    await updateMeetingStatus(meetingId, { status: "closed" });

    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath("/meetings");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (error) {
    console.error("closeVotingAction error:", error);
    return { success: false, error: "Hlasování se nepodařilo uzavřít." };
  }
}
