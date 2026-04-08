"use client";

import { useState } from "react";
import { updateMemberEmailAction } from "@/actions/members";

interface Props {
  memberId: string;
  initialEmail: string | null;
}

export function EditMemberEmailForm({ memberId, initialEmail }: Props) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(initialEmail ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const result = await updateMemberEmailAction(memberId, email);
    setLoading(false);
    if (result.success) {
      setOpen(false);
    } else {
      setError(result.error ?? "Chyba");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-primary hover:underline mt-1"
      >
        Upravit
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-1 flex flex-col gap-1">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@example.com"
        className="text-xs border border-border rounded px-2 py-1 w-48"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="text-xs text-primary hover:underline disabled:opacity-50"
        >
          {loading ? "Ukládám…" : "Uložit"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setEmail(initialEmail ?? ""); setError(null); }}
          className="text-xs text-text-muted hover:underline"
        >
          Zrušit
        </button>
      </div>
    </form>
  );
}
