"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { parseXlsxAction, importMembersAction } from "@/actions/import-members";
import type { ImportPreview, ImportPreviewRow } from "@/lib/types/import";

type FormState = "idle" | "previewing" | "importing" | "done";

type DoneResult = {
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: string[];
};

export function ImportMembersForm() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // rows the admin did NOT uncheck — starts as all new+update rows
  const [selectedRowIndexes, setSelectedRowIndexes] = useState<Set<number>>(new Set());
  const [doneResult, setDoneResult] = useState<DoneResult | null>(null);

  // ── Step 1: upload → preview ──────────────────────────────────────────────

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.[0]) {
      setError("Vyberte soubor .xlsx.");
      return;
    }

    const formData = new FormData();
    formData.append("file", fileInput.files[0]);

    setState("previewing"); // optimistic — show spinner while parsing

    try {
      const result = await parseXlsxAction(formData);
      if (!result.success) {
        setError(result.error);
        setState("idle");
        return;
      }

      const data = result.data!;
      setPreview(data);

      // Pre-select all rows that are actionable (new or update)
      const selected = new Set<number>();
      data.rows.forEach((row, idx) => {
        if (row.status === "new" || row.status === "update") {
          selected.add(idx);
        }
      });
      setSelectedRowIndexes(selected);
    } catch {
      setError("Nepodarilo se zpracovat soubor.");
      setState("idle");
    }
  }

  // ── Step 2: confirm import ────────────────────────────────────────────────

  async function handleImport() {
    if (!preview) return;
    setError("");
    setState("importing");

    const rowsToImport: ImportPreviewRow[] = preview.rows.filter(
      (_, idx) => selectedRowIndexes.has(idx)
    );

    try {
      const result = await importMembersAction(rowsToImport);
      if (!result.success) {
        setError(result.error);
        setState("previewing");
        showToast("error", result.error);
        return;
      }

      const data = result.data!;
      setDoneResult(data);
      setState("done");

      if (data.errorCount === 0) {
        showToast(
          "success",
          `Import dokoncen: ${data.createdCount} novych, ${data.updatedCount} aktualizovanych.`
        );
      } else {
        showToast(
          "error",
          `Import s chybami: ${data.errorCount} radku selhalo.`
        );
      }
    } catch {
      setError("Nepodarilo se provest import.");
      setState("previewing");
    }
  }

  function handleCancel() {
    setState("idle");
    setPreview(null);
    setSelectedRowIndexes(new Set());
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleReset() {
    setState("idle");
    setPreview(null);
    setSelectedRowIndexes(new Set());
    setDoneResult(null);
    setError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function toggleRow(idx: number) {
    setSelectedRowIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  }

  // ── Status badge helpers ──────────────────────────────────────────────────

  function statusBadge(row: ImportPreviewRow) {
    switch (row.status) {
      case "new":
        return <Badge variant="success">novy</Badge>;
      case "update":
        return <Badge variant="warning">update</Badge>;
      case "unchanged":
        return <Badge variant="neutral">beze zmeny</Badge>;
      case "skipped":
        return <Badge variant="danger">preskocen</Badge>;
    }
  }

  function rowBgClass(row: ImportPreviewRow) {
    switch (row.status) {
      case "new":
        return "bg-green-50";
      case "update":
        return "bg-yellow-50";
      case "unchanged":
        return "bg-gray-50";
      case "skipped":
        return "bg-red-50";
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // idle state
  if (state === "idle") {
    return (
      <form onSubmit={handleUpload} className="space-y-3">
        {error && (
          <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">
            {error}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-text-main" htmlFor="import-xlsx-file">
            XLSX soubor
          </label>
          <input
            id="import-xlsx-file"
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="text-sm text-text-main file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary file:text-white hover:file:bg-primary/90 cursor-pointer"
          />
        </div>
        <Button type="submit" variant="primary" size="sm">
          Nahrat a zobrazit preview
        </Button>
      </form>
    );
  }

  // previewing state (also used as loading state while parsing — preview===null means parsing in progress)
  if (state === "previewing") {
    if (!preview) {
      return (
        <div className="text-sm text-text-muted py-4">
          Zpracovavam soubor...
        </div>
      );
    }

    const { rows, summary } = preview;
    const selectedActionableCount = Array.from(selectedRowIndexes).filter(
      (idx) => rows[idx]?.status === "new" || rows[idx]?.status === "update"
    ).length;

    return (
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Summary */}
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-text-muted">Souhrn:</span>
          <Badge variant="success">{summary.newCount} novych</Badge>
          <Badge variant="warning">{summary.updateCount} aktualizaci</Badge>
          <Badge variant="neutral">{summary.unchangedCount} beze zmeny</Badge>
          {summary.skippedCount > 0 && (
            <Badge variant="danger">{summary.skippedCount} preskoceno</Badge>
          )}
        </div>

        {/* Preview table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-primary text-left bg-background">
                <th className="px-3 py-2 font-semibold w-8"></th>
                <th className="px-3 py-2 font-semibold">Stav</th>
                <th className="px-3 py-2 font-semibold">Jmeno</th>
                <th className="px-3 py-2 font-semibold">Obor (novy)</th>
                <th className="px-3 py-2 font-semibold">Obor (stavajici)</th>
                <th className="px-3 py-2 font-semibold">Datum vstupu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const isActionable = row.status === "new" || row.status === "update";
                const isChecked = selectedRowIndexes.has(idx);

                return (
                  <tr
                    key={idx}
                    className={`border-b border-border ${rowBgClass(row)} ${
                      isActionable ? "cursor-pointer" : ""
                    }`}
                    onClick={() => isActionable && toggleRow(idx)}
                  >
                    <td className="px-3 py-2 text-center">
                      {isActionable ? (
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleRow(idx)}
                          onClick={(e) => e.stopPropagation()}
                          className="cursor-pointer"
                        />
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{statusBadge(row)}</td>
                    <td className="px-3 py-2 font-medium">{row.xlsxName}</td>
                    <td className="px-3 py-2">
                      {row.xlsxObor ?? <span className="text-text-muted">—</span>}
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {row.status === "skipped"
                        ? <span className="text-danger text-xs">{row.reason}</span>
                        : row.existingObor ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-text-muted">
                      {row.xlsxJoinedAt ??
                        (row.status === "new" ? (
                          <span title="Chybi/nerozpoznano v souboru — pouzije se aktualni datum">
                            — (dnesni datum)
                          </span>
                        ) : (
                          <span title="Chybi/nerozpoznano v souboru — stavajici datum vstupu zustane beze zmeny">
                            —
                          </span>
                        ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleImport}
            disabled={selectedActionableCount === 0}
          >
            Importovat vybrane ({selectedActionableCount})
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleCancel}
          >
            Zrusit
          </Button>
        </div>
      </div>
    );
  }

  // importing state
  if (state === "importing") {
    return (
      <div className="text-sm text-text-muted py-4">
        Importuji cleny...
      </div>
    );
  }

  // done state
  if (state === "done" && doneResult) {
    return (
      <div className="space-y-3">
        <div
          className={`p-4 rounded-lg text-sm space-y-1 ${
            doneResult.errorCount === 0
              ? "bg-green-50 text-green-800"
              : "bg-yellow-50 text-yellow-800"
          }`}
        >
          <p className="font-semibold">Import dokoncen</p>
          <p>Vytvoreno: {doneResult.createdCount} clenu</p>
          <p>Aktualizovano: {doneResult.updatedCount} clenu</p>
          {doneResult.errorCount > 0 && (
            <p className="text-danger">Chyby: {doneResult.errorCount}</p>
          )}
          {doneResult.errors.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs text-danger space-y-0.5">
              {doneResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={handleReset}>
          Nahrat dalsi soubor
        </Button>
      </div>
    );
  }

  return null;
}
