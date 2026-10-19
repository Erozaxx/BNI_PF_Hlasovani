"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createInterviewAction } from "@/actions/interviews";
import type { InterviewType } from "@/lib/db/queries/interviews";

const TYPE_OPTIONS: Array<{ value: InterviewType; label: string }> = [
  { value: "month_5", label: "5 měsíců" },
  { value: "month_10", label: "10 měsíců" },
];

interface MemberOption {
  id: string;
  name: string;
  email: string | null;
  /** iter-037 (K13, K15): neaktivní člen smí být zpovídaný, ale ne vedoucí. */
  isInactive?: boolean;
}

interface CreateInterviewFormProps {
  members: MemberOption[];
  /** Founding admin/mod — pre-filled as the default leader (arch 8a). */
  currentMemberId: string;
  /** memberId -> which types already have a non-cancelled interview, for a
   *  comfort hint only — the DB partial UNIQUE is the real authority (8a). */
  existingByMember: Record<string, { month5: boolean; month10: boolean }>;
  /** Pre-fill from a due-chip click on /admin/members (arch iter-023 T-001 §3.3).
   *  Bez `key` (M3): formulář se nevytváří znovu při obnovení stránky, takže
   *  rozepsaný výběr přežije změnu filtru. Nová neprázdná předvolba se přenese
   *  přes efekt níže. */
  initialMemberId?: string;
  initialType?: InterviewType;
}

export function CreateInterviewForm({
  members,
  currentMemberId,
  existingByMember,
  initialMemberId,
  initialType,
}: CreateInterviewFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [memberId, setMemberId] = useState(initialMemberId ?? "");
  const [type, setType] = useState<InterviewType | "">(initialType ?? "");
  const [leaderId, setLeaderId] = useState(currentMemberId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // M3: předvyplnění z URL jen při změně na neprázdnou hodnotu. Smazání
  // parametrů filtrem (prázdné hodnoty) výběr neresetuje.
  useEffect(() => {
    if (initialMemberId) setMemberId(initialMemberId);
    if (initialType) setType(initialType);
  }, [initialMemberId, initialType]);

  const memberOptions = members.map((m) => ({
    value: m.id,
    label: m.isInactive ? `${m.name} (neaktivní)` : m.name,
  }));
  const leaderOptions = members.filter((m) => !m.isInactive).map((m) => ({
    value: m.id,
    label: m.email ? m.name : `${m.name} (bez emailu)`,
  }));

  const existing = memberId ? existingByMember[memberId] : undefined;
  const hint =
    existing?.month5 && existing?.month10
      ? "Tento člen už má založené oba pohovory (5 i 10 měsíců)."
      : existing?.month5
        ? "Tento člen už má založený pohovor 5 měsíců."
        : existing?.month10
          ? "Tento člen už má založený pohovor 10 měsíců."
          : null;

  // Disable a type already occupied by a non-cancelled interview for the
  // selected member (arch 8a: "ve formulari je uz obsazeny typ disabled s
  // vysvetlenim" — the DB partial UNIQUE stays the real authority, this is
  // UX only, MINOR-2).
  const typeOptions = TYPE_OPTIONS.map((opt) => {
    const isTaken =
      (opt.value === "month_5" && existing?.month5) ||
      (opt.value === "month_10" && existing?.month10);
    return {
      ...opt,
      label: isTaken ? `${opt.label} (už založeno)` : opt.label,
      disabled: Boolean(isTaken),
    };
  });

  const selectedLeader = members.find((m) => m.id === leaderId && !m.isInactive);

  function handleMemberChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newMemberId = e.target.value;
    setMemberId(newMemberId);

    // Clear the selected type if it just became disabled for the new member.
    const newExisting = existingByMember[newMemberId];
    if (
      (type === "month_5" && newExisting?.month5) ||
      (type === "month_10" && newExisting?.month10)
    ) {
      setType("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!memberId) {
      setError("Vyberte člena.");
      return;
    }
    if (!type) {
      setError("Vyberte typ pohovoru.");
      return;
    }
    if (!leaderId) {
      setError("Vyberte vedoucího.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createInterviewAction(memberId, type, leaderId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else if (result.data) {
        showToast("success", "Pohovor byl založen.");
        router.push(`/interviews/${result.data.id}`);
      }
    } catch {
      setError("Nepodařilo se založit pohovor.");
      showToast("error", "Nepodařilo se založit pohovor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select
          label="Člen"
          name="memberId"
          value={memberId}
          onChange={handleMemberChange}
          options={memberOptions}
          placeholder="Vyberte člena…"
        />
        <Select
          label="Typ pohovoru"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as InterviewType)}
          options={typeOptions}
          placeholder="Vyberte typ…"
        />
        <Select
          label="Vedoucí pohovoru"
          name="leaderId"
          value={leaderId}
          onChange={(e) => setLeaderId(e.target.value)}
          options={leaderOptions}
          placeholder="Vyberte vedoucího…"
        />
      </div>

      {hint && <p className="text-sm text-warning">{hint}</p>}
      {selectedLeader && !selectedLeader.email && (
        <p className="text-sm text-warning">
          Vybraný vedoucí nemá e-mail. Odkaz na vyplnění půjde poslat až po
          doplnění e-mailu.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Button
        type="submit"
        variant="primary"
        size="sm"
        loading={loading}
        className="min-h-[44px] sm:min-h-0"
      >
        Založit pohovor
      </Button>
    </form>
  );
}
