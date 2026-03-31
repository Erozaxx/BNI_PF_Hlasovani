"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { castVoteAction } from "@/actions/votes";

type VoteValue = "up" | "neutral" | "down";

interface VoteFormProps {
  guestId: string;
  meetingId: string;
  /** null = user hasn't voted yet */
  existingVote: {
    value: string;
    reason: string | null;
  } | null;
  /** Is the voting window currently open? */
  votingOpen: boolean;
}

const voteOptions: { value: VoteValue; label: string; emoji: string }[] = [
  { value: "up", label: "Pro", emoji: "\u{1F44D}" },
  { value: "neutral", label: "Neutralni", emoji: "\u{1F610}" },
  { value: "down", label: "Proti", emoji: "\u{1F44E}" },
];

export function VoteForm({
  guestId,
  meetingId,
  existingVote,
  votingOpen,
}: VoteFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<VoteValue | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Already voted — show what was cast
  if (existingVote) {
    const option = voteOptions.find((o) => o.value === existingVote.value);
    return (
      <div className="space-y-2">
        <p className="text-sm text-text-muted">Vas hlas:</p>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{option?.emoji ?? "?"}</span>
          <span className="font-medium text-text-main">
            {option?.label ?? existingVote.value}
          </span>
        </div>
        {existingVote.reason && (
          <p className="text-sm text-text-muted">
            Duvod: {existingVote.reason}
          </p>
        )}
      </div>
    );
  }

  // Voting not open — hide form
  if (!votingOpen) {
    return (
      <p className="text-sm text-text-muted">
        Hlasovani neni aktivni.
      </p>
    );
  }

  async function handleSubmit() {
    if (!selected) return;

    if (selected === "down" && reason.trim().length === 0) {
      setError("Hlasovani proti vyzaduje uvedeni duvodu.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await castVoteAction(
        guestId,
        meetingId,
        selected,
        selected === "down" ? reason.trim() : undefined
      );
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", "Hlas byl uspesne odeslan.");
        router.push(`/meetings/${meetingId}`);
      }
    } catch {
      setError("Nepodarilo se odeslat hlas.");
      showToast("error", "Nepodarilo se odeslat hlas.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Vote buttons */}
      <div className="flex gap-3">
        {voteOptions.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              setSelected(opt.value);
              setError("");
            }}
            disabled={loading}
            className={`
              flex flex-col items-center gap-1 px-4 py-3 rounded-lg border-2 transition-colors
              focus:outline-none focus:shadow-focus
              ${
                selected === opt.value
                  ? "border-primary bg-primary/10"
                  : "border-border bg-white hover:border-primary/50"
              }
              disabled:opacity-50 disabled:cursor-not-allowed
            `.trim()}
          >
            <span className="text-2xl">{opt.emoji}</span>
            <span className="text-sm font-medium text-text-main">
              {opt.label}
            </span>
          </button>
        ))}
      </div>

      {/* Reason field — shown only for 'down' */}
      {selected === "down" && (
        <Textarea
          label="Duvod (povinny)"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Prosim uvedte duvod vaseho hlasu proti..."
          error={
            selected === "down" && error.includes("duvod") ? error : undefined
          }
        />
      )}

      {/* Submit */}
      {selected && (
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          loading={loading}
          disabled={loading}
        >
          Odeslat hlas
        </Button>
      )}

      {/* Error message */}
      {error && !error.includes("duvod") && (
        <p className="text-sm text-danger">{error}</p>
      )}
    </div>
  );
}
