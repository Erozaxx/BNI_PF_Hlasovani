"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Textarea } from "@/components/ui/Textarea";
import type { MyVote } from "./GuestCardMeeting";

interface MeetingVoteButtonsProps {
  token: string;
  guestId: string;
  initialVote?: MyVote | null;
  onVoteCast: (vote: MyVote) => void;
}

type VoteValue = "up" | "neutral" | "down";
type ViewState = "selecting" | "down-form" | "submitted";

const voteOptions = [
  {
    value: "up" as VoteValue,
    emoji: "👍",
    label: "Pro",
    selectedClass: "border-success bg-success-light",
  },
  {
    value: "neutral" as VoteValue,
    emoji: "🤷",
    label: "Nevim",
    selectedClass: "border-info bg-info-light",
  },
  {
    value: "down" as VoteValue,
    emoji: "👎",
    label: "Proti",
    selectedClass: "border-danger bg-danger-light",
  },
] as const;

const voteLabel: Record<string, string> = {
  up: "Pro",
  neutral: "Nevim",
  down: "Proti",
};

const voteBadgeVariant: Record<string, "success" | "neutral" | "danger"> = {
  up: "success",
  neutral: "neutral",
  down: "danger",
};

export function MeetingVoteButtons({
  token,
  guestId,
  initialVote,
  onVoteCast,
}: MeetingVoteButtonsProps) {
  const [viewState, setViewState] = useState<ViewState>(
    initialVote ? "submitted" : "selecting"
  );
  const [submittedVote, setSubmittedVote] = useState<MyVote | null>(
    initialVote ?? null
  );
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitVote = async (value: VoteValue, voteReason?: string) => {
    setLoading(true);
    setError(null);

    try {
      const body: { guestId: string; value: VoteValue; reason?: string } = {
        guestId,
        value,
      };
      if (value === "down" && voteReason) {
        body.reason = voteReason;
      }

      const res = await fetch(`/api/m/${token}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string"
            ? data.error
            : "Nepodarilo se odeslat hlas."
        );
        return;
      }

      const newVote: MyVote = {
        value,
        reason: value === "down" ? (voteReason ?? null) : null,
      };
      setSubmittedVote(newVote);
      setViewState("submitted");
      onVoteCast(newVote);
    } catch {
      setError("Nepodarilo se odeslat hlas. Zkuste to znovu.");
    } finally {
      setLoading(false);
    }
  };

  const handlePushVote = async (value: VoteValue) => {
    if (value === "down") {
      // Down always goes through the form
      setViewState("down-form");
      setError(null);
      return;
    }
    await submitVote(value);
  };

  const handleDownFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Pro hlas 'Proti' je duvod povinny.");
      return;
    }
    await submitVote("down", reason.trim());
  };

  const handleChange = () => {
    setViewState("selecting");
    setReason("");
    setError(null);
  };

  // --- submitted state ---
  if (viewState === "submitted" && submittedVote) {
    return (
      <div className="flex flex-col items-start gap-2">
        <span className="text-xs text-text-muted">Vas hlas</span>
        <Badge variant={voteBadgeVariant[submittedVote.value] ?? "neutral"}>
          {voteLabel[submittedVote.value] ?? submittedVote.value}
        </Badge>
        {submittedVote.reason && (
          <p className="text-xs text-text-muted max-w-xs">
            {submittedVote.reason}
          </p>
        )}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={handleChange}
        >
          Zmenit
        </Button>
      </div>
    );
  }

  // --- down-form state ---
  if (viewState === "down-form") {
    return (
      <form onSubmit={handleDownFormSubmit} className="space-y-3">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Duvod pro hlas Proti
        </p>
        <Textarea
          name="vote-reason"
          label="Duvod (povinny)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Uved duvod pro hlas Proti..."
          disabled={loading}
          rows={2}
          error={error ?? undefined}
        />
        <div className="flex gap-2">
          <Button
            type="submit"
            size="sm"
            loading={loading}
            disabled={!reason.trim()}
          >
            Potvrdit hlas
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={() => {
              setViewState("selecting");
              setReason("");
              setError(null);
            }}
          >
            Zpet
          </Button>
        </div>
      </form>
    );
  }

  // --- selecting state ---
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
        Vas hlas
      </p>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2 flex-wrap">
        {voteOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handlePushVote(opt.value)}
            disabled={loading}
            className={[
              "flex flex-col items-center gap-1 px-4 py-3 rounded-lg border-2 transition-colors",
              "focus:outline-none focus:shadow-focus text-sm font-medium",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "border-border bg-white hover:border-primary/50",
            ].join(" ")}
          >
            {loading ? (
              <span className="text-2xl opacity-50">{opt.emoji}</span>
            ) : (
              <span className="text-2xl">{opt.emoji}</span>
            )}
            <span className="text-xs">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
