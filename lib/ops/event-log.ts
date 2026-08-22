/**
 * iter-027 (T-005) — `logOpsEvent` (arch iter-027 T-001, sekce 5.1). Jediné
 * místo v repu, které smí zapisovat do `ops_event`.
 *
 * Kontrakt, který platí BEZ VÝJIMKY (D2):
 * 1. Nikdy nevyhodí výjimku a nikdy nevrátí rejected promise. Celé tělo je
 *    v try/catch, včetně stavby řádku čistou `buildOpsEvent()` — pokud by
 *    vstup měl vadný tvar, i tahle chyba skončí v `catch`, ne jako throw.
 * 2. Při selhání zapíše `console.error("[ops-log] …")` a vrátí `false`.
 * 3. `deps.write` existuje jen kvůli testům (scripts/test-ops-events.ts,
 *    případ 22) — v produkci se nepředává, výchozí implementace je
 *    `insertOpsEvent` z lib/db/queries/ops-events.ts.
 *
 * Proč `await`, a ne fire-and-forget: serverless funkce může doběhnout dřív,
 * než nezavolaný promise, a zápis by se tiše ztratil. `await` na INSERTu,
 * který nikdy nevyhazuje, stojí 30-60 ms a je jistý.
 *
 * Když migrace neproběhla, INSERT skončí 42P01 undefined_table — `catch` to
 * spolkne, `console.error` to vypíše, hlavní cesta (rozeslání hlasování)
 * jede dál beze změny (11.5).
 *
 * NENÍ čistý modul — smí a musí importovat DB vrstvu (insertOpsEvent).
 */
import { insertOpsEvent } from "@/lib/db/queries/ops-events";
import { buildOpsEvent } from "./event-shape";
import type { OpsEventInput, OpsEventRow } from "./types";

export interface LogOpsEventDeps {
  write?: (row: OpsEventRow) => Promise<void>;
}

export async function logOpsEvent(
  input: OpsEventInput,
  deps?: LogOpsEventDeps
): Promise<boolean> {
  try {
    const row = buildOpsEvent(input);
    const write = deps?.write ?? insertOpsEvent;
    await write(row);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      `[ops-log] failed to write event kind=${input.kind} runId=${input.runId} seq=${input.seq}: ${msg}`
    );
    return false;
  }
}
