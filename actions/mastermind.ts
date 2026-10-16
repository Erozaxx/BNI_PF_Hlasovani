"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAuth, requireManagementRole } from "@/lib/auth/guards";
import { getMemberById } from "@/lib/db/queries/members";
import {
  addInterest,
  confirmPresentedGuarded,
  countInterest,
  createCaseWithLimit,
  getCaseById,
  removeCaseGuarded,
  removeInterest,
  scheduleCaseGuarded,
  undoPresentedGuarded,
  unscheduleCaseGuarded,
  updateCaseGuarded,
} from "@/lib/db/queries/mastermind";
import {
  presentedEvent,
  presentedUndoneEvent,
  removedEvent,
  scheduledEvent,
  unscheduledEvent,
  type MastermindEventCtx,
} from "@/lib/mastermind/events";
import {
  MESSAGES,
  canSetInterest,
  isSchedulableDate,
  isShortNotice,
  isUuid,
  validateCaseInput,
  type CaseInput,
} from "@/lib/mastermind/rules";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import type { SessionData } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/types";

/**
 * iter-033 (T-005, arch T-001 sekce 6, gate Z1, Z2): zásobník „5 minut pro
 * ostatní“. `memberId` aktéra je vždy ze session, nikdy z klienta.
 *
 * Guard na začátku každé akce je závazný a hlídá ho statický test
 * (scripts/test-iter-033-mastermind.ts): `requireAuth` pro create, update,
 * remove a setInterest, `requireManagementRole` pro schedule, unschedule,
 * confirm a undo. U akcí s `requireAuth` platí autorita ve WHERE příkazu
 * (`member_id = $me OR $isManagement`, `$isManagement` ze session).
 *
 * Bez transakcí (LL-003): každý přechod je jeden SQL příkaz a log až
 * po něm. Do logu ani do `detail` nejde e-mailová adresa, téma ani text.
 */

const MANAGEMENT_ROLES: Array<"admin" | "moderator"> = ["admin", "moderator"];

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

function isManagementSession(session: SessionData): boolean {
  return session.managementRole === "admin" || session.managementRole === "moderator";
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(build: () => OpsEventInput): Promise<void> {
  try {
    await logOpsEvent(build());
  } catch (err) {
    console.error(`[mastermind] ops log failed: ${errClass(err)}`);
  }
}

function eventCtx(
  actorName: string,
  t: { caseId: string; presenterId: string; presenterName: string; internalDate: string | null }
): MastermindEventCtx {
  return {
    runId: randomUUID(),
    actor: actorName,
    caseId: t.caseId,
    presenterId: t.presenterId,
    presenterName: t.presenterName,
    internalDate: t.internalDate,
  };
}

function revalidateMastermind(withDashboard: boolean): void {
  revalidatePath("/mastermind");
  if (withDashboard) revalidatePath("/dashboard");
}

// ── Vytvoření ──

export type CreateCaseInput = Partial<CaseInput> & { forMemberId?: string | null };

/**
 * Člen přihlásí případ za sebe. Za jiného člena ho zapíše jen vedení
 * (`forMemberId`, K2 A). Limit 5 hlídá sám INSERT (4.4) a platí pro všechny.
 */
export async function createCaseAction(
  input: CreateCaseInput
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  const parsed = validateCaseInput(input);
  if (!parsed.ok) return { success: false, error: parsed.error };

  try {
    const forId = input?.forMemberId ?? null;
    let targetId = actor.memberId;
    let targetName = actor.name;
    if (forId && forId !== actor.memberId) {
      if (!isManagementSession(actor)) {
        return { success: false, error: MESSAGES.forOtherByManagementOnly };
      }
      if (!isUuid(forId)) return { success: false, error: MESSAGES.invalidInput };
      const target = await getMemberById(forId);
      if (!target) return { success: false, error: "Člen nebyl nalezen." };
      targetId = target.id;
      targetName = target.name;
    }

    const id = await createCaseWithLimit({
      memberId: targetId,
      ...parsed.value,
      createdBy: actor.memberId,
    });
    if (!id) {
      return {
        success: false,
        error: targetId === actor.memberId ? MESSAGES.limitSelf : MESSAGES.limitOther(targetName),
      };
    }

    revalidateMastermind(false);
    return { success: true, data: { id } };
  } catch (err) {
    console.error(`[createCaseAction] failed: ${errClass(err)}`);
    return { success: false, error: "Případ se nepodařilo přihlásit." };
  }
}

// ── Úprava a odstranění ──

export async function updateCaseAction(
  caseId: string,
  input: Partial<CaseInput>
): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(caseId)) return { success: false, error: MESSAGES.invalidInput };
  const parsed = validateCaseInput(input);
  if (!parsed.ok) return { success: false, error: parsed.error };

  try {
    const ok = await updateCaseGuarded({
      caseId,
      actorId: actor.memberId,
      isManagement: isManagementSession(actor),
      todayPrague: todayInPrague(),
      ...parsed.value,
    });
    if (!ok) return { success: false, error: MESSAGES.cannotEdit };
    revalidateMastermind(true);
    return { success: true };
  } catch (err) {
    console.error(`[updateCaseAction] failed: ${errClass(err)}`);
    return { success: false, error: "Případ se nepodařilo upravit." };
  }
}

/** Autor stáhne jen navržený případ, vedení navržený i zařazený. */
export async function removeCaseAction(caseId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(caseId)) return { success: false, error: MESSAGES.invalidInput };

  try {
    const removed = await removeCaseGuarded({
      caseId,
      actorId: actor.memberId,
      isManagement: isManagementSession(actor),
    });
    if (!removed) {
      const current = await getCaseById(caseId);
      return { success: false, error: current ? MESSAGES.cannotRemove : MESSAGES.notFound };
    }
    await safeLog(() => removedEvent(eventCtx(actor.name, removed), removed.status === "scheduled"));
    revalidateMastermind(true);
    return { success: true };
  } catch (err) {
    console.error(`[removeCaseAction] failed: ${errClass(err)}`);
    return { success: false, error: "Případ se nepodařilo stáhnout." };
  }
}

// ── Zájem / přihláška posluchače ──

/**
 * Přijímá cílový stav, ne přepínač: dvojklik ani dvě záložky nevyrobí
 * opačný výsledek. Bez `revalidatePath` (7.4), karty se po kliknutí nesmí
 * přeskládat pod prstem. Vlastní případ hlídá INSERT ... SELECT (U5).
 */
export async function setInterestAction(
  caseId: string,
  interested: boolean
): Promise<ActionResult<{ interested: boolean; count: number }>> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(caseId) || typeof interested !== "boolean") {
    return { success: false, error: MESSAGES.invalidInput };
  }

  try {
    if (interested) {
      const inserted = await addInterest(caseId, actor.memberId);
      if (!inserted) {
        // Nic nevzniklo: případ neexistuje, je vlastní, odprezentovaný, nebo zájem už byl.
        const current = await getCaseById(caseId);
        if (!current) return { success: false, error: MESSAGES.notFound };
        if (
          !canSetInterest(
            { memberId: actor.memberId, isManagement: false },
            { memberId: current.memberId, status: current.status, internalDate: current.internalDate }
          )
        ) {
          return {
            success: false,
            error: current.memberId === actor.memberId ? MESSAGES.ownInterest : MESSAGES.presentedInterest,
          };
        }
      }
    } else {
      const removed = await removeInterest(caseId, actor.memberId);
      if (!removed) {
        const current = await getCaseById(caseId);
        if (!current) return { success: false, error: MESSAGES.notFound };
        if (current.status === "presented") {
          return { success: false, error: MESSAGES.presentedInterest };
        }
      }
    }
    const count = await countInterest(caseId);
    return { success: true, data: { interested, count } };
  } catch (err) {
    console.error(`[setInterestAction] failed: ${errClass(err)}`);
    return { success: false, error: "Změnu se nepodařilo uložit." };
  }
}

// ── Zařazení, vrácení, potvrzení (jen vedení) ──

export type ScheduleResult = {
  date: string;
};

/**
 * Zařazení na čtvrtek. Žádné maily (rozhodnutí 15. 10. 2026, free tarif
 * Resendu): informaci o zařazení nese jen aplikace.
 */
export async function scheduleCaseAction(
  caseId: string,
  date: string
): Promise<ActionResult<ScheduleResult>> {
  const auth = await requireManagementRole(MANAGEMENT_ROLES);
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(caseId)) return { success: false, error: MESSAGES.invalidInput };
  const today = todayInPrague();
  if (typeof date !== "string" || !isSchedulableDate(date, today)) {
    return { success: false, error: MESSAGES.badDate };
  }

  try {
    const outcome = await scheduleCaseGuarded({
      caseId,
      date,
      actorId: actor.memberId,
      todayPrague: today,
    });
    if (!outcome.ok) {
      const error =
        outcome.reason === "gone"
          ? MESSAGES.notFound
          : outcome.reason === "not-proposed"
            ? MESSAGES.notProposed
            : outcome.reason === "taken"
              ? MESSAGES.takenDate
              : outcome.reason === "open-meeting"
                ? MESSAGES.openMeetingDate
                : MESSAGES.generic;
      return { success: false, error };
    }
    const scheduled = outcome.row;

    revalidateMastermind(true);

    // Po úspěšném zařazení se nic nesmí vrátit jako chyba, případ už je zařazený.
    const shortNotice = isShortNotice(scheduled.internalDate, today);
    let presenterName = "";
    try {
      presenterName = (await getMemberById(scheduled.memberId))?.name ?? "";
    } catch (err) {
      console.error(`[scheduleCaseAction] presenter name failed: ${errClass(err)}`);
    }
    const ctx = eventCtx(actor.name, {
      caseId,
      presenterId: scheduled.memberId,
      presenterName,
      internalDate: scheduled.internalDate,
    });
    await safeLog(() => scheduledEvent(ctx, { shortNotice }));

    return { success: true, data: { date: scheduled.internalDate } };
  } catch (err) {
    console.error(`[scheduleCaseAction] failed: ${errClass(err)}`);
    return { success: false, error: "Případ se nepodařilo zařadit." };
  }
}

/** Vrácení do zásobníku, přihlášky se vrací na zájmy. */
export async function unscheduleCaseAction(caseId: string): Promise<ActionResult> {
  const auth = await requireManagementRole(MANAGEMENT_ROLES);
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(caseId)) return { success: false, error: MESSAGES.invalidInput };

  try {
    const row = await unscheduleCaseGuarded(caseId);
    if (!row) {
      const current = await getCaseById(caseId);
      return { success: false, error: current ? MESSAGES.notScheduled : MESSAGES.notFound };
    }
    await safeLog(() => unscheduledEvent(eventCtx(actor.name, row)));
    revalidateMastermind(true);
    return { success: true };
  } catch (err) {
    console.error(`[unscheduleCaseAction] failed: ${errClass(err)}`);
    return { success: false, error: "Případ se nepodařilo vrátit do zásobníku." };
  }
}

/** Potvrzení „Odprezentováno“ až v den interní nebo po ní. */
export async function confirmPresentedAction(caseId: string): Promise<ActionResult> {
  const auth = await requireManagementRole(MANAGEMENT_ROLES);
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(caseId)) return { success: false, error: MESSAGES.invalidInput };

  try {
    const row = await confirmPresentedGuarded({
      caseId,
      actorId: actor.memberId,
      todayPrague: todayInPrague(),
    });
    if (!row) {
      const current = await getCaseById(caseId);
      if (!current) return { success: false, error: MESSAGES.notFound };
      return {
        success: false,
        error: current.status === "scheduled" ? MESSAGES.cannotConfirm : MESSAGES.notScheduled,
      };
    }
    await safeLog(() => presentedEvent(eventCtx(actor.name, row)));
    revalidateMastermind(true);
    return { success: true };
  } catch (err) {
    console.error(`[confirmPresentedAction] failed: ${errClass(err)}`);
    return { success: false, error: "Odprezentování se nepodařilo potvrdit." };
  }
}

/** Vrácení potvrzení (K13), jen oprava překlepu. `warn` v logu. */
export async function undoPresentedAction(caseId: string): Promise<ActionResult> {
  const auth = await requireManagementRole(MANAGEMENT_ROLES);
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(caseId)) return { success: false, error: MESSAGES.invalidInput };

  try {
    const row = await undoPresentedGuarded(caseId);
    if (!row) {
      const current = await getCaseById(caseId);
      if (!current) return { success: false, error: MESSAGES.notFound };
      // Stále odprezentovaný, ale příkaz neprošel: člen má už 5 otevřených (m-5).
      if (current.status === "presented") {
        return { success: false, error: MESSAGES.undoLimit(current.presenterName) };
      }
      return { success: false, error: MESSAGES.notPresented };
    }
    await safeLog(() => presentedUndoneEvent(eventCtx(actor.name, row)));
    revalidateMastermind(true);
    return { success: true };
  } catch (err) {
    console.error(`[undoPresentedAction] failed: ${errClass(err)}`);
    return { success: false, error: "Potvrzení se nepodařilo vrátit." };
  }
}
