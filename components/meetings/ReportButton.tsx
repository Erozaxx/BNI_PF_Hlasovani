"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { triggerReportAction } from "@/actions/report";

interface ReportButtonProps {
  meetingId: string;
}

export function ReportButton({ meetingId }: ReportButtonProps) {
  const { showToast } = useToast();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  async function handleClick() {
    // iter-042 (#5): každé kliknutí pošle nový mail celému vedení, proto dotaz předem.
    if (
      !window.confirm(
        "Poslat report e-mailem celému vedení? Každé kliknutí pošle nový mail."
      )
    ) {
      return;
    }

    setPending(true);
    setMessage(null);

    try {
      const result = await triggerReportAction(meetingId);
      if (result.success) {
        const data = result.data;
        const msg = `Report odešel na ${data?.sent ?? 0} adres.`;
        setMessage({ type: "success", text: msg });
        showToast("success", msg);
      } else {
        setMessage({ type: "error", text: result.error });
        showToast("error", result.error);
      }
    } catch {
      setMessage({ type: "error", text: "Report se nepodařilo odeslat." });
      showToast("error", "Report se nepodařilo odeslat.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleClick}
        loading={pending}
        className="min-h-[44px]"
      >
        Poslat report vedení
      </Button>
      {message && (
        <p
          className={`text-sm mt-2 ${
            message.type === "success" ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
