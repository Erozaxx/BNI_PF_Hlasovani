"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { MemberLinksManager } from "./MemberLinksManager";

interface MeetingActivationControlsProps {
  meetingId: string;
  meetingDate: string;
  status: string;
}

/**
 * Client component that provides:
 * 1. "Aktivovat schuzku" button (draft -> active) — calls POST /api/meetings/[id]/activate
 * 2. "Aktivovat hlasovani" button (active -> voting) — calls POST /api/meetings/[id]/activate-voting
 * 3. MemberLinksManager section — shown when status in [active, voting, closed]
 *
 * rawTokens produced by the activate endpoint are passed into MemberLinksManager
 * so the admin can copy / send emails immediately after activation.
 */
export function MeetingActivationControls({
  meetingId,
  meetingDate,
  status: initialStatus,
}: MeetingActivationControlsProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(initialStatus);

  // rawTokens from activate response: memberId -> rawToken
  // Passed to MemberLinksManager so admin can copy/send immediately
  const [initialRawTokens, setInitialRawTokens] = useState<
    Record<string, string>
  >({});

  async function handleActivateMeeting() {
    if (
      !confirm(
        "Aktivovat schuzku? Vygeneruji se magic linky pro vsechny cleny s emailem."
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/activate`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Nepodarilo se aktivovat schuzku.");
        return;
      }

      // Extract rawTokens from response (only for newly created links)
      const tokens: Record<string, string> = {};
      if (Array.isArray(body.links)) {
        for (const link of body.links) {
          if (link.rawToken && link.memberId) {
            tokens[link.memberId] = link.rawToken;
          }
        }
      }
      setInitialRawTokens(tokens);

      const newLinkCount = Object.keys(tokens).length;
      showToast(
        "success",
        `Schuzka aktivovana. Magic linky vytvoreny pro ${newLinkCount} clenu.`
      );
      setCurrentStatus("active");
      router.refresh();
    } catch {
      showToast("error", "Nepodarilo se aktivovat schuzku.");
    } finally {
      setLoading(false);
    }
  }

  async function handleActivateVoting() {
    if (
      !confirm(
        "Spustit hlasovani? Status schuzky se zmeni na 'hlasovani' a tokeny zacnou expirovat za 72 hodin."
      )
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/activate-voting`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast("error", body.error ?? "Nepodarilo se spustit hlasovani.");
        return;
      }
      showToast("success", "Hlasovani bylo spusteno.");
      setCurrentStatus("voting");
      router.refresh();
    } catch {
      showToast("error", "Nepodarilo se spustit hlasovani.");
    } finally {
      setLoading(false);
    }
  }

  const showLinksManager =
    currentStatus === "active" ||
    currentStatus === "voting" ||
    currentStatus === "closed";

  return (
    <div className="space-y-6">
      {/* Activation buttons */}
      <div className="flex flex-wrap gap-3">
        {currentStatus === "draft" && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleActivateMeeting}
            loading={loading}
          >
            Aktivovat schuzku
          </Button>
        )}
        {currentStatus === "active" && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleActivateVoting}
            loading={loading}
          >
            Aktivovat hlasovani
          </Button>
        )}
      </div>

      {/* MemberLinksManager section */}
      {showLinksManager && (
        <MemberLinksManager
          meetingId={meetingId}
          meetingDate={meetingDate}
          initialRawTokens={initialRawTokens}
        />
      )}
    </div>
  );
}
