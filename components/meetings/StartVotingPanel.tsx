"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { nextWednesday2359InPrague } from "@/lib/meetings/voting-window";

type SkipReason = "no-email" | "revoked" | "already-sent";

type DispatchOutcome =
  | { status: "sent" }
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
  statusBefore: string;
  statusAfter: string;
  transitioned: boolean;
  votingClosesAt: string;
  linkExpiresAt: string;
  totalMembers: number;
  linksCreated: number;
  counts: { sent: number; skipped: number; error: number };
  recipients: DispatchRecipient[];
  errors: string[];
}

interface StartVotingPanelProps {
  meetingId: string;
  status: string; // "draft" | "active" | "voting" | "closed"
  hasGuests: boolean;
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

function formatClosesAtPreview(): string {
  const closesAt = nextWednesday2359InPrague(new Date());
  return closesAt.toLocaleDateString("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StartVotingPanel({
  meetingId,
  status: initialStatus,
  hasGuests,
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

  async function dispatch(mode: "start" | "resend") {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/start-voting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
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
      showToast(
        "success",
        `Odeslano ${dispatchResult.counts.sent} z ${dispatchResult.totalMembers} clenu.`
      );
      router.refresh();
    } catch {
      showToast("error", "Nepodarilo se spustit hlasovani.");
    } finally {
      setLoading(false);
    }
  }

  function handleStart() {
    const closesLabel = formatClosesAtPreview();
    if (
      !confirm(
        `Spustit hlasovani? Zalozi odkazy vsem clenum s e-mailem, spusti hlasovani do ${closesLabel} a rozesle maily.`
      )
    ) {
      return;
    }
    dispatch("start");
  }

  function handleResendClick() {
    dispatch(resendAll ? "resend" : "start");
  }

  function handleResendCheckboxChange(checked: boolean) {
    if (!checked) {
      setResendAll(false);
      return;
    }
    if (
      confirm(`Odeslat odkaz znovu vsem ${membersWithEmailCount} clenum?`)
    ) {
      setResendAll(true);
    } else {
      setResendAll(false);
    }
  }

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
                ? `Zalozi odkazy vsem clenum s e-mailem, spusti hlasovani do ${formatClosesAtPreview()} a rozesle maily.`
                : "Schuzka nema zadneho hosta, neni o cem hlasovat. Nejdrive pridejte hosty."}
            </p>
          </div>
        )}

        {currentStatus === "voting" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleResendClick}
                loading={loading}
              >
                Rozeslat odkazy
              </Button>
            </div>
            <p className="text-sm text-text-muted">
              Odkaz uz dostalo <strong>{linkEmailSentCount} z {membersWithEmailCount}</strong> clenu.
              Rozeslani doplni odkazy zbylym a posle jim mail; kdo odkaz uz
              dostal, se preskoci.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="resend-all"
                checked={resendAll}
                onChange={(e) => handleResendCheckboxChange(e.target.checked)}
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
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {result.recipients.map((r) => {
              const icon =
                r.outcome.status === "sent"
                  ? "✓"
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
