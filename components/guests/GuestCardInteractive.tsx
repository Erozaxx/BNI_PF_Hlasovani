"use client";

import { useState, useTransition } from "react";
import { GuestCard } from "@/components/guests/GuestCard";
import { Button } from "@/components/ui/Button";
import { castVoteAction } from "@/actions/votes";

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
  const [showNoForm, setShowNoForm] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const showVoting = !!votingMeetingId && !voted;

  function handleYes() {
    if (!votingMeetingId) return;
    setError(null);
    startTransition(async () => {
      const result = await castVoteAction(guest.id, votingMeetingId, "up");
      if (result.success) {
        setVoted(true);
        setShowNoForm(false);
      } else {
        setError(result.error);
      }
    });
  }

  function handleNoOpen() {
    setShowNoForm(true);
    setError(null);
  }

  function handleNoCancel() {
    setShowNoForm(false);
    setComment("");
    setError(null);
  }

  function handleNoSubmit() {
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
        setShowNoForm(false);
        setComment("");
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <GuestCard
        name={guest.name}
        description={guest.description}
        categoryName={guest.categoryName}
      />

      {voted && (
        <p className="text-sm text-success font-medium px-1">Hlasovano ✓</p>
      )}

      {showVoting && !showNoForm && (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={isPending}
            loading={isPending}
            onClick={handleYes}
          >
            YES
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={isPending}
            onClick={handleNoOpen}
          >
            NO
          </Button>
        </div>
      )}

      {showVoting && showNoForm && (
        <div className="flex flex-col gap-2 p-3 bg-background border border-border rounded-lg">
          <label className="text-sm font-medium text-text-main">
            Duvod pro hlasovani NO (povinne):
          </label>
          <textarea
            className="w-full text-sm border border-border rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Zadejte duvod..."
            disabled={isPending}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={isPending || comment.trim().length === 0}
              loading={isPending}
              onClick={handleNoSubmit}
            >
              Potvrdit NO
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={handleNoCancel}
            >
              Zrusit
            </Button>
          </div>
        </div>
      )}

      {!showNoForm && error && (
        <p className="text-sm text-danger px-1">{error}</p>
      )}
    </div>
  );
}
