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
  const [pickerValue, setPickerValue] = useState("");
  const eventOptionType = (event.optionType ?? "text") as "text" | "date" | "datetime";
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [settingSelectedId, setSettingSelectedId] = useState<string | null>(null);

  function formatDateLabel(value: string, type: "date" | "datetime"): string {
    if (!value) return "";
    if (type === "date") {
      const [y, m, d] = value.split("-");
      return `${parseInt(d)}. ${parseInt(m)}. ${y}`;
    }
    // datetime-local: "YYYY-MM-DDTHH:MM"
    const [datePart, timePart] = value.split("T");
    const [y, m, d] = datePart.split("-");
    return `${parseInt(d)}. ${parseInt(m)}. ${y} ${timePart}`;
  }

  function handlePickerChange(value: string) {
    setPickerValue(value);
    if (value) {
      setNewLabel(formatDateLabel(value, eventOptionType as "date" | "datetime"));
    }
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
        setPickerValue("");
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
            <input
              type={eventOptionType === "date" ? "date" : "datetime-local"}
              value={pickerValue}
              onChange={(e) => handlePickerChange(e.target.value)}
              disabled={isPending}
              className="h-10 px-3 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus disabled:bg-background disabled:cursor-not-allowed"
            />
          )}

          {/* Label text field — always visible, auto-filled from picker */}
          <div className="flex gap-2">
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
            </div>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={isPending}
              disabled={!newLabel.trim()}
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
