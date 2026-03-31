"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createMeetingAction } from "@/actions/meetings";

export function CreateMeetingForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError("Datum je povinne.");
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
        showToast("success", "Schuzka byla vytvorena.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se vytvorit schuzku.");
      showToast("error", "Nepodarilo se vytvorit schuzku.");
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
            label="Datum schuzky"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            error={error}
          />
        </div>
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            name="location"
            label="Misto konani"
            placeholder="Nepovinne"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>
        <Button type="submit" variant="primary" size="sm" loading={loading}>
          Vytvorit
        </Button>
      </div>
    </form>
  );
}
