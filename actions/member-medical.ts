"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import { MEDICAL_TEXTS, decideMedicalChange } from "@/lib/members/medical";
import { pragueToday } from "@/lib/members/activity";
import {
  clearMemberMedicalGuarded,
  getMedicalChangeContext,
  setMemberMedicalGuarded,
} from "@/lib/db/queries/member-medical";
import type { ActionResult } from "@/lib/types";

/**
 * iter-046 (arch 4.2): medical člena. Právo `members.medical` (Člen výboru,
 * Prezident, Viceprezident, admin, vše jen se session heslem). Jeden SQL
 * příkaz na akci, pojistky ve WHERE, `decideMedicalChange` jen pro srozumitelnou
 * hlášku. Do `ops_event` se nezapisuje (medical je zdravotní údaj, `/status`
 * vidí i moderátor bez funkce): stopa je `medical_set_by` a `medical_set_at`.
 */

const memberIdSchema = z.string().uuid();

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function revalidateMedicalViews(): void {
  revalidatePath("/admin/members");
  revalidatePath("/dochazka/zapis");
  revalidatePath("/dochazka");
}

export type MedicalState = { medicalFrom: string | null; medicalUntil: string | null };

export async function setMemberMedicalAction(
  memberId: string,
  until: string
): Promise<ActionResult<MedicalState>> {
  const auth = await requirePermission("members.medical");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };
  const today = pragueToday();

  try {
    const ctx = await getMedicalChangeContext(parsedId.data, actor.memberId);
    const decision = decideMedicalChange({
      actorId: actor.memberId,
      hasPermission: true,
      target: ctx.target,
      actorIsAdmin: ctx.actorIsAdmin,
      until,
      today,
    });
    if (!decision.ok) return { success: false, error: decision.message };

    const row = await setMemberMedicalGuarded({
      targetId: parsedId.data,
      actorId: actor.memberId,
      until,
    });
    if (!row) return { success: false, error: MEDICAL_TEXTS.changed };

    revalidateMedicalViews();
    return { success: true, data: { medicalFrom: row.medicalFrom, medicalUntil: row.medicalUntil } };
  } catch (err) {
    console.error(`[setMemberMedicalAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Medical se nepodařilo uložit." };
  }
}

export async function clearMemberMedicalAction(
  memberId: string
): Promise<ActionResult<MedicalState>> {
  const auth = await requirePermission("members.medical");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };

  try {
    const ctx = await getMedicalChangeContext(parsedId.data, actor.memberId);
    const decision = decideMedicalChange({
      actorId: actor.memberId,
      hasPermission: true,
      target: ctx.target,
      actorIsAdmin: ctx.actorIsAdmin,
      today: pragueToday(),
    });
    if (!decision.ok) return { success: false, error: decision.message };

    const row = await clearMemberMedicalGuarded({
      targetId: parsedId.data,
      actorId: actor.memberId,
    });
    if (!row) return { success: false, error: MEDICAL_TEXTS.changed };

    revalidateMedicalViews();
    return { success: true, data: { medicalFrom: null, medicalUntil: null } };
  } catch (err) {
    console.error(`[clearMemberMedicalAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Medical se nepodařilo zrušit." };
  }
}
