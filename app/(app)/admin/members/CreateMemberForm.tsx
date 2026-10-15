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
      setError("Jmeno je povinne.");
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
        showToast("success", "Clen byl pridan.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se vytvorit clena.");
      showToast("error", "Nepodarilo se vytvorit clena.");
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
        label="Jmeno *"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Jmeno clena"
      />
      <Input
        label="Email (pro report)"
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
        placeholder="Nazev firmy"
      />
      <Input
        label="Obor"
        name="obor"
        value={obor}
        onChange={(e) => setObor(e.target.value)}
        placeholder="Obor cinnosti"
      />
      <p className="text-xs text-text-muted">
        Nový člen vzniká bez role. Roli moderátora nebo admina mu dáš v seznamu členů níž.
      </p>
      <Button type="submit" variant="primary" size="sm" loading={loading}>
        Pridat clena
      </Button>
    </form>
  );
}
