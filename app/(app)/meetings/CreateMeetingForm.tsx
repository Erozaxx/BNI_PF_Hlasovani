"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createMeetingAction } from "@/actions/meetings";

interface CreateMeetingFormProps {
  /**
   * iter-042 (Z11): nejbližší pravidelný den schůzky z nastavení chapteru
   * (`YYYY-MM-DD`), předvyplní pole Datum. Bez hodnoty zůstane pole prázdné.
   */
  defaultDate?: string;
}

export function CreateMeetingForm({ defaultDate = "" }: CreateMeetingFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [date, setDate] = useState(defaultDate);
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError("Datum je povinné.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createMeetingAction(date, location || undefined);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setDate("");
        setLocation("");
        showToast("success", "Schůzka je vytvořená.");
        router.refresh();
      }
    } catch {
      setError("Schůzku se nepodařilo vytvořit.");
      showToast("error", "Schůzku se nepodařilo vytvořit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex-1 min-w-0">
          <Input
            type="date"
            name="date"
            label="Datum schůzky"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={error}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            name="location"
            label="Místo konání"
            placeholder="Nepovinné"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={loading}
          className="min-h-[44px]"
        >
          Vytvořit
        </Button>
      </div>
    </form>
  );
}
