import Link from "next/link";
import { OVERVIEW_TEXTS } from "@/lib/attendance/sheet";

export type AttendanceTab = "mine" | "members" | "sheet" | "plan" | "overview";

/**
 * iter-038 (T-003b, gate Z4): záložky Docházky. iter-039 přidala čtvrtou záložku
 * „Omluvy“ (Moje, Zápis, Omluvy, Přehled). Zápis, Omluvy a
 * Přehled se ukazují podle konkrétního práva (`attendance.view_all`), ne podle
 * způsobu přihlášení. Server komponenta, jen odkazy.
 *
 * iter-046 (arch 9.4): záložky se ukazují každému. Bez `attendance.view_all`
 * „Moje“ a „Členové“, s ním navíc „Zápis“, „Omluvy“, „Přehled“.
 *
 * iter-047: „Omluvy“ vidí každý přihlášený (člen jen ke čtení). Bez práva Moje,
 * Členové, Omluvy, s ním Moje, Členové, Zápis, Omluvy, Přehled.
 */
export function AttendanceTabs({ active, canViewAll }: { active: AttendanceTab; canViewAll: boolean }) {
  const tabs: { id: AttendanceTab; href: string; label: string }[] = [
    { id: "mine", href: "/dochazka", label: OVERVIEW_TEXTS.tabMine },
    { id: "members", href: "/dochazka/clenove", label: OVERVIEW_TEXTS.tabMembers },
    ...(canViewAll
      ? [{ id: "sheet" as const, href: "/dochazka/zapis", label: OVERVIEW_TEXTS.tabSheet }]
      : []),
    { id: "plan", href: "/dochazka/omluvy", label: OVERVIEW_TEXTS.tabPlan },
    ...(canViewAll
      ? [{ id: "overview" as const, href: "/dochazka/prehled", label: OVERVIEW_TEXTS.tabOverview }]
      : []),
  ];
  return (
    <nav aria-label="Docházka" className="mb-4 flex gap-1 border-b border-border">
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
