"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { createEventAction } from "@/actions/events";

type VotingType = "pick_one" | "multiple" | "max_x";
type WhoCanVote = "members_only" | "anyone_with_link";
type WhoCanAddOptions = "members_only" | "anyone_with_link";
type OptionType = "text" | "date" | "datetime";

export function EventForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [votingType, setVotingType] = useState<VotingType>("pick_one");
  const [votingMaxX, setVotingMaxX] = useState<number>(2);
  const [optionType, setOptionType] = useState<OptionType>("text");
  const [whoCanVote, setWhoCanVote] = useState<WhoCanVote>("members_only");
  const [customOptionsAllowed, setCustomOptionsAllowed] = useState(false);
  const [whoCanAddOptions, setWhoCanAddOptions] =
    useState<WhoCanAddOptions>("members_only");
  const [error, setError] = useState<string | null>(null);

  // Expiry date — default: today + 3 months
  const defaultExpiry = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d;
  })();
  const [expiryDate, setExpiryDate] = useState(
    defaultExpiry.toISOString().slice(0, 10)
  );
  const [expiryHour, setExpiryHour] = useState(
    String(defaultExpiry.getHours()).padStart(2, "0")
  );
  const [expiryMinute, setExpiryMinute] = useState(
    String(Math.floor(defaultExpiry.getMinutes() / 5) * 5).padStart(2, "0")
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const expiresAt = expiryDate && expiryHour && expiryMinute
        ? new Date(`${expiryDate}T${expiryHour}:${expiryMinute}`)
        : undefined;

      const result = await createEventAction(
        title,
        {
          votingType,
          votingMaxX: votingType === "max_x" ? votingMaxX : undefined,
          optionType,
          whoCanVote,
          customOptionsAllowed,
          whoCanAddOptions,
          expiresAt,
        },
        description || undefined
      );

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(`/events/${result.data!.id}`);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Input
        label="Nazev akce *"
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Napr. Vyber terminu schuzky"
        required
        disabled={isPending}
      />

      <Textarea
        label="Popis (volitelny)"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Kratky popis ucelu akce..."
        disabled={isPending}
      />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-main">
          Typ hlasovani *
        </label>
        <select
          value={votingType}
          onChange={(e) => setVotingType(e.target.value as VotingType)}
          disabled={isPending}
          className="h-11 px-3.5 py-2.5 rounded-lg border border-border text-base bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus disabled:bg-background disabled:cursor-not-allowed"
        >
          <option value="pick_one">Vyber jednu moznost (pick_one)</option>
          <option value="multiple">Vyber vice moznosti (multiple)</option>
          <option value="max_x">Max. N moznosti (max_x)</option>
        </select>
      </div>

      {votingType === "max_x" && (
        <Input
          label="Max. pocet hlasu na ucastnika *"
          name="votingMaxX"
          type="number"
          min={1}
          value={votingMaxX}
          onChange={(e) => setVotingMaxX(Number(e.target.value))}
          required
          disabled={isPending}
        />
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-text-main mb-1">
          Typ možností
        </legend>
        {(
          [
            { value: "text", label: "Text" },
            { value: "date", label: "Datum" },
            { value: "datetime", label: "Datum a čas" },
          ] as { value: OptionType; label: string }[]
        ).map(({ value, label }) => (
          <label key={value} className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="radio"
              name="optionType"
              value={value}
              checked={optionType === value}
              onChange={() => setOptionType(value)}
              disabled={isPending}
              className="h-4 w-4 text-primary"
            />
            <span className="text-sm text-text-main">{label}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-text-main mb-1">
          Kdo může hlasovat
        </legend>
        {(
          [
            { value: "members_only", label: "Pouze členové BNI" },
            { value: "anyone_with_link", label: "Kdokoliv s odkazem" },
          ] as { value: WhoCanVote; label: string }[]
        ).map(({ value, label }) => (
          <label
            key={value}
            className="flex items-center gap-2 cursor-pointer select-none"
          >
            <input
              type="radio"
              name="whoCanVote"
              value={value}
              checked={whoCanVote === value}
              onChange={() => {
                setWhoCanVote(value);
                // when switching back to members_only, reset whoCanAddOptions too
                if (value === "members_only") {
                  setWhoCanAddOptions("members_only");
                }
              }}
              disabled={isPending}
              className="h-4 w-4 text-primary focus:outline-none"
            />
            <span className="text-sm text-text-main">{label}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="customOptionsAllowed"
          checked={customOptionsAllowed}
          onChange={(e) => setCustomOptionsAllowed(e.target.checked)}
          disabled={isPending}
          className="h-4 w-4 rounded border-border text-primary focus:outline-none"
        />
        <label
          htmlFor="customOptionsAllowed"
          className="text-sm font-medium text-text-main cursor-pointer"
        >
          Účastníci mohou přidávat možnosti
        </label>
      </div>

      {customOptionsAllowed && whoCanVote === "anyone_with_link" && (
        <fieldset className="flex flex-col gap-2 pl-7">
          <legend className="text-sm font-medium text-text-main mb-1">
            Kdo může přidávat možnosti
          </legend>
          {(
            [
              { value: "members_only", label: "Pouze členové BNI" },
              { value: "anyone_with_link", label: "Kdokoliv s odkazem" },
            ] as { value: WhoCanAddOptions; label: string }[]
          ).map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-2 cursor-pointer select-none"
            >
              <input
                type="radio"
                name="whoCanAddOptions"
                value={value}
                checked={whoCanAddOptions === value}
                onChange={() => setWhoCanAddOptions(value)}
                disabled={isPending}
                className="h-4 w-4 text-primary focus:outline-none"
              />
              <span className="text-sm text-text-main">{label}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-main">
          Platnost akce (konec platnosti odkazu)
        </label>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            disabled={isPending}
            className="h-9 px-2 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary disabled:bg-background disabled:cursor-not-allowed"
          />
          <div className="flex items-center gap-1">
            <select
              value={expiryHour}
              onChange={(e) => setExpiryHour(e.target.value)}
              disabled={isPending}
              className="h-9 px-2 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary disabled:bg-background disabled:cursor-not-allowed"
            >
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="font-medium">:</span>
            <select
              value={expiryMinute}
              onChange={(e) => setExpiryMinute(e.target.value)}
              disabled={isPending}
              className="h-9 px-2 rounded-lg border border-border text-sm bg-white text-text-main focus:outline-none focus:border-primary disabled:bg-background disabled:cursor-not-allowed"
            >
              {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-text-muted">
          Po tomto datu budou přístupové odkazy zneplatněny. U akcí s datumovými možnostmi se automaticky nastaví na datum vítězné možnosti.
        </p>
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="submit" variant="primary" loading={isPending}>
          Vytvorit akci
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => router.push("/events")}
        >
          Zrusit
        </Button>
      </div>
    </form>
  );
}
