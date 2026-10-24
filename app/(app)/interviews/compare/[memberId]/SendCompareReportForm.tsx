"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { sendInterviewCompareReportAction } from "@/actions/interviews";

interface RecipientOption {
  id: string;
  name: string;
}

interface SendCompareReportFormProps {
  memberId: string;
  /** Sending is guarded server-side to "both interviews submitted" (T-003) -
   *  render an explanation instead of a form the guard would just reject. */
  canSend: boolean;
  recipients: RecipientOption[];
}

export function SendCompareReportForm({
  memberId,
  canSend,
  recipients,
}: SendCompareReportFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [recipientId, setRecipientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!canSend) {
    return (
      <p className="text-sm text-text-muted">
        Srovnávací report jde odeslat, až budou oba pohovory odeslané.
      </p>
    );
  }

  if (recipients.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        Žádný člen nemá vyplněný e-mail, report nemá komu přijít.
      </p>
    );
  }

  const options = recipients.map((m) => ({ value: m.id, label: m.name }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!recipientId) {
      setError("Vyber příjemce.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await sendInterviewCompareReportAction(memberId, recipientId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", "Srovnávací report je odeslaný.");
        router.refresh();
      }
    } catch {
      setError("Srovnávací report se nepodařilo odeslat.");
      showToast("error", "Srovnávací report se nepodařilo odeslat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 items-start sm:items-end"
    >
      <div className="flex-1 min-w-0">
        <Select
          name="recipientId"
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          options={options}
          placeholder="Vyber příjemce…"
          error={error}
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" className="min-h-[44px]" loading={loading}>
        Odeslat srovnávací report
      </Button>
    </form>
  );
}
