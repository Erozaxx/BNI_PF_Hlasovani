"use server";

import { revalidatePath } from "next/cache";
import { requireManagementRole, requireAdmin } from "@/lib/auth/guards";
import { drizzle } from "drizzle-orm/neon-http";
import { getSql } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import {
  event,
  eventOption,
  eventParticipant,
  member,
} from "@/lib/db/schema";
import { getEventById, markEventDone, getEventParticipants } from "@/lib/db/queries/events";
import { getParticipantById } from "@/lib/db/queries/participants";
import { bulkCreateParticipantsFromMembers } from "@/lib/events/bulk-participants";
import {
  generateEventToken,
  hashEventToken,
  sendEventMagicLink,
  buildEventLink,
} from "@/lib/events/magic-link";
import { castVote } from "@/lib/events/voting";
import type { ActionResult } from "@/lib/types";

function getDb() {
  return drizzle(getSql());
}

// ─── Event CRUD ───────────────────────────────────────────────────────────────

/**
 * Create a new event. Requires admin or moderator role.
 * Automatically bulk-creates participants from all current members.
 */
export async function createEventAction(
  title: string,
  config: {
    votingType?: "pick_one" | "multiple" | "max_x";
    votingMaxX?: number;
    whoCanVote?: "members_only" | "anyone_with_link";
    customOptionsAllowed?: boolean;
    whoCanAddOptions?: "members_only" | "anyone_with_link";
    optionType?: "text" | "date" | "datetime";
    expiresAt?: Date;
  },
  description?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!title || !title.trim()) {
    return { success: false, error: "Nazev akce je povinny." };
  }

  if (
    config.votingType === "max_x" &&
    (config.votingMaxX === undefined || config.votingMaxX < 1)
  ) {
    return {
      success: false,
      error: "Pro typ hlasovani max_x je povinny limit (min. 1).",
    };
  }

  try {
    const db = getDb();

    const [newEvent] = await db
      .insert(event)
      .values({
        title: title.trim(),
        description: description?.trim() ?? null,
        status: "draft",
        votingType: config.votingType ?? "pick_one",
        votingMaxX: config.votingMaxX ?? null,
        whoCanVote: config.whoCanVote ?? "members_only",
        customOptionsAllowed: config.customOptionsAllowed ?? false,
        whoCanAddOptions: config.whoCanAddOptions ?? "members_only",
        optionType: config.optionType ?? "text",
        expiresAt: config.expiresAt ?? (() => { const d = new Date(); d.setMonth(d.getMonth() + 3); return d; })(),
        createdBy: auth.session.memberId,
      })
      .returning();

    // Bulk-create participants from all current members (synchronous, in same request)
    await bulkCreateParticipantsFromMembers(newEvent.id, newEvent.title);

    revalidatePath("/events");
    return { success: true, data: { id: newEvent.id } };
  } catch (error) {
    console.error("createEventAction error:", error);
    return { success: false, error: "Nepodarilo se vytvorit akci." };
  }
}

/**
 * Update event title and description. Requires admin or moderator.
 * Only allowed in draft or active status.
 */
export async function updateEventAction(
  id: string,
  title: string,
  description?: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!title || !title.trim()) {
    return { success: false, error: "Nazev akce je povinny." };
  }

  try {
    const existing = await getEventById(id);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "draft" && existing.status !== "active") {
      return {
        success: false,
        error: "Editovat lze pouze akce ve stavu draft nebo active.",
      };
    }

    await getDb()
      .update(event)
      .set({
        title: title.trim(),
        description: description?.trim() ?? null,
      })
      .where(eq(event.id, id));

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    return { success: true };
  } catch (error) {
    console.error("updateEventAction error:", error);
    return { success: false, error: "Nepodarilo se aktualizovat akci." };
  }
}

/**
 * Delete an event. Requires admin role.
 * Allowed only in draft, closed, or done status (not active).
 */
export async function deleteEventAction(id: string): Promise<ActionResult> {
  const auth = await requireAdmin();
  if (!auth.success) return auth;

  try {
    const existing = await getEventById(id);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status === "active") {
      return {
        success: false,
        error:
          "Aktivni akci nelze smazat. Nejdrive akci uzavrete.",
      };
    }

    await getDb().delete(event).where(eq(event.id, id));

    revalidatePath("/events");
    return { success: true };
  } catch (error) {
    console.error("deleteEventAction error:", error);
    return { success: false, error: "Nepodarilo se smazat akci." };
  }
}

// ─── State transitions ────────────────────────────────────────────────────────

/**
 * Activate an event (draft → active). Requires admin or moderator.
 */
export async function activateEventAction(id: string): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getEventById(id);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "draft") {
      return {
        success: false,
        error: "Aktivovat lze pouze akce ve stavu draft.",
      };
    }

    await getDb()
      .update(event)
      .set({ status: "active", activatedAt: new Date() })
      .where(eq(event.id, id));

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    return { success: true };
  } catch (error) {
    console.error("activateEventAction error:", error);
    return { success: false, error: "Nepodarilo se aktivovat akci." };
  }
}

/**
 * Close an event (active → closed). Requires admin or moderator.
 */
export async function closeEventAction(id: string): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getEventById(id);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "active") {
      return {
        success: false,
        error: "Uzavrit lze pouze aktivni akce.",
      };
    }

    await getDb()
      .update(event)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(event.id, id));

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    return { success: true };
  } catch (error) {
    console.error("closeEventAction error:", error);
    return { success: false, error: "Nepodarilo se uzavrit akci." };
  }
}

/**
 * Set the selected option on a closed event. Requires admin or moderator.
 */
export async function setSelectedOptionAction(
  id: string,
  optionId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getEventById(id);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "closed") {
      return {
        success: false,
        error: "Vysledek lze oznacit pouze u uzavrene akce.",
      };
    }

    const db = getDb();

    // If event uses date/datetime options, parse winning label → update expiresAt
    let expiresAtUpdate: Date | undefined;
    if (existing.optionType === "date" || existing.optionType === "datetime") {
      const optRow = await db
        .select({ label: eventOption.label })
        .from(eventOption)
        .where(and(eq(eventOption.id, optionId), eq(eventOption.eventId, id)))
        .limit(1);
      if (optRow[0]) {
        const parsed = parseCzechDateLabel(optRow[0].label, existing.optionType);
        if (parsed) expiresAtUpdate = parsed;
      }
    }

    await db
      .update(event)
      .set({
        selectedOptionId: optionId,
        ...(expiresAtUpdate ? { expiresAt: expiresAtUpdate } : {}),
      })
      .where(eq(event.id, id));

    revalidatePath("/events");
    revalidatePath(`/events/${id}`);
    return { success: true };
  } catch (error) {
    console.error("setSelectedOptionAction error:", error);
    return { success: false, error: "Nepodarilo se nastavit vysledek." };
  }
}

/** Parse Czech date label "D. M. YYYY" or "D. M. YYYY HH:MM" → Date (local). */
function parseCzechDateLabel(label: string, optionType: string): Date | null {
  const dateRe = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/;
  const datetimeRe = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\s+(\d{2}):(\d{2})$/;
  if (optionType === "datetime") {
    const m = label.trim().match(datetimeRe);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), parseInt(m[4]), parseInt(m[5]));
  }
  if (optionType === "date") {
    const m = label.trim().match(dateRe);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  }
  return null;
}

/**
 * Manually mark a closed event as done (token revocation + done state).
 * Requires admin or moderator role.
 */
export async function markEventDoneAction(eventId: string): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getEventById(eventId);
    if (!existing) return { success: false, error: "Akce nebyla nalezena." };
    if (existing.status !== "closed") {
      return { success: false, error: "Pouze uzavrenou akci lze oznacit jako konanou." };
    }

    await markEventDone(eventId);
    revalidatePath("/events");
    revalidatePath(`/events/${eventId}`);
    return { success: true };
  } catch (error) {
    console.error("markEventDoneAction error:", error);
    return { success: false, error: "Nepodarilo se oznacit akci jako konanou." };
  }
}

// ─── Options management ────────────────────────────────────────────────────────

/**
 * Add an option to an event. Requires admin or moderator.
 * Allowed in draft and active status.
 */
export async function addOptionAction(
  eventId: string,
  label: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!label || !label.trim()) {
    return { success: false, error: "Nazev moznosti je povinny." };
  }

  try {
    const existing = await getEventById(eventId);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "draft" && existing.status !== "active") {
      return {
        success: false,
        error: "Moznosti lze pridavat pouze u akcí ve stavu draft nebo active.",
      };
    }

    const [newOption] = await getDb()
      .insert(eventOption)
      .values({ eventId, label: label.trim() })
      .returning();

    revalidatePath(`/events/${eventId}`);
    return { success: true, data: { id: newOption.id } };
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError?.code === "23505") {
      return {
        success: false,
        error: "Moznost s timto nazvem jiz existuje.",
      };
    }
    console.error("addOptionAction error:", error);
    return { success: false, error: "Nepodarilo se pridat moznost." };
  }
}

/**
 * Remove an option from an event. Requires admin or moderator.
 * Allowed in draft and active status.
 */
export async function removeOptionAction(
  eventId: string,
  optionId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getEventById(eventId);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "draft" && existing.status !== "active") {
      return {
        success: false,
        error: "Moznosti lze odebirat pouze u akcí ve stavu draft nebo active.",
      };
    }

    await getDb()
      .delete(eventOption)
      .where(
        and(eq(eventOption.id, optionId), eq(eventOption.eventId, eventId))
      );

    revalidatePath(`/events/${eventId}`);
    return { success: true };
  } catch (error) {
    console.error("removeOptionAction error:", error);
    return { success: false, error: "Nepodarilo se odebrat moznost." };
  }
}

// ─── Participants management ───────────────────────────────────────────────────

/**
 * Add an external participant to an event. Requires admin or moderator.
 * Generates and stores a magic token, sends email if address provided.
 * Allowed in draft and active status.
 */
export async function addParticipantAction(
  eventId: string,
  name: string,
  email?: string
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  if (!name || !name.trim()) {
    return { success: false, error: "Jmeno ucastnika je povinne." };
  }

  try {
    const existing = await getEventById(eventId);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "draft" && existing.status !== "active") {
      return {
        success: false,
        error: "Ucastniky lze pridavat pouze u akcí ve stavu draft nebo active.",
      };
    }

    const rawToken = generateEventToken();
    const tokenHash = hashEventToken(rawToken);

    const [participant] = await getDb()
      .insert(eventParticipant)
      .values({
        eventId,
        externalName: name.trim(),
        externalEmail: email?.trim() || null,
        magicTokenHash: tokenHash,
        tokenCreatedAt: new Date(),
      })
      .returning();

    // Send magic link email if email is provided
    if (email?.trim()) {
      const emailResult = await sendEventMagicLink(
        email.trim(),
        name.trim(),
        existing.title,
        rawToken,
        eventId
      );
      if (!emailResult.success) {
        console.warn(
          `addParticipantAction: email send failed for ${email}: ${emailResult.error}`
        );
      }
    }

    revalidatePath(`/events/${eventId}`);
    return { success: true, data: { id: participant.id } };
  } catch (error: unknown) {
    const dbError = error as { code?: string };
    if (dbError?.code === "23505") {
      return {
        success: false,
        error: "Ucastnik s timto emailem jiz existuje v teto akci.",
      };
    }
    console.error("addParticipantAction error:", error);
    return { success: false, error: "Nepodarilo se pridat ucastnika." };
  }
}

/**
 * Remove a participant from an event. Requires admin or moderator.
 * Allowed in draft and active status.
 */
export async function removeParticipantAction(
  eventId: string,
  participantId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const existing = await getEventById(eventId);
    if (!existing) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (existing.status !== "draft" && existing.status !== "active") {
      return {
        success: false,
        error: "Ucastniky lze odebirat pouze u akcí ve stavu draft nebo active.",
      };
    }

    await getDb()
      .delete(eventParticipant)
      .where(
        and(
          eq(eventParticipant.id, participantId),
          eq(eventParticipant.eventId, eventId)
        )
      );

    revalidatePath(`/events/${eventId}`);
    return { success: true };
  } catch (error) {
    console.error("removeParticipantAction error:", error);
    return { success: false, error: "Nepodarilo se odebrat ucastnika." };
  }
}

/**
 * Resend magic link email to a participant. Requires admin or moderator.
 * Only works when the event is active (magic links are functional).
 */
export async function resendMagicLinkAction(
  participantId: string
): Promise<ActionResult> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const participant = await getParticipantById(participantId);
    if (!participant) {
      return { success: false, error: "Ucastnik nebyl nalezen." };
    }

    const eventData = await getEventById(participant.eventId);
    if (!eventData) {
      return { success: false, error: "Akce nebyla nalezena." };
    }

    if (eventData.status !== "active") {
      return {
        success: false,
        error: "Pozvankovy email lze odeslat pouze pro aktivni akce.",
      };
    }

    if (!participant.magicTokenHash) {
      return {
        success: false,
        error: "Ucastnik nema vygenerovany token. Obnovte token nejdrive.",
      };
    }

    // Determine email and name
    let email: string | null = null;
    let name: string = "Ucastnik";

    if (participant.memberId) {
      // BNI member — load from member table
      const [memberRow] = await getDb()
        .select({ email: member.email, name: member.name })
        .from(member)
        .where(eq(member.id, participant.memberId))
        .limit(1);

      if (!memberRow) {
        return { success: false, error: "Clen nebyl nalezen." };
      }
      email = memberRow.email;
      name = memberRow.name;
    } else {
      email = participant.externalEmail;
      name = participant.externalName ?? "Ucastnik";
    }

    if (!email) {
      return {
        success: false,
        error: "Ucastnik nema zadany email — email nelze odeslat.",
      };
    }

    // We can't recover the raw token from the hash — generate a new token
    const rawToken = generateEventToken();
    const tokenHash = hashEventToken(rawToken);

    await getDb()
      .update(eventParticipant)
      .set({ magicTokenHash: tokenHash, tokenCreatedAt: new Date() })
      .where(eq(eventParticipant.id, participantId));

    const emailResult = await sendEventMagicLink(
      email,
      name,
      eventData.title,
      rawToken,
      eventData.id
    );

    if (!emailResult.success) {
      return {
        success: false,
        error: `Email se nepodarilo odeslat: ${emailResult.error}`,
      };
    }

    revalidatePath(`/events/${eventData.id}`);
    return { success: true };
  } catch (error) {
    console.error("resendMagicLinkAction error:", error);
    return { success: false, error: "Nepodarilo se odeslat pozvankovy email." };
  }
}

/**
 * Resend magic link to all participants with an email address.
 * Generates a new token for each, updates DB, sends email.
 * Returns count of emails sent.
 */
export async function resendAllMagicLinksAction(
  eventId: string
): Promise<ActionResult<{ sent: number; skipped: number }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const eventData = await getEventById(eventId);
    if (!eventData) return { success: false, error: "Akce nebyla nalezena." };
    if (eventData.status !== "active") {
      return { success: false, error: "Hromadne odeslani je mozne pouze u aktivni akce." };
    }

    const participants = await getEventParticipants(eventId);
    const db = getDb();

    let sent = 0;
    let skipped = 0;

    for (const p of participants) {
      const email = p.memberEmail ?? p.externalEmail ?? null;
      const name = p.memberName ?? p.externalName ?? "Ucastnik";

      if (!email) { skipped++; continue; }

      const rawToken = generateEventToken();
      const tokenHash = hashEventToken(rawToken);

      await db
        .update(eventParticipant)
        .set({ magicTokenHash: tokenHash, tokenCreatedAt: new Date() })
        .where(eq(eventParticipant.id, p.id));

      const emailResult = await sendEventMagicLink(email, name, eventData.title, rawToken, eventId);
      if (emailResult.success) {
        sent++;
      } else {
        console.warn(`resendAllMagicLinksAction: email failed for ${p.id} (${email}): ${emailResult.error}`);
        skipped++;
      }
    }

    revalidatePath(`/events/${eventId}`);
    return { success: true, data: { sent, skipped } };
  } catch (error) {
    console.error("resendAllMagicLinksAction error:", error);
    return { success: false, error: "Nepodarilo se odeslat hromadne pozvanky." };
  }
}

/**
 * Regenerate (reset) a participant's magic token. Requires admin or moderator.
 * Old token is immediately invalidated.
 */
export async function resetParticipantTokenAction(
  participantId: string
): Promise<ActionResult<{ link: string }>> {
  const auth = await requireManagementRole(["admin", "moderator"]);
  if (!auth.success) return auth;

  try {
    const participant = await getParticipantById(participantId);
    if (!participant) {
      return { success: false, error: "Ucastnik nebyl nalezen." };
    }

    const rawToken = generateEventToken();
    const tokenHash = hashEventToken(rawToken);

    await getDb()
      .update(eventParticipant)
      .set({ magicTokenHash: tokenHash, tokenCreatedAt: new Date() })
      .where(eq(eventParticipant.id, participantId));

    const link = buildEventLink(participant.eventId, rawToken);

    revalidatePath(`/events/${participant.eventId}`);
    return { success: true, data: { link } };
  } catch (error) {
    console.error("resetParticipantTokenAction error:", error);
    return { success: false, error: "Nepodarilo se obnovit token ucastnika." };
  }
}

// ─── Voting ───────────────────────────────────────────────────────────────────

/**
 * Cast a vote for an event participant.
 * This action is cookie-free / session-free — auth is via URL token (participantId from verified token).
 * The caller (route handler / page) must verify the token BEFORE calling this action.
 *
 * eventId is used for pick_one (delete all votes for this event).
 */
export async function castVoteAction(
  participantId: string,
  optionId: string,
  eventId: string,
  votingType: "pick_one" | "multiple" | "max_x",
  options?: {
    action?: "add" | "remove";
    maxX?: number;
  }
): Promise<ActionResult> {
  // Validate inputs
  if (!participantId || !optionId || !eventId) {
    return { success: false, error: "Neplatne parametry hlasovani." };
  }

  try {
    // Verify the event is still active
    const eventData = await getEventById(eventId);
    if (!eventData) {
      return { success: false, error: "Akce nebyla nalezena." };
    }
    if (eventData.status !== "active") {
      return {
        success: false,
        error: "Hlasovat lze pouze v aktivni akci.",
      };
    }

    // For max_x: always use votingMaxX from DB — do not rely on client-provided value
    const resolvedOptions =
      votingType === "max_x"
        ? { ...options, maxX: eventData.votingMaxX ?? options?.maxX }
        : options;

    const result = await castVote(participantId, eventId, optionId, votingType, resolvedOptions);

    if (!result.success) {
      return { success: false, error: result.error ?? "Hlasovani se nepodarilo." };
    }

    revalidatePath(`/e/${eventId}`);
    return { success: true };
  } catch (error) {
    console.error("castVoteAction error:", error);
    return { success: false, error: "Hlasovani se nepodarilo. Zkuste to znovu." };
  }
}
