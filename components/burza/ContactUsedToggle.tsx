"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { UsedToggleButton } from "@/components/burza/UsedToggleButton";
import { setContactUsedAction } from "@/actions/burza";

/**
 * „Využil(a) jsem“ na cizí kartě záložky Kontakty. Zápis platí natrvalo,
 * dalším klepnutím se smaže. Cílový stav, optimisticky, bez potvrzování a bez
 * poznámky (stejné chování jako `HelpUsedToggle`).
 */
export function ContactUsedToggle({
  contactId,
  initialUsed,
}: {
  contactId: string;
  initialUsed: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [used, setUsed] = useState(initialUsed);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (pending) return;
    const target = !used;
    setUsed(target);
    setPending(true);
    try {
      const result = await setContactUsedAction({ contactId, used: target });
      if (!result.success) {
        setUsed(!target);
        showToast("error", result.error);
        router.refresh();
        return;
      }
      setUsed(result.data?.used ?? target);
    } catch {
      setUsed(!target);
      showToast("error", "Zápis se nepodařilo uložit.");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return <UsedToggleButton used={used} pending={pending} onClick={handleClick} />;
}
