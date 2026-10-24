import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { FEATURE_OFF_PAGE_TEXT, SETTINGS_LINK_LABEL } from "@/lib/chapter/texts";

/**
 * iter-042 (gate Z10): místo obsahu vypnuté části. Bez přesměrování, aby odkaz
 * ze záložky nebo z mailu řekl, co se děje. Držitel práva `chapter.settings`
 * dostane odkaz na Nastavení chapteru, ostatní jen větu.
 */
export function FeatureOff({ canManageSettings = false }: { canManageSettings?: boolean }) {
  const [before, after] = FEATURE_OFF_PAGE_TEXT.split(SETTINGS_LINK_LABEL);
  return (
    <Card>
      <p className="text-base text-text-main" data-testid="feature-off">
        {canManageSettings ? (
          <>
            {before}
            <Link
              href="/admin/nastaveni"
              className="inline-flex min-h-[44px] items-center font-semibold text-navy underline"
            >
              {SETTINGS_LINK_LABEL}
            </Link>
            {after}
          </>
        ) : (
          FEATURE_OFF_PAGE_TEXT
        )}
      </p>
    </Card>
  );
}
