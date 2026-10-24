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

// Prezentační ořez dlouhých seznamů (sekce 5.6). Odpověď API zůstává
// úplná, ořez je jen kosmetický, aby úspěšný import nevyplivl stránku
// textu.
const MAX_VISIBLE_LIST_ITEMS = 20;

// Jména a e-maily z xlsx a z DB se vypisují DOSLOVA, tak jak přišly, nikdy
// se nepřevádějí na tvar bez diakritiky (gate P4). Report slouží
// k identifikaci konkrétního člověka, komolení jmen by ten účel podkopalo.
function formatEmailForDisplay(email: string | null): string {
  return email ?? "bez e-mailu";
}

function splitForDisplay<T>(
  items: T[],
  max: number
): { visible: T[]; remaining: number } {
  return { visible: items.slice(0, max), remaining: Math.max(0, items.length - max) };
}

function buildSummaryLines(result: GuestImportResult): string[] {
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} nových hostů`);
  if (result.existing > 0) parts.push(`${result.existing} sloučeno s existujícím`);
  if (result.duplicates > 0) parts.push(`${result.duplicates} duplicitních řádků`);
  if (result.skipped > 0) parts.push(`${result.skipped} přeskočeno`);

  const firstLine =
    parts.length > 0
      ? `Import hotový: ${parts.join(", ")} (z ${result.totalRows} řádků).`
      : `Import hotový: žádné řádky ke zpracování (z ${result.totalRows} řádků).`;

  const secondLine =
    result.alreadyLinked > 0
      ? `Na schůzku přiřazeno ${result.linkedToMeeting} hostů, ${result.alreadyLinked} už na schůzce bylo.`
      : `Na schůzku přiřazeno ${result.linkedToMeeting} hostů.`;

  return [firstLine, secondLine];
}

function createdRowText(row: GuestImportCreatedRow): string {
  return `Řádek ${row.rowNumber}: ${row.name} (${formatEmailForDisplay(row.email)}) → nová karta hosta`;
}

function mergedRowText(row: GuestImportMergedRow): string {
  if (row.reason === "existing-guest") {
    const emailPart = `(${formatEmailForDisplay(row.email)})`;
    // Gate P3: shoda podle samotneho jmena (oba bez emailu) je jediny typ
    // slouceni, ktery muze byt falesny - v textu se to musi poznat.
    const matchedWithoutEmail = row.matchedEmail === null;
    const suffix = matchedWithoutEmail
      ? " (bez e-mailu, sloučeno podle jména)"
      : "";
    return `Řádek ${row.rowNumber}: ${row.name} ${emailPart} → napojeno na existujícího hosta „${row.matchedName}"${suffix}`;
  }
  return `Řádek ${row.rowNumber}: ${row.name} (${formatEmailForDisplay(row.email)}) → duplicita řádku ${row.firstRowNumber} „${row.firstName}", přiřazen jednou`;
}

function skippedRowText(row: GuestImportSkippedRow): string {
  return `Řádek ${row.rowNumber}: chybí jméno, řádek nejde uložit`;
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
      setErrorMessage(`Soubor je příliš velký. Maximální velikost je ${MAX_FILE_SIZE_MB} MB.`);
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
        let message = "Import selhal. Zkus to znovu.";
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
      setErrorMessage("Import selhal. Zkontroluj připojení a zkus to znovu.");
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
          className="min-h-[44px]"
        >
          Importovat hosty (.xlsx)
        </Button>
        {(status === "success" || status === "error") && (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={handleReset}
            className="min-h-[44px]"
          >
            Zavřít
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
              Soubor obsahuje víc než 500 řádků. Zpracovalo se prvních 500, zbytek se ignoroval.
            </p>
          )}

          {result.createdRows.length > 0 && (
            <div className="text-sm text-slate-600">
              <p className="font-medium">Nově založení hosté:</p>
              <ul className="list-disc pl-5">
                {createdDisplay.visible.map((row) => (
                  <li key={row.rowNumber}>{createdRowText(row)}</li>
                ))}
              </ul>
              {createdDisplay.remaining > 0 && (
                <p>… a dalších {createdDisplay.remaining} řádků.</p>
              )}
            </div>
          )}

          {result.merged.length > 0 && (
            <div className="text-sm text-slate-600">
              <p className="font-medium">Sloučeno s existujícími záznamy:</p>
              <ul className="list-disc pl-5">
                {mergedDisplay.visible.map((row) => (
                  <li key={`${row.reason}-${row.rowNumber}`}>{mergedRowText(row)}</li>
                ))}
              </ul>
              {mergedDisplay.remaining > 0 && (
                <p>… a dalších {mergedDisplay.remaining} řádků.</p>
              )}
            </div>
          )}

          {result.skippedRows.length > 0 && (
            <div className="text-sm text-amber-700">
              <p className="font-medium">Přeskočené řádky:</p>
              <ul className="list-disc pl-5">
                {skippedDisplay.visible.map((row) => (
                  <li key={row.rowNumber}>{skippedRowText(row)}</li>
                ))}
              </ul>
              {skippedDisplay.remaining > 0 && (
                <p>… a dalších {skippedDisplay.remaining} řádků.</p>
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
