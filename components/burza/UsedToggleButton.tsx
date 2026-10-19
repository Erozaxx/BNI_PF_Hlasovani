import { Button } from "@/components/ui/Button";
import { TEXTS } from "@/lib/burza/rules";

/**
 * Přepínač „Využil(a) jsem“ (prezentační). Popisek je stálý, stav nese
 * `aria-pressed` a ikona: prázdný čtvereček, nebo fajfka. Zaškrtnutý stav je
 * jemný (okraj a světlé pozadí v barvě `primary`). 44 px, pod `sm` na celou šířku.
 */
export function UsedToggleButton({
  used,
  pending,
  onClick,
}: {
  used: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-pressed={used}
      aria-busy={pending}
      disabled={pending}
      onClick={onClick}
      className={`min-h-[44px] w-full sm:w-auto ${
        used ? "!border-primary bg-primary/10 font-medium text-text-main hover:!bg-primary/15" : ""
      }`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className="h-5 w-5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <rect x="3" y="3" width="14" height="14" rx="3" />
        {used && <path d="M6.5 10.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {TEXTS.usedToggle}
    </Button>
  );
}
