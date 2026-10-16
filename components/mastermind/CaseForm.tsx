"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { createCaseAction, updateCaseAction } from "@/actions/mastermind";
import { DESCRIPTION_MAX, TITLE_MAX } from "@/lib/mastermind/rules";

export interface CaseFormInitial {
  title: string;
  /** Popis „O čem to bude“; u starších případů spojený ze čtyř bodů. */
  description: string;
}

/**
 * Formulář případu (7.5): téma a jeden popis „O čem to bude“. Vedení má
 * navíc výběr člena, který téma přináší (výchozí přihlášený), u
 * úpravy se nemění. Tlačítko je `disabled` během odesílání (4.4). Repo je
 * veřejné, v kódu nejsou žádné příklady skutečných případů.
 */
export function CaseForm({
  mode,
  caseId,
  initial,
  members,
  viewerId,
}: {
  mode: "create" | "edit";
  caseId?: string;
  initial?: CaseFormInitial;
  /** Jen vedení při zápisu nového případu. */
  members?: Array<{ id: string; name: string }>;
  viewerId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [forMemberId, setForMemberId] = useState(viewerId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    // Po úspěchu zůstane tlačítko neaktivní až do navigace (m-1), znovu se
    // povoluje jen při chybě.
    let keepDisabled = false;
    try {
      const body = { title, situation: description };
      const result =
        mode === "create"
          ? await createCaseAction({ ...body, forMemberId: forMemberId !== viewerId ? forMemberId : null })
          : await updateCaseAction(caseId ?? "", body);
      if (!result.success) {
        showToast("error", result.error);
        return;
      }
      keepDisabled = true;
      showToast("success", mode === "create" ? "Případ je přihlášený." : "Případ je upravený.");
      router.push("/mastermind");
      router.refresh();
    } catch {
      showToast("error", "Případ se nepodařilo uložit.");
    } finally {
      if (!keepDisabled) setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-3xl">
      {mode === "create" && members && members.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor="forMemberId" className="text-sm font-medium text-text-main">
            Téma přináší
          </label>
          <select
            id="forMemberId"
            value={forMemberId}
            onChange={(e) => setForMemberId(e.target.value)}
            className="h-11 rounded-lg border border-border bg-white px-3 text-base text-text-main focus:outline-none focus:border-primary focus:shadow-focus"
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <Input
        label="Téma"
        name="title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={TITLE_MAX}
        required
      />
      <Textarea
        label="O čem to bude"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        maxLength={DESCRIPTION_MAX}
        rows={5}
        required
      />
      <p className="-mt-3 text-xs text-text-muted">
        Dvě až tři věty, ať ostatní vědí, jestli se přidat. Klienta popiš obecně, bez jména.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={loading} disabled={loading} className="min-h-[44px] w-full sm:w-auto">
          {mode === "create" ? "Přihlásit případ" : "Uložit"}
        </Button>
        <Link
          href="/mastermind"
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-6 py-3 text-base text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus sm:w-auto"
        >
          Zpět
        </Link>
      </div>
    </form>
  );
}
