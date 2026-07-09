"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { updateMemberJoinedAtAction } from "@/actions/members";

interface Props {
  memberId: string;
  /** "YYYY-MM-DD" — matches the DATE column and the <input type="date"> value format. */
  initialJoinedAt: string;
}

/**
 * Admin-only editor for member.joined_at (arch 7.1, iter-020). Saving a real
 * entry date is also what clears the "neoverene datum vstupu" heuristic
 * shown on the /interviews due-list (joined_at == created_at::date).
 */
export function EditMemberJoinedAtForm({ memberId, initialJoinedAt }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [joinedAt, setJoinedAt] = useState(initialJoinedAt);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await updateMemberJoinedAtAction(memberId, joinedAt);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", "Datum vstupu aktualizovano.");
        setOpen(false);
        router.refresh();
      }
    } catch {
      showToast("error", "Nepodarilo se aktualizovat datum vstupu.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-primary underline hover:no-underline"
      >
        Upravit
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-1">
      <Input
        type="date"
        label="Datum vstupu"
        name="joinedAt"
        value={joinedAt}
        onChange={(e) => setJoinedAt(e.target.value)}
        required
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={loading}>
          Ulozit
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            setJoinedAt(initialJoinedAt);
            setOpen(false);
          }}
        >
          Zrusit
        </Button>
      </div>
    </form>
  );
}
