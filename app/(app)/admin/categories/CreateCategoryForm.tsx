"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createCategoryAction } from "@/actions/categories";

export function CreateCategoryForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nazev je povinny.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createCategoryAction(name);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setName("");
        showToast("success", "Kategorie byla vytvorena.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se vytvorit kategorii.");
      showToast("error", "Nepodarilo se vytvorit kategorii.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 items-start sm:items-end max-w-md"
    >
      <div className="flex-1 min-w-0">
        <Input
          name="name"
          label="Nazev kategorie"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Napr. IT / Technologie"
          error={error}
        />
      </div>
      <Button type="submit" variant="primary" size="sm" loading={loading}>
        Pridat
      </Button>
    </form>
  );
}
