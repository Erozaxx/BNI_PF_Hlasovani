/**
 * iter-027 (T-005) — `buildOpsEvent`: čistá funkce OpsEventInput -> OpsEventRow
 * (arch iter-027 T-001, sekce 5.1, 9.2). Aplikuje redakci (redact.ts) a
 * zkrácení na `message`, `code` a serializovaný `detail` — v tomhle pořadí,
 * nikdy naopak (9.2).
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/server ani resend.
 * Bezpečné pro scripts/test-ops-events.ts (tsx bez DATABASE_URL).
 */
import { redactSecrets } from "./redact";
import type { OpsEventInput, OpsEventRow } from "./types";

const MESSAGE_MAX_LENGTH = 500;
const DETAIL_MAX_BYTES = 4096;

/**
 * `detail` se redaguje jako JSON.parse(redactSecrets(JSON.stringify(detail))).
 * Přesáhne-li po redakci DETAIL_MAX_BYTES, uloží se místo něj
 * `{ truncated: true, bytes: N }` — `detail` se NIKDY nezkracuje řezem,
 * useknutý JSON by přestal být platný jsonb (9.2).
 */
function redactDetail(
  detail: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!detail) return null;

  const redactedJson = redactSecrets(JSON.stringify(detail));
  const bytes = Buffer.byteLength(redactedJson, "utf8");

  if (bytes > DETAIL_MAX_BYTES) {
    return { truncated: true, bytes };
  }

  return JSON.parse(redactedJson) as Record<string, unknown>;
}

export function buildOpsEvent(input: OpsEventInput): OpsEventRow {
  // Redakce PŘED zkrácením (9.2, závazné pořadí) — jinak by zkrácení mohlo
  // useknout token uprostřed a nechat fragment kratší než 8 znaků, na který
  // se redaktor už nechytí.
  const redactedMessage = redactSecrets(input.message).slice(0, MESSAGE_MAX_LENGTH);
  const redactedCode = input.code != null ? redactSecrets(input.code) : null;

  return {
    runId: input.runId,
    seq: input.seq,
    occurredAt: input.occurredAt ?? new Date(),
    source: input.source,
    kind: input.kind,
    severity: input.severity,
    actor: input.actor ?? null,
    meetingId: input.meetingId ?? null,
    meetingDate: input.meetingDate ?? null,
    memberId: input.memberId ?? null,
    memberName: input.memberName ?? null,
    email: input.email ?? null,
    code: redactedCode,
    message: redactedMessage,
    detail: redactDetail(input.detail),
    resendEmailId: input.resendEmailId ?? null,
    resendMessageId: input.resendMessageId ?? null,
  };
}
