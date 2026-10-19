"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { UsedToggleButton } from "@/components/burza/UsedToggleButton";
import { setHelpUsedAction } from "@/actions/burza";
import { TEXTS } from "@/lib/burza/rules";

/**
 * „Využil(a) jsem“ na cizí kartě záložky Pomoc. Klepnutí posílá CÍLOVÝ stav
 * (ne přepínání), takže dvojklik ani dvě záložky prohlížeče nezdvojí záznam.
 * Optimisticky: stav se změní hned, při chybě se vrátí a ukáže se hláška.
 * Stav po úspěchu se bere z odpovědi serveru (pravda je server). Bez
 * potvrzování a bez poznámky. Vedle zaškrtnutého je šedě „tento měsíc“.
 */
export function HelpUsedToggle({
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
  const [pending, setPending] = useState(false);
  const used = helpId !== null;

  async function handleClick() {
    if (pending) return;
    const target = !used;
    const previous = helpId;
    // Optimisticky: zaškrtnuto = zatím neznámé `id`, doplní se z odpovědi.
    setHelpId(target ? "pending" : null);
    setPending(true);
    try {
      const result = await setHelpUsedAction({ helperId, used: target, helpId: previous });
      if (!result.success) {
        setHelpId(previous);
        showToast("error", result.error);
        router.refresh();
        return;
      }
      setHelpId(result.data?.used ? (result.data.helpId ?? null) : null);
    } catch {
      setHelpId(previous);
      showToast("error", "Zápis se nepodařilo uložit.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <UsedToggleButton used={used} pending={pending} onClick={handleClick} />
      {used && <span className="text-sm text-text-muted">{TEXTS.usedThisMonth}</span>}
    </div>
  );
}
