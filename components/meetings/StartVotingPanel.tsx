"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { votingClosesAtFor, isDeliveryDue } from "@/lib/meetings/voting-window";
import { deliveryHint, type DeliveryHint } from "@/lib/meetings/morning-dispatch";
import { formatWeekdayFull } from "@/lib/attendance/rules";

type SkipReason = "inactive" | "no-email" | "revoked" | "already-sent";

type DispatchOutcome =
  | { status: "sent" }
  // iter-028 (T-005, arch 3.3): deliver:"defer" - odkaz čeká na ranní cron.
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
  /** Datum schůzky "YYYY-MM-DD" (iter-028, arch 3.6), uzávěrka a "kdy odejdou maily" se počítají od něj. */
  meetingDate: string;
  /** Kolik členů s e-mailem už má značku odeslání, jen pro počáteční zobrazení stavu 'voting'. */
  initialLinkEmailSentCount: number;
  /** Kolik členů celkem má e-mail, jmenovatel "X z Y" a text potvrzovacího dialogu. */
  membersWithEmailCount: number;
  /** iter-042 (BK3): den pravidelné schůzky z Nastavení chapteru (0 až 6), podle něj končí hlasování. Výchozí čtvrtek. */
  regularWeekday?: number;
}

const SKIP_LABEL: Record<SkipReason, string> = {
  inactive: "přeskočeno: neaktivní",
  "no-email": "přeskočeno: bez e-mailu",
  revoked: "přeskočeno: odkaz zneplatněný",
  "already-sent": "přeskočeno: odkaz už odeslaný",
};

/** „st 28. 10. 2026 23:59“, čas výslovně v Europe/Prague (iter-042 Z1). */
function formatClosesAtPreview(meetingDate: string, regularWeekday?: number): string {
  const closesAt = votingClosesAtFor(meetingDate, new Date(), regularWeekday);
  const day = closesAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
  const time = closesAt.toLocaleTimeString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatWeekdayFull(day)} ${time}`;
}

/** "YYYY-MM-DD" -> "D. M." (arch 3.6, bez roku, telo panelu). */
function formatCzShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day}. ${month}.`;
}

/** `{kdy}` z arch 3.6 - kdy odejdou maily, slovně. */
function formatDeliveryHint(hint: DeliveryHint): string {
  switch (hint.kind) {
    case "on-date":
      return `v den schůzky ${formatCzShortDate(hint.date)} ráno`;
    case "today-morning":
      return "dnes ráno";
    case "tomorrow-morning":
      return "zítra ráno";
  }
}

export function StartVotingPanel({
  meetingId,
  status: initialStatus,
  hasGuests,
  meetingDate,
  initialLinkEmailSentCount,
  membersWithEmailCount,
  regularWeekday,
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
          body.error ?? "Hlasování se nepodařilo spustit."
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
      // iter-028 (T-005, arch 3.6): deliver:"defer" nikdy nic neposlal,
      // toast to nesmí předstírat. deliver:"now" (Rozeslat hned) beze změny.
      showToast(
        "success",
        dispatchResult.deliver === "defer"
          ? `Hlasování spuštěno, maily odejdou ${formatDeliveryHint(
              deliveryHint(dispatchResult.meetingDate, new Date())
            )}.`
          : `Odesláno ${dispatchResult.counts.sent} z ${dispatchResult.totalMembers} členů.`
      );
      router.refresh();
    } catch {
      showToast("error", "Hlasování se nepodařilo spustit.");
    } finally {
      setLoading(false);
    }
  }

  function handleStart() {
    const closesLabel = formatClosesAtPreview(meetingDate, regularWeekday);
    if (
      !confirm(
        `Spustit hlasování? Maily členům odejdou ${kdy}, ne teď. Hlasování poběží do ${closesLabel}.`
      )
    ) {
      return;
    }
    dispatch("start");
  }

  function handleSendNowClick() {
    const missing = membersWithEmailCount - linkEmailSentCount;
    if (!confirm(`Poslat odkaz hned ${missing} členům, kteří ho ještě nemají?`)) {
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
        `Poslat odkaz znovu všem ${membersWithEmailCount} členům? Jejich dosavadní odkazy přestanou platit.`
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
              className="min-h-[44px]"
            >
              Spustit hlasování
            </Button>
            <p className="text-sm text-text-muted">
              {hasGuests
                ? `Založí odkazy všem členům s e-mailem a spustí hlasování do ${formatClosesAtPreview(
                    meetingDate,
                    regularWeekday
                  )}. Maily odejdou ${kdy}. Po spuštění už nejde přidávat hosty.`
                : "Schůzka nemá žádného hosta, není o čem hlasovat. Nejdřív přidej hosty."}
            </p>
          </div>
        )}

        {currentStatus === "voting" && !dueToday && (
          <p className="text-sm text-text-muted">
            Hlasování je spuštěné. Odkazy odejdou {membersWithEmailCount} členům
            v den schůzky {formatCzShortDate(meetingDate)} ráno. Do té doby
            nikomu nic nepřijde.
          </p>
        )}

        {currentStatus === "voting" && dueToday && !allAlreadySent && (
          <div className="space-y-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSendNowClick}
              loading={loading}
              className="min-h-[44px]"
            >
              Rozeslat hned
            </Button>
            <p className="text-sm text-text-muted">
              Odkaz už dostalo{" "}
              <strong>
                {linkEmailSentCount} z {membersWithEmailCount}
              </strong>{" "}
              členů. Ostatním ho pošle ranní rozeslání {kdy}. Rozeslat hned ho
              pošle teď.
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
                className="min-h-[44px]"
              >
                Rozeslat hned
              </Button>
            </div>
            <p className="text-sm text-text-muted">
              Odkaz už dostali všichni ({membersWithEmailCount} z{" "}
              {membersWithEmailCount}).
            </p>
            <div className="flex min-h-[44px] items-center gap-2">
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
                Poslat znovu i těm, kdo odkaz už dostali (starý odkaz přestane platit)
              </label>
            </div>
          </div>
        )}

        {currentStatus === "closed" && (
          <p className="text-sm text-text-muted">Hlasování je uzavřené.</p>
        )}
      </Card>

      {result && (
        <Card>
          {result.deliver === "defer" ? (
            <p className="text-sm font-medium text-text-main mb-3">
              Hlasování spuštěno. Odkazy odejdou{" "}
              {formatDeliveryHint(deliveryHint(result.meetingDate, new Date()))}:{" "}
              {result.counts.scheduled} členů, bez e-mailu{" "}
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
              Odesláno {result.counts.sent} z {result.totalMembers} členů
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
                  ? `odesláno${r.linkCreated ? " (nový odkaz)" : ""}`
                  : r.outcome.status === "scheduled"
                  ? "odejde ráno"
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
                    {r.memberEmail ?? "bez e-mailu"}
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
