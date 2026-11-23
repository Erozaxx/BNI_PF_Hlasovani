"use client";

import { useRef, useState } from "react";
import { saveSituationHeadAction } from "@/actions/situations";
import {
  type DirtyState,
  canRetry,
  clearsErrorOnEdit,
  headDirtyState,
  headNeedsResave,
  runSituationAction,
} from "@/lib/situations/card-state";
import {
  HEAD_MAX,
  UI_TEXTS,
  cleanText,
  type HeadField as HeadFieldName,
  type SituationErrorCode,
  type Slot,
} from "@/lib/situations/rules";

/**
 * iter-049 (arch 7.3): pole hlavičky situace (klient, název, popis). Ukládá se
 * při opuštění pole, a to jen když se hodnota liší od poslední uložené. Chyba
 * nechá text v poli (gate změny 12, 13). Bez `router.refresh()` (LL-017).
 */
export function HeadField({
  memberId,
  slot,
  field,
  initial,
  canEdit,
  multiline,
  placeholder,
  ariaLabel,
  className,
  dirtyKey,
  onDirtyChange,
}: {
  memberId: string;
  slot: Slot;
  field: HeadFieldName;
  initial: string;
  canEdit: boolean;
  multiline: boolean;
  placeholder?: string;
  ariaLabel: string;
  className: string;
  dirtyKey: string;
  onDirtyChange: (key: string, state: DirtyState) => void;
}) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<SituationErrorCode | null>(null);
  const [saved, setSaved] = useState(false);
  const lastSaved = useRef(initial);
  const busy = useRef(false);
  const latest = useRef(initial);

  function report(next: string, st: "idle" | "saving" | "error") {
    onDirtyChange(dirtyKey, headDirtyState(st, cleanText(next, multiline), lastSaved.current));
  }

  async function save() {
    if (busy.current) return;
    busy.current = true;
    try {
      // Smyčka: úprava během ukládání se po doběhnutí uloží znovu (review m-1).
      for (;;) {
        const next = cleanText(latest.current, multiline);
        if (next === lastSaved.current) {
          setStatus("idle");
          setError(null);
          setCode(null);
          report(next, "idle");
          return;
        }
        setStatus("saving");
        setError(null);
        setCode(null);
        report(next, "saving");
        const result = await runSituationAction(() =>
          saveSituationHeadAction({ memberId, slot, field, value: next })
        );
        if (!result.success) {
          setStatus("error");
          setError(result.error);
          setCode(result.code);
          report(latest.current, "error");
          return;
        }
        lastSaved.current = next;
        if (headNeedsResave(latest.current, next, multiline)) continue;
        setStatus("idle");
        setSaved(true);
        report(latest.current, "idle");
        window.setTimeout(() => setSaved(false), 2500);
        return;
      }
    } finally {
      busy.current = false;
    }
  }

  if (!canEdit) {
    if (!value) return null;
    return <p className={`whitespace-pre-wrap break-words ${className}`}>{value}</p>;
  }

  const common = {
    value,
    placeholder,
    maxLength: HEAD_MAX[field] + 20,
    "aria-label": ariaLabel,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      latest.current = e.target.value;
      setValue(e.target.value);
      if (clearsErrorOnEdit(status, code)) {
        // Po chybě validace se opravený text uloží sám při blur (review m-2).
        setStatus("idle");
        setError(null);
        setCode(null);
        report(e.target.value, "idle");
      } else {
        report(e.target.value, status);
      }
    },
    onBlur: () => {
      if (status === "error") return;
      void save();
    },
  };

  return (
    <div>
      {multiline ? (
        <textarea {...common} rows={4} className={className} />
      ) : (
        <input
          {...common}
          type="text"
          className={className}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
        />
      )}
      <div className="min-h-[1rem] text-xs">
        {status === "saving" && <span className="text-text-muted">{UI_TEXTS.saving}</span>}
        {saved && status === "idle" && <span className="text-success">{UI_TEXTS.saved}</span>}
        {status === "error" && error && (
          <span role="alert" className="text-danger">
            {error}{" "}
            {canRetry(code) && (
              <button
                type="button"
                onClick={() => void save()}
                className="min-h-[44px] rounded font-medium text-navy underline focus:outline-none focus:shadow-focus md:min-h-0"
              >
                {UI_TEXTS.retry}
              </button>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
