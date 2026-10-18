"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { recordHelpForAction } from "@/actions/burza";
import { HELP_NOTE_MAX, TEXTS } from "@/lib/burza/rules";

const selectClass =
  "h-11 w-full rounded-lg border border-border bg-white px-3 text-base text-text-main focus:outline-none focus:border-primary focus:shadow-focus";

/**
 * „Zapsat pomoc podle hlášení“ (6.5, vedení): kdo pomohl (jen členové s
 * řádkem v burze), komu (všichni kromě vybraného pomocníka) a poznámka.
 */
export function RecordHelpForm({
  helpers,
  members,
}: {
  helpers: Array<{ id: string; name: string }>;
  members: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [helperId, setHelperId] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  const recipients = members.filter((m) => m.id !== helperId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!helperId || !recipientId) {
      showToast("error", "Vyber, kdo pomohl a komu.");
      return;
    }
    setLoading(true);
    try {
      const result = await recordHelpForAction(helperId, recipientId, note);
      if (!result.success) {
        showToast("error", result.error);
        return;
      }
      showToast("success", result.data?.already ? "Tento měsíc už zapsáno." : "Pomoc je zapsaná.");
      setNote("");
      setRecipientId("");
      router.refresh();
    } catch {
      showToast("error", "Pomoc se nepodařilo zapsat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="help-helper" className="text-sm font-medium text-text-main">
          Kdo pomohl
        </label>
        <select
          id="help-helper"
          value={helperId}
          onChange={(e) => {
            setHelperId(e.target.value);
            if (e.target.value === recipientId) setRecipientId("");
          }}
          className={selectClass}
        >
          <option value="">Vyber člena</option>
          {helpers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-text-muted">{TEXTS.helpMissingMember}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="help-recipient" className="text-sm font-medium text-text-main">
          Komu
        </label>
        <select
          id="help-recipient"
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          className={selectClass}
        >
          <option value="">Vyber člena</option>
          {recipients.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <Textarea
        label="Poznámka (nepovinné)"
        name="help-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={HELP_NOTE_MAX}
        rows={2}
      />

      <Button type="submit" loading={loading} disabled={loading} className="min-h-[44px] w-full sm:w-auto">
        Zapsat
      </Button>
    </form>
  );
}
