"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  MEMBER_TEXTS,
  formatWeekdayLong,
  type PastResult,
} from "@/lib/attendance/rules";

/**
 * iter-038 (T-003a, arch 7.1, gate sekce 5): panel vybraného dne v kalendáři.
 * Tři volby (Přijdu / Nepřijdu bez náhradníka / Nepřijdu, pošlu náhradníka),
 * jméno náhradníka s nabídkou dřívějších jmen. Panel drží jen rozpracovanou
 * volbu a text jména, uložený stav patří rodiči (`AbsenceCalendar`), který
 * volá akci. Jméno se ukládá tlačítkem Uložit, Enterem nebo klepnutím na štítek.
 */

export type DayChoice = "present" | "absent" | "substitute";

export interface DayPanelProps {
  date: string;
  /** Uložený stav dne. */
  saved: { absent: boolean; substituteName: string | null };
  /** Člen smí den teď měnit; jinak `blockedMessage` říká proč. */
  editable: boolean;
  blockedMessage: string | null;
  /** Výsledek uzavřené docházky (minulé dny), jinak `null`. */
  result: PastResult | null;
  /** Dřívější jména (nejnovější první), panel ukáže prvních 8. */
  recentNames: string[];
  pending: boolean;
  /** Chyba ze serveru (např. jméno příliš krátké). */
  error: string | null;
  onSave: (kind: "none" | "absence" | "substitute", name: string | null) => void;
}

const RESULT_TEXT: Record<PastResult, string> = {
  present: "Výsledek: přítomen",
  substitute: "Výsledek: náhradník",
  absent: "Výsledek: absence",
};

export function DayPanel({
  date,
  saved,
  editable,
  blockedMessage,
  result,
  recentNames,
  pending,
  error,
  onSave,
}: DayPanelProps) {
  const initial: DayChoice = !saved.absent
    ? "present"
    : saved.substituteName
      ? "substitute"
      : "absent";
  const [choice, setChoice] = useState<DayChoice>(initial);
  const [name, setName] = useState(saved.substituteName ?? "");

  function pick(next: DayChoice) {
    if (!editable || pending) return;
    setChoice(next);
    if (next === "present") onSave("none", null);
    else if (next === "absent") onSave("absence", null);
  }

  function saveSubstitute(value: string) {
    if (!editable || pending) return;
    onSave("substitute", value);
  }

  const options: { value: DayChoice; label: string }[] = [
    { value: "present", label: MEMBER_TEXTS.optionPresent },
    { value: "absent", label: MEMBER_TEXTS.optionAbsent },
    { value: "substitute", label: MEMBER_TEXTS.optionSubstitute },
  ];

  const savedLabel = !saved.absent
    ? MEMBER_TEXTS.optionPresent
    : saved.substituteName
      ? `${MEMBER_TEXTS.optionSubstitute}: ${saved.substituteName}`
      : MEMBER_TEXTS.optionAbsent;

  const heading = formatWeekdayLong(date);
  const title = heading.charAt(0).toUpperCase() + heading.slice(1);

  return (
    <div className="space-y-3" aria-live="polite">
      <h2 className="text-lg font-semibold text-text-main">{title}</h2>

      {!editable ? (
        <div className="space-y-2 text-sm">
          {blockedMessage && <p className="text-text-muted">{blockedMessage}</p>}
          <p className="text-text-main">{savedLabel}</p>
          {result && <p className="font-medium text-text-main">{RESULT_TEXT[result]}</p>}
        </div>
      ) : (
        <fieldset className="space-y-1" disabled={pending}>
          <legend className="sr-only">{title}</legend>
          {options.map((o) => (
            <label
              key={o.value}
              className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-text-main hover:bg-background"
            >
              <input
                type="radio"
                name={`absence-${date}`}
                value={o.value}
                checked={choice === o.value}
                onChange={() => pick(o.value)}
                className="h-5 w-5 accent-primary"
              />
              {o.label}
            </label>
          ))}

          {choice === "substitute" && (
            <div className="space-y-2 pl-2 pt-2">
              <label className="block text-sm text-text-muted" htmlFor={`sub-name-${date}`}>
                {MEMBER_TEXTS.nameLabel}
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  id={`sub-name-${date}`}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveSubstitute(name);
                    }
                  }}
                  autoComplete="off"
                  className="min-h-[44px] w-full rounded-lg border border-border bg-surface px-3 text-base text-text-main focus:outline-none focus:shadow-focus"
                />
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={() => saveSubstitute(name)}
                  loading={pending}
                >
                  {MEMBER_TEXTS.save}
                </Button>
              </div>
              {recentNames.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-text-muted">{MEMBER_TEXTS.recentNames}</span>
                  {recentNames.slice(0, 8).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setName(n);
                        saveSubstitute(n);
                      }}
                      className="min-h-[44px] rounded-full border border-navy bg-navy-light px-3 text-sm text-navy focus:outline-none focus:shadow-focus"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </fieldset>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
