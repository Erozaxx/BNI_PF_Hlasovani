"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import {
  commitSemaforImportAction,
  previewSemaforImportAction,
  type PreviewData,
} from "@/actions/semafor";
import type { PreviewRowDto } from "@/lib/semafor/import";
import {
  SEMAFOR_TEXTS,
  colorBadgeText,
  errTwiceText,
  fmtNum,
  importSummaryText,
  matchNeedsAttention,
} from "@/lib/semafor/texts";
import { ColorBadge } from "@/components/semafor/ColorBadge";

/**
 * iter-041 (arch 5.1, 5.7, gate Z6): import měsíčního souboru se skóre. Dvě
 * kroky: „Zobrazit náhled“ (soubor se zpracuje na serveru, nic se neukládá) a
 * „Uložit“ (soubor se pošle znovu s hashem z náhledu a volbami členů).
 * Mobil 390 px: karty místo tabulky, select člena na celou šířku, cíle
 * klepnutí aspoň 44 px. Klient nic nepočítá z čísel, jen drží volby členů.
 * Po uložení se stav vyčistí (stránku obnoví `revalidatePath` v akci).
 */

type Decisions = Record<number, string>;

function effective(row: PreviewRowDto, decisions: Decisions): string | undefined {
  if (row.error) return "skip";
  const d = decisions[row.index];
  if (d !== undefined) return d === "" ? undefined : d;
  return row.suggested ?? undefined;
}

export function ImportSemaforForm({
  monthOptions,
  defaultMonth,
}: {
  monthOptions: { value: string; label: string }[];
  defaultMonth: string;
}) {
  const { showToast } = useToast();
  const [month, setMonth] = useState(defaultMonth);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [pending, setPending] = useState<"preview" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const memberById = useMemo(() => new Map((preview?.members ?? []).map((m) => [m.id, m])), [preview]);

  const view = useMemo(() => {
    if (!preview) return null;
    const eff = preview.rows.map((r) => effective(r, decisions));
    const chosen = new Map<string, number[]>();
    eff.forEach((d, i) => {
      if (d && d !== "skip") chosen.set(d, [...(chosen.get(d) ?? []), i]);
    });
    const dupRows = new Set<number>();
    for (const idxs of chosen.values()) if (idxs.length > 1) idxs.forEach((i) => dupRows.add(i));
    const undecided = preview.rows.filter((r, i) => !r.error && eff[i] === undefined).length;
    const matched = eff.filter((d) => d && d !== "skip").length;
    const decidedIds = new Set(chosen.keys());
    const keeps = (preview.existing?.members ?? []).filter((m) => !decidedIds.has(m.id)).map((m) => m.name);
    const missing = preview.members.filter((m) => m.active && !decidedIds.has(m.id)).map((m) => m.name);
    return { eff, dupRows, undecided, matched, keeps, missing };
  }, [preview, decisions]);

  const canSave = !!view && view.undecided === 0 && view.dupRows.size === 0 && view.matched > 0;

  async function runPreview() {
    if (!file) {
      setError(SEMAFOR_TEXTS.errNoFile);
      return;
    }
    setPending("preview");
    setError(null);
    setSaved(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("month", month);
      const res = await previewSemaforImportAction(fd);
      if (!res.success || !res.data) {
        setPreview(null);
        setError(res.success ? SEMAFOR_TEXTS.errBroken : res.error);
        return;
      }
      setPreview(res.data);
      setDecisions({});
    } catch {
      setError(SEMAFOR_TEXTS.errBroken);
    } finally {
      setPending(null);
    }
  }

  async function runSave() {
    if (!file || !preview || !view) return;
    setPending("save");
    setError(null);
    try {
      const out: Record<string, string> = {};
      preview.rows.forEach((r, i) => {
        const d = view.eff[i];
        if (d) out[String(r.index)] = d;
      });
      const fd = new FormData();
      fd.set("file", file);
      fd.set("month", preview.month);
      fd.set("sha256", preview.sha256);
      fd.set("decisions", JSON.stringify(out));
      const res = await commitSemaforImportAction(fd);
      if (!res.success || !res.data) {
        setError(res.success ? SEMAFOR_TEXTS.errSaveFailed : res.error);
        return;
      }
      showToast("success", res.data.message);
      setSaved(res.data.message);
      setPreview(null);
      setDecisions({});
      setFile(null);
      setFileKey((k) => k + 1);
    } catch {
      setError(SEMAFOR_TEXTS.errSaveFailed);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-base font-semibold text-text-main">{SEMAFOR_TEXTS.importTitle}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
            {SEMAFOR_TEXTS.importMonth}
            <select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setPreview(null);
              }}
              className="h-11 w-full rounded-lg border border-border bg-white px-3 text-base"
            >
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
            {SEMAFOR_TEXTS.importFile}
            <input
              key={fileKey}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setPreview(null);
                setSaved(null);
              }}
              className="min-h-[44px] w-full rounded-lg border border-border bg-white px-2 py-2 text-sm"
            />
          </label>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3 min-h-[44px]"
          loading={pending === "preview"}
          disabled={pending !== null || !file}
          onClick={runPreview}
        >
          {SEMAFOR_TEXTS.importPreview}
        </Button>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-3 text-sm text-success">
            {saved}
          </p>
        )}
      </Card>

      {preview && view && (
        <Card>
          <p className="text-sm font-medium text-text-main">
            {importSummaryText(preview.month, preview.rows.length, view.matched)}
          </p>
          {preview.sameFile && <p className="mt-2 text-sm text-text-muted">{SEMAFOR_TEXTS.importSameFile}</p>}
          {preview.otherMonthText && <p className="mt-2 text-sm text-warning">{preview.otherMonthText}</p>}
          {preview.existing && <p className="mt-2 text-sm text-text-muted">{preview.existing.text}</p>}
          {preview.existing && view.keeps.length > 0 && (
            <p className="mt-1 text-sm text-text-muted">
              {SEMAFOR_TEXTS.importKeeps} {view.keeps.join(", ")}
            </p>
          )}
          {view.missing.length > 0 && (
            <p className="mt-2 text-sm text-text-muted">
              {SEMAFOR_TEXTS.importMissing} {view.missing.join(", ")}
            </p>
          )}
          {preview.warnings.map((w, i) => (
            <p key={i} className="mt-2 text-sm text-text-muted">
              {w}
            </p>
          ))}

          <p className="mt-4 text-sm text-text-main">{SEMAFOR_TEXTS.importPreviewHint}</p>
          <ul className="mt-2 space-y-3">
            {preview.rows.map((row, i) => {
              const eff = view.eff[i];
              const dup = view.dupRows.has(i);
              const selected = eff ?? "";
              const options = row.candidates.length > 0
                ? [
                    ...row.candidates.map((id) => memberById.get(id)).filter((m): m is NonNullable<typeof m> => !!m),
                    ...preview.members.filter((m) => !row.candidates.includes(m.id)),
                  ]
                : preview.members;
              return (
                <li key={row.index} className="rounded-card border border-border bg-surface p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="break-words text-sm font-medium text-text-main">{row.name || `#${row.r}`}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      {row.total !== null && row.color && (
                        <ColorBadge color={row.color} text={colorBadgeText(row.color, row.total)} />
                      )}
                      {row.total !== null && <span className="text-text-muted">{fmtNum(row.total)}</span>}
                    </span>
                  </div>
                  {row.error ? (
                    <p className="mt-2 text-sm text-danger">{row.error}</p>
                  ) : (
                    <>
                      <p
                        className={`mt-1 text-xs ${
                          matchNeedsAttention(row.kind) ? "font-medium text-warning" : "text-text-muted"
                        }`}
                      >
                        {row.label}
                      </p>
                      <select
                        aria-label={row.name || `#${row.r}`}
                        value={selected}
                        onChange={(e) => setDecisions((d) => ({ ...d, [row.index]: e.target.value }))}
                        className="mt-2 h-11 w-full rounded-lg border border-border bg-white px-3 text-base"
                      >
                        <option value="" disabled>
                          {SEMAFOR_TEXTS.pickMember}
                        </option>
                        <option value="skip">{SEMAFOR_TEXTS.skip}</option>
                        {options.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.active ? "" : ` ${SEMAFOR_TEXTS.overviewInactive}`}
                          </option>
                        ))}
                      </select>
                      {dup && eff && (
                        <p role="alert" className="mt-1 text-sm text-danger">
                          {errTwiceText(memberById.get(eff)?.name ?? "")}
                        </p>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            className="mt-4 min-h-[44px] w-full sm:w-auto"
            loading={pending === "save"}
            disabled={pending !== null || !canSave}
            onClick={runSave}
          >
            {SEMAFOR_TEXTS.importSave}
          </Button>
          <p className="mt-2 text-sm text-text-muted">{SEMAFOR_TEXTS.importSaveNote}</p>
        </Card>
      )}
    </div>
  );
}
