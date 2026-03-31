"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { renameCategoryAction } from "@/actions/categories";

interface RenameCategoryFormProps {
  categoryId: string;
  currentName: string;
}

export function RenameCategoryForm({
  categoryId,
  currentName,
}: RenameCategoryFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      setError("Nazev je povinny.");
      return;
    }
    if (name.trim() === currentName) {
      setEditing(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await renameCategoryAction(categoryId, name.trim());
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setEditing(false);
        showToast("success", "Kategorie byla prejmenovana.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se prejmenovat kategorii.");
      showToast("error", "Nepodarilo se prejmenovat kategorii.");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Prejmenovat
      </Button>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
      <Input
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error}
      />
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={handleSave} loading={loading}>
          Ulozit
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            setEditing(false);
            setName(currentName);
            setError("");
          }}
        >
          Zrusit
        </Button>
      </div>
    </div>
  );
}
