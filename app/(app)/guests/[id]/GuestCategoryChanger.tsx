"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { updateGuestCategoryAction } from "@/actions/guests";

interface GuestCategoryChangerProps {
  guestId: string;
  currentCategoryId: string;
  categories: Array<{ id: string; name: string }>;
}

export function GuestCategoryChanger({
  guestId,
  currentCategoryId,
  categories,
}: GuestCategoryChangerProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [categoryId, setCategoryId] = useState(currentCategoryId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  async function handleChange() {
    if (categoryId === currentCategoryId) return;

    setLoading(true);
    setError("");

    try {
      const result = await updateGuestCategoryAction(guestId, categoryId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        showToast("success", "Kategorie byla zmenena.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se zmenit kategorii.");
      showToast("error", "Nepodarilo se zmenit kategorii.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
      <div className="flex-1 min-w-0">
        <Select
          name="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          options={categoryOptions}
          placeholder="Vyberte kategorii"
        />
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleChange}
        loading={loading}
        disabled={categoryId === currentCategoryId}
      >
        Zmenit
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
