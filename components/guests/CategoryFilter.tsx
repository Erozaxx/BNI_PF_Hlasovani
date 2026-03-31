"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";

interface CategoryFilterProps {
  categories: Array<{ id: string; name: string }>;
  currentCategoryId?: string;
}

export function CategoryFilter({ categories, currentCategoryId }: CategoryFilterProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(!!currentCategoryId);

  const handleVse = () => {
    if (currentCategoryId) {
      router.push("/guests");
      setExpanded(false);
    } else {
      setExpanded((prev) => !prev);
    }
  };

  const handleCategory = (id: string) => {
    router.push(`/guests?category=${id}`);
  };

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={handleVse} className="focus:outline-none">
          <Badge variant={!currentCategoryId ? "danger" : "neutral"}>Vše</Badge>
        </button>

        {expanded && currentCategoryId && (
          <button onClick={handleVse} className="focus:outline-none">
            <Badge variant="neutral">← Zpět na vše</Badge>
          </button>
        )}

        {/* Expand/collapse indicator when collapsed */}
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-main transition-colors"
          >
            <span>Filtrovat podle činnosti</span>
            <span className="text-[10px]">▼</span>
          </button>
        )}

        {/* Collapse button when expanded */}
        {expanded && !currentCategoryId && (
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-main transition-colors ml-auto"
          >
            <span>Skrýt</span>
            <span className="text-[10px]">▲</span>
          </button>
        )}
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-border">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategory(cat.id)}
              className="focus:outline-none"
            >
              <Badge variant={currentCategoryId === cat.id ? "category" : "neutral"}>
                {cat.name}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
