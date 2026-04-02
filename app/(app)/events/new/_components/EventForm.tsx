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

export function EventForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [votingType, setVotingType] = useState<VotingType>("pick_one");
  const [votingMaxX, setVotingMaxX] = useState<number>(2);
  const [whoCanVote, setWhoCanVote] = useState<WhoCanVote>("members_only");
  const [customOptionsAllowed, setCustomOptionsAllowed] = useState(false);
  const [whoCanAddOptions, setWhoCanAddOptions] =
    useState<WhoCanAddOptions>("members_only");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createEventAction(
        title,
        {
          votingType,
          votingMaxX: votingType === "max_x" ? votingMaxX : undefined,
          whoCanVote,
          customOptionsAllowed,
          whoCanAddOptions,
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

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-main">
          Kdo muze hlasovat
        </label>
        <select
          value={whoCanVote}
          onChange={(e) => setWhoCanVote(e.target.value as WhoCanVote)}
          disabled={isPending}
          className="h-11 px-3.5 py-2.5 rounded-lg border border-border text-base bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus disabled:bg-background disabled:cursor-not-allowed"
        >
          <option value="members_only">Pouze cleny BNI</option>
          <option value="anyone_with_link">Kdokoliv s odkazem</option>
        </select>
      </div>

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
          Ucastnici mohou pridat vlastni moznosti
        </label>
      </div>

      {customOptionsAllowed && (
        <div className="flex flex-col gap-1 pl-7">
          <label className="text-sm font-medium text-text-main">
            Kdo muze pridat moznosti
          </label>
          <select
            value={whoCanAddOptions}
            onChange={(e) =>
              setWhoCanAddOptions(e.target.value as WhoCanAddOptions)
            }
            disabled={isPending}
            className="h-11 px-3.5 py-2.5 rounded-lg border border-border text-base bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus disabled:bg-background disabled:cursor-not-allowed"
          >
            <option value="members_only">Pouze cleny BNI</option>
            <option value="anyone_with_link">Kdokoliv s odkazem</option>
          </select>
        </div>
      )}

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
