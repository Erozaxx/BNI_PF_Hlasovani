import Link from "next/link";
import { OVERVIEW_TEXTS } from "@/lib/attendance/sheet";

export type AttendanceTab = "mine" | "sheet" | "overview";

/**
 * iter-038 (T-003b, gate Z4): záložky Docházky „Moje, Zápis, Přehled“. Zápis a
 * Přehled se ukazují podle konkrétního práva (`attendance.view_all`), ne podle
 * způsobu přihlášení. Server komponenta, jen odkazy.
 */
export function AttendanceTabs({ active, canViewAll }: { active: AttendanceTab; canViewAll: boolean }) {
  if (!canViewAll) return null;
  const tabs: { id: AttendanceTab; href: string; label: string }[] = [
    { id: "mine", href: "/dochazka", label: OVERVIEW_TEXTS.tabMine },
    { id: "sheet", href: "/dochazka/zapis", label: OVERVIEW_TEXTS.tabSheet },
    { id: "overview", href: "/dochazka/prehled", label: OVERVIEW_TEXTS.tabOverview },
  ];
  return (
    <nav aria-label="Docházka" className="mb-4 flex gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          aria-current={t.id === active ? "page" : undefined}
          className={`min-h-[44px] rounded-t-lg px-4 py-2.5 text-sm font-medium focus:outline-none focus:shadow-focus ${
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
