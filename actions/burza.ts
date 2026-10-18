"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAuth, requireManagementRole } from "@/lib/auth/guards";
import {
  confirmOfferGuarded,
  createOfferGuarded,
  getHelpMissReason,
  recordHelpGuarded,
  removeHelpGuarded,
  removeOfferGuarded,
  updateOfferGuarded,
} from "@/lib/db/queries/burza";
import {
  helpRemovedEvent,
  offerEvent,
  type BurzaEventCtx,
  type OfferEventAction,
} from "@/lib/burza/events";
import {
  MESSAGES,
  canEditOffer,
  isUuid,
  mapDbError,
  validateHelpNote,
  validateIsNew,
  validateOfferInput,
} from "@/lib/burza/rules";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import type { SessionData } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/types";

/**
 * iter-035 (T-005, arch T-001 sekce 5, gate Z1 až Z6): Burza pomoci.
 * `memberId` aktéra je vždy ze session, nikdy z klienta.
 *
 * Guard na začátku každé akce je závazný a hlídá ho statický test
 * (scripts/test-iter-035-burza.ts): `requireAuth` pro saveOffer, confirmOffer,
 * removeOffer, recordHelp a removeHelp, `requireManagementRole` pro
 * recordHelpFor. U akcí s `requireAuth` platí autorita ve WHERE příkazu
 * (`$target = $me OR $isManagement`, `$isManagement` ze session).
 *
 * Bez transakcí (LL-003): každá akce je jeden SQL příkaz a log až po něm.
 * Do logu ani do `detail` nejde e-mailová adresa, text řádku, kontakt ani
 * poznámka. Žádné maily.
 */

const MANAGEMENT_ROLES: Array<"admin" | "moderator"> = ["admin", "moderator"];

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** Kód chyby Postgresu z výjimky driveru (přímo, nebo v `cause`). */
function dbErrorCode(err: unknown): string | null {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : null;
}

function isManagementSession(session: SessionData): boolean {
  return session.managementRole === "admin" || session.managementRole === "moderator";
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(build: () => OpsEventInput | null): Promise<void> {
  try {
    const event = build();
    if (event) await logOpsEvent(event);
  } catch (err) {
    console.error(`[burza] ops log failed: ${errClass(err)}`);
  }
}

function eventCtx(session: SessionData): BurzaEventCtx {
  return {
    runId: randomUUID(),
    actor: session.name,
    actorId: session.memberId,
    isManagement: isManagementSession(session),
  };
}

function revalidateOffers(): void {
  revalidatePath("/burza");
  revalidatePath("/dashboard");
}

// ── Řádek ──

export type SaveOfferInput = {
  memberId: string;
  offer: string;
  contact?: string | null;
  note?: string | null;
  /** Formulář se načetl bez řádku (založení), jinak úprava. */
  isNew: boolean;
};

/**
 * Založení (`isNew = true`) je `INSERT ... ON CONFLICT (member_id) DO NOTHING`,
 * úprava (`isNew = false`) je `UPDATE`. Smazaný řádek se z cizího otevřeného
 * formuláře znovu nezaloží. Uložení je zároveň potvrzení.
 */
export async function saveOfferAction(
  input: SaveOfferInput
): Promise<ActionResult<{ created: boolean }>> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  if (typeof input !== "object" || input === null) {
    return { success: false, error: MESSAGES.invalidInput };
  }
  if (!isUuid(input.memberId) || !validateIsNew(input.isNew)) {
    return { success: false, error: MESSAGES.invalidInput };
  }
  const parsed = validateOfferInput(input);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const isManagement = isManagementSession(actor);
  if (!canEditOffer({ memberId: actor.memberId, isManagement }, input.memberId)) {
    return { success: false, error: MESSAGES.denied };
  }

  try {
    const args = {
      targetId: input.memberId,
      actorId: actor.memberId,
      isManagement,
      ...parsed.value,
    };
    const created = input.isNew;
    const owner = created ? await createOfferGuarded(args) : await updateOfferGuarded(args);
    if (!owner) {
      return {
        success: false,
        error: created ? MESSAGES.alreadyCreated : MESSAGES.deletedMeanwhile,
      };
    }
    const action: OfferEventAction = created ? "create" : "update";
    await safeLog(() => offerEvent(eventCtx(actor), owner, action));
    revalidateOffers();
    return { success: true, data: { created } };
  } catch (err) {
    console.error(`[saveOfferAction] failed: ${errClass(err)}`);
    return { success: false, error: mapDbError(dbErrorCode(err)) };
  }
}

/** „Platí dál“: jen vlastník, posune datum potvrzení. Neloguje se. */
export async function confirmOfferAction(): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  try {
    const ok = await confirmOfferGuarded(actor.memberId);
    if (!ok) return { success: false, error: MESSAGES.offerGone };
    revalidateOffers();
    return { success: true };
  } catch (err) {
    console.error(`[confirmOfferAction] failed: ${errClass(err)}`);
    return { success: false, error: MESSAGES.generic };
  }
}

/** Smazání řádku: vlastník svůj, vedení kterýkoli. */
export async function removeOfferAction(memberId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(memberId)) return { success: false, error: MESSAGES.invalidInput };

  try {
    const owner = await removeOfferGuarded({
      targetId: memberId,
      actorId: actor.memberId,
      isManagement: isManagementSession(actor),
    });
    if (!owner) return { success: false, error: MESSAGES.offerGone };
    await safeLog(() => offerEvent(eventCtx(actor), owner, "remove"));
    revalidateOffers();
    return { success: true };
  } catch (err) {
    console.error(`[removeOfferAction] failed: ${errClass(err)}`);
    return { success: false, error: mapDbError(dbErrorCode(err)) };
  }
}

// ── Pomoc využita (jen evidence) ──

export type RecordHelpResult = {
  recorded: true;
  /** Záznam na dvojici za tento měsíc už byl. */
  already: boolean;
  /** `id` záznamu za tento měsíc (pro „Zrušit“). */
  helpId: string | null;
};

async function recordHelp(opts: {
  helperId: string;
  recipientId: string;
  createdBy: string;
  note: unknown;
}): Promise<ActionResult<RecordHelpResult>> {
  if (!isUuid(opts.helperId) || !isUuid(opts.recipientId)) {
    return { success: false, error: MESSAGES.invalidInput };
  }
  if (opts.helperId === opts.recipientId) return { success: false, error: MESSAGES.selfHelp };
  const note = validateHelpNote(opts.note);
  if (!note.ok) return { success: false, error: note.error };

  try {
    const today = todayInPrague();
    const id = await recordHelpGuarded({
      helperId: opts.helperId,
      recipientId: opts.recipientId,
      createdBy: opts.createdBy,
      note: note.value,
      today,
    });
    if (id) {
      revalidatePath("/burza");
      revalidatePath("/burza/pomoc");
      return { success: true, data: { recorded: true, already: false, helpId: id } };
    }
    // Nic nevzniklo: pomocník neexistuje, nemá řádek, nebo záznam už je (cílový stav).
    const why = await getHelpMissReason({
      helperId: opts.helperId,
      recipientId: opts.recipientId,
      today,
    });
    if (why.helperName === null) return { success: false, error: MESSAGES.memberGone };
    if (!why.hasOffer) return { success: false, error: MESSAGES.helperGone(why.helperName) };
    if (why.recordedId) {
      return { success: true, data: { recorded: true, already: true, helpId: why.recordedId } };
    }
    return { success: false, error: MESSAGES.generic };
  } catch (err) {
    console.error(`[recordHelp] failed: ${errClass(err)}`);
    return { success: false, error: mapDbError(dbErrorCode(err)) };
  }
}

/** „Pomohl(a) mi“: příjemce je vždy přihlášený člen ze session. Přijímá cílový stav, ne přepínač. */
export async function recordHelpAction(
  helperId: string,
  note?: string | null
): Promise<ActionResult<RecordHelpResult>> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  return recordHelp({
    helperId,
    recipientId: actor.memberId,
    createdBy: actor.memberId,
    note,
  });
}

/** Zápis vedením podle hlášení: pomocník i příjemce z formuláře. */
export async function recordHelpForAction(
  helperId: string,
  recipientId: string,
  note?: string | null
): Promise<ActionResult<RecordHelpResult>> {
  const auth = await requireManagementRole(MANAGEMENT_ROLES);
  if (!auth.success) return auth;
  const actor = auth.session;

  // L-1: vedení nezapisuje pomoc sobě jako pomocníkovi (druhá pojistka je v SQL).
  if (helperId === actor.memberId) return { success: false, error: MESSAGES.helperIsActor };

  return recordHelp({ helperId, recipientId, createdBy: actor.memberId, note });
}

/** Smazání záznamu: příjemce svůj, vedení jakýkoli. */
export async function removeHelpAction(helpId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const actor = auth.session;

  if (!isUuid(helpId)) return { success: false, error: MESSAGES.invalidInput };

  try {
    const removed = await removeHelpGuarded({
      helpId,
      actorId: actor.memberId,
      isManagement: isManagementSession(actor),
    });
    if (!removed) return { success: false, error: MESSAGES.helpGone };
    await safeLog(() => helpRemovedEvent(eventCtx(actor), removed));
    revalidatePath("/burza");
    revalidatePath("/burza/pomoc");
    return { success: true };
  } catch (err) {
    console.error(`[removeHelpAction] failed: ${errClass(err)}`);
    return { success: false, error: mapDbError(dbErrorCode(err)) };
  }
}
