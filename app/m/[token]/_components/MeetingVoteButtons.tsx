"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { MyVote } from "./GuestCardMeeting";

interface MeetingVoteButtonsProps {
  token: string;
  guestId: string;
  onVoteCast: (vote: MyVote) => void;
}

type VoteValue = "up" | "neutral" | "down";

export function MeetingVoteButtons({
  token,
  guestId,
  onVoteCast,
}: MeetingVoteButtonsProps) {
  const [selected, setSelected] = useState<VoteValue | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelect = (value: VoteValue) => {
    setSelected(value);
    setError(null);
    if (value !== "down") {
      setReason("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (selected === "down" && !reason.trim()) {
      setError("Pro hlas 'Proti' je duvod povinny.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body: { guestId: string; value: VoteValue; reason?: string } = {
        guestId,
        value: selected,
      };
      if (selected === "down" && reason.trim()) {
        body.reason = reason.trim();
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

      onVoteCast({
        value: selected,
        reason: selected === "down" ? reason.trim() : null,
      });
    } catch {
      setError("Nepodarilo se odeslat hlas. Zkuste to znovu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">
        Vas hlas
      </p>
      <div className="flex gap-2 flex-wrap">
        <Button
          type="button"
          variant={selected === "up" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSelect("up")}
          disabled={loading}
          className={
            selected === "up"
              ? "border-success bg-success-light text-success"
              : ""
          }
        >
          Pro
        </Button>
        <Button
          type="button"
          variant={selected === "neutral" ? "primary" : "secondary"}
          size="sm"
          onClick={() => handleSelect("neutral")}
          disabled={loading}
          className={
            selected === "neutral"
              ? "border-info bg-info-light text-info"
              : ""
          }
        >
          Nevim
        </Button>
        <Button
          type="button"
          variant={selected === "down" ? "danger" : "secondary"}
          size="sm"
          onClick={() => handleSelect("down")}
          disabled={loading}
        >
          Proti
        </Button>
      </div>

      {selected === "down" && (
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
      )}

      {error && selected !== "down" && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {selected && (
        <Button
          type="submit"
          size="sm"
          loading={loading}
          disabled={selected === "down" && !reason.trim()}
        >
          Potvrdit hlas
        </Button>
      )}
    </form>
  );
}
