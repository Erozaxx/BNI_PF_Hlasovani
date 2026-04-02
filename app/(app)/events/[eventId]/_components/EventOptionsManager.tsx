"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { addOptionAction, removeOptionAction, setSelectedOptionAction } from "@/actions/events";

interface EventOption {
  id: string;
  eventId: string;
  label: string;
  voteCount: number;
}

interface EventData {
  id: string;
  status: string;
  selectedOptionId: string | null;
  optionType: string;
}

interface EventOptionsManagerProps {
  event: EventData;
  options: EventOption[];
  canEdit: boolean;
}

export function EventOptionsManager({
  event,
  options,
  canEdit,
}: EventOptionsManagerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newLabel, setNewLabel] = useState("");
  const [pickerDate, setPickerDate] = useState("");
  const [pickerHour, setPickerHour] = useState("");
  const [pickerMinute, setPickerMinute] = useState("");
  const eventOptionType = (event.optionType ?? "text") as "text" | "date" | "datetime";
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [settingSelectedId, setSettingSelectedId] = useState<string | null>(null);

  // Format validation for label field
  const DATE_RE = /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}$/;
  const DATETIME_RE = /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\s+\d{2}:\d{2}$/;

  function getLabelError(label: string): string | null {
    if (!label.trim()) return null;
    if (eventOptionType === "date" && !DATE_RE.test(label.trim())) {
      return "Zadejte datum ve formátu D. M. YYYY (např. 15. 4. 2026)";
    }
    if (eventOptionType === "datetime" && !DATETIME_RE.test(label.trim())) {
      return "Zadejte datum a čas ve formátu D. M. YYYY HH:MM (např. 15. 4. 2026 14:00)";
    }
    return null;
  }

  const labelError = getLabelError(newLabel);

  function buildLabel(date: string, hour: string, minute: string): string {
    if (!date) return "";
    const [y, m, d] = date.split("-");
    if (eventOptionType === "date") return `${parseInt(d)}. ${parseInt(m)}. ${y}`;
    if (!hour || !minute) return "";
    return `${parseInt(d)}. ${parseInt(m)}. ${y} ${hour}:${minute}`;
  }

  function handleDateChange(value: string) {
    setPickerDate(value);
    const label = buildLabel(value, pickerHour, pickerMinute);
    if (label) setNewLabel(label);
  }

  function handleHourChange(value: string) {
    setPickerHour(value);
    const label = buildLabel(pickerDate, value, pickerMinute);
    if (label) setNewLabel(label);
  }

  function handleMinuteChange(value: string) {
    setPickerMinute(value);
    const label = buildLabel(pickerDate, pickerHour, value);
    if (label) setNewLabel(label);
  }

  function handleAddOption(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const result = await addOptionAction(event.id, newLabel);
      if (!result.success) {
        setError(result.error);
      } else {
        setNewLabel("");
        // Picker date/time intentionally kept — next option defaults to same value
        setSuccessMsg("Moznost pridana.");
        router.refresh();
      }
    });
  }

  function handleRemoveOption(optionId: string, label: string) {
    if (!confirm(`Odebrat moznost „${label}"?`)) return;
    setError(null);
    setSuccessMsg(null);

    startTransition(async () => {
      const result = await removeOptionAction(event.id, optionId);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Moznost odebrána.");
        router.refresh();
      }
    });
  }

  function handleSetSelected(optionId: string) {
    setError(null);
    setSuccessMsg(null);
    setSettingSelectedId(optionId);

    startTransition(async () => {
      const result = await setSelectedOptionAction(event.id, optionId);
      setSettingSelectedId(null);
      if (!result.success) {
        setError(result.error);
      } else {
        setSuccessMsg("Vysledek oznacen.");
        router.refresh();
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold text-text-main mb-4">
        Moznosti hlasovani ({options.length})
      </h2>

      {/* Call-to-action: mark winner after closing */}
      {event.status === "closed" && !event.selectedOptionId && (
        <div className="mb-4 p-3 rounded-lg border border-warning bg-warning-light text-sm text-text-main">
          Akce je uzavřena. Klikněte na <strong>Označit vítěze</strong> u vybrané možnosti níže.
        </div>
      )}

      {/* Options list */}
      {options.length > 0 ? (
        <div className="space-y-2 mb-4">
          {options.map((opt) => {
            const isSelected = event.selectedOptionId === opt.id;
            const isClosed = event.status === "closed";

            return (
              <div
                key={opt.id}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-colors ${
                  isSelected
                    ? "border-success bg-success-light"
                    : "border-border bg-background"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-text-main">
                    {opt.label}
                  </span>
                  {isSelected && (
                    <span className="ml-2 text-xs text-success font-semibold">
                      ✓ Vitezna moznost
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-text-muted">
                    {opt.voteCount}{" "}
                    {opt.voteCount === 1 ? "hlas" : "hlasu"}
                  </span>

                  {/* Mark as winner button — only in closed state */}
                  {isClosed && !isSelected && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSetSelected(opt.id)}
                      loading={isPending && settingSelectedId === opt.id}
                      disabled={isPending}
                    >
                      Oznacit viteze
                    </Button>
                  )}

                  {/* Remove button — only in draft/active */}
                  {canEdit && (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleRemoveOption(opt.id, opt.label)}
                      disabled={isPending}
                    >
                      Odebrat
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted mb-4">
          Zatim zadne moznosti. Pridejte prvni moznost nize.
        </p>
      )}

      {/* Add option form — only in draft/active */}
      {canEdit && (
        <form onSubmit={handleAddOption} className="space-y-3 pt-2 border-t border-border mt-2">
          {/* Date / Datetime picker — shown when event optionType requires it */}
          {eventOptionType !== "text" && (
            <div className="flex items-center gap-2 text-sm text-text-muted flex-wrap">
              <span className="shrink-0">Vybrat z kalendáře:</span>
              <input
                type="date"
                value={pickerDate}
                onChange={(e) => handleDateChange(e.target.value)}
                disabled={isPending}
                className="h-9 px-2 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus disabled:bg-background disabled:cursor-not-allowed w-auto"
              />
              {eventOptionType === "datetime" && (
                <div className="flex items-center gap-1">
                  <select
                    value={pickerHour}
                    onChange={(e) => handleHourChange(e.target.value)}
                    disabled={isPending}
                    className="h-9 px-2 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary disabled:bg-background disabled:cursor-not-allowed"
                  >
                    <option value="">HH</option>
                    {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                  <span className="font-medium">:</span>
                  <select
                    value={pickerMinute}
                    onChange={(e) => handleMinuteChange(e.target.value)}
                    disabled={isPending}
                    className="h-9 px-2 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary disabled:bg-background disabled:cursor-not-allowed"
                  >
                    <option value="">MM</option>
                    {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Label text field — always visible, auto-filled from picker */}
          <div className="flex gap-2 items-start">
            <div className="flex-1">
              <Input
                name="label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={
                  eventOptionType === "date"
                    ? "Napr. 15. 4. 2026"
                    : eventOptionType === "datetime"
                    ? "Napr. 15. 4. 2026 14:00"
                    : "Napr. Varianta A"
                }
                disabled={isPending}
              />
              {labelError && (
                <p className="text-xs text-danger mt-1">{labelError}</p>
              )}
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isPending}
              disabled={!newLabel.trim() || !!labelError}
            >
              Přidat
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-danger mt-2" role="alert">
          {error}
        </p>
      )}
      {successMsg && (
        <p className="text-sm text-success mt-2" role="status">
          {successMsg}
        </p>
      )}
    </Card>
  );
}
