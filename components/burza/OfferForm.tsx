"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { RemoveOfferButton } from "@/components/burza/RemoveOfferButton";
import { saveOfferAction } from "@/actions/burza";
import { CONTACT_MAX, NOTE_MAX, OFFER_MAX, TEXTS } from "@/lib/burza/rules";

/**
 * Formulář řádku burzy (6.4, Z1, Z3). Kontakt je vždy volný text bez
 * předvyplnění (burza e-mail člena nečte). `isNew` říká, jestli se formulář
 * načetl bez řádku (založení) nebo s ním (úprava). Po uložení návrat na
 * přehled. Tlačítko je `disabled` během odesílání a po úspěchu až do navigace.
 * Vedení může řádek z formuláře i smazat.
 */
export function OfferForm({
  memberId,
  isNew,
  initial,
  canRemove,
  own,
}: {
  memberId: string;
  isNew: boolean;
  initial: { offer: string; contact: string; note: string };
  /** Vedení u existujícího řádku. */
  canRemove: boolean;
  own: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [offer, setOffer] = useState(initial.offer);
  const [contact, setContact] = useState(initial.contact);
  const [note, setNote] = useState(initial.note);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    let keepDisabled = false;
    try {
      const result = await saveOfferAction({ memberId, offer, contact, note, isNew });
      if (!result.success) {
        showToast("error", result.error);
        return;
      }
      keepDisabled = true;
      showToast("success", result.data?.created ? "Řádek přidán." : "Řádek uložen.");
      router.push("/burza");
      router.refresh();
    } catch {
      showToast("error", "Řádek se nepodařilo uložit.");
    } finally {
      if (!keepDisabled) setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
      <Textarea
        label="S čím pomůžu"
        name="offer"
        value={offer}
        onChange={(e) => setOffer(e.target.value)}
        maxLength={OFFER_MAX}
        rows={5}
        required
      />
      <p className="-mt-3 text-xs text-text-muted">{TEXTS.boundaryField}</p>
      <Input
        label="Jak mě kontaktovat"
        name="contact"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        maxLength={CONTACT_MAX}
        placeholder={TEXTS.contactPlaceholder}
        autoComplete="off"
      />
      <Textarea
        label="Poznámka"
        name="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={NOTE_MAX}
        rows={2}
      />
      <p className="-mt-3 text-xs text-text-muted">{TEXTS.noteHint}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="submit" loading={loading} disabled={loading} className="min-h-[44px] w-full sm:w-auto">
          Uložit
        </Button>
        <Link
          href="/burza"
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-6 py-3 text-base text-text-main transition-colors hover:bg-background focus:outline-none focus:shadow-focus sm:w-auto"
        >
          Zpět
        </Link>
        {canRemove && <RemoveOfferButton memberId={memberId} own={own} goTo="/burza" />}
      </div>
    </form>
  );
}
