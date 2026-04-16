"use client";

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DeleteTimerButton } from "./DeleteTimerButton";
import type { Timer } from "@/lib/db/queries/timers";

interface TimerCardProps {
  timer: Timer;
}

function formatMMSS(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TimerCard({ timer: t }: TimerCardProps) {
  const { showToast } = useToast();

  const viewUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/t/${t.viewToken}`;
  const controlUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/t/${t.controlToken}/control`;

  async function copyToClipboard(url: string, label: string) {
    try {
      await navigator.clipboard.writeText(url);
      showToast("success", `${label} zkopirovan.`);
    } catch {
      showToast("error", "Kopirovani selhalo — zkopirujte rucne.");
    }
  }

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="font-medium text-text-main">{t.name}</span>
          <div className="flex items-center gap-2">
            <Badge variant={t.status === "running" ? "success" : "neutral"}>
              {t.status === "running" ? "Bezi" : "Pozastaveno"}
            </Badge>
            <span className="text-sm text-text-muted">
              {formatMMSS(t.displaySeconds)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => copyToClipboard(viewUrl, "Zobrazovaci link")}
          >
            Kopirovat zobrazovaci link
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => copyToClipboard(controlUrl, "Ovladaci link")}
          >
            Kopirovat ovladaci link
          </Button>
          <DeleteTimerButton
            controlToken={t.controlToken}
            timerName={t.name}
          />
        </div>
      </div>
    </Card>
  );
}
