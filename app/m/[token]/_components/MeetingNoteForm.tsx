"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import type { GuestNote } from "./GuestCardMeeting";

interface MeetingNoteFormProps {
  token: string;
  guestId: string;
  onNoteAdded: (note: GuestNote) => void;
}

export function MeetingNoteForm({
  token,
  guestId,
  onNoteAdded,
}: MeetingNoteFormProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleOpen = () => {
    setOpen(true);
    setError(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const handleCancel = () => {
    setOpen(false);
    setText("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/m/${token}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestId, text: text.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string"
            ? data.error
            : "Nepodarilo se ulozit poznamku."
        );
        return;
      }

      const data = await res.json();
      const saved: GuestNote = {
        id: data.note.id,
        text: data.note.text,
        createdAt: data.note.createdAt,
      };

      onNoteAdded(saved);
      setText("");
      setOpen(false);
    } catch {
      setError("Nepodarilo se odeslat poznamku. Zkuste to znovu.");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        className="text-sm text-navy hover:underline"
      >
        + Pridat poznamku
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-2">
      <Textarea
        ref={textareaRef}
        name="note-text"
        label="Nova poznamka"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Napis poznamku..."
        error={error ?? undefined}
        disabled={loading}
        rows={3}
      />
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          loading={loading}
          disabled={!text.trim()}
        >
          Ulozit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCancel}
          disabled={loading}
        >
          Zrusit
        </Button>
      </div>
    </form>
  );
}
