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
  | "migration.applied";

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
