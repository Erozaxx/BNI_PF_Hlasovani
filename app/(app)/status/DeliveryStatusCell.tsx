"use client";

import { useEffect, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { mapResendStatus, type DeliveryStatus } from "@/lib/ops/resend-status";

interface DeliveryStatusCellProps {
  eventId: string;
  resendEmailId: string | null;
  /** Uložený terminální stav z DB (8.1 bod 3), nebo `null` — pak se po
   * namountování dotáhne živě. */
  initialDeliveryStatus: string | null;
  /** Kdy se cache naplnila (`delivery_checked_at`), ISO string. Použije se
   * jako "čas" u cachovaného řádku (7.4 krok 4: "Doruceno a cas"). */
  initialDeliveryCheckedAt: string | null;
}

const SEVERITY_BADGE: Record<DeliveryStatus["severity"], BadgeVariant> = {
  info: "success",
  warn: "warning",
  error: "danger",
};

/** "22. 8. 07:05" — Europe/Prague vždy (R9). */
function formatDeliveryAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Prague",
  });
  const time = date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Prague",
  });
  return `${day} ${time}`;
}

/**
 * Klientská buňka „Stav u poskytovatele" (arch iter-027 T-001, sekce 8.3,
 * 7.3, 7.4). Stránka se renderuje jen z databáze (D5) — Resend volá TATO
 * komponenta, a to až po namountování, nikdy server render.
 *
 * Bez `resendEmailId` (mail se přes Resend vůbec neposlal) se nevolá nic.
 * S uloženým terminálním stavem (`initialDeliveryStatus`) se taky nevolá
 * nic — hodnota se jen zobrazí přes stejnou čistou `mapResendStatus`, kterou
 * používá i server route, aby tu nebyla druhá kopie mapovací logiky.
 *
 * Když `POST /api/status/delivery` spadne nebo vrátí chybu, buňka degraduje
 * na "Nezjisteno" + tlačítko — NIKDY nehodí chybu výš (AC: "degraduje jeden
 * sloupec, ne obrazovka").
 */
export function DeliveryStatusCell({
  eventId,
  resendEmailId,
  initialDeliveryStatus,
  initialDeliveryCheckedAt,
}: DeliveryStatusCellProps) {
  const [status, setStatus] = useState<DeliveryStatus | null>(
    initialDeliveryStatus
      ? { ...mapResendStatus({ last_event: initialDeliveryStatus }), at: initialDeliveryCheckedAt }
      : null
  );
  const [loading, setLoading] = useState(!!resendEmailId && !initialDeliveryStatus);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!resendEmailId || initialDeliveryStatus) return;

    let cancelled = false;
    setLoading(true);
    setFailed(false);

    fetchDelivery([eventId])
      .then((map) => {
        if (cancelled) return;
        const result = map[eventId];
        if (result) {
          setStatus(result);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, resendEmailId]);

  async function handleRecheck() {
    setLoading(true);
    setFailed(false);
    try {
      const map = await fetchDelivery([eventId], true);
      const result = map[eventId];
      if (result) {
        setStatus(result);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  if (!resendEmailId) {
    return <span className="text-xs text-text-muted">Neodeslano pres Resend</span>;
  }

  if (loading) {
    return <span className="text-xs text-text-muted">Nacitani…</span>;
  }

  if (failed || !status) {
    return (
      <span className="inline-flex items-center gap-2 text-xs">
        <span className="text-text-muted">Nezjisteno</span>
        <button
          type="button"
          onClick={handleRecheck}
          className="text-primary underline focus:outline-none focus:shadow-focus"
        >
          Overit znovu
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={SEVERITY_BADGE[status.severity]}>{status.label}</Badge>
      {status.at && (
        <span className="text-xs text-text-muted">{formatDeliveryAt(status.at)}</span>
      )}
      <button
        type="button"
        onClick={handleRecheck}
        className="text-xs text-text-muted underline hover:text-primary focus:outline-none focus:shadow-focus"
      >
        Overit znovu
      </button>
    </span>
  );
}

async function fetchDelivery(
  eventIds: string[],
  force = false
): Promise<Record<string, DeliveryStatus>> {
  const res = await fetch("/api/status/delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventIds, force }),
  });
  if (!res.ok) {
    throw new Error(`status delivery request failed: ${res.status}`);
  }
  return res.json();
}
