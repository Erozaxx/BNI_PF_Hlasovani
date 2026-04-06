"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MeetingNoteForm } from "./MeetingNoteForm";
import { MeetingVoteButtons } from "./MeetingVoteButtons";
import { MeetingResultsView, VoteSummary, VoteDetailItem } from "./MeetingResultsView";

export interface GuestNote {
  id: string;
  text: string;
  createdAt: string | Date;
}

export interface MyVote {
  value: string;
  reason: string | null;
}

export interface GuestCardMeetingProps {
  token: string;
  guestId: string;
  name: string;
  company: string | null;
  email: string | null;
  description: string | null;
  categoryName: string | null;
  votingEnabled: boolean;
  notes: GuestNote[];
  myVote: MyVote | null;
  voteSummary: VoteSummary;
  voteDetail: VoteDetailItem[];
  phase: "active" | "voting" | "closed";
}

export function GuestCardMeeting({
  token,
  guestId,
  name,
  company,
  email,
  description,
  categoryName,
  votingEnabled,
  notes: initialNotes,
  myVote: initialVote,
  voteSummary,
  voteDetail,
  phase,
}: GuestCardMeetingProps) {
  const [notes, setNotes] = useState<GuestNote[]>(initialNotes);

  const handleNoteAdded = (note: GuestNote) => {
    setNotes((prev) => [...prev, note]);
  };

  const showNoteForm = phase === "active" || phase === "voting";
  // Badge is now owned by MeetingVoteButtons in voting phase;
  // show it here only outside voting (e.g. closed phase, after reload).
  const showVoteButtons = phase === "voting" && votingEnabled;
  const showVoteBadgeHere = !showVoteButtons && initialVote !== null;

  return (
    <Card>
      {/* Guest header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold text-text-main">{name}</h3>
          {company && (
            <p className="text-sm text-text-muted">{company}</p>
          )}
          {email && (
            <p className="text-sm text-text-muted">{email}</p>
          )}
          {categoryName && (
            <Badge variant="category" className="mt-1">
              {categoryName}
            </Badge>
          )}
        </div>
        {showVoteBadgeHere && initialVote && (
          <div className="flex flex-col items-start sm:items-end gap-1">
            <span className="text-xs text-text-muted">Vas hlas</span>
            <Badge
              variant={
                ({ up: "success", neutral: "neutral", down: "danger" } as Record<string, "success" | "neutral" | "danger">)[initialVote.value] ?? "neutral"
              }
            >
              {({ up: "Pro", neutral: "Nevim", down: "Proti" } as Record<string, string>)[initialVote.value] ?? initialVote.value}
            </Badge>
            {initialVote.reason && (
              <p className="text-xs text-text-muted max-w-xs text-right">
                {initialVote.reason}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-text-main mb-4 whitespace-pre-line">
          {description}
        </p>
      )}

      {/* Notes section */}
      {notes.length > 0 && (
        <div className="mb-4">
          <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
            Poznamky
          </h4>
          <ul className="space-y-1">
            {notes.map((n) => (
              <li
                key={n.id}
                className="text-sm text-text-main bg-background rounded px-3 py-2 border border-border"
              >
                {n.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Note form */}
      {showNoteForm && (
        <MeetingNoteForm
          token={token}
          guestId={guestId}
          onNoteAdded={handleNoteAdded}
        />
      )}

      {/* Vote buttons — shown whenever voting phase is active, regardless of prior vote */}
      {showVoteButtons && (
        <div className="mt-4 pt-4 border-t border-border">
          <MeetingVoteButtons
            token={token}
            guestId={guestId}
            initialVote={initialVote ?? null}
            onVoteCast={() => {}}
          />
        </div>
      )}

      {/* Vote summary — visible in voting and closed phases */}
      {(phase === "voting" || phase === "closed") && (
        <div className="mt-4 pt-4 border-t border-border">
          <MeetingResultsView summary={voteSummary} guestName={name} voteDetail={voteDetail} />
        </div>
      )}
    </Card>
  );
}
