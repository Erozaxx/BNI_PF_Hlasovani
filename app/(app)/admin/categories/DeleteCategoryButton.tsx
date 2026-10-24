"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { deleteCategoryAction } from "@/actions/categories";

interface DeleteCategoryButtonProps {
  categoryId: string;
  categoryName: string;
}

export function DeleteCategoryButton({
  categoryId,
  categoryName,
}: DeleteCategoryButtonProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Smazat kategorii „${categoryName}“? Hosté v ní zůstanou bez kategorie.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteCategoryAction(categoryId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Kategorie „${categoryName}“ je smazaná.`);
        router.refresh();
      }
    } catch {
      showToast("error", "Kategorii se nepodařilo smazat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      className="min-h-[44px]"
      loading={loading}
      onClick={handleDelete}
    >
      Smazat
    </Button>
  );
}
