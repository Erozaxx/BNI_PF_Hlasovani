"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/guards";
import { adminTargetError } from "@/lib/auth/admin-protection";
import {
  decideDeactivation,
  DEACTIVATION_TEXTS,
  pragueToday,
  validateInactiveUntil,
} from "@/lib/members/activity";
import {
  deactivateMemberGuarded,
  getManagerContext,
  reactivateMemberGuarded,
  updateDeactivationGuarded,
} from "@/lib/db/queries/member-status";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import type { ActionResult } from "@/lib/types";

/**
 * iter-037 (T-003b, arch 5.1, gate Z1, K1, K2): deaktivace a reaktivace člena.
 * Právo `members.deactivate` (admin a funkce s plnou sadou). Bez poznámky
 * k důvodu (Z1), bez UI (to je T-003c).
 *
 * Bez transakcí (LL-003): deaktivace je jeden SQL příkaz
 * (`deactivateMemberGuarded`), čisté `decideDeactivation` slouží jen pro
 * srozumitelnou hlášku. Ops log bez data a bez důvodu (arch 10: datum by
 * mohlo napovědět důvod).
 */

const memberIdSchema = z.string().uuid();

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(build: () => OpsEventInput): Promise<void> {
  try {
    await logOpsEvent(build());
  } catch (err) {
    console.error(`[member-status] ops log failed: ${errClass(err)}`);
  }
}

function revalidateMemberViews(): void {
  revalidatePath("/admin/members");
  revalidatePath("/burza");
  revalidatePath("/burza/kontakty");
  revalidatePath("/mastermind");
  revalidatePath("/dashboard");
}

export type DeactivateResult = {
  /** Kolik naplánovaných témat Master mindu se vrátilo do zásobníku. */
  unscheduled: number;
};

/**
 * `until`: `null` = do odvolání, jinak „YYYY-MM-DD“ = poslední neaktivní den
 * včetně (K1). Sebe, už neaktivního a posledního aktivního účtu se správou
 * členů deaktivovat nejde.
 */
export async function deactivateMemberAction(
  memberId: string,
  input: { until: string | null }
): Promise<ActionResult<DeactivateResult>> {
  const auth = await requirePermission("members.deactivate");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success || typeof input !== "object" || input === null) {
    return { success: false, error: "Neplatný vstup." };
  }
  const today = pragueToday();
  const until = validateInactiveUntil(input.until, today);
  if (!until.ok) return { success: false, error: until.error };

  try {
    const denied = await adminTargetError(actor, parsedId.data);
    if (denied) return { success: false, error: denied };

    const ctx = await getManagerContext(parsedId.data);
    const decision = decideDeactivation({
      actorId: actor.memberId,
      target: ctx.target,
      otherActiveManagers: ctx.otherActiveManagers,
      todayPrague: today,
    });
    if (!decision.ok) return { success: false, error: decision.message };

    const row = await deactivateMemberGuarded({
      targetId: parsedId.data,
      actorId: actor.memberId,
      until: until.value,
    });
    // Pojistka ve WHERE neprošla (souběh): stav se mezitím změnil.
    if (!row) return { success: false, error: DEACTIVATION_TEXTS.alreadyInactive };

    await safeLog(() => ({
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.member-deactivated",
      severity: "info",
      actor: actor.name,
      memberId: row.id,
      memberName: row.name,
      message: "Člen deaktivován.",
    }));

    revalidateMemberViews();
    return { success: true, data: { unscheduled: row.unscheduled } };
  } catch (err) {
    console.error(`[deactivateMemberAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Člena se nepodařilo deaktivovat." };
  }
}

/**
 * Změna data u neaktivního člena. Session ani odkazy se nemění, nic se
 * nezapisuje do logu.
 */
export async function updateDeactivationAction(
  memberId: string,
  input: { until: string | null }
): Promise<ActionResult> {
  const auth = await requirePermission("members.deactivate");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success || typeof input !== "object" || input === null) {
    return { success: false, error: "Neplatný vstup." };
  }
  const until = validateInactiveUntil(input.until, pragueToday());
  if (!until.ok) return { success: false, error: until.error };

  try {
    const denied = await adminTargetError(actor, parsedId.data);
    if (denied) return { success: false, error: denied };

    const changed = await updateDeactivationGuarded({
      targetId: parsedId.data,
      actorId: actor.memberId,
      until: until.value,
    });
    if (!changed) return { success: false, error: DEACTIVATION_TEXTS.notInactive };

    revalidateMemberViews();
    return { success: true };
  } catch (err) {
    console.error(`[updateDeactivationAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Změnu se nepodařilo uložit." };
  }
}

/**
 * „Aktivovat hned“. Session se nemění (člen se přihlásí sám), témata Master
 * mindu se do plánu nevracejí. Reaktivace datem (vypršelo „do“) se neloguje,
 * protože se nic neděje.
 */
export async function reactivateMemberAction(memberId: string): Promise<ActionResult> {
  const auth = await requirePermission("members.deactivate");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = memberIdSchema.safeParse(memberId);
  if (!parsedId.success) return { success: false, error: "Neplatný vstup." };

  try {
    const denied = await adminTargetError(actor, parsedId.data);
    if (denied) return { success: false, error: denied };

    const row = await reactivateMemberGuarded(parsedId.data, actor.memberId);
    if (!row) return { success: false, error: DEACTIVATION_TEXTS.notInactive };

    await safeLog(() => ({
      runId: randomUUID(),
      seq: 1,
      source: "gui",
      kind: "access.member-reactivated",
      severity: "info",
      actor: actor.name,
      memberId: row.id,
      memberName: row.name,
      message: "Člen je zase aktivní.",
    }));

    revalidateMemberViews();
    return { success: true };
  } catch (err) {
    console.error(`[reactivateMemberAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: "Člena se nepodařilo aktivovat." };
  }
}
