"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { removeContactItemAction, saveContactItemAction } from "@/actions/burza";
import { CONTACT_LABEL_MAX, TEXTS } from "@/lib/burza/rules";

/**
 * Seznam položek člena ve správě kontaktů: u každé „Upravit“ (inline pole,
 * „Uložit“, „Zpět“) a „Smazat“ s potvrzením (maže obsah, na rozdíl od
 * přepínače). Po úspěchu `router.refresh()`, stránka zůstává. Na úzkém
 * displeji pole na celou šířku a tlačítka pod ním.
 */
export function ContactItemsEditor({
  memberId,
  items,
}: {
  memberId: string;
  items: Array<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleSave(contactId: string) {
    if (busyId) return;
    setBusyId(contactId);
    try {
      const result = await saveContactItemAction({ memberId, contactId, label: draft });
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      setEditingId(null);
      showToast("success", TEXTS.contactSaved);
      router.refresh();
    } catch {
      showToast("error", "Kontakt se nepodařilo uložit.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(contactId: string) {
    if (busyId) return;
    if (!window.confirm(TEXTS.contactDeleteConfirm)) return;
    setBusyId(contactId);
    try {
      const result = await removeContactItemAction(contactId);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      setEditingId(null);
      showToast("success", TEXTS.contactDeleted);
      router.refresh();
    } catch {
      showToast("error", "Kontakt se nepodařilo smazat.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="max-w-3xl space-y-3">
      {items.map((item) => {
        const editing = editingId === item.id;
        const busy = busyId === item.id;
        return (
          <li
            key={item.id}
            className="min-w-0 rounded-card border border-border bg-surface p-4 shadow-card"
          >
            {editing ? (
              <div className="space-y-3">
                <Input
                  label={TEXTS.contactLabel}
                  name={`contact-edit-${item.id}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={CONTACT_LABEL_MAX}
                  autoComplete="off"
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    size="sm"
                    loading={busy}
                    disabled={busy}
                    onClick={() => handleSave(item.id)}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    Uložit
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => setEditingId(null)}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    Zpět
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-line break-words text-sm text-text-main">{item.label}</p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(item.id);
                      setDraft(item.label);
                    }}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    Upravit
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    loading={busy}
                    disabled={busy}
                    onClick={() => handleRemove(item.id)}
                    className="min-h-[44px] w-full sm:w-auto"
                  >
                    Smazat
                  </Button>
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
