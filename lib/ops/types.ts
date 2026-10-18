/**
 * iter-027 (T-005) — datový model logu běhů (arch iter-027 T-001, sekce 3, 9).
 *
 * Čistý typový modul: žádný import drizzle-orm, @/lib/db/*, next/server ani
 * resend. Bezpečné pro scripts/test-ops-events.ts (tsx bez DATABASE_URL).
 *
 * `OpsEventInput` je záměrně uzavřený typ (9.1, vrstva 1 proti úniku tokenů):
 * NEMÁ pole `url`, `link`, `token`, `href` ani `rawToken`. Kdo by chtěl
 * zalogovat magic link, musí nejdřív rozšířit tenhle typ — to je viditelná
 * změna v code review, ne překlep v nějakém volajícím kódu.
 */

export type OpsEventSource = "cron" | "gui" | "manual" | "system";
export type OpsEventSeverity = "info" | "warn" | "error";

/**
 * Číselník `kind` (3.3). Autorita je tenhle union, NE databáze — `severity`
 * má CHECK, `kind` ne (bude přibývat, CHECK by znamenal migraci za každý
 * nový druh; chybný `kind` v logu nikomu neublíží, viz 3.2).
 */
export type OpsEventKind =
  | "cron.started"
  | "cron.finished"
  | "cron.failed"
  | "cron.phase-failed"
  | "meeting.closed"
  | "dispatch.started"
  | "dispatch.guard-failed"
  | "dispatch.failed"
  | "dispatch.finished"
  | "email.sent"
  | "email.failed"
  | "email.skipped"
  | "warning.sent"
  | "warning.failed"
  | "report.sent"
  | "report.failed"
  | "retention.purged"
  | "migration.applied"
  // iter-028 (T-006, arch 7): připomínky (fáze 8). "reminder.round" NENÍ
  // v TERMINAL_KINDS — je to souhrn kola, ne konec běhu, jinak by přebil
  // pozdější `cron.finished` v `deriveRunStatus` (7).
  | "reminder.sent"
  | "reminder.failed"
  | "reminder.round"
  // iter-032 (arch 9.5, K9, U1): změny přístupu z /admin/members a
  // /login/heslo. Každá je jednorázová událost s vlastním runId, proto
  // všechny v TERMINAL_KINDS (jinak by je /status po 5 minutách ukázal
  // jako zaseklý běh). Nikdy nenesou heslo ani odkaz.
  | "access.role-changed"
  | "access.password-reset"
  | "access.password-set"
  | "access.password-link-copied"
  // T-006r (review F-02): „Poslat znovu" jen vymění token nepoužitého odkazu.
  | "access.password-link-resent"
  // iter-033 (T-005, arch 10.1): zásobník „5 minut pro ostatní“. Jednorázové
  // události s vlastním runId, proto všechny v TERMINAL_KINDS. Nikdy nenesou
  // téma, text případu ani e-mailovou adresu.
  | "mastermind.scheduled"
  | "mastermind.unscheduled"
  | "mastermind.presented"
  | "mastermind.presented-undone"
  | "mastermind.removed"
  // iter-035 (T-005, arch 10, gate Z6): Burza pomoci. Jednorázové události
  // s vlastním runId, proto všechny v TERMINAL_KINDS. Loguje se jen zásah
  // vedení do cizích dat, nikdy text řádku, kontakt, poznámka ani e-mail.
  | "burza.offer-by-management"
  | "burza.offer-removed"
  | "burza.help-removed";

/**
 * Explicitní množina terminálních kindů (3.3, MAJOR-2 review T-002).
 * Autorita pro detektor zaseklých běhů (`deriveRunStatus`, T-006,
 * lib/ops/run-status.ts). Konvence "končí na -failed" NENÍ dost —
 * `dispatch.failed` patří sem výslovně, ne odvozením z přípony, aby budoucí
 * nekonzistentní pojmenování nerozbilo detekci.
 */
export const TERMINAL_KINDS: readonly OpsEventKind[] = [
  "cron.finished",
  "cron.failed",
  "dispatch.finished",
  "dispatch.guard-failed",
  "dispatch.failed",
  "access.role-changed",
  "access.password-reset",
  "access.password-set",
  "access.password-link-copied",
  "access.password-link-resent",
  "mastermind.scheduled",
  "mastermind.unscheduled",
  "mastermind.presented",
  "mastermind.presented-undone",
  "mastermind.removed",
  "burza.offer-by-management",
  "burza.offer-removed",
  "burza.help-removed",
];

/**
 * Vstup do `logOpsEvent` / `buildOpsEvent`. `occurredAt` je nepovinné —
 * když chybí, `buildOpsEvent` ho doplní `new Date()` (3.2: "occurred_at
 * posílá aplikace", DB default `now()` je jen pojistka pro čas zápisu, ne
 * čas události).
 */
export interface OpsEventInput {
  runId: string;
  seq: number;
  source: OpsEventSource;
  kind: OpsEventKind;
  severity: OpsEventSeverity;
  actor?: string | null;
  meetingId?: string | null;
  meetingDate?: string | null; // "YYYY-MM-DD"
  memberId?: string | null;
  memberName?: string | null;
  email?: string | null;
  code?: string | null;
  message: string;
  detail?: Record<string, unknown> | null;
  resendEmailId?: string | null;
  resendMessageId?: string | null;
  occurredAt?: Date;
}

/**
 * Řádek připravený k INSERTu — výstup `buildOpsEvent`, už po redakci (9.2) a
 * zkrácení. Všechna nepovinná pole `OpsEventInput` jsou tu normalizovaná na
 * `null` (žádné `undefined` směrem do DB vrstvy).
 */
export interface OpsEventRow {
  runId: string;
  seq: number;
  occurredAt: Date;
  source: OpsEventSource;
  kind: OpsEventKind;
  severity: OpsEventSeverity;
  actor: string | null;
  meetingId: string | null;
  meetingDate: string | null;
  memberId: string | null;
  memberName: string | null;
  email: string | null;
  code: string | null;
  message: string;
  detail: Record<string, unknown> | null;
  resendEmailId: string | null;
  resendMessageId: string | null;
}
