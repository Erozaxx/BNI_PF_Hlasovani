"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createMemberAction } from "@/actions/members";

export function CreateMemberForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [obor, setObor] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Jméno je povinné.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createMemberAction(
        name,
        email || undefined,
        company || undefined,
        obor || undefined
      );
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setName("");
        setEmail("");
        setCompany("");
        setObor("");
        showToast("success", "Člen byl přidán.");
        router.refresh();
      }
    } catch {
      setError("Nepodařilo se vytvořit člena.");
      showToast("error", "Nepodařilo se vytvořit člena.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md">
      {error && (
        <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">
          {error}
        </div>
      )}
      <Input
        label="Jméno *"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jméno člena"
      />
      <Input
        label="E-mail (pro report)"
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@example.com"
      />
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
      <p className="text-xs text-text-muted">
        Nový člen vzniká bez funkce. Funkci nebo admina mu dáš na jeho stránce.
      </p>
      <Button type="submit" variant="primary" size="sm" className="min-h-[44px]" loading={loading}>
        Přidat člena
      </Button>
    </form>
  );
}
