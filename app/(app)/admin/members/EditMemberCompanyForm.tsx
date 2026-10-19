"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { updateMemberCompanyAction } from "@/actions/members";

interface Props {
  memberId: string;
  initialCompany: string | null;
  initialObor: string | null;
}

export function EditMemberCompanyForm({ memberId, initialCompany, initialObor }: Props) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState(initialCompany ?? "");
  const [obor, setObor] = useState(initialObor ?? "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await updateMemberCompanyAction(memberId, company, obor);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", "Firma a obor aktualizovány.");
        setOpen(false);
        router.refresh();
      }
    } catch {
      showToast("error", "Nepodařilo se aktualizovat firmu a obor.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center text-sm text-primary underline hover:no-underline"
      >
        Upravit
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-1">
      <Input
        label="Firma"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Název firmy"
      />
      <Input
        label="Obor"
        name="obor"
        value={obor}
        onChange={(e) => setObor(e.target.value)}
        placeholder="Obor činnosti"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" className="min-h-[44px]" loading={loading}>
          Uložit
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="min-h-[44px]"
          onClick={() => {
            setCompany(initialCompany ?? "");
            setObor(initialObor ?? "");
            setOpen(false);
          }}
        >
          Zrušit
        </Button>
      </div>
    </form>
  );
}
