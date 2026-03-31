"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { GuestCard } from "@/components/guests/GuestCard";
import { castVoteAction } from "@/actions/votes";

type VoteValue = "up" | "neutral" | "down";

const voteOptions: { value: VoteValue; emoji: string; label: string }[] = [
  { value: "up", emoji: "👍", label: "Pro" },
  { value: "neutral", emoji: "😐", label: "Nevim" },
  { value: "down", emoji: "👎", label: "Proti" },
];

interface GuestCardInteractiveProps {
  guest: {
    id: string;
    name: string;
    description?: string | null;
    categoryName?: string | null;
  };
  votingMeetingId?: string;
  alreadyVoted?: boolean;
}

export function GuestCardInteractive({
  guest,
  votingMeetingId,
  alreadyVoted = false,
}: GuestCardInteractiveProps) {
  const [voted, setVoted] = useState(alreadyVoted);
  const [selected, setSelected] = useState<VoteValue | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showVoting = !!votingMeetingId && !voted;

  function handleSelect(value: VoteValue) {
    setSelected(value);
    setError(null);
    if (value !== "down") {
      setComment("");
      if (!votingMeetingId) return;
      startTransition(async () => {
        const result = await castVoteAction(guest.id, votingMeetingId, value);
        if (result.success) {
          setVoted(true);
        } else {
          setError(result.error);
          setSelected(null);
        }
      });
    }
  }

  function handleDownSubmit() {
    if (!votingMeetingId) return;
    setError(null);
    startTransition(async () => {
      const result = await castVoteAction(
        guest.id,
        votingMeetingId,
        "down",
        comment.trim() || undefined
      );
      if (result.success) {
        setVoted(true);
        setSelected(null);
        setComment("");
      } else {
        setError(result.error);
      }
    });
  }

  function handleDownCancel() {
    setSelected(null);
    setComment("");
    setError(null);
  }

  return (
    <div className="flex flex-col gap-2">
      <Link href={`/guests/${guest.id}`}>
        <GuestCard
          name={guest.name}
          description={guest.description}
          categoryName={guest.categoryName}
          interactive
        />
      </Link>

      {voted && (
        <p className="text-sm text-success font-medium px-1">Hlasovano ✓</p>
      )}

      {showVoting && selected !== "down" && (
        <div className="flex gap-2">
          {voteOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handleSelect(opt.value)}
              disabled={isPending}
              className={`
                flex flex-col items-center gap-1 px-3 py-2 rounded-lg border-2 transition-colors
                focus:outline-none focus:shadow-focus text-sm font-medium
                border-border bg-white hover:border-primary/50
                disabled:opacity-50 disabled:cursor-not-allowed
              `.trim()}
            >
              <span className="text-xl">{opt.emoji}</span>
              <span className="text-xs text-text-main">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {showVoting && selected === "down" && (
        <div className="flex flex-col gap-2 p-3 bg-background border border-border rounded-lg">
          <label className="text-sm font-medium text-text-main">
            Duvod pro hlasovani Proti (povinny):
          </label>
          <textarea
            className="w-full text-sm border border-border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Zadejte duvod..."
            disabled={isPending}
            autoFocus
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDownSubmit}
              disabled={isPending || comment.trim().length === 0}
              className="flex items-center gap-1 px-3 py-2 rounded-lg border-2 border-danger bg-danger text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              👎 Potvrdit
            </button>
            <button
              type="button"
              onClick={handleDownCancel}
              disabled={isPending}
              className="px-3 py-2 rounded-lg border-2 border-border bg-white text-sm font-medium text-text-main"
            >
              Zrusit
            </button>
          </div>
        </div>
      )}

      {selected !== "down" && error && (
        <p className="text-sm text-danger px-1">{error}</p>
      )}
    </div>
  );
}
