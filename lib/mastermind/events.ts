/**
 * iter-033 (T-005, arch 9.5, 10.1): skládání událostí `mastermind.*` pro
 * ops log. Čistý modul (jen typy z lib/ops/types), skládání jde otestovat
 * bez DB a LL-011 platí: volající ho volá uvnitř chráněného bloku (safeLog).
 *
 * Do události nikdy nejde e-mailová adresa, téma ani text případu. Log má
 * retenci 180 dní a čte ho vedení v jiném kontextu.
 */
import type { OpsEventInput } from "@/lib/ops/types";
import { formatDM } from "./rules";

export type MastermindEventKind =
  | "mastermind.scheduled"
  | "mastermind.unscheduled"
  | "mastermind.presented"
  | "mastermind.presented-undone"
  | "mastermind.removed";

export const MASTERMIND_EVENT_KINDS: readonly MastermindEventKind[] = [
  "mastermind.scheduled",
  "mastermind.unscheduled",
  "mastermind.presented",
  "mastermind.presented-undone",
  "mastermind.removed",
];

export interface MastermindEventCtx {
  runId: string;
  /** Jméno aktéra ze session. */
  actor: string;
  caseId: string;
  presenterId: string;
  presenterName: string;
  /** „YYYY-MM-DD“ nebo null (např. odstraněný navržený případ). */
  internalDate: string | null;
}

function base(kind: MastermindEventKind, ctx: MastermindEventCtx): OpsEventInput {
  return {
    runId: ctx.runId,
    seq: 1,
    source: "gui",
    kind,
    severity: "info",
    actor: ctx.actor,
    memberId: ctx.presenterId,
    memberName: ctx.presenterName,
    meetingDate: ctx.internalDate,
    message: "",
    detail: { caseId: ctx.caseId },
  };
}

function dm(date: string | null): string {
  return date ? formatDM(date) : "bez data";
}

export function scheduledEvent(
  ctx: MastermindEventCtx,
  extra: { shortNotice: boolean }
): OpsEventInput {
  return {
    ...base("mastermind.scheduled", ctx),
    message: `Případ zařazen na interní ${dm(ctx.internalDate)}`,
    detail: {
      caseId: ctx.caseId,
      shortNotice: extra.shortNotice,
    },
  };
}

export function unscheduledEvent(ctx: MastermindEventCtx): OpsEventInput {
  return {
    ...base("mastermind.unscheduled", ctx),
    message: `Případ vrácen do zásobníku (byl na interní ${dm(ctx.internalDate)})`,
  };
}

export function presentedEvent(ctx: MastermindEventCtx): OpsEventInput {
  return {
    ...base("mastermind.presented", ctx),
    message: `Proběhlo potvrzeno (interní ${dm(ctx.internalDate)})`,
  };
}

export function presentedUndoneEvent(ctx: MastermindEventCtx): OpsEventInput {
  return {
    ...base("mastermind.presented-undone", ctx),
    severity: "warn",
    message: `Potvrzení, že proběhlo, vráceno (interní ${dm(ctx.internalDate)})`,
  };
}

export function removedEvent(ctx: MastermindEventCtx, wasScheduled: boolean): OpsEventInput {
  return {
    ...base("mastermind.removed", ctx),
    message: wasScheduled
      ? `Zařazený případ odstraněn (interní ${dm(ctx.internalDate)})`
      : "Případ ze zásobníku odstraněn",
  };
}
