"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuth, requirePermission } from "@/lib/auth/guards";
import { adminTargetError } from "@/lib/auth/admin-protection";
import { decideMemberAbsenceEdit, validateSubstituteName } from "@/lib/attendance/rules";
import {
  forgetSubstituteName,
  listSubstituteNames,
  setAttendanceManagerGuarded,
  setMyAbsenceGuarded,
  type SubstituteNameRow,
} from "@/lib/db/queries/attendance";
import { getMemberById } from "@/lib/db/queries/members";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import type { ActionResult } from "@/lib/types";

/**
 * iter-038 (T-003a, arch 5.3, 6.1): akce docházky na straně člena a příznak
 * Správce docházky. Zápis správce, opravy a audit přidává T-003b.
 *
 * Bez transakcí (LL-003): každá změna je jeden SQL příkaz s pojistkami ve
 * WHERE (lib/db/queries/attendance.ts), mail ani log nejsou součástí. Cíl
 * `setMyAbsenceAction` je VŽDY volající člen (`session.memberId`), id člena se
 * z klienta nebere. Akce nevolají `revalidatePath` na `/dochazka`: klientský
 * kalendář drží stav lokálně (LL-017), jen dashboard se invaliduje.
 */

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kindSchema = z.enum(["none", "absence", "substitute"]);
const uuidSchema = z.string().uuid();

const GENERIC_ERROR = "Neuložilo se. Zkus to znovu.";

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(build: () => OpsEventInput): Promise<void> {
  try {
    await logOpsEvent(build());
  } catch (err) {
    console.error(`[attendance] ops log failed: ${errClass(err)}`);
  }
}

export interface SetAbsenceData {
  date: string;
  kind: "none" | "absence" | "substitute";
  substituteName: string | null;
  /** Paměť jmen po uložení náhradníka (id pro smazání), jinak `null`. */
  names: SubstituteNameRow[] | null;
}

/**
 * Člen nastaví svou nepřítomnost na den: `none` = přijdu (smaže ohlášení),
 * `absence` = bez náhradníka, `substitute` = s náhradníkem a jménem. Od dneška
 * do dnes + 365 dní, jen do 7:30 v ten den. Po uzávěrce zapíše změnu správce.
 */
export async function setMyAbsenceAction(
  date: string,
  kind: "none" | "absence" | "substitute",
  name?: string | null
): Promise<ActionResult<SetAbsenceData>> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const memberId = auth.session.memberId;

  const parsedDate = dateSchema.safeParse(date);
  const parsedKind = kindSchema.safeParse(kind);
  if (!parsedDate.success || !parsedKind.success) {
    return { success: false, error: "Neplatný vstup." };
  }

  // Srozumitelná hláška předem; správnost drží SQL pojistka níž.
  const decision = decideMemberAbsenceEdit(new Date(), parsedDate.data);
  if (!decision.ok) return { success: false, error: decision.message };

  let cleanName: string | null = null;
  if (parsedKind.data === "substitute") {
    const v = validateSubstituteName(name);
    if (!v.ok) return { success: false, error: v.error };
    cleanName = v.value;
  }

  try {
    const result = await setMyAbsenceGuarded({
      memberId,
      date: parsedDate.data,
      kind: parsedKind.data,
      name: cleanName,
    });
    if (!result.ok) {
      // Pojistka v SQL neprošla (uplynulo 7:30 mezi kontrolou a zápisem, neaktivní člen).
      const again = decideMemberAbsenceEdit(new Date(), parsedDate.data);
      return { success: false, error: again.ok ? GENERIC_ERROR : again.message };
    }
    // Jen dashboard (karta „Příště chybíš“). /dochazka nechává stav klientovi (LL-017).
    revalidatePath("/dashboard");

    // Paměť jmen se plní ve stejném příkazu; tady se jen přečte pro klienta.
    // Selhání čtení uložení nevrací (zápis už proběhl).
    let names: SubstituteNameRow[] | null = null;
    if (parsedKind.data === "substitute") {
      try {
        names = await listSubstituteNames(memberId);
      } catch (err) {
        console.error(`[setMyAbsenceAction] names read failed: ${errClass(err)}`);
      }
    }
    return {
      success: true,
      data: { date: parsedDate.data, kind: parsedKind.data, substituteName: cleanName, names },
    };
  } catch (err) {
    console.error(`[setMyAbsenceAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: GENERIC_ERROR };
  }
}

/** Člen smaže jedno ze svých uložených jmen náhradníků. Cizí jméno nejde. */
export async function forgetSubstituteNameAction(nameId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;

  const parsed = uuidSchema.safeParse(nameId);
  if (!parsed.success) return { success: false, error: "Neplatný vstup." };

  try {
    // Jméno, které už neexistuje, je splněný cílový stav, výsledek se nerozlišuje.
    await forgetSubstituteName(auth.session.memberId, parsed.data);
    return { success: true };
  } catch (err) {
    console.error(`[forgetSubstituteNameAction] failed: ${errClass(err)}`);
    return { success: false, error: GENERIC_ERROR };
  }
}

/**
 * Přepínač Správce docházky na stránce člena (arch 5.3, K2 A). Kdo spravuje
 * členy (`members.manage`: admin, Prezident, Viceprezident). Účet admina mění
 * jen admin (`adminTargetError` + `actorMayChangeSql` v SQL). Cílový stav,
 * idempotentní. Log `access.attendance-manager-changed` jen při skutečné změně.
 */
export async function setAttendanceManagerAction(
  memberId: string,
  enabled: boolean
): Promise<ActionResult<{ enabled: boolean }>> {
  const auth = await requirePermission("members.manage");
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsedId = uuidSchema.safeParse(memberId);
  if (!parsedId.success || typeof enabled !== "boolean") {
    return { success: false, error: "Neplatný vstup." };
  }

  try {
    const denied = await adminTargetError(actor, parsedId.data);
    if (denied) return { success: false, error: denied };

    const target = await getMemberById(parsedId.data);
    if (!target) return { success: false, error: "Člen nebyl nalezen." };

    const row = await setAttendanceManagerGuarded({
      targetId: parsedId.data,
      actorId: actor.memberId,
      enabled,
    });
    // Pojistka ve WHERE neprošla (souběh se změnou role cíle).
    if (!row) return { success: false, error: GENERIC_ERROR };

    if (row.was !== row.now) {
      await safeLog(() => ({
        runId: randomUUID(),
        seq: 1,
        source: "gui",
        kind: "access.attendance-manager-changed",
        severity: "info",
        actor: actor.name,
        memberId: row.id,
        memberName: row.name,
        message: row.now ? "Přidán." : "Odebrán.",
      }));
    }

    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${row.id}`);
    return { success: true, data: { enabled: row.now } };
  } catch (err) {
    console.error(`[setAttendanceManagerAction] failed memberId=${memberId}: ${errClass(err)}`);
    return { success: false, error: GENERIC_ERROR };
  }
}
