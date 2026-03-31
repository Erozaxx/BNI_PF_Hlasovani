"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { addGuestToMeetingAction } from "@/actions/meetings";

interface AddGuestToMeetingFormProps {
  meetingId: string;
  availableGuests: Array<{
    id: string;
    name: string;
    categoryName: string | null;
  }>;
}

export function AddGuestToMeetingForm({
  meetingId,
  availableGuests,
}: AddGuestToMeetingFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [guestId, setGuestId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const guestOptions = availableGuests.map((g) => ({
    value: g.id,
    label: g.categoryName ? `${g.name} (${g.categoryName})` : g.name,
  }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guestId) {
      setError("Vyberte hosta.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await addGuestToMeetingAction(meetingId, guestId);
      if (!result.success) {
        setError(result.error);
        showToast("error", result.error);
      } else {
        setGuestId("");
        showToast("success", "Host byl pridan ke schuzce.");
        router.refresh();
      }
    } catch {
      setError("Nepodarilo se pridat hosta.");
      showToast("error", "Nepodarilo se pridat hosta.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 items-start sm:items-end"
    >
      <div className="flex-1 min-w-0">
        <Select
          name="guestId"
          value={guestId}
          onChange={(e) => setGuestId(e.target.value)}
          options={guestOptions}
          placeholder="Vyberte hosta..."
          error={error}
        />
      </div>
      <Button type="submit" variant="primary" size="sm" loading={loading}>
        Pridat
      </Button>
    </form>
  );
}
