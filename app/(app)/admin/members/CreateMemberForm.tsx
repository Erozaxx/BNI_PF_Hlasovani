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
  const [password, setPassword] = useState("");
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
    if (role && password.length > 0 && password.length < 8) {
      setError("Heslo musi mit alespon 8 znaku.");
      return;
    }
    if (role && !password) {
      setError("Pro admin/moderator roli je nutne zadat heslo.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createMemberAction(
        name,
        email || undefined,
        role || null,
        role ? password : undefined
      );
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setName("");
        setEmail("");
        setRole("");
        setPassword("");
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
        onChange={(e) => { setRole(e.target.value); setPassword(""); }}
        options={roleOptions}
      />
      {role && (
        <Input
          label="Heslo (pro prihlaseni do administrace) *"
          name="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          placeholder="Min. 8 znaku"
        />
      )}
      <Button type="submit" variant="primary" size="sm" loading={loading}>
        Pridat clena
      </Button>
    </form>
  );
}
