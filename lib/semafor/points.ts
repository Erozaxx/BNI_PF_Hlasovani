/**
 * iter-044 (arch 6.3, 4.3): čistá pravidla ručních bodů semaforu (školení,
 * poděkování, přivedený host, který se stal členem, akce, ostatní práce).
 * Žádná DB, žádný Next. Validace vrací klíč hlášky (`PointErrorKey`), text
 * je v `lib/semafor/texts.ts`. SQL v `lib/db/queries/semafor-points.ts`
 * pravidla opakuje (autorita je SQL, tohle je rychlá cesta pro hlášku).
 */
import { z } from "zod";
import { absenceWindowStart } from "@/lib/attendance/rules";
import { isValidDateString } from "@/lib/members/activity";
import { WORK_POINTS } from "@/lib/semafor/bonus";
import { cleanText } from "@/lib/text/clean";

/** Kategorie v tabulce `semafor_point` (CHECK `sp_category`). */
export const POINT_CATEGORIES = ["training", "thanks", "host_member", "activity", "work"] as const;
export type PointCategory = (typeof POINT_CATEGORIES)[number];

/** Kategorie, které zapisuje vedení (poděkování píše kdokoli). */
export const MANUAL_CATEGORIES = ["training", "host_member", "activity", "work"] as const;
export type ManualCategory = (typeof MANUAL_CATEGORIES)[number];

export function isPointCategory(v: unknown): v is PointCategory {
  return typeof v === "string" && (POINT_CATEGORIES as readonly string[]).includes(v);
}

/** Hranice délky textu poděkování, tématu, popisu práce (po `trim`). */
export const NOTE_LENGTH = { min: 3, max: 300 } as const;
export const TITLE_LENGTH = { min: 3, max: 120 } as const;
/** Nejvýš tolik účastníků jedné akce (jeden zápis). */
export const MAX_ACTIVITY_MEMBERS = 60;

export type PointErrorKey =
  | "errThanksSelf"
  | "errThanksText"
  | "errThanksDuplicate"
  | "errSelf"
  | "errDate"
  | "errNote"
  | "errPoints"
  | "errTitle"
  | "errNoMembers"
  | "errNewMember"
  | "errNotCommittee"
  | "errInactive"
  | "errDuplicate"
  | "errActivityDuplicate"
  | "errActivityMissing"
  | "errWorkDuplicate"
  | "errNoTable"
  | "errNoPermission";

/** Datum události: `(dnes - 6 měsíců, dnes]`, stejná hranice jako okno absencí. */
export function pointDateRange(today: string): { after: string; to: string } {
  return { after: absenceWindowStart(today), to: today };
}

export function dateInPointRange(date: unknown, today: string): date is string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidDateString(date)) return false;
  const r = pointDateRange(today);
  return date > r.after && date <= r.to;
}

/** `cleanText`: bez znaků nulové šířky, směrových a řídicích znaků, potom `trim` (security L-3). */
const trimmed = cleanText;

export function noteLengthOk(note: string): boolean {
  return note.length >= NOTE_LENGTH.min && note.length <= NOTE_LENGTH.max;
}

export type Validated<T> = { ok: true; value: T } | { ok: false; error: PointErrorKey };

/** Poděkování: text 3 až 300 znaků po `trim`, ne sám sobě. */
export function validateThanks(input: {
  actorId: string;
  recipientId: string;
  text: unknown;
}): Validated<{ recipientId: string; text: string }> {
  if (input.recipientId === input.actorId) return { ok: false, error: "errThanksSelf" };
  const text = trimmed(input.text);
  if (!noteLengthOk(text)) return { ok: false, error: "errThanksText" };
  return { ok: true, value: { recipientId: input.recipientId, text } };
}

export type ManualInput =
  | { category: "training"; memberId: string; heldOn: unknown; topic: unknown }
  | { category: "work"; memberId: string; workedOn: unknown; points: unknown; description: unknown }
  | { category: "host_member"; memberId: string; newMemberId: string };

export type ManualValue =
  | { category: "training"; memberId: string; earnedOn: string; note: string }
  | { category: "work"; memberId: string; earnedOn: string; note: string; points: number }
  | { category: "host_member"; memberId: string; refMemberId: string };

/**
 * Ruční kategorie zapisované vedením: ne sám sobě (`actorId`), datum
 * v rozpětí, text 3 až 300, body ostatní práce celé 1 až `WORK_POINTS.max`.
 * U `host_member` se datum bere z DB (`joined_at` nového člena), ne ze vstupu.
 */
export function validateManual(actorId: string, input: ManualInput, today: string): Validated<ManualValue> {
  if (input.memberId === actorId) return { ok: false, error: "errSelf" };
  if (input.category === "host_member") {
    if (input.newMemberId === input.memberId) return { ok: false, error: "errNewMember" };
    return { ok: true, value: { category: "host_member", memberId: input.memberId, refMemberId: input.newMemberId } };
  }
  if (input.category === "training") {
    if (!dateInPointRange(input.heldOn, today)) return { ok: false, error: "errDate" };
    const note = trimmed(input.topic);
    if (!noteLengthOk(note)) return { ok: false, error: "errNote" };
    return { ok: true, value: { category: "training", memberId: input.memberId, earnedOn: input.heldOn, note } };
  }
  if (!dateInPointRange(input.workedOn, today)) return { ok: false, error: "errDate" };
  const pts = typeof input.points === "string" && input.points.trim() !== "" ? Number(input.points) : input.points;
  if (typeof pts !== "number" || !Number.isInteger(pts) || pts < WORK_POINTS.min || pts > WORK_POINTS.max) {
    return { ok: false, error: "errPoints" };
  }
  const note = trimmed(input.description);
  if (!noteLengthOk(note)) return { ok: false, error: "errNote" };
  return {
    ok: true,
    value: { category: "work", memberId: input.memberId, earnedOn: input.workedOn, note, points: pts },
  };
}

/** Akce chapteru: název 3 až 120, datum v rozpětí, 1 až 60 účastníků (aktér mezi nimi není). */
export function validateActivity(
  actorId: string,
  input: { title: unknown; heldOn: unknown; memberIds: readonly string[] },
  today: string
): Validated<{ title: string; heldOn: string; memberIds: string[] }> {
  const title = trimmed(input.title);
  if (title.length < TITLE_LENGTH.min || title.length > TITLE_LENGTH.max) return { ok: false, error: "errTitle" };
  if (!dateInPointRange(input.heldOn, today)) return { ok: false, error: "errDate" };
  const ids = Array.from(new Set(input.memberIds)).filter((id) => id !== actorId);
  if (ids.length === 0 || ids.length > MAX_ACTIVITY_MEMBERS) return { ok: false, error: "errNoMembers" };
  return { ok: true, value: { title, heldOn: input.heldOn, memberIds: ids } };
}

/** Příznaky, které vrací jeden zápisový SQL příkaz (`chk` CTE + počet vložených řádků). */
export interface WriteFlags {
  /** Aktér má právo (`undefined` = kontrola se netýká, poděkování). */
  perm?: boolean;
  /** Aktér drží funkci Člen výboru (`undefined` = netýká se). */
  committee?: boolean;
  self: boolean;
  active: boolean;
  inserted: number;
}

export type WriteOutcome = "ok" | PointErrorKey;

/**
 * Z příznaků SQL udělá klíč hlášky v pořadí perm, committee, self, active,
 * duplicita. Duplicita = kontroly prošly a nic se nevložilo (`ON CONFLICT DO
 * NOTHING` bez cíle).
 */
export function pointWriteOutcome(
  flags: WriteFlags,
  duplicateKey: "errDuplicate" | "errWorkDuplicate" | "errThanksDuplicate" = "errDuplicate"
): WriteOutcome {
  if (flags.perm === false) return "errNoPermission";
  if (flags.committee === false) return "errNotCommittee";
  if (flags.self) return "errSelf";
  if (!flags.active) return "errInactive";
  if (flags.inserted === 0) return duplicateKey;
  return "ok";
}

/**
 * Smí aktér záznam smazat (TS protějšek, pravdu určuje SQL). Autor svůj
 * poděkování ano, cizí ne; držitel `semafor.points` cokoli.
 */
export function canDeletePoint(
  actor: { memberId: string; canPoints: boolean },
  point: { category: PointCategory; createdBy: string | null }
): boolean {
  if (actor.canPoints) return true;
  return point.category === "thanks" && point.createdBy !== null && point.createdBy === actor.memberId;
}

// ── zod schémata vstupů akcí ─────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const pointUuidSchema = z.string().regex(UUID);
export const pointIdListSchema = z.array(pointUuidSchema).max(MAX_ACTIVITY_MEMBERS);
