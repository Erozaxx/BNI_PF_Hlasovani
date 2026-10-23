"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidDateString } from "@/lib/members/activity";
import { requirePermission } from "@/lib/auth/guards";
import {
  INTERNAL_TEXTS,
  absencesDeletedFlag,
  decideInternalCancel,
  decideInternalCreate,
  internalOpsEvent,
  type InternalOpsKind,
} from "@/lib/attendance/internal";
import {
  cancelInternalDay,
  createInternalDay,
  getInternalDayState,
} from "@/lib/db/queries/attendance-internal";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { ActionResult } from "@/lib/types";

/**
 * iter-040 (T-003, arch 6.4, gate Z1): založení a zrušení interní schůzky v
 * docházce. První krok obou akcí je `requirePermission("attendance.internal_manage")`.
 * Bez transakcí (LL-003): každá změna je jeden SQL příkaz s pojistkami
 * (lib/db/queries/attendance-internal.ts), log je až po něm a nikdy neshodí
 * akci (LL-011). `/dochazka` a Omluvy drží stav na klientovi, žádný
 * `router.refresh()` (LL-017), jen dashboard se po zrušení invaliduje.
 *
 * Z1: výsledek ani toast neprozradí, jestli na den někdo měl omluvu.
 * `absencesDeleted` se počítá z pravidla (zrušeno a není běžná schůzka),
 * nikdy z dat. Toast po zrušení je vždy stejný.
 */

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidDateString);

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

export interface InternalActionData {
  date: string;
  state: "internal" | "none" | "meeting";
  /** Z pravidla, ne z dat (Z1): klient podle toho vyprázdní omluvy dne v lokálním stavu. */
  absencesDeleted: boolean;
  /** Text toastu (vždy stejný pro stejný výsledek). */
  message: string;
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(kind: InternalOpsKind, date: string, overridden: boolean, actorName: string) {
  try {
    await logOpsEvent({
      runId: randomUUID(),
      seq: 1,
      actor: actorName,
      ...internalOpsEvent(kind, date, overridden),
    });
  } catch (err) {
    console.error(`[attendance-internal] ops log failed: ${errClass(err)}`);
  }
}

export async function createInternalDayAction(date: string): Promise<ActionResult<InternalActionData>> {
  const auth = await requirePermission("attendance.internal_manage");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) return { success: false, error: INTERNAL_TEXTS.errInvalid };
  const d = parsed.data;

  try {
    // Srozumitelná hláška předem; správnost drží SQL pojistka níž.
    const state = await getInternalDayState(d);
    const decision = decideInternalCreate(new Date(), d, state);
    if (!decision.ok) return { success: false, error: decision.message };
    if (decision.alreadyExists) {
      return {
        success: true,
        data: { date: d, state: "internal", absencesDeleted: false, message: INTERNAL_TEXTS.toastExists },
      };
    }

    const res = await createInternalDay({ date: d, actorId: actor.memberId });
    if (res.created) {
      await safeLog("attendance.internal-created", d, false, actor.name);
      return {
        success: true,
        data: { date: d, state: "internal", absencesDeleted: false, message: INTERNAL_TEXTS.toastCreated },
      };
    }
    if (res.existed) {
      return {
        success: true,
        data: { date: d, state: "internal", absencesDeleted: false, message: INTERNAL_TEXTS.toastExists },
      };
    }
    if (res.hasMeeting) return { success: false, error: INTERNAL_TEXTS.errMeeting };
    // Souběh dvou sezení: rozhoduje stav ze SQL, ne JS čas. Řádek mezitím vznikl jinde.
    if (!res.created && !res.existed && res.rangeOk && !res.hasMeeting) {
      return {
        success: true,
        data: { date: d, state: "internal", absencesDeleted: false, message: INTERNAL_TEXTS.toastExists },
      };
    }
    const again = decideInternalCreate(new Date(), d, { hasMeeting: false, hasInternal: false });
    return { success: false, error: again.ok ? INTERNAL_TEXTS.errGeneric : again.message };
  } catch (err) {
    console.error(`[createInternalDayAction] failed: ${errClass(err)}`);
    return { success: false, error: INTERNAL_TEXTS.errGeneric };
  }
}

export async function cancelInternalDayAction(date: string): Promise<ActionResult<InternalActionData>> {
  const auth = await requirePermission("attendance.internal_manage");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsed = dateSchema.safeParse(date);
  if (!parsed.success) return { success: false, error: INTERNAL_TEXTS.errInvalid };
  const d = parsed.data;

  try {
    // Hláška předem (minulý den, 17:00, uzavřeno, zápis); pravdou je SQL níž.
    const state = await getInternalDayState(d);
    if (state.hasInternal) {
      const decision = decideInternalCancel(new Date(), d, state);
      if (!decision.ok) return { success: false, error: decision.message };
    }

    const res = await cancelInternalDay({ date: d });
    if (res.deleted) {
      await safeLog("attendance.internal-cancelled", d, res.hasMeeting, actor.name);
      const absencesDeleted = absencesDeletedFlag(1, res.hasMeeting);
      if (absencesDeleted) revalidatePath("/dashboard");
      return {
        success: true,
        data: {
          date: d,
          state: res.hasMeeting ? "meeting" : "none",
          absencesDeleted,
          message: INTERNAL_TEXTS.toastCancelled,
        },
      };
    }
    if (!res.existed) {
      // Už je zrušená: cílový stav splněn, nic se nemazalo.
      return {
        success: true,
        data: {
          date: d,
          state: res.hasMeeting ? "meeting" : "none",
          absencesDeleted: false,
          message: INTERNAL_TEXTS.toastGone,
        },
      };
    }
    // Souběh dvou sezení: řádek existoval, všechny pojistky SQL prošly, smazalo ho jiné sezení.
    // Úspěch bez logu a bez informace o omluvách (Z1).
    if (res.existed && res.timeOk && res.openOk && (res.hasMeeting || !res.recorded)) {
      return {
        success: true,
        data: {
          date: d,
          state: res.hasMeeting ? "meeting" : "none",
          absencesDeleted: false,
          message: INTERNAL_TEXTS.toastGone,
        },
      };
    }
    // Pojistka v SQL neprošla (uplynulo 17:00, někdo zapsal docházku).
    const again = decideInternalCancel(new Date(), d, {
      hasMeeting: res.hasMeeting,
      finalized: !res.openOk,
      hasManagerRecord: res.recorded,
    });
    return { success: false, error: again.ok ? INTERNAL_TEXTS.errGeneric : again.message };
  } catch (err) {
    console.error(`[cancelInternalDayAction] failed: ${errClass(err)}`);
    return { success: false, error: INTERNAL_TEXTS.errGeneric };
  }
}
