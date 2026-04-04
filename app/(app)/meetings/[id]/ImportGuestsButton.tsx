"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface ImportResult {
  created: number;
  existing: number;
  linkedToMeeting: number;
  skipped: number;
}

interface ImportGuestsButtonProps {
  meetingId: string;
}

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export function ImportGuestsButton({ meetingId }: ImportGuestsButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  function handleButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus("error");
      setErrorMessage(`Soubor je prilis velky. Maximalni velikost je ${MAX_FILE_SIZE_MB} MB.`);
      // Reset input so same file can be re-selected after fix
      e.target.value = "";
      return;
    }

    setStatus("uploading");
    setResult(null);
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`/api/meetings/${meetingId}/import-guests`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let message = "Import selhal. Zkuste to znovu.";
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

      const data: ImportResult = await response.json();
      setResult(data);
      setStatus("success");
      router.refresh();
    } catch {
      setStatus("error");
      setErrorMessage("Import selhal. Zkontrolujte pripojeni a zkuste to znovu.");
    } finally {
      // Reset input so the same file can be selected again if needed
      e.target.value = "";
    }
  }

  function handleReset() {
    setStatus("idle");
    setResult(null);
    setErrorMessage("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={status === "uploading"}
          disabled={status === "uploading"}
          onClick={handleButtonClick}
        >
          Importovat hosty (.xlsx)
        </Button>
        {(status === "success" || status === "error") && (
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Success report */}
      {status === "success" && result && (
        <p className="text-sm text-green-700">
          Importovano: {result.created} novych, {result.existing} existujicich, celkem{" "}
          {result.linkedToMeeting} prirazeno
          {result.skipped > 0 ? `, ${result.skipped} preskoceno` : ""}.
        </p>
      )}

      {/* Error message */}
      {status === "error" && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
