"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type {
  GuestImportCreatedRow,
  GuestImportMergedRow,
  GuestImportResult,
  GuestImportSkippedRow,
} from "@/lib/import/dedup-guests";

interface ImportGuestsButtonProps {
  meetingId: string;
}

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Prezentacni orez dlouhych seznamu (sekce 5.6). Odpoved API zustava
// uplna, orez je jen kosmeticky, aby uspesny import nevyplivl stranku
// textu.
const MAX_VISIBLE_LIST_ITEMS = 20;

// Konvence komponenty: staticke popisky bez diakritiky ("Radek",
// "napojeno na", "chybi jmeno" apod.). Jmena a emaily z xlsx a z DB se
// vypisuji DOSLOVA, tak jak prisly — nikdy se nesklapeji na bez-diakritiku
// tvar (gate P4). Report ma sloužit k identifikaci konkretniho cloveka,
// komoleni jmen by tenhle ucel podkopalo.
function formatEmailForDisplay(email: string | null): string {
  return email ?? "bez emailu";
}

function splitForDisplay<T>(
  items: T[],
  max: number
): { visible: T[]; remaining: number } {
  return { visible: items.slice(0, max), remaining: Math.max(0, items.length - max) };
}

function buildSummaryLines(result: GuestImportResult): string[] {
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} novych hostu`);
  if (result.existing > 0) parts.push(`${result.existing} slouceni s existujicim`);
  if (result.duplicates > 0) parts.push(`${result.duplicates} duplicitni radek`);
  if (result.skipped > 0) parts.push(`${result.skipped} preskocen`);

  const firstLine =
    parts.length > 0
      ? `Import dokoncen: ${parts.join(", ")} (z ${result.totalRows} radku).`
      : `Import dokoncen: zadne radky ke zpracovani (z ${result.totalRows} radku).`;

  const secondLine =
    result.alreadyLinked > 0
      ? `Na schuzku prirazeno ${result.linkedToMeeting} hostu, ${result.alreadyLinked} uz na schuzce byli.`
      : `Na schuzku prirazeno ${result.linkedToMeeting} hostu.`;

  return [firstLine, secondLine];
}

function createdRowText(row: GuestImportCreatedRow): string {
  return `Radek ${row.rowNumber} — ${row.name} (${formatEmailForDisplay(row.email)}) → nova karta hosta`;
}

function mergedRowText(row: GuestImportMergedRow): string {
  if (row.reason === "existing-guest") {
    const emailPart = `(${formatEmailForDisplay(row.email)})`;
    // Gate P3: shoda podle samotneho jmena (oba bez emailu) je jediny typ
    // slouceni, ktery muze byt falesny — v textu se to musi poznat.
    const matchedWithoutEmail = row.matchedEmail === null;
    const suffix = matchedWithoutEmail
      ? " (bez emailu, slouceno podle jmena)"
      : "";
    return `Radek ${row.rowNumber} — ${row.name} ${emailPart} → napojeno na existujiciho hosta „${row.matchedName}"${suffix}`;
  }
  return `Radek ${row.rowNumber} — ${row.name} (${formatEmailForDisplay(row.email)}) → duplicita radku ${row.firstRowNumber} „${row.firstName}", prirazen jednou`;
}

function skippedRowText(row: GuestImportSkippedRow): string {
  return `Radek ${row.rowNumber} — chybi jmeno, radek nelze ulozit`;
}

export function ImportGuestsButton({ meetingId }: ImportGuestsButtonProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<GuestImportResult | null>(null);
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

      const data: GuestImportResult = await response.json();
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

  const createdDisplay = result
    ? splitForDisplay(result.createdRows, MAX_VISIBLE_LIST_ITEMS)
    : null;
  const mergedDisplay = result
    ? splitForDisplay(result.merged, MAX_VISIBLE_LIST_ITEMS)
    : null;
  const skippedDisplay = result
    ? splitForDisplay(result.skippedRows, MAX_VISIBLE_LIST_ITEMS)
    : null;

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
      {status === "success" && result && createdDisplay && mergedDisplay && skippedDisplay && (
        <div className="flex flex-col gap-3">
          <div className="text-sm text-green-700">
            {buildSummaryLines(result).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          {result.truncated && (
            <p className="text-sm text-amber-700">
              Soubor obsahuje vic nez 500 radku. Zpracovano bylo prvnich 500, zbytek byl ignorovan.
            </p>
          )}

          {result.createdRows.length > 0 && (
            <div className="text-sm text-slate-600">
              <p className="font-medium">Nove zalozeni hoste:</p>
              <ul className="list-disc pl-5">
                {createdDisplay.visible.map((row) => (
                  <li key={row.rowNumber}>{createdRowText(row)}</li>
                ))}
              </ul>
              {createdDisplay.remaining > 0 && (
                <p>… a dalsich {createdDisplay.remaining} radku.</p>
              )}
            </div>
          )}

          {result.merged.length > 0 && (
            <div className="text-sm text-slate-600">
              <p className="font-medium">Slouceno s existujicimi zaznamy:</p>
              <ul className="list-disc pl-5">
                {mergedDisplay.visible.map((row) => (
                  <li key={`${row.reason}-${row.rowNumber}`}>{mergedRowText(row)}</li>
                ))}
              </ul>
              {mergedDisplay.remaining > 0 && (
                <p>… a dalsich {mergedDisplay.remaining} radku.</p>
              )}
            </div>
          )}

          {result.skippedRows.length > 0 && (
            <div className="text-sm text-amber-700">
              <p className="font-medium">Preskocene radky:</p>
              <ul className="list-disc pl-5">
                {skippedDisplay.visible.map((row) => (
                  <li key={row.rowNumber}>{skippedRowText(row)}</li>
                ))}
              </ul>
              {skippedDisplay.remaining > 0 && (
                <p>… a dalsich {skippedDisplay.remaining} radku.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Error message */}
      {status === "error" && (
        <p className="text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
