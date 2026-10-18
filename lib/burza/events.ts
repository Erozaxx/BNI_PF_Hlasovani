/**
 * iter-035 (T-005, arch 10, gate Z6): skládání událostí `burza.*` pro ops log.
 * Čistý modul (jen typy z lib/ops/types), jde otestovat bez DB a LL-011 platí:
 * volající ho volá uvnitř chráněného bloku (safeLog).
 *
 * Loguje se jen zásah vedení do cizích dat: zápis nebo úprava cizího řádku,
 * smazání cizího řádku a smazání záznamu pomoci, kde vedoucí není příjemce.
 * Vlastní úpravy členů a zápis pomoci se nelogují (stopa je v tabulce).
 *
 * Do události nikdy nejde e-mailová adresa, text řádku, kontakt ani poznámka.
 * Log má retenci 180 dní a čte ho vedení v jiném kontextu.
 */
import type { OpsEventInput } from "@/lib/ops/types";

export type BurzaEventKind =
  | "burza.offer-by-management"
  | "burza.offer-removed"
  | "burza.help-removed";

export const BURZA_EVENT_KINDS: readonly BurzaEventKind[] = [
  "burza.offer-by-management",
  "burza.offer-removed",
  "burza.help-removed",
];

export interface BurzaEventCtx {
  runId: string;
  /** Jméno aktéra ze session. */
  actor: string;
  actorId: string;
  /** Aktér je admin nebo moderátor (ze session). */
  isManagement: boolean;
}

export type OfferEventAction = "create" | "update" | "remove";

/**
 * Událost jen když vedení zapisuje nebo maže řádek JINÉHO člena. Vlastní
 * řádek (i když je autor ve vedení) a řádek zapsaný členem sám vrátí `null`.
 */
export function offerEvent(
  ctx: BurzaEventCtx,
  target: { memberId: string; memberName: string },
  action: OfferEventAction
): OpsEventInput | null {
  if (!ctx.isManagement || target.memberId === ctx.actorId) return null;
  const removed = action === "remove";
  return {
    runId: ctx.runId,
    seq: 1,
    source: "gui",
    kind: removed ? "burza.offer-removed" : "burza.offer-by-management",
    severity: "info",
    actor: ctx.actor,
    memberId: target.memberId,
    memberName: target.memberName,
    message: removed ? "Řádek v burze smazalo vedení" : "Řádek v burze zapsalo vedení",
    detail: removed ? null : { action },
  };
}

export interface RemovedHelp {
  helpId: string;
  helperId: string;
  helperName: string;
  recipientId: string | null;
}

/**
 * Smazání záznamu pomoci: loguje se jen zásah vedení do záznamu, kde není
 * příjemce (`warn`, i když příjemce už není členem). Smazání vlastního
 * záznamu příjemcem nebo vedoucím jako příjemcem se neloguje.
 */
export function helpRemovedEvent(ctx: BurzaEventCtx, removed: RemovedHelp): OpsEventInput | null {
  if (!ctx.isManagement) return null;
  if (removed.recipientId !== null && removed.recipientId === ctx.actorId) return null;
  return {
    runId: ctx.runId,
    seq: 1,
    source: "gui",
    kind: "burza.help-removed",
    severity: "warn",
    actor: ctx.actor,
    memberId: removed.helperId,
    memberName: removed.helperName,
    message: "Záznam pomoci smazalo vedení",
    detail: { helpId: removed.helpId },
  };
}
