"use server";

import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import {
  addItemGuarded,
  getWriteState,
  removeItemGuarded,
  saveHeadGuarded,
  updateItemGuarded,
} from "@/lib/db/queries/client-situations";
import {
  MESSAGES,
  canEditSituations,
  decideAddMiss,
  decideHeadMiss,
  decideRemoveMiss,
  decideUpdateMiss,
  fail,
  isHeadField,
  isItemKind,
  isSlot,
  isUuid,
  missToResult,
  validateHeadValue,
  validateItemText,
  type HeadField,
  type ItemKind,
  type ItemRow,
  type SituationActionResult,
  type Slot,
} from "@/lib/situations/rules";

/**
 * iter-049 (arch 6.2, gate změna 12): akce klientských situací. `memberId`
 * aktéra je vždy ze session. Klient posílá jen `memberId` cíle, `slot` a u
 * kartičky `itemId`, nikdy id situace (statický test 11).
 *
 * Každá akce začíná `requireAuth()`. Autorita je dvojí: `canEditSituations`
 * v akci a stejná podmínka ve WHERE příkazu (SQL protějšek práva
 * `situations.manage`), takže odebrání práva platí hned.
 *
 * Chyba nese rozlišitelný `code`: `session_expired` (vypršelé přihlášení, text
 * v poli zůstane a „Zkusit znovu“ se nenabízí), `denied`, `invalid`,
 * `inactive`, `gone`, `limit`, `failed`.
 *
 * Bez transakcí (LL-003): jedna akce je jeden SQL příkaz. Do logu jde jen
 * název třídy chyby, nikdy text kartičky.
 */

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** Revalidace je jen přehled a nikdy neshodí akci, která už zapsala (LL-017: žádný `router.refresh()`). */
function revalidateOverview(): void {
  try {
    revalidatePath("/situace");
  } catch (err) {
    console.error(`[situations] revalidate failed: ${errClass(err)}`);
  }
}

export type SaveSituationHeadInput = {
  memberId: string;
  slot: Slot;
  field: HeadField;
  value: string;
};

export async function saveSituationHeadAction(
  input: SaveSituationHeadInput
): Promise<SituationActionResult<{ changed: boolean }>> {
  const auth = await requireAuth();
  if (!auth.success) return fail("session_expired", MESSAGES.sessionExpired);
  const actor = auth.session;

  if (
    typeof input !== "object" ||
    input === null ||
    !isUuid(input.memberId) ||
    !isSlot(input.slot) ||
    !isHeadField(input.field)
  ) {
    return fail("invalid", MESSAGES.invalidInput);
  }
  const value = validateHeadValue(input.field, input.value);
  if (!value.ok) return fail("invalid", value.error);
  if (!canEditSituations({ memberId: actor.memberId, canManage: can(actor, "situations.manage") }, input.memberId)) {
    return fail("denied", MESSAGES.denied);
  }

  const args = {
    target: input.memberId,
    slot: input.slot,
    actor: actor.memberId,
    field: input.field,
    value: value.value,
  };
  try {
    const wrote = await saveHeadGuarded(args);
    if (!wrote) {
      const miss = decideHeadMiss(await getWriteState({ ...args, head: { field: args.field, value: args.value } }));
      const err = missToResult(miss);
      if (err) return fail(err.code, err.error);
      return { success: true, data: { changed: false } };
    }
    revalidateOverview();
    return { success: true, data: { changed: true } };
  } catch (err) {
    console.error(`[saveSituationHeadAction] failed: ${errClass(err)}`);
    return fail("failed", MESSAGES.saveFailed);
  }
}

export type AddSituationItemInput = {
  memberId: string;
  slot: Slot;
  /** Vygeneruje klient při otevření nové kartičky (idempotence dvojího odeslání). */
  itemId: string;
  kind: ItemKind;
  text: string;
};

export async function addSituationItemAction(
  input: AddSituationItemInput
): Promise<SituationActionResult<{ item: ItemRow }>> {
  const auth = await requireAuth();
  if (!auth.success) return fail("session_expired", MESSAGES.sessionExpired);
  const actor = auth.session;

  if (
    typeof input !== "object" ||
    input === null ||
    !isUuid(input.memberId) ||
    !isUuid(input.itemId) ||
    !isSlot(input.slot) ||
    !isItemKind(input.kind)
  ) {
    return fail("invalid", MESSAGES.invalidInput);
  }
  const text = validateItemText(input.kind, input.text);
  if (!text.ok) return fail("invalid", text.error);
  if (!canEditSituations({ memberId: actor.memberId, canManage: can(actor, "situations.manage") }, input.memberId)) {
    return fail("denied", MESSAGES.denied);
  }

  const args = {
    target: input.memberId,
    slot: input.slot,
    actor: actor.memberId,
    itemId: input.itemId,
    kind: input.kind,
    text: text.value,
  };
  try {
    const item = await addItemGuarded(args);
    if (item) {
      revalidateOverview();
      return { success: true, data: { item } };
    }
    // 0 řádků: dvojí odeslání (kartička už existuje), limit, neaktivní cíl nebo chybějící právo.
    const state = await getWriteState({
      target: args.target,
      actor: args.actor,
      slot: args.slot,
      kind: args.kind,
      itemId: args.itemId,
    });
    const miss = decideAddMiss(state, args.kind);
    const err = missToResult(miss, args.kind);
    if (err) return fail(err.code, err.error);
    if (miss.type === "ok" && miss.item) return { success: true, data: { item: miss.item } };
    return fail("failed", MESSAGES.saveFailed);
  } catch (err) {
    console.error(`[addSituationItemAction] failed: ${errClass(err)}`);
    return fail("failed", MESSAGES.saveFailed);
  }
}

export type UpdateSituationItemInput = {
  memberId: string;
  itemId: string;
  /** Typ kartičky z klienta slouží jen k validaci délky, SQL ho porovná s uloženým. */
  kind: ItemKind;
  text: string;
};

export async function updateSituationItemAction(
  input: UpdateSituationItemInput
): Promise<SituationActionResult<{ item: ItemRow }>> {
  const auth = await requireAuth();
  if (!auth.success) return fail("session_expired", MESSAGES.sessionExpired);
  const actor = auth.session;

  if (
    typeof input !== "object" ||
    input === null ||
    !isUuid(input.memberId) ||
    !isUuid(input.itemId) ||
    !isItemKind(input.kind)
  ) {
    return fail("invalid", MESSAGES.invalidInput);
  }
  const text = validateItemText(input.kind, input.text);
  if (!text.ok) return fail("invalid", text.error);
  if (!canEditSituations({ memberId: actor.memberId, canManage: can(actor, "situations.manage") }, input.memberId)) {
    return fail("denied", MESSAGES.denied);
  }

  const args = {
    target: input.memberId,
    actor: actor.memberId,
    itemId: input.itemId,
    kind: input.kind,
    text: text.value,
  };
  try {
    const item = await updateItemGuarded(args);
    if (item) {
      revalidateOverview();
      return { success: true, data: { item } };
    }
    const state = await getWriteState({ target: args.target, actor: args.actor, itemId: args.itemId });
    const miss = decideUpdateMiss(state, args.kind, args.text);
    const err = missToResult(miss);
    if (err) return fail(err.code, err.error);
    if (miss.type === "ok" && miss.item) return { success: true, data: { item: miss.item } };
    return fail("failed", MESSAGES.saveFailed);
  } catch (err) {
    console.error(`[updateSituationItemAction] failed: ${errClass(err)}`);
    return fail("failed", MESSAGES.saveFailed);
  }
}

export type RemoveSituationItemInput = {
  memberId: string;
  itemId: string;
};

export async function removeSituationItemAction(
  input: RemoveSituationItemInput
): Promise<SituationActionResult<{ removed: boolean }>> {
  const auth = await requireAuth();
  if (!auth.success) return fail("session_expired", MESSAGES.sessionExpired);
  const actor = auth.session;

  if (
    typeof input !== "object" ||
    input === null ||
    !isUuid(input.memberId) ||
    !isUuid(input.itemId)
  ) {
    return fail("invalid", MESSAGES.invalidInput);
  }
  if (!canEditSituations({ memberId: actor.memberId, canManage: can(actor, "situations.manage") }, input.memberId)) {
    return fail("denied", MESSAGES.denied);
  }

  const args = { target: input.memberId, actor: actor.memberId, itemId: input.itemId };
  try {
    const removed = await removeItemGuarded(args);
    if (removed) {
      revalidateOverview();
      return { success: true, data: { removed: true } };
    }
    // 0 řádků: kartička už není (dvojklik), neaktivní cíl nebo chybějící právo.
    const miss = decideRemoveMiss(await getWriteState(args));
    const err = missToResult(miss);
    if (err) return fail(err.code, err.error);
    return { success: true, data: { removed: false } };
  } catch (err) {
    console.error(`[removeSituationItemAction] failed: ${errClass(err)}`);
    return fail("failed", MESSAGES.saveFailed);
  }
}
