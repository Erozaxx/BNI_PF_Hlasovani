/**
 * iter-046 (arch 4.1, gate): medical člena. Období žije u člena
 * (`member.medical_from`, `medical_until`, poslední medical den včetně).
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/* ani resend.
 * SQL protějšek `isMedicalOn` je `memberMedicalOnSql` v
 * lib/db/queries/member-active.ts. Medical je zdravotní údaj: texty tady
 * nepatří do veřejného pohledu ani na tisk.
 */
import {
  addDaysToDateString,
  isValidDateString,
} from "@/lib/members/activity";

/** Nejdál smí medical končit: dnes + 365 dní. */
export const MAX_MEDICAL_DAYS = 365;

export interface MedicalFields {
  medicalFrom: string | null;
  medicalUntil: string | null;
}

/** Medical platí v den `day` (YYYY-MM-DD, pražský den). */
export function isMedicalOn(m: MedicalFields, day: string): boolean {
  return !!m.medicalFrom && !!m.medicalUntil && m.medicalFrom <= day && day <= m.medicalUntil;
}

/** „30. 11.“ z „2026-11-30“ (bez roku). */
export function formatCzDayMonth(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${Number(m[3])}. ${Number(m[2])}.`;
}

function formatCzFull(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return value;
  return `${Number(m[3])}. ${Number(m[2])}. ${m[1]}`;
}

export const MEDICAL_TEXTS = {
  title: "Medical",
  intro:
    "Člen s medical zůstává aktivní a přihlásí se. Nehlasuje, na schůzkách je omluven(a) a do absencí se mu to nepočítá.",
  untilLabel: "Medical do",
  save: "Uložit",
  clear: "Zrušit medical",
  confirmClear: "Zrušit medical? Od dneška se bude docházka počítat normálně.",
  none: "Bez medical",
  stateUntil: (d: string) => `Medical do ${formatCzFull(d)}`,
  listLabel: (d: string) => `medical do ${formatCzDayMonth(d)}`,
  self: "Sám sobě medical nastavit nejde.",
  invalidDate: "Neplatné datum.",
  pastDate: "Datum nesmí být v minulosti.",
  tooFar: "Datum může být nejpozději za rok.",
  changed: "Medical se mezitím změnil, obnov stránku.",
  notFound: "Člen nebyl nalezen.",
  adminTarget: "Účet admina smí měnit jen admin.",
  noPermission: "Na tohle nemáš oprávnění.",
  ownNotice: (d: string) =>
    `Do ${formatCzDayMonth(d)} máš medical. Na schůzkách jsi omluven(a) a do absencí se ti to nepočítá. Hlasovat do té doby nemůžeš.`,
  listTitle: "Medical",
} as const;

export type MedicalUntilResult = { ok: true; value: string } | { ok: false; error: string };

/** `until`: platné datum od dneška do dneška + 365 dní. */
export function validateMedicalUntil(value: unknown, today: string): MedicalUntilResult {
  if (typeof value !== "string" || !isValidDateString(value)) {
    return { ok: false, error: MEDICAL_TEXTS.invalidDate };
  }
  if (value < today) return { ok: false, error: MEDICAL_TEXTS.pastDate };
  if (value > addDaysToDateString(today, MAX_MEDICAL_DAYS)) {
    return { ok: false, error: MEDICAL_TEXTS.tooFar };
  }
  return { ok: true, value };
}

/** „medical do 30. 11.“, `null` když dnes neplatí. */
export function medicalLabel(m: MedicalFields, today: string): string | null {
  if (!isMedicalOn(m, today) || !m.medicalUntil) return null;
  return MEDICAL_TEXTS.listLabel(m.medicalUntil);
}

export type MedicalChangeReason =
  | "no-permission"
  | "self"
  | "not-found"
  | "admin-target"
  | "invalid-date";

export type MedicalChangeDecision =
  | { ok: true }
  | { ok: false; reason: MedicalChangeReason; message: string };

/**
 * Pořadí kontrol: právo, sebe, cíl existuje, účet admina, datum (jen
 * u nastavení, `until === undefined` u zrušení). Jen pro srozumitelnou hlášku,
 * pojistky drží SQL.
 */
export function decideMedicalChange(input: {
  actorId: string;
  hasPermission: boolean;
  target: { id: string; isAdmin: boolean } | null;
  actorIsAdmin: boolean;
  until?: unknown;
  today: string;
}): MedicalChangeDecision {
  if (!input.hasPermission) {
    return { ok: false, reason: "no-permission", message: MEDICAL_TEXTS.noPermission };
  }
  if (input.target && input.target.id === input.actorId) {
    return { ok: false, reason: "self", message: MEDICAL_TEXTS.self };
  }
  if (!input.target) {
    return { ok: false, reason: "not-found", message: MEDICAL_TEXTS.notFound };
  }
  if (input.target.isAdmin && !input.actorIsAdmin) {
    return { ok: false, reason: "admin-target", message: MEDICAL_TEXTS.adminTarget };
  }
  if (input.until !== undefined) {
    const v = validateMedicalUntil(input.until, input.today);
    if (!v.ok) return { ok: false, reason: "invalid-date", message: v.error };
  }
  return { ok: true };
}
