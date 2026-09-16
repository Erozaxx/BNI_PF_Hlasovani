"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { votingClosesAtFor, isDeliveryDue } from "@/lib/meetings/voting-window";
import { deliveryHint, type DeliveryHint } from "@/lib/meetings/morning-dispatch";

type SkipReason = "no-email" | "revoked" | "already-sent";

type DispatchOutcome =
  | { status: "sent" }
  // iter-028 (T-005, arch 3.3): deliver:"defer" — odkaz čeká na ranní cron.
  | { status: "scheduled" }
  | { status: "skipped"; reason: SkipReason }
  | { status: "error"; reason: string };

interface DispatchRecipient {
  memberId: string;
  memberName: string;
  memberEmail: string | null;
  linkCreated: boolean;
  outcome: DispatchOutcome;
}

interface DispatchResult {
  ok: true;
  meetingId: string;
  meetingDate: string;
  mode: "start" | "resend";
  deliver: "now" | "defer";
  statusBefore: string;
  statusAfter: string;
  transitioned: boolean;
  votingClosesAt: string;
  linkExpiresAt: string;
  totalMembers: number;
  linksCreated: number;
  counts: { sent: number; skipped: number; error: number; scheduled: number };
  recipients: DispatchRecipient[];
  errors: string[];
}

interface StartVotingPanelProps {
  meetingId: string;
  status: string; // "draft" | "active" | "voting" | "closed"
  hasGuests: boolean;
  /** Datum schůzky "YYYY-MM-DD" (iter-028, arch 3.6) — uzávěrka a "kdy odejdou maily" se počítají od něj. */
  meetingDate: string;
  /** Kolik členů s e-mailem už má značku odeslání — jen pro počáteční zobrazení stavu 'voting'. */
  initialLinkEmailSentCount: number;
  /** Kolik členů celkem má e-mail — jmenovatel "X z Y" a text potvrzovacího dialogu. */
  membersWithEmailCount: number;
}

const SKIP_LABEL: Record<SkipReason, string> = {
  "no-email": "preskoceno: bez e-mailu",
  revoked: "preskoceno: odkaz revokovan",
  "already-sent": "preskoceno: odkaz jiz odeslan",
};

function formatClosesAtPreview(meetingDate: string): string {
  const closesAt = votingClosesAtFor(meetingDate, new Date());
  return closesAt.toLocaleDateString("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "YYYY-MM-DD" -> "D. M." (arch 3.6, bez roku, telo panelu). */
function formatCzShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day}. ${month}.`;
}

/** `{kdy}` z arch 3.6 — kdy odejdou maily, slovně. */
function formatDeliveryHint(hint: DeliveryHint): string {
  switch (hint.kind) {
    case "on-date":
      return `v den schuzky ${formatCzShortDate(hint.date)} rano`;
    case "today-morning":
      return "dnes rano";
    case "tomorrow-morning":
      return "zitra rano";
  }
}

export function StartVotingPanel({
  meetingId,
  status: initialStatus,
  hasGuests,
  meetingDate,
  initialLinkEmailSentCount,
  membersWithEmailCount,
}: StartVotingPanelProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [resendAll, setResendAll] = useState(false);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [linkEmailSentCount, setLinkEmailSentCount] = useState(
    initialLinkEmailSentCount
  );

  const now = new Date();
  const kdy = formatDeliveryHint(deliveryHint(meetingDate, now));
  const dueToday = isDeliveryDue(meetingDate, now);

  async function dispatch(action: "start" | "send-now", resendAllFlag = false) {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/start-voting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "send-now" ? { action, resendAll: resendAllFlag } : { action }
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok !== true) {
        showToast(
          "error",
          body.error ?? "Nepodarilo se spustit hlasovani."
        );
        return;
      }
      const dispatchResult = body as DispatchResult;
      setResult(dispatchResult);
      setCurrentStatus(dispatchResult.statusAfter);
      setLinkEmailSentCount(
        dispatchResult.recipients.filter((r) => r.outcome.status === "sent")
          .length +
          dispatchResult.recipients.filter(
            (r) =>
              r.outcome.status === "skipped" &&
              r.outcome.reason === "already-sent"
          ).length
      );
      setResendAll(false);
      // iter-028 (T-005, arch 3.6): deliver:"defer" nikdy nic neposlal —
      // toast to nesmí předstírat. deliver:"now" (Rozeslat hned) beze změny.
      showToast(
        "success",
        dispatchResult.deliver === "defer"
          ? `Hlasovani spusteno, maily odejdou ${formatDeliveryHint(
              deliveryHint(dispatchResult.meetingDate, new Date())
            )}.`
          : `Odeslano ${dispatchResult.counts.sent} z ${dispatchResult.totalMembers} clenu.`
      );
      router.refresh();
    } catch {
      showToast("error", "Nepodarilo se spustit hlasovani.");
    } finally {
      setLoading(false);
    }
  }

  function handleStart() {
    const closesLabel = formatClosesAtPreview(meetingDate);
    if (
      !confirm(
        `Spustit hlasovani? Maily clenum odejdou ${kdy}, ne ted. Hlasovani pobezi do ${closesLabel}.`
      )
    ) {
      return;
    }
    dispatch("start");
  }

  function handleSendNowClick() {
    const missing = membersWithEmailCount - linkEmailSentCount;
    if (!confirm(`Poslat odkaz hned ${missing} clenum, kteri ho jeste nemaji?`)) {
      return;
    }
    dispatch("send-now", false);
  }

  function handleSendNowResendClick() {
    dispatch("send-now", true);
  }

  function handleResendAllCheckboxChange(checked: boolean) {
    if (!checked) {
      setResendAll(false);
      return;
    }
    if (
      confirm(
        `Poslat odkaz hned znovu vsem ${membersWithEmailCount} clenum? Jejich dosavadni odkazy prestanou platit.`
      )
    ) {
      setResendAll(true);
    } else {
      setResendAll(false);
    }
  }

  const allAlreadySent =
    membersWithEmailCount > 0 && linkEmailSentCount >= membersWithEmailCount;

  return (
    <div className="space-y-4">
      <Card>
        {(currentStatus === "draft" || currentStatus === "active") && (
          <div className="space-y-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleStart}
              loading={loading}
              disabled={!hasGuests}
              title={
                hasGuests
                  ? undefined
                  : "Schuzka nema zadneho hosta, neni o cem hlasovat. Nejdrive pridejte hosty."
              }
            >
              Spustit hlasovani
            </Button>
            <p className="text-sm text-text-muted">
              {hasGuests
                ? `Zalozi odkazy vsem clenum s e-mailem a spusti hlasovani do ${formatClosesAtPreview(
                    meetingDate
                  )}. Maily clenum odejdou ${kdy}. Po spusteni uz nejde pridavat hosty.`
                : "Schuzka nema zadneho hosta, neni o cem hlasovat. Nejdrive pridejte hosty."}
            </p>
          </div>
        )}

        {currentStatus === "voting" && !dueToday && (
          <p className="text-sm text-text-muted">
            Hlasovani je spustene. Odkazy odejdou {membersWithEmailCount} clenum
            v den schuzky {formatCzShortDate(meetingDate)} rano. Do te doby
            nikomu nic neprijde.
          </p>
        )}

        {currentStatus === "voting" && dueToday && !allAlreadySent && (
          <div className="space-y-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSendNowClick}
              loading={loading}
            >
              Rozeslat hned
            </Button>
            <p className="text-sm text-text-muted">
              Odkaz uz dostalo{" "}
              <strong>
                {linkEmailSentCount} z {membersWithEmailCount}
              </strong>{" "}
              clenu. Zbylym ho posle ranni rozeslani {kdy}. Rozeslat hned ho
              posle v tuto chvili.
            </p>
          </div>
        )}

        {currentStatus === "voting" && dueToday && allAlreadySent && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSendNowResendClick}
                loading={loading}
                disabled={!resendAll}
              >
                Rozeslat hned
              </Button>
            </div>
            <p className="text-sm text-text-muted">
              Odkaz uz dostali vsichni ({membersWithEmailCount} z{" "}
              {membersWithEmailCount}).
            </p>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="resend-all"
                checked={resendAll}
                onChange={(e) => handleResendAllCheckboxChange(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary focus:outline-none"
              />
              <label
                htmlFor="resend-all"
                className="text-sm text-text-main cursor-pointer"
              >
                Poslat znovu i tem, kteri odkaz uz dostali
              </label>
            </div>
          </div>
        )}

        {currentStatus === "closed" && (
          <p className="text-sm text-text-muted">Hlasovani je uzavrene.</p>
        )}
      </Card>

      {result && (
        <Card>
          {result.deliver === "defer" ? (
            <p className="text-sm font-medium text-text-main mb-3">
              Hlasovani spusteno. Odkazy odejdou{" "}
              {formatDeliveryHint(deliveryHint(result.meetingDate, new Date()))}:{" "}
              {result.counts.scheduled} clenu, bez e-mailu{" "}
              {
                result.recipients.filter(
                  (r) =>
                    r.outcome.status === "skipped" &&
                    r.outcome.reason === "no-email"
                ).length
              }
              .
            </p>
          ) : (
            <p className="text-sm font-medium text-text-main mb-3">
              Odeslano {result.counts.sent} z {result.totalMembers} clenu
              {result.counts.error > 0 && ` · ${result.counts.error} chyb`}
              {" · bez e-mailu "}
              {
                result.recipients.filter(
                  (r) =>
                    r.outcome.status === "skipped" &&
                    r.outcome.reason === "no-email"
                ).length
              }
            </p>
          )}
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {result.recipients.map((r) => {
              const icon =
                r.outcome.status === "sent"
                  ? "✓"
                  : r.outcome.status === "scheduled"
                  ? "…"
                  : r.outcome.status === "error"
                  ? "✗"
                  : "–";
              const colorClass =
                r.outcome.status === "sent"
                  ? "text-success"
                  : r.outcome.status === "error"
                  ? "text-danger"
                  : "text-text-muted";
              const label =
                r.outcome.status === "sent"
                  ? `odeslano${r.linkCreated ? " (novy odkaz)" : ""}`
                  : r.outcome.status === "scheduled"
                  ? "odejde rano"
                  : r.outcome.status === "error"
                  ? `chyba: ${r.outcome.reason}`
                  : SKIP_LABEL[r.outcome.reason];

              return (
                <div
                  key={r.memberId}
                  className={`flex items-center gap-2 text-sm ${colorClass}`}
                >
                  <span className="w-4">{icon}</span>
                  <span className="flex-1 min-w-0 truncate text-text-main">
                    {r.memberName}
                  </span>
                  <span className="text-text-muted text-xs">
                    {r.memberEmail ?? "—"}
                  </span>
                  <span className="text-xs">{label}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
