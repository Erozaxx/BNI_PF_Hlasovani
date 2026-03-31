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
      `Opravdu chcete smazat kategorii "${categoryName}"? Hosté v této kategorii budou zobrazováni jako "[bez kategorie]".`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
      const result = await deleteCategoryAction(categoryId);
      if (!result.success) {
        showToast("error", result.error);
      } else {
        showToast("success", `Kategorie "${categoryName}" byla smazána.`);
        router.refresh();
      }
    } catch {
      showToast("error", "Nepodarilo se smazat kategorii.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="danger"
      size="sm"
      loading={loading}
      onClick={handleDelete}
    >
      Smazat
    </Button>
  );
}
