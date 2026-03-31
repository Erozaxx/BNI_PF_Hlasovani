"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { CreatableSelect } from "@/components/ui/CreatableSelect";
import { useToast } from "@/components/ui/Toast";
import { createGuestAction, updateGuestAction } from "@/actions/guests";
import { createCategoryAction } from "@/actions/categories";

interface GuestFormProps {
  categories: Array<{ id: string; name: string }>;
  guest?: {
    id: string;
    name: string;
    company?: string | null;
    email?: string | null;
    description?: string | null;
    categoryId?: string | null;
  };
  activeMeeting?: {
    id: string;
    date: string;
  };
}

export function GuestForm({ categories, guest, activeMeeting }: GuestFormProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const isEdit = Boolean(guest);

  const [name, setName] = useState(guest?.name ?? "");
  const [company, setCompany] = useState(guest?.company ?? "");
  const [email, setEmail] = useState(guest?.email ?? "");
  const [description, setDescription] = useState(guest?.description ?? "");
  const [categoryId, setCategoryId] = useState(guest?.categoryId ?? "");
  const [categoryOptions, setCategoryOptions] = useState(
    categories.map((c) => ({ value: c.id, label: c.name }))
  );
  const [addToMeeting, setAddToMeeting] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [categoryError, setCategoryError] = useState("");

  async function handleCreateCategory(name: string): Promise<string> {
    const result = await createCategoryAction(name);
    if (!result.success) {
      throw new Error(result.error);
    }
    const newId = result.data!.id;
    setCategoryOptions((prev) => [...prev, { value: newId, label: name }]);
    return newId;
  }

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
        result = await updateGuestAction(guest.id, name, description, company, email);
      } else {
        const meetingId =
          activeMeeting && addToMeeting ? activeMeeting.id : undefined;
        result = await createGuestAction(name, categoryId, description, meetingId, company, email);
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

      <Input
        label="Firma"
        name="company"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        placeholder="Název firmy (nepovinné)"
      />

      <Input
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email@example.com (nepovinné)"
      />

      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm font-medium text-text-main">Kategorie *</span>
          <span
            title="Kategorie vychází z číselníku CZ-NACE. Doporučujeme přiřadit standardní kategorii ze seznamu."
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-text-muted/20 text-text-muted text-xs cursor-help select-none"
          >
            ?
          </span>
        </div>
        <CreatableSelect
          options={categoryOptions}
          value={categoryId}
          onChange={setCategoryId}
          onCreateOption={handleCreateCategory}
          placeholder="Vyberte nebo napište kategorii"
          error={categoryError}
        />
      </div>

      <Textarea
        label="Popis"
        name="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Kratky popis hosta, jeho obor..."
      />

      {!isEdit && activeMeeting && (
        <label className="flex items-center gap-2 cursor-pointer text-sm text-text-main">
          <input
            type="checkbox"
            checked={addToMeeting}
            onChange={(e) => setAddToMeeting(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Pridat do schuzky {activeMeeting.date}
        </label>
      )}

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
