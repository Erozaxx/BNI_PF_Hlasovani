import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import type { SemaforColor } from "@/lib/semafor/color";
import { SEMAFOR_TEXTS } from "@/lib/semafor/texts";

const VARIANT: Record<SemaforColor, BadgeVariant> = {
  green: "success",
  yellow: "warning",
  red: "danger",
  grey: "neutral",
};

/**
 * iter-041 (arch 6.2): barevný štítek semaforu. Barva není jediný nositel
 * informace: štítek vždy nese název barvy textem (`aria` i viditelně), nepovinné
 * `score` se přidá za tečku („Zelená · 74“).
 */
export function ColorBadge({
  color,
  text,
  size = "md",
}: {
  color: SemaforColor;
  /** Celý text štítku, jinak jen název barvy. */
  text?: string;
  size?: "md" | "lg";
}) {
  return (
    <Badge
      variant={VARIANT[color]}
      className={size === "lg" ? "!px-4 !py-1.5 !text-base !font-semibold" : ""}
    >
      {text ?? SEMAFOR_TEXTS.colors[color]}
    </Badge>
  );
}
