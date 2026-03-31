"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/Button";

interface ArchiveFiltersProps {
  meetings: Array<{ id: string; date: string }>;
  categories: Array<{ id: string; name: string }>;
}

export function ArchiveFilters({ meetings, categories }: ArchiveFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dateFrom = searchParams.get("from") ?? "";
  const dateTo = searchParams.get("to") ?? "";
  const selectedMeetings = searchParams.getAll("meeting");
  const selectedCategory = searchParams.get("category") ?? "";

  const updateParams = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        params.delete(key);
        if (value === null || value === "") continue;
        if (Array.isArray(value)) {
          for (const v of value) {
            params.append(key, v);
          }
        } else {
          params.set(key, value);
        }
      }

      router.push(`/archive?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleDateFromChange = (value: string) => {
    // When using date range, clear meeting selections
    updateParams({ from: value || null, meeting: null });
  };

  const handleDateToChange = (value: string) => {
    updateParams({ to: value || null, meeting: null });
  };

  const handleMeetingToggle = (meetingId: string) => {
    const current = new Set(selectedMeetings);
    if (current.has(meetingId)) {
      current.delete(meetingId);
    } else {
      current.add(meetingId);
    }
    // When using meeting selection, clear date range
    updateParams({
      meeting: [...current],
      from: null,
      to: null,
    });
  };

  const handleCategoryChange = (value: string) => {
    updateParams({ category: value || null });
  };

  const handleClearAll = () => {
    router.push("/archive");
  };

  const hasFilters =
    dateFrom || dateTo || selectedMeetings.length > 0 || selectedCategory;

  return (
    <div className="space-y-4">
      {/* Date range filter */}
      <div>
        <h3 className="text-sm font-medium text-text-main mb-2">
          Casove obdobi
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="date-from" className="text-xs text-text-muted">
              Od
            </label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => handleDateFromChange(e.target.value)}
              className="h-11 px-3.5 py-2.5 rounded-lg border border-border text-base bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="date-to" className="text-xs text-text-muted">
              Do
            </label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => handleDateToChange(e.target.value)}
              className="h-11 px-3.5 py-2.5 rounded-lg border border-border text-base bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus"
            />
          </div>
        </div>
      </div>

      {/* Meeting multiselect */}
      <div>
        <h3 className="text-sm font-medium text-text-main mb-2">
          Schuzky
        </h3>
        {meetings.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {meetings.map((m) => {
              const isSelected = selectedMeetings.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleMeetingToggle(m.id)}
                  className={`
                    inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-colors
                    ${
                      isSelected
                        ? "bg-primary text-white border-primary"
                        : "bg-white text-text-main border-border hover:bg-background"
                    }
                  `.trim()}
                >
                  {formatDate(m.date)}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Zadne uzavrene schuzky.
          </p>
        )}
      </div>

      {/* Category dropdown */}
      <div>
        <h3 className="text-sm font-medium text-text-main mb-2">
          Kategorie
        </h3>
        <select
          value={selectedCategory}
          onChange={(e) => handleCategoryChange(e.target.value)}
          className="h-11 px-3.5 py-2.5 rounded-lg border border-border text-base appearance-none bg-white text-text-main bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23333%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center] pr-10 focus:outline-none focus:border-primary focus:shadow-focus"
        >
          <option value="">Vsechny kategorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Clear filters */}
      {hasFilters && (
        <div>
          <Button variant="ghost" size="sm" onClick={handleClearAll}>
            Zrusit filtry
          </Button>
        </div>
      )}
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("cs-CZ", {
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}
