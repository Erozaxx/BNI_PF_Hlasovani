"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { castVoteAction } from "@/actions/events";
import { addOptionByParticipantAction } from "@/actions/participant-events";

interface EventData {
  id: string;
  title: string;
  description: string | null;
  votingType: string;
  votingMaxX: number | null;
  customOptionsAllowed: boolean;
  whoCanAddOptions: string;
  optionType: string;
}

interface ParticipantData {
  id: string;
  memberId: string | null;
  memberName: string | null;
  externalName: string | null;
}

interface OptionData {
  id: string;
  label: string;
  voteCount: number;
}

interface VotingViewProps {
  event: EventData;
  participant: ParticipantData;
  options: OptionData[];
  myVotedOptionIds: string[];
}

export function VotingView({
  event,
  participant,
  options,
  myVotedOptionIds,
}: VotingViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // For multiple/max_x: track local checkbox state (initialise from server data)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(myVotedOptionIds)
  );

  // For add-option form
  const [newOptionLabel, setNewOptionLabel] = useState("");
  const [pickerDate, setPickerDate] = useState("");
  const [pickerHour, setPickerHour] = useState("");
  const [pickerMinute, setPickerMinute] = useState("");
  const [addOptionError, setAddOptionError] = useState<string | null>(null);
  const [addOptionPending, startAddOptionTransition] = useTransition();

  const eventOptionType = (event.optionType ?? "text") as "text" | "date" | "datetime";
  const DATE_RE = /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}$/;
  const DATETIME_RE = /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}\s+\d{2}:\d{2}$/;

  function getLabelError(label: string): string | null {
    if (!label.trim()) return null;
    if (eventOptionType === "date" && !DATE_RE.test(label.trim()))
      return "Zadejte datum ve formátu D. M. YYYY (např. 15. 4. 2026)";
    if (eventOptionType === "datetime" && !DATETIME_RE.test(label.trim()))
      return "Zadejte datum a čas ve formátu D. M. YYYY HH:MM (např. 15. 4. 2026 14:00)";
    return null;
  }

  const labelError = getLabelError(newOptionLabel);

  function buildPickerLabel(date: string, hour: string, minute: string): string {
    if (!date) return "";
    const [y, m, d] = date.split("-");
    if (eventOptionType === "date") return `${parseInt(d)}. ${parseInt(m)}. ${y}`;
    if (!hour || !minute) return "";
    return `${parseInt(d)}. ${parseInt(m)}. ${y} ${hour}:${minute}`;
  }

  function handlePickerDateChange(value: string) {
    setPickerDate(value);
    const label = buildPickerLabel(value, pickerHour, pickerMinute);
    if (label) setNewOptionLabel(label);
  }

  function handlePickerHourChange(value: string) {
    setPickerHour(value);
    const label = buildPickerLabel(pickerDate, value, pickerMinute);
    if (label) setNewOptionLabel(label);
  }

  function handlePickerMinuteChange(value: string) {
    setPickerMinute(value);
    const label = buildPickerLabel(pickerDate, pickerHour, value);
    if (label) setNewOptionLabel(label);
  }

  const maxVotes = Math.max(...options.map((o) => o.voteCount), 0);

  const maxX = event.votingMaxX ?? 0;
  const isMaxXReached =
    event.votingType === "max_x" && selectedIds.size >= maxX;

  // Determine if this participant can add options
  const canAddOptions =
    event.customOptionsAllowed &&
    (event.whoCanAddOptions === "anyone_with_link" ||
      participant.memberId !== null);

  function handlePickOne(optionId: string) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await castVoteAction(
        participant.id,
        optionId,
        event.id,
        "pick_one"
      );
      if (result.success) {
        setSuccess("Hlas byl ulozen.");
        router.refresh();
      } else {
        setError(result.error ?? "Hlasovani se nepodarilo.");
      }
    });
  }

  function handleCheckboxChange(optionId: string, checked: boolean) {
    setError(null);
    setSuccess(null);
    if (checked) {
      if (event.votingType === "max_x" && selectedIds.size >= maxX) {
        return; // limit reached, ignore
      }
      setSelectedIds((prev) => new Set([...prev, optionId]));
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(optionId);
        return next;
      });
    }
  }

  function handleSaveVotes() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      // Determine which options to add (not previously voted) and remove
      const prev = new Set(myVotedOptionIds);
      const toAdd = [...selectedIds].filter((id) => !prev.has(id));
      const toRemove = myVotedOptionIds.filter((id) => !selectedIds.has(id));

      const votingType = event.votingType as "multiple" | "max_x";

      // Process removals first
      for (const optionId of toRemove) {
        const result = await castVoteAction(
          participant.id,
          optionId,
          event.id,
          votingType,
          { action: "remove" }
        );
        if (!result.success) {
          setError(result.error ?? "Hlasovani se nepodarilo.");
          return;
        }
      }

      // Process additions
      for (const optionId of toAdd) {
        const result = await castVoteAction(
          participant.id,
          optionId,
          event.id,
          votingType,
          { action: "add", maxX: maxX > 0 ? maxX : undefined }
        );
        if (!result.success) {
          setError(result.error ?? "Hlasovani se nepodarilo.");
          return;
        }
      }

      setSuccess("Hlasy byly ulozeny.");
      router.refresh();
    });
  }

  function handleAddOption() {
    if (!newOptionLabel.trim() || labelError) return;
    setAddOptionError(null);
    startAddOptionTransition(async () => {
      const result = await addOptionByParticipantAction(
        event.id,
        participant.id,
        newOptionLabel.trim()
      );
      if (result.success) {
        setNewOptionLabel("");
        setPickerDate("");
        setPickerHour("");
        setPickerMinute("");
        router.refresh();
      } else {
        setAddOptionError(result.error ?? "Nepodarilo se pridat moznost.");
      }
    });
  }

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-xl mx-auto flex flex-col gap-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="info">Aktivni hlasovani</Badge>
            {event.votingType === "pick_one" && (
              <Badge variant="neutral">Vyber jednu moznost</Badge>
            )}
            {event.votingType === "multiple" && (
              <Badge variant="neutral">Vice moznosti</Badge>
            )}
            {event.votingType === "max_x" && (
              <Badge variant="neutral">Max {maxX} hlasu</Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold text-text-main">{event.title}</h1>
          {event.description && (
            <p className="text-text-muted mt-1">{event.description}</p>
          )}
          <p className="text-sm text-text-muted mt-1">
            Hlasujete jako:{" "}
            <span className="font-medium text-text-main">
              {participant.memberName ?? participant.externalName ?? "Neznámý"}
            </span>
          </p>
        </div>

        {/* Status messages */}
        {error && (
          <div className="rounded-lg border border-danger bg-danger-light px-4 py-3 text-danger text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border border-success bg-success-light px-4 py-3 text-success text-sm">
            {success}
          </div>
        )}

        {/* Options */}
        <div className="flex flex-col gap-3">
          {event.votingType === "pick_one" &&
            options.map((option) => {
              const isMyVote = myVotedOptionIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handlePickOne(option.id)}
                  disabled={isPending}
                  className={`
                    w-full text-left rounded-card p-4 border-2 transition-all
                    focus:outline-none focus:shadow-focus
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${
                      isMyVote
                        ? "border-primary bg-surface shadow-card"
                        : "border-border bg-surface shadow-card hover:border-primary/50 hover:shadow-lg"
                    }
                  `.trim()}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-text-main">
                      {option.label}
                    </span>
                    <div className="flex items-center gap-2 shrink-0">
                      {isMyVote && (
                        <span className="text-primary text-sm font-semibold">
                          Vas hlas
                        </span>
                      )}
                      <Badge variant="neutral">{option.voteCount} hlasu</Badge>
                    </div>
                  </div>
                  <div className="mt-2 h-1 bg-border/40 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-success transition-all duration-500"
                      style={{ width: maxVotes > 0 ? `${Math.round((option.voteCount / maxVotes) * 100)}%` : "0%" }}
                    />
                  </div>
                </button>
              );
            })}

          {(event.votingType === "multiple" ||
            event.votingType === "max_x") && (
            <>
              {options.map((option) => {
                const isChecked = selectedIds.has(option.id);
                const isMyVote = myVotedOptionIds.includes(option.id);
                const isDisabled =
                  isPending ||
                  (!isChecked && event.votingType === "max_x" && isMaxXReached);

                return (
                  <label
                    key={option.id}
                    className={`
                      flex items-center gap-3 rounded-card p-4 border-2 transition-all cursor-pointer
                      ${
                        isMyVote
                          ? "border-primary bg-surface shadow-card"
                          : isChecked
                          ? "border-primary/60 bg-surface shadow-card"
                          : "border-border bg-surface shadow-card hover:border-primary/50"
                      }
                      ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}
                    `.trim()}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isDisabled}
                      onChange={(e) =>
                        handleCheckboxChange(option.id, e.target.checked)
                      }
                      className="w-4 h-4 accent-primary shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-text-main">
                        {option.label}
                      </span>
                      <div className="mt-2 h-1 bg-border/40 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-success transition-all duration-500"
                          style={{ width: maxVotes > 0 ? `${Math.round((option.voteCount / maxVotes) * 100)}%` : "0%" }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isMyVote && (
                        <span className="text-primary text-sm font-semibold">
                          Vas hlas
                        </span>
                      )}
                      <Badge variant="neutral">{option.voteCount} hlasu</Badge>
                    </div>
                  </label>
                );
              })}

              {event.votingType === "max_x" && (
                <p className="text-sm text-text-muted">
                  Vybrano: {selectedIds.size} / {maxX}
                </p>
              )}

              <Button
                variant="primary"
                onClick={handleSaveVotes}
                loading={isPending}
                disabled={isPending}
                className="w-full mt-2"
              >
                Ulozit hlasy
              </Button>
            </>
          )}
        </div>

        {/* Add option form */}
        {canAddOptions && (
          <Card variant="default">
            <h2 className="font-semibold text-text-main mb-3">
              Přidat novou možnost
            </h2>
            <div className="space-y-2">
              {/* Date / Datetime picker */}
              {eventOptionType !== "text" && (
                <div className="flex items-center gap-2 text-sm text-text-muted flex-wrap">
                  <span className="shrink-0">Vybrat z kalendáře:</span>
                  <input
                    type="date"
                    value={pickerDate}
                    onChange={(e) => handlePickerDateChange(e.target.value)}
                    disabled={addOptionPending}
                    className="h-9 px-2 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary disabled:bg-background disabled:cursor-not-allowed w-auto"
                  />
                  {eventOptionType === "datetime" && (
                    <div className="flex items-center gap-1">
                      <select
                        value={pickerHour}
                        onChange={(e) => handlePickerHourChange(e.target.value)}
                        disabled={addOptionPending}
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
                        onChange={(e) => handlePickerMinuteChange(e.target.value)}
                        disabled={addOptionPending}
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
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    value={newOptionLabel}
                    onChange={(e) => setNewOptionLabel(e.target.value)}
                    placeholder={
                      eventOptionType === "date"
                        ? "Napr. 15. 4. 2026"
                        : eventOptionType === "datetime"
                        ? "Napr. 15. 4. 2026 14:00"
                        : "Název možnosti..."
                    }
                    disabled={addOptionPending}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:bg-background disabled:cursor-not-allowed"
                  />
                  {labelError && (
                    <p className="text-danger text-xs mt-1">{labelError}</p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddOption}
                  loading={addOptionPending}
                  disabled={addOptionPending || !newOptionLabel.trim() || !!labelError}
                >
                  Přidat
                </Button>
              </div>
            </div>
            {addOptionError && (
              <p className="text-danger text-sm mt-2">{addOptionError}</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
