import Link from "next/link";
import { POINT_TEXTS, SEMAFOR_TEXTS } from "@/lib/semafor/texts";

export type SemaforTab = "mine" | "overview" | "points" | "import";

/**
 * iter-041 (arch 6.2): záložky Semaforu. „Můj semafor“ vidí každý, „Přehled“
 * jen s `semafor.view_all`, „Body“ jen s `semafor.points` (iter-044) a „Import“
 * jen s `semafor.import`. Běžný člen žádné záložky nevidí (jen svůj semafor).
 * Server komponenta, jen odkazy. Čtyři záložky se na 390 px posouvají vodorovně.
 */
export function SemaforTabs({
  active,
  canViewAll,
  canImport,
  canPoints = false,
}: {
  active: SemaforTab;
  canViewAll: boolean;
  canImport: boolean;
  canPoints?: boolean;
}) {
  if (!canViewAll && !canImport && !canPoints) return null;
  const tabs: { id: SemaforTab; href: string; label: string }[] = [
    { id: "mine", href: "/semafor", label: SEMAFOR_TEXTS.tabMy },
    ...(canViewAll ? [{ id: "overview" as const, href: "/semafor/prehled", label: SEMAFOR_TEXTS.tabOverview }] : []),
    ...(canPoints ? [{ id: "points" as const, href: "/semafor/body", label: POINT_TEXTS.tabPoints }] : []),
    ...(canImport ? [{ id: "import" as const, href: "/semafor/import", label: SEMAFOR_TEXTS.tabImport }] : []),
  ];
  return (
    <nav aria-label={SEMAFOR_TEXTS.nav} className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={`min-h-[44px] whitespace-nowrap rounded-t-lg px-3 py-2.5 sm:px-4 text-sm font-medium focus:outline-none focus:shadow-focus ${
            t.id === active
              ? "border border-b-0 border-border bg-surface text-primary"
              : "text-text-muted hover:bg-background hover:text-text-main"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
