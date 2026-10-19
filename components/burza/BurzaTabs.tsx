import Link from "next/link";
import { TEXTS } from "@/lib/burza/rules";

/**
 * Záložky Burzy pomoci: dva odkazy na dvě stránky (`/burza`, `/burza/kontakty`),
 * takže funguje tlačítko zpět, přímý odkaz i provoz bez JS. Aktivní záložka má
 * `aria-current="page"` a plné podtržení. Každý odkaz 44 px, na úzkém displeji
 * dvě poloviny šířky.
 */
export function BurzaTabs({ active }: { active: "help" | "contacts" }) {
  const tabs = [
    { key: "help", href: "/burza", label: TEXTS.tabHelp },
    { key: "contacts", href: "/burza/kontakty", label: TEXTS.tabContacts },
  ] as const;

  return (
    <nav aria-label={TEXTS.tabsLabel} className="flex border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`flex min-h-[44px] flex-1 items-center justify-center border-b-2 px-4 text-sm font-medium focus:outline-none focus:shadow-focus ${
            t.key === active
              ? "border-primary text-text-main underline underline-offset-4"
              : "border-transparent text-text-muted hover:text-text-main"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
