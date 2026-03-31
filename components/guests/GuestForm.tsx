"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { createGuestAction, updateGuestAction } from "@/actions/guests";

interface GuestFormProps {
  categories: Array<{ id: string; name: string }>;
  guest?: {
    id: string;
    name: string;
    description?: string | null;
    categoryId?: string | null;
  };
}

export function GuestForm({ categories, guest }: GuestFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const isEdit = Boolean(guest);

  const [name, setName] = useState(guest?.name ?? "");
  const [description, setDescription] = useState(guest?.description ?? "");
  const [categoryId, setCategoryId] = useState(guest?.categoryId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [categoryError, setCategoryError] = useState("");

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNameError("");
    setCategoryError("");

    // Client-side validation
    let hasError = false;
    if (!name.trim()) {
      setNameError("Jmeno hosta je povinne.");
      hasError = true;
    }
    if (!categoryId) {
      setCategoryError("Kategorie je povinna.");
      hasError = true;
    }
    if (hasError) return;

    setLoading(true);

    try {
      let result;
      if (isEdit && guest) {
        result = await updateGuestAction(guest.id, name, description);
      } else {
        result = await createGuestAction(name, categoryId, description);
      }

      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", isEdit ? "Host byl upraven." : "Host byl pridan.");
        if (!isEdit && result.data && "id" in result.data) {
          router.push(`/guests/${result.data.id}`);
        } else {
          router.push("/guests");
        }
        router.refresh();
      }
    } catch {
      setError("Doslo k neocekavane chybe.");
      showToast("error", "Doslo k neocekavane chybe.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {error && (
        <div className="p-3 bg-danger-light text-danger rounded-lg text-sm">
          {error}
        </div>
      )}

      <Input
        label="Jmeno hosta *"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        placeholder="Celé jméno"
      />

      <Select
        label="Kategorie *"
        name="categoryId"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        options={categoryOptions}
        placeholder="Vyberte kategorii"
        error={categoryError}
      />

      <Textarea
        label="Popis"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Kratky popis hosta, jeho obor..."
      />

      <div className="flex gap-3">
        <Button type="submit" variant="primary" loading={loading}>
          {isEdit ? "Ulozit zmeny" : "Pridat hosta"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
        >
          Zrusit
        </Button>
      </div>
    </form>
  );
}
