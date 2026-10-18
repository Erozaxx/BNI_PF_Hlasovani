"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { recordHelpAction, removeHelpAction } from "@/actions/burza";
import { HELP_NOTE_MAX, TEXTS } from "@/lib/burza/rules";

/**
 * „Pomohl(a) mi“ na cizí kartě (sekundární obrysové tlačítko, 44 px). Po
 * klepnutí se rozbalí nepovinná poznámka a „Zapsat“. Když už je tento měsíc
 * zapsáno, ukáže se „Tento měsíc zapsáno“ a „Zrušit“ (smaže záznam). Akce
 * přijímá cílový stav, dvojklik nevyrobí druhý záznam. Tlačítka jsou
 * `disabled` během odesílání.
 */
export function HelpButton({
  helperId,
  initialHelpId,
}: {
  helperId: string;
  /** `id` záznamu za tento měsíc, nebo `null`. */
  initialHelpId: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [helpId, setHelpId] = useState<string | null>(initialHelpId);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function handleRecord() {
    if (pending) return;
    setPending(true);
    try {
      const result = await recordHelpAction(helperId, note);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      const data = result.data;
      setHelpId(data?.helpId ?? null);
      setOpen(false);
      setNote("");
      showToast("success", data?.already ? "Tento měsíc už zapsáno." : "Zapsáno, díky.");
      router.refresh();
    } catch {
      showToast("error", "Pomoc se nepodařilo zapsat.");
    } finally {
      setPending(false);
    }
  }

  async function handleUndo() {
    if (pending || !helpId) return;
    if (!window.confirm("Opravdu zrušit zápis, že ti tento člen pomohl?")) return;
    setPending(true);
    try {
      const result = await removeHelpAction(helpId);
      if (!result.success) {
        showToast("error", result.error);
        router.refresh();
        return;
      }
      setHelpId(null);
      showToast("success", "Zápis je zrušený.");
      router.refresh();
    } catch {
      showToast("error", "Zápis se nepodařilo zrušit.");
    } finally {
      setPending(false);
    }
  }

  if (helpId) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-sm text-text-muted">Tento měsíc zapsáno</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={handleUndo}
          className="min-h-[44px]"
        >
          Zrušit
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full sm:w-auto"
      >
        Pomohl(a) mi
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        label="Poznámka (nepovinné)"
        name={`help-note-${helperId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={HELP_NOTE_MAX}
        rows={2}
      />
      <p className="text-xs text-text-muted">{TEXTS.helpHint}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={pending}
          disabled={pending}
          onClick={handleRecord}
          className="min-h-[44px] w-full sm:w-auto"
        >
          Zapsat
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setNote("");
          }}
          className="min-h-[44px] w-full sm:w-auto"
        >
          Zpět
        </Button>
      </div>
    </div>
  );
}
