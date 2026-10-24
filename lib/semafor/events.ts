/**
 * iter-041 (arch 10, K15): skládání událostí `semafor.*` pro ops log. Čistý
 * modul (jen typy z lib/ops/types), volající ho volá v chráněném bloku (LL-011).
 *
 * Do události nikdy nejde `memberId`, `memberName`, jméno ze souboru, skóre ani
 * hash souboru. Počty řádků jsou provozní údaj. `/status` vidí i moderátor,
 * proto ta přísnost. `actor` je jméno vedoucího, který akci udělal.
 */
import type { OpsEventInput } from "@/lib/ops/types";

export type SemaforEventKind =
  | "semafor.imported"
  | "semafor.month-deleted"
  | "semafor.row-deleted"
  | "semafor.alias-removed";

export const SEMAFOR_EVENT_KINDS: readonly SemaforEventKind[] = [
  "semafor.imported",
  "semafor.month-deleted",
  "semafor.row-deleted",
  "semafor.alias-removed",
];

export interface SemaforEventCtx {
  runId: string;
  /** Jméno aktéra ze session. */
  actor: string;
}

function base(ctx: SemaforEventCtx, kind: SemaforEventKind, message: string, detail: Record<string, unknown>): OpsEventInput {
  return {
    runId: ctx.runId,
    seq: 1,
    source: "gui",
    kind,
    severity: "info",
    actor: ctx.actor,
    message,
    detail,
  };
}

/** `month` je `YYYY-MM`. */
function ym(month: string): string {
  return month.slice(0, 7);
}

export function importedEvent(
  ctx: SemaforEventCtx,
  d: { month: string; rows: number; inserted: number; updated: number; unchanged: number }
): OpsEventInput {
  return base(ctx, "semafor.imported", "Semafor: import uložen", {
    month: ym(d.month),
    rows: d.rows,
    inserted: d.inserted,
    updated: d.updated,
    unchanged: d.unchanged,
  });
}

export function monthDeletedEvent(ctx: SemaforEventCtx, d: { month: string; rows: number }): OpsEventInput {
  return base(ctx, "semafor.month-deleted", "Semafor: měsíc smazán", { month: ym(d.month), rows: d.rows });
}

export function rowDeletedEvent(ctx: SemaforEventCtx, d: { month: string }): OpsEventInput {
  return base(ctx, "semafor.row-deleted", "Semafor: řádek smazán", { month: ym(d.month) });
}

export function aliasRemovedEvent(ctx: SemaforEventCtx): OpsEventInput {
  return base(ctx, "semafor.alias-removed", "Semafor: zapamatované párování smazáno", {});
}
