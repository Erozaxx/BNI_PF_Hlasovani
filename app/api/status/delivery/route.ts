import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getOpsEventsForDelivery,
  updateOpsEventDeliveryStatus,
} from "@/lib/db/queries/ops-events";
import { fetchResendStatus, mapResendStatus } from "@/lib/ops/resend-status";
import type { DeliveryStatus } from "@/lib/ops/resend-status";

/**
 * POST /api/status/delivery (arch iter-027 T-001, sekce 8.3). Jediné místo,
 * které volá Resend pro stav doručení — stránka `/status` se renderuje
 * JEN z databáze (D5), tahle routa je volaná až klientskou
 * `<DeliveryStatusCell/>` po namountování.
 *
 * Nikdy nespadne obrazovka kvůli téhle routě: klient (DeliveryStatusCell)
 * degraduje na "Nezjisteno" + tlacitko pri jakemkoli non-2xx / vyjimce, viz
 * AC v briefu T-006. `fetchResendStatus` sama taky nikdy nevyhazuje (8.2).
 */
export const maxDuration = 30;

/** Strop na jedno volani (8.3). */
const MAX_EVENT_IDS = 30;

/**
 * Dávkování odvozené z limitu Resendu, ne z ručně zvolené prodlevy (MINOR-2
 * review T-002, 8.3). RESEND_MAX_RPS je JEDINÁ laditelná konstanta — zmení-li
 * se skutečný limit, mění se jedno číslo, ne návrh.
 */
const RESEND_MAX_RPS = 5;
const CONCURRENCY = 4;
const BATCH_INTERVAL_MS = Math.ceil((CONCURRENCY / RESEND_MAX_RPS) * 1000); // = 800

function errorResponse(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

interface DeliveryRequestBody {
  eventIds?: unknown;
  force?: unknown;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  if (!isManagement) {
    return errorResponse(401, "Unauthorized");
  }

  let body: DeliveryRequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const rawIds = Array.isArray(body.eventIds) ? body.eventIds : [];
  const eventIds = rawIds
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .slice(0, MAX_EVENT_IDS);
  const force = body.force === true;

  if (eventIds.length === 0) {
    return NextResponse.json({});
  }

  let rows;
  try {
    rows = await getOpsEventsForDelivery(eventIds);
  } catch (e) {
    console.error("[status-delivery] nepodarilo se nacist ops_event radky:", e);
    return errorResponse(500, "Failed to load events");
  }

  const result: Record<string, DeliveryStatus> = {};
  const toFetch: { id: string; resendEmailId: string }[] = [];

  for (const row of rows) {
    if (!row.resendEmailId) {
      // Nemá Resend id (např. mail se vůbec neodeslal) — klient tenhle
      // řádek ani nepošle, ale defenzivně ho prostě přeskočíme.
      continue;
    }
    if (!force && row.deliveryStatus) {
      // Uložený terminální stav (8.1 bod 3/4) — Resend se nevolá.
      result[row.id] = mapResendStatus({ last_event: row.deliveryStatus });
      continue;
    }
    toFetch.push({ id: row.id, resendEmailId: row.resendEmailId });
  }

  // Dávky po CONCURRENCY, další dávka startuje nejdřív BATCH_INTERVAL_MS PO
  // STARTU té předchozí (ne po jejím dokončení) — 8.3 doslova.
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batchStartedAt = Date.now();
    const batch = toFetch.slice(i, i + CONCURRENCY);

    const statuses = await Promise.all(
      batch.map((item) => fetchResendStatus(item.resendEmailId))
    );

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const status = statuses[j];
      result[item.id] = status;

      if (status.terminal) {
        // Sekvenční UPDATE, bez transakce (LL-003) — selže-li, příště se
        // zeptá znovu, nic se neztratí.
        try {
          await updateOpsEventDeliveryStatus(item.id, {
            state: status.state,
            messageId: status.messageId,
            checkedAt: new Date(),
          });
        } catch (e) {
          console.error(
            `[status-delivery] nepodarilo se ulozit terminalni stav pro ${item.id}:`,
            e
          );
        }
      }
    }

    const hasMoreBatches = i + CONCURRENCY < toFetch.length;
    if (hasMoreBatches) {
      const elapsed = Date.now() - batchStartedAt;
      const waitMs = Math.max(0, BATCH_INTERVAL_MS - elapsed);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
  }

  return NextResponse.json(result);
}
