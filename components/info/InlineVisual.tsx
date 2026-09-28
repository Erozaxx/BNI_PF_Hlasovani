/**
 * Mini osa u kroku (arch 6.1, 6.6). Výchozí obsah pro režim bez JS, pro
 * `prefers-reduced-motion` a pro tisk. Se sticky režimem ji CSS skryje
 * jen vizuálně, čtečky ji dál čtou přes `aria-label`.
 */
import type { VisualKind, VisualStateMap } from "@/lib/info-pages/types";
import { renderVisual } from "./visuals/registry";

function srTextOf(state: unknown): string | undefined {
  if (typeof state === "object" && state !== null && "srText" in state) {
    const text = (state as { srText: unknown }).srText;
    return typeof text === "string" ? text : undefined;
  }
  return undefined;
}

export function InlineVisual<K extends VisualKind>({
  kind,
  state,
}: {
  kind: K;
  state: VisualStateMap[K];
}) {
  const visual = renderVisual(kind, state, "inline");
  if (!visual) return null;
  return (
    <div
      className="info-inline-visual mt-5 rounded-card border border-border bg-surface px-3 py-2.5"
      role="img"
      aria-label={srTextOf(state)}
    >
      {visual}
    </div>
  );
}
