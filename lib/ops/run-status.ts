/**
 * iter-027 (T-006) — detektor stavu jednoho běhu (arch iter-027 T-001,
 * sekce 7.2, MAJOR-2 review T-002). Čistá funkce `deriveRunStatus`: dostane
 * všechny události jednoho `run_id` (libovolné pořadí) a řekne, jak se má
 * ten běh ukázat v pruhu 1 „Poslední běhy" a v hlavičce detailu běhu.
 *
 * Terminální množina je EXPLICITNÍ (`TERMINAL_KINDS` z ./types), ne
 * odvozená z přípony `-failed` — to je celý smysl MAJOR-2. Kdyby detekce
 * hádala z přípony, `dispatch.infra-error` (než byl přejmenován na
 * `dispatch.failed`, arch 3.3) by tiše spadl do `stalled`, přesně jako
 * 13. 8. 2026.
 *
 * Čistý modul: žádný import drizzle-orm, @/lib/db/*, next/server ani
 * resend — jen typy z ./types (taky čistý modul). Bezpečné pro
 * scripts/test-ops-events.ts (tsx bez DATABASE_URL).
 */
import { TERMINAL_KINDS, type OpsEventKind } from "./types";

/** Kdy se běh bez terminálního záznamu považuje za zaseklý, ne za běžící. */
const STALLED_AFTER_MS = 5 * 60 * 1000;

/** Terminální kindy, které znamenají chybu (podmnožina TERMINAL_KINDS). */
const FAILURE_KINDS: readonly OpsEventKind[] = [
  "cron.failed",
  "dispatch.guard-failed",
  "dispatch.failed",
];

export type RunState = "ok" | "partial" | "failed" | "running" | "stalled" | "unknown";

export interface RunStatus {
  state: RunState;
  /** Česká věta pro pruh 1 / hlavičku detailu — viz tabulka 7.2. */
  label: string;
}

/**
 * Minimální tvar události, který `deriveRunStatus` potřebuje. Volající
 * (T-006 page.tsx) mu předává řádky z `getEventsByRunId` — ty mají víc
 * polí, strukturálně sedí. `kind` je `string`, ne `OpsEventKind`: sloupec
 * `kind` v DB nemá CHECK (3.2, autoritou je TS union jen na zápisu), takže
 * čtecí strana musí počítat s libovolným řetězcem.
 */
export interface RunStatusEvent {
  kind: string;
  message: string;
  /** `jsonb` sloupec — drizzle ho typuje jako `unknown` (bez `$type<>()`),
   * proto `unknown` i tady, ne `Record<string, unknown> | null`. */
  detail: unknown;
  occurredAt: Date;
}

interface DispatchFinishedDetail {
  sent: number;
  error: number;
  totalMembers: number;
}

function isDispatchFinishedDetail(detail: unknown): detail is DispatchFinishedDetail {
  if (!detail || typeof detail !== "object") return false;
  const d = detail as Record<string, unknown>;
  return typeof d.sent === "number" && typeof d.error === "number" && typeof d.totalMembers === "number";
}

/**
 * Stav jednoho běhu z jeho událostí (7.2). `now` je injektovatelné pro testy
 * (13–18) — v produkci volající předá `new Date()`.
 */
export function deriveRunStatus(events: RunStatusEvent[], now: Date): RunStatus {
  if (events.length === 0) {
    return { state: "unknown", label: "Bez zaznamu" };
  }

  const terminal = events.find((e) =>
    (TERMINAL_KINDS as readonly string[]).includes(e.kind)
  );

  if (terminal) {
    if ((FAILURE_KINDS as readonly string[]).includes(terminal.kind)) {
      // dispatch.guard-failed nese v `message` konkrétní důvod (5 kódů
      // guardů z iter-026 2.6) — dá se rovnou ukázat, "Guard: ..." z 7.2.
      const label =
        terminal.kind === "dispatch.guard-failed"
          ? `Guard: ${terminal.message}`
          : "Beh skoncil chybou";
      return { state: "failed", label };
    }

    // Terminální a NEchybový kind (dispatch.finished / cron.finished).
    // "partial" pozná podle PŘÍTOMNOSTI aspoň jednoho email.failed (7.2
    // doslova), ne podle severity terminálu — obě cesty spolu souhlasí
    // (dispatchOutcomeEvent dává severity=warn právě tehdy, kdyz error>0),
    // ale text tabulky 7.2 je závazný.
    const hasFailedRecipient = events.some((e) => e.kind === "email.failed");
    if (isDispatchFinishedDetail(terminal.detail)) {
      const { sent, error, totalMembers } = terminal.detail;
      if (hasFailedRecipient || error > 0) {
        return {
          state: "partial",
          label: `Rozeslano ${sent} z ${totalMembers}, ${error} chyb`,
        };
      }
      return { state: "ok", label: `Rozeslano ${sent} z ${totalMembers}` };
    }

    return hasFailedRecipient
      ? { state: "partial", label: "Beh dokoncen, nekterym prijemcum se neodeslalo" }
      : { state: "ok", label: "Beh dokoncen" };
  }

  // Žádný terminální záznam — running vs. stalled podle stáří NEJSTARŠÍ
  // události v běhu (typicky `*.started`).
  const earliest = events.reduce(
    (min, e) => (e.occurredAt.getTime() < min.getTime() ? e.occurredAt : min),
    events[0].occurredAt
  );
  const elapsedMs = now.getTime() - earliest.getTime();

  return elapsedMs >= STALLED_AFTER_MS
    ? { state: "stalled", label: "Beh zacal a nedobehl" }
    : { state: "running", label: "Beh probiha" };
}
