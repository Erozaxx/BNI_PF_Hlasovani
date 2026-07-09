"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createInterviewAction } from "@/actions/interviews";
import type { InterviewType } from "@/lib/db/queries/interviews";

const TYPE_OPTIONS: Array<{ value: InterviewType; label: string }> = [
  { value: "month_5", label: "5 mesicu" },
  { value: "month_10", label: "10 mesicu" },
];

interface MemberOption {
  id: string;
  name: string;
  email: string | null;
}

interface CreateInterviewFormProps {
  members: MemberOption[];
  /** Founding admin/mod — pre-filled as the default leader (arch 8a). */
  currentMemberId: string;
  /** memberId -> which types already have a non-cancelled interview, for a
   *  comfort hint only — the DB partial UNIQUE is the real authority (8a). */
  existingByMember: Record<string, { month5: boolean; month10: boolean }>;
}

export function CreateInterviewForm({
  members,
  currentMemberId,
  existingByMember,
}: CreateInterviewFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [memberId, setMemberId] = useState("");
  const [type, setType] = useState<InterviewType | "">("");
  const [leaderId, setLeaderId] = useState(currentMemberId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const memberOptions = members.map((m) => ({ value: m.id, label: m.name }));
  const leaderOptions = members.map((m) => ({
    value: m.id,
    label: m.email ? m.name : `${m.name} (bez emailu)`,
  }));

  const existing = memberId ? existingByMember[memberId] : undefined;
  const hint =
    existing?.month5 && existing?.month10
      ? "Tento clen jiz ma zalozene oba pohovory (5 i 10 mesicu)."
      : existing?.month5
        ? "Tento clen jiz ma zalozeny pohovor 5 mesicu."
        : existing?.month10
          ? "Tento clen jiz ma zalozeny pohovor 10 mesicu."
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
      label: isTaken ? `${opt.label} (jiz zalozeno)` : opt.label,
      disabled: Boolean(isTaken),
    };
  });

  const selectedLeader = members.find((m) => m.id === leaderId);

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
      setError("Vyberte clena.");
      return;
    }
    if (!type) {
      setError("Vyberte typ pohovoru.");
      return;
    }
    if (!leaderId) {
      setError("Vyberte vedouciho.");
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
        showToast("success", "Pohovor byl zalozen.");
        router.push(`/interviews/${result.data.id}`);
      }
    } catch {
      setError("Nepodarilo se zalozit pohovor.");
      showToast("error", "Nepodarilo se zalozit pohovor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select
          label="Clen"
          name="memberId"
          value={memberId}
          onChange={handleMemberChange}
          options={memberOptions}
          placeholder="Vyberte clena..."
        />
        <Select
          label="Typ pohovoru"
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as InterviewType)}
          options={typeOptions}
          placeholder="Vyberte typ..."
        />
        <Select
          label="Vedouci pohovoru"
          name="leaderId"
          value={leaderId}
          onChange={(e) => setLeaderId(e.target.value)}
          options={leaderOptions}
          placeholder="Vyberte vedouciho..."
        />
      </div>

      {hint && <p className="text-sm text-warning">{hint}</p>}
      {selectedLeader && !selectedLeader.email && (
        <p className="text-sm text-warning">
          Vybrany vedouci nema email — odkaz na vyplneni pujde poslat az po
          doplneni emailu.
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" variant="primary" size="sm" loading={loading}>
        Zalozit pohovor
      </Button>
    </form>
  );
}
