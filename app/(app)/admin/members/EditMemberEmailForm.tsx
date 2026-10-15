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
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const result = await updateMemberEmailAction(memberId, email);
    setLoading(false);
    if (result.success) {
      setOpen(false);
      // iter-032 (security M-1): odkazy poslané na starou adresu přestaly platit.
      if ((result.data?.revokedLinks ?? 0) > 0) {
        setNotice(
          "Odkazy poslané na starou adresu přestaly platit." +
            (result.data?.isManagement
              ? " Jestli si člen ještě nenastavil heslo, pošli mu nový odkaz pro heslo."
              : "")
        );
      }
    } else {
      setError(result.error ?? "Chyba");
    }
  }

  if (!open) {
    return (
      <>
        <button
          onClick={() => { setOpen(true); setNotice(null); }}
          className="text-xs text-primary hover:underline mt-1"
        >
          Upravit
        </button>
        {notice && <p className="text-xs text-text-muted mt-1">{notice}</p>}
      </>
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
