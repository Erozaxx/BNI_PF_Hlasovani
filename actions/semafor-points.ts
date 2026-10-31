"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAuth, requirePermission } from "@/lib/auth/guards";
import { requireFeature } from "@/lib/chapter/feature-guard";
import { pragueToday } from "@/lib/members/activity";
import { logOpsEvent } from "@/lib/ops/event-log";
import type { OpsEventInput } from "@/lib/ops/types";
import type { ActionResult } from "@/lib/types";
import {
  activityAddedEvent,
  activityDeletedEvent,
  pointsAddedEvent,
  pointsDeletedEvent,
} from "@/lib/semafor/events";
import {
  MAX_ACTIVITY_MEMBERS,
  pointUuidSchema,
  validateActivity,
  validateManual,
  validateThanks,
  type PointErrorKey,
} from "@/lib/semafor/points";
import { POINT_TEXTS, SEMAFOR_TEXTS, pointErrorText, pointsSavedActivityText } from "@/lib/semafor/texts";
import {
  addActivityMembers,
  deleteActivity,
  deleteOwnThanks,
  deletePoint,
  insertActivity,
  insertPoint,
  insertThanks,
} from "@/lib/db/queries/semafor-points";

/**
 * iter-044 (arch 6.3): akce vlastních bodů semaforu.
 *
 * Pořadí kroků v každé akci: guard (`requireAuth` u poděkování, `requirePermission
 * ("semafor.points")` u ostatních), `requireFeature("semafor")`, validace
 * (čisté funkce z `lib/semafor/points.ts`), jeden SQL příkaz, převod výsledku
 * na hlášku, ops log v chráněném bloku (LL-011), `revalidatePath`. `memberId`
 * aktéra je vždy ze session. Bez transakcí (LL-003).
 *
 * Pravidlo modulu (R-03): SQL větev práva smí volat jen akce, která před tím
 * prošla `requirePermission("semafor.points")`. `deleteOwnThanksAction`
 * proto volá `deleteOwnThanks` (bez větve práva), nikdy `deletePoint`.
 * Do ops logu jdou jen zásahy vedení (Q12), nikdy příjemce, text ani název akce.
 */

function errClass(err: unknown): string {
  return err instanceof Error ? err.name : typeof err;
}

/** LL-011: sestavení vstupu i zápis uvnitř try, nikdy neshodí akci. */
async function safeLog(build: () => OpsEventInput) {
  try {
    await logOpsEvent(build());
  } catch (err) {
    console.error(`[semafor-points] ops log failed: ${errClass(err)}`);
  }
}

function revalidatePoints() {
  revalidatePath("/semafor");
  revalidatePath("/semafor/body");
  revalidatePath("/semafor/prehled");
}

function fail(key: PointErrorKey, today?: string): { success: false; error: string } {
  return { success: false, error: pointErrorText(key, today) };
}

const FAILED = { success: false as const, error: SEMAFOR_TEXTS.errSaveFailed };

function field(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function uuidField(formData: FormData, name: string): string | null {
  const p = pointUuidSchema.safeParse(field(formData, name));
  return p.success ? p.data : null;
}

// ── Poděkování (každý přihlášený, i odkazem) ─────────────────

export async function thankAction(formData: FormData): Promise<ActionResult<{ message: string }>> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;
  const today = pragueToday();

  const recipientId = uuidField(formData, "recipientId");
  if (!recipientId) return fail("errThanksText");
  const v = validateThanks({ actorId: actor.memberId, recipientId, text: field(formData, "text") });
  if (!v.ok) return fail(v.error, today);

  try {
    const res = await insertThanks({ actorId: actor.memberId, recipientId, text: v.value.text, today });
    if (res.outcome !== "ok") return fail(res.outcome, today);
    revalidatePoints();
    return { success: true, data: { message: POINT_TEXTS.thanksDone } };
  } catch (err) {
    console.error(`[thankAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

/** Autor smaže své poděkování. Bez větve práva (R-03), proto `requireAuth`. */
export async function deleteOwnThanksAction(pointId: string): Promise<ActionResult> {
  const auth = await requireAuth();
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const id = pointUuidSchema.safeParse(pointId);
  if (!id.success) return FAILED;
  try {
    const res = await deleteOwnThanks({ actorId: auth.session.memberId, pointId: id.data });
    if ("noTable" in res) return fail("errNoTable");
    revalidatePoints();
    return { success: true };
  } catch (err) {
    console.error(`[deleteOwnThanksAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

// ── Školení, přivedený host, ostatní práce, akce (semafor.points) ──

export async function addTrainingAction(formData: FormData): Promise<ActionResult<{ message: string }>> {
  const auth = await requirePermission("semafor.points");
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;
  const today = pragueToday();

  const memberId = uuidField(formData, "memberId");
  if (!memberId) return fail("errInactive");
  const v = validateManual(
    actor.memberId,
    { category: "training", memberId, heldOn: field(formData, "heldOn"), topic: field(formData, "topic") },
    today
  );
  if (!v.ok || v.value.category !== "training") return fail(v.ok ? "errNote" : v.error);

  try {
    const res = await insertPoint({
      category: "training",
      actorId: actor.memberId,
      recipientId: memberId,
      earnedOn: v.value.earnedOn,
      note: v.value.note,
      today,
    });
    if (res.outcome !== "ok") return fail(res.outcome);
    await safeLog(() => pointsAddedEvent({ runId: randomUUID(), actor: actor.name }, { category: "training" }));
    revalidatePoints();
    return { success: true, data: { message: POINT_TEXTS.pointsSaved } };
  } catch (err) {
    console.error(`[addTrainingAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

export async function addHostMemberAction(formData: FormData): Promise<ActionResult<{ message: string }>> {
  const auth = await requirePermission("semafor.points");
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;
  const today = pragueToday();

  const memberId = uuidField(formData, "memberId");
  const newMemberId = uuidField(formData, "newMemberId");
  if (!memberId || !newMemberId) return fail("errNewMember");
  const v = validateManual(actor.memberId, { category: "host_member", memberId, newMemberId }, today);
  if (!v.ok) return fail(v.error);

  try {
    const res = await insertPoint({
      category: "host_member",
      actorId: actor.memberId,
      recipientId: memberId,
      refMemberId: newMemberId,
      today,
    });
    if (res.outcome !== "ok") return fail(res.outcome);
    await safeLog(() => pointsAddedEvent({ runId: randomUUID(), actor: actor.name }, { category: "host_member" }));
    revalidatePoints();
    return { success: true, data: { message: POINT_TEXTS.pointsSaved } };
  } catch (err) {
    console.error(`[addHostMemberAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

/**
 * Ostatní práci uděluje jen držitel funkce Člen výboru (Tom 30. 10.). Akce
 * nejdřív `requirePermission("semafor.points")` (vyřadí přihlášení odkazem a
 * držitele bez práva), pak SQL příkaz s obě podmínkami. Prezident, Viceprezident
 * a admin bez funkce dostanou `errNotCommittee`.
 */
export async function addWorkAction(formData: FormData): Promise<ActionResult<{ message: string }>> {
  const auth = await requirePermission("semafor.points");
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;
  const today = pragueToday();

  const memberId = uuidField(formData, "memberId");
  if (!memberId) return fail("errInactive");
  const v = validateManual(
    actor.memberId,
    {
      category: "work",
      memberId,
      workedOn: field(formData, "workedOn"),
      points: field(formData, "points"),
      description: field(formData, "description"),
    },
    today
  );
  if (!v.ok || v.value.category !== "work") return fail(v.ok ? "errNote" : v.error);
  const work = v.value;

  try {
    const res = await insertPoint({
      category: "work",
      actorId: actor.memberId,
      recipientId: memberId,
      earnedOn: work.earnedOn,
      note: work.note,
      points: work.points,
      today,
    });
    if (res.outcome !== "ok") return fail(res.outcome);
    await safeLog(() =>
      pointsAddedEvent({ runId: randomUUID(), actor: actor.name }, { category: "work", points: work.points })
    );
    revalidatePoints();
    return { success: true, data: { message: POINT_TEXTS.pointsSaved } };
  } catch (err) {
    console.error(`[addWorkAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

function memberIdsOf(formData: FormData): string[] | null {
  const ids: string[] = [];
  for (const v of formData.getAll("memberIds")) {
    const p = pointUuidSchema.safeParse(typeof v === "string" ? v : "");
    if (!p.success) return null;
    ids.push(p.data);
  }
  return ids.length <= MAX_ACTIVITY_MEMBERS ? ids : null;
}

export async function addActivityAction(formData: FormData): Promise<ActionResult<{ message: string }>> {
  const auth = await requirePermission("semafor.points");
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;
  const today = pragueToday();

  const ids = memberIdsOf(formData);
  if (!ids) return fail("errNoMembers");
  const v = validateActivity(
    actor.memberId,
    { title: field(formData, "title"), heldOn: field(formData, "heldOn"), memberIds: ids },
    today
  );
  if (!v.ok) return fail(v.error);

  try {
    const res = await insertActivity({
      actorId: actor.memberId,
      title: v.value.title,
      heldOn: v.value.heldOn,
      memberIds: v.value.memberIds,
      today,
    });
    if (res.outcome !== "ok") return fail(res.outcome);
    await safeLog(() =>
      activityAddedEvent({ runId: randomUUID(), actor: actor.name }, { participants: res.written })
    );
    revalidatePoints();
    return { success: true, data: { message: pointsSavedActivityText(res.written, res.skipped) } };
  } catch (err) {
    console.error(`[addActivityAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

export async function addActivityMembersAction(formData: FormData): Promise<ActionResult<{ message: string }>> {
  const auth = await requirePermission("semafor.points");
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;

  const activityId = uuidField(formData, "activityId");
  const ids = memberIdsOf(formData);
  if (!activityId || !ids) return fail("errNoMembers");
  const members = Array.from(new Set(ids)).filter((id) => id !== actor.memberId);
  if (members.length === 0) return fail("errNoMembers");

  try {
    const res = await addActivityMembers({ actorId: actor.memberId, activityId, memberIds: members });
    if (res.outcome !== "ok") return fail(res.outcome);
    await safeLog(() =>
      activityAddedEvent({ runId: randomUUID(), actor: actor.name }, { participants: res.written })
    );
    revalidatePoints();
    return { success: true, data: { message: pointsSavedActivityText(res.written, res.skipped) } };
  } catch (err) {
    console.error(`[addActivityMembersAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

/** Moderace: držitel `semafor.points` smaže jakýkoli záznam (i cizí poděkování). */
export async function deletePointAction(pointId: string): Promise<ActionResult> {
  const auth = await requirePermission("semafor.points");
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;
  const id = pointUuidSchema.safeParse(pointId);
  if (!id.success) return FAILED;

  try {
    const res = await deletePoint({ actorId: actor.memberId, pointId: id.data });
    if ("noTable" in res) return fail("errNoTable");
    if (res.deleted) {
      await safeLog(() =>
        pointsDeletedEvent(
          { runId: randomUUID(), actor: actor.name },
          { category: res.category, warn: !res.own && (res.category === "thanks" || res.category === "work") }
        )
      );
    }
    revalidatePoints();
    return { success: true };
  } catch (err) {
    console.error(`[deletePointAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}

export async function deleteActivityAction(activityId: string): Promise<ActionResult> {
  const auth = await requirePermission("semafor.points");
  if (!auth.success) return auth;
  const off = await requireFeature("semafor");
  if (off) return off;
  const actor = auth.session;
  const id = pointUuidSchema.safeParse(activityId);
  if (!id.success) return FAILED;

  try {
    const res = await deleteActivity({ actorId: actor.memberId, activityId: id.data });
    if ("noTable" in res) return fail("errNoTable");
    if (res.deleted) {
      await safeLog(() =>
        activityDeletedEvent({ runId: randomUUID(), actor: actor.name }, { participants: res.participants })
      );
    }
    revalidatePoints();
    return { success: true };
  } catch (err) {
    console.error(`[deleteActivityAction] failed: ${errClass(err)}`);
    return FAILED;
  }
}
