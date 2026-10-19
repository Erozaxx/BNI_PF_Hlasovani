"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { saveContactItemAction } from "@/actions/burza";
import { CONTACT_LABEL_MAX, TEXTS } from "@/lib/burza/rules";

/**
 * Přidání položky „Na koho mám kontakt“ (jedno pole, 150 znaků). Stránka
 * zůstává, aby šlo přidat víc položek za sebou. Při plném limitu formulář
 * místo sebe ukáže větu (rozhoduje stránka podle počtu položek).
 */
export function ContactItemForm({ memberId }: { memberId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const result = await saveContactItemAction({ memberId, contactId: null, label });
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      setLabel("");
      showToast("success", TEXTS.contactAdded);
      router.refresh();
    } catch {
      showToast("error", "Kontakt se nepodařilo uložit.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-3">
      <Input
        label={TEXTS.contactLabel}
        name="contact-label"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={CONTACT_LABEL_MAX}
        autoComplete="off"
        required
      />
      <Button
        type="submit"
        loading={loading}
        disabled={loading}
        className="min-h-[44px] w-full sm:w-auto"
      >
        {TEXTS.contactAdd}
      </Button>
    </form>
  );
}
