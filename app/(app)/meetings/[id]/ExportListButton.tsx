"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface ExportListButtonProps {
  meetingId: string;
}

export function ExportListButton({ meetingId }: ExportListButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleExport() {
    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch(`/api/meetings/${meetingId}/export-list`);

      if (!response.ok) {
        let message = "Export selhal. Zkuste to znovu.";
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          // ignore parse errors
        }
        setStatus("error");
        setErrorMessage(message);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Extract filename from Content-Disposition header if present
      const disposition = response.headers.get("Content-Disposition");
      let filename = "seznam-hostu.xlsx";
      if (disposition) {
        const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)/i);
        if (match) filename = decodeURIComponent(match[1]);
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setStatus("idle");
    } catch {
      setStatus("error");
      setErrorMessage("Export selhal. Zkontrolujte pripojeni a zkuste to znovu.");
    }
  }

  function handleReset() {
    setStatus("idle");
    setErrorMessage("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={status === "loading"}
          disabled={status === "loading"}
          onClick={handleExport}
        >
          Exportovat seznam (.xlsx)
        </Button>
        {status === "error" && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleReset}
          >
            Zavrit
          </Button>
        )}
      </div>

      {/* Error message */}
      {status === "error" && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
