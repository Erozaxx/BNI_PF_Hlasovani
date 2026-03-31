"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { createNoteAction } from "@/actions/notes";

interface NoteFormProps {
  guestId: string;
}

const MAX_LENGTH = 2000;

export function NoteForm({ guestId }: NoteFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = text.trim();
    if (!trimmed) {
      setError("Poznamka nesmi byt prazdna.");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`Poznamka muze mit maximalne ${MAX_LENGTH} znaku.`);
      return;
    }

    setLoading(true);

    try {
      const result = await createNoteAction(guestId, trimmed);

      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setText("");
        showToast("success", "Poznamka byla pridana.");
        router.refresh();
      }
    } catch {
      setError("Doslo k neocekavane chybe.");
      showToast("error", "Doslo k neocekavane chybe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">
          {error}
        </div>
      )}

      <Textarea
        name="note-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Napiste poznamku k tomuto hostu..."
        maxLength={MAX_LENGTH}
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted">
          {text.length}/{MAX_LENGTH}
        </span>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={loading}
          disabled={!text.trim()}
        >
          Pridat poznamku
        </Button>
      </div>
    </form>
  );
}
