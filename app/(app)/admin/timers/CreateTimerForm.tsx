"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { createTimerAction } from "@/actions/timers";

interface CreatedLinks {
  viewUrl: string;
  controlUrl: string;
}

export function CreateTimerForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [displaySeconds, setDisplaySeconds] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdLinks, setCreatedLinks] = useState<CreatedLinks | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Nazev je povinny.");
      return;
    }
    const seconds = parseInt(displaySeconds, 10);
    if (!displaySeconds || isNaN(seconds) || seconds < 1 || seconds > 86400) {
      setError("Delka musi byt celé cislo 1–86400.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createTimerAction(name.trim(), seconds);
      const origin = window.location.origin;
      setCreatedLinks({
        viewUrl: `${origin}/t/${result.viewToken}`,
        controlUrl: `${origin}/t/${result.controlToken}/control`,
      });
      setName("");
      setDisplaySeconds("");
      showToast("success", "Casovac byl vytvoren. Zkopirujte odkazy nize.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nepodarilo se vytvorit casovac.";
      setError(msg);
      showToast("error", msg);
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("success", `${label} zkopirovan.`);
    } catch {
      showToast("error", "Kopirovani selhalo — zkopirujte rucne.");
    }
  }

  function handleDone() {
    setCreatedLinks(null);
    router.refresh();
  }

  if (createdLinks) {
    return (
      <div className="space-y-4 max-w-xl">
        <p className="text-sm font-semibold text-text-main">
          Casovac byl vytvoren. Zkopirujte oba odkazy — po zavřeni je nelze znovu zobrazit.
        </p>

        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted">Zobrazovaci link (pro publikum)</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 break-all">
                {createdLinks.viewUrl}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(createdLinks.viewUrl, "Zobrazovaci link")}
              >
                Kopirovat
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-muted">Ovladaci link (pro moderatora)</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 break-all">
                {createdLinks.controlUrl}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => copyToClipboard(createdLinks.controlUrl, "Ovladaci link")}
              >
                Kopirovat
              </Button>
            </div>
          </div>
        </div>

        <Button type="button" variant="primary" size="sm" onClick={handleDone}>
          Hotovo — zobrazit seznam
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <Input
        name="name"
        label="Nazev casovace"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Napr. Prezentace clena"
        maxLength={100}
      />
      <Input
        name="displaySeconds"
        label="Delka v sekundach"
        type="number"
        min={1}
        max={86400}
        value={displaySeconds}
        onChange={(e) => setDisplaySeconds(e.target.value)}
        placeholder="Napr. 120"
        error={error}
      />
      <Button type="submit" variant="primary" size="sm" loading={loading}>
        Vytvorit casovac
      </Button>
    </form>
  );
}
