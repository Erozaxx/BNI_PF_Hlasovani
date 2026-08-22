/**
 * iter-027 (T-006) — stav doručení z Resendu (arch iter-027 T-001, sekce
 * 8.1, 8.2, D6). Dvě funkce se dvěma naprosto různými kontrakty:
 *
 * - `mapResendStatus` je ČISTÁ. Nemá žádný import, nesahá na síť, nikdy
 *   nevyhazuje pro žádný vstup (i `null`/`{}` vrátí `unknown`, test 21).
 *   Testovatelná bez sítě (scripts/test-ops-events.ts, případy 19–21).
 * - `fetchResendStatus` je nečistá, ale taky nikdy nevyhazuje. Holý `fetch`
 *   (D6 — ne `resend` SDK, viz hlavička souboru níže), `RESEND_API_KEY` se
 *   čte AŽ při volání (ne při importu modulu — proto nedědí nález N-1
 *   `lib/email/resend.ts:7`, tenhle soubor ten modul vůbec neimportuje).
 *
 * Proč ne `resend` SDK (8.2, N-1): `lib/email/resend.ts:7` konstruuje
 * klienta při importu a bez klíče spadne celé načtení modulu. Tenhle modul
 * ten soubor neimportuje vůbec, takže nález nezhoršuje ani nedědí a nesahá
 * na kód iter-026 (scope OUT T-006).
 */

/** Terminální stavy (8.1 bod 3) — jen ty se ukládají zpátky do `ops_event`. */
const TERMINAL_STATES = ["delivered", "bounced", "complained", "failed"] as const;

export type DeliveryState =
  | "delivered"
  | "bounced"
  | "complained"
  | "failed"
  | "queued"
  | "sent"
  | "scheduled"
  | "unknown";

export interface DeliveryStatus {
  state: DeliveryState;
  terminal: boolean;
  /** Česky, pro buňku v tabulce (7.3, 7.4). */
  label: string;
  severity: "info" | "warn" | "error";
  messageId: string | null;
  at: string | null;
}

const STATE_META: Record<DeliveryState, { label: string; severity: DeliveryStatus["severity"] }> = {
  delivered: { label: "Doruceno", severity: "info" },
  bounced: { label: "Odmitnuto (bounced)", severity: "error" },
  complained: { label: "Oznaceno jako spam", severity: "error" },
  failed: { label: "Chyba u poskytovatele", severity: "error" },
  queued: { label: "Ve fronte u poskytovatele", severity: "warn" },
  sent: { label: "Predano poskytovateli", severity: "warn" },
  scheduled: { label: "Naplanovano", severity: "warn" },
  unknown: { label: "Nezjisteno", severity: "warn" },
};

function unknownStatus(): DeliveryStatus {
  const meta = STATE_META.unknown;
  return {
    state: "unknown",
    terminal: false,
    label: meta.label,
    severity: meta.severity,
    messageId: null,
    at: null,
  };
}

function isKnownState(value: unknown): value is DeliveryState {
  return typeof value === "string" && value in STATE_META;
}

/**
 * ČISTÁ. Mapuje odpověď `GET /emails/{id}` (16, bod 2 — tvar `last_event`,
 * `message_id`, ověřeno 21. 8. proti Resend API) na náš stav. Neznámý nebo
 * chybějící tvar (`null`, `{}`, cizí `last_event`) se mapuje na `unknown`,
 * nikdy nevyhodí (test 21).
 */
export function mapResendStatus(payload: unknown): DeliveryStatus {
  if (!payload || typeof payload !== "object") {
    return unknownStatus();
  }

  const obj = payload as Record<string, unknown>;
  const state: DeliveryState = isKnownState(obj.last_event) ? obj.last_event : "unknown";
  const meta = STATE_META[state];

  const messageId = typeof obj.message_id === "string" ? obj.message_id : null;
  const at =
    typeof obj.last_event_at === "string"
      ? obj.last_event_at
      : typeof obj.created_at === "string"
        ? obj.created_at
        : null;

  return {
    state,
    terminal: (TERMINAL_STATES as readonly string[]).includes(state),
    label: meta.label,
    severity: meta.severity,
    messageId,
    at,
  };
}

const FETCH_TIMEOUT_MS = 3000;

/**
 * Nečistá. Jedno HTTP volání, NIKDY nevyhazuje (8.2) — chybějící klíč,
 * síťová chyba, timeout (`AbortSignal.timeout`, 3 s), non-2xx odpověď i
 * neparsovatelné tělo skončí stejně jako neznámý stav Resendu: `unknown`.
 * Volající (app/api/status/delivery/route.ts) na tom staví degradaci "jeden
 * sloupec, ne obrazovka" (8.3).
 */
export async function fetchResendStatus(emailId: string): Promise<DeliveryStatus> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return unknownStatus();
  }

  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(emailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      // vc. 429 (R2) — degraduje na "Nezjisteno" + tlacitko "Overit znovu",
      // nikdy nevyhazuje dal.
      return unknownStatus();
    }

    const payload = await res.json();
    return mapResendStatus(payload);
  } catch {
    return unknownStatus();
  }
}
