"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { createMemberAction } from "@/actions/members";

export function CreateMemberForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const roleOptions = [
    { value: "", label: "Clen (bez management role)" },
    { value: "moderator", label: "Moderator" },
    { value: "admin", label: "Admin" },
  ];

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
        role || null
      );
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setName("");
        setEmail("");
        setRole("");
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
      <Select
        label="Role"
        name="role"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        options={roleOptions}
      />
      <Button type="submit" variant="primary" size="sm" loading={loading}>
        Pridat clena
      </Button>
    </form>
  );
}
