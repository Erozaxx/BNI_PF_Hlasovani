export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/Button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const isAdmin = session.managementRole === "admin";
  const isManagement =
    session.managementRole === "admin" ||
    session.managementRole === "moderator";

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex md:flex-col md:w-60 bg-surface border-r border-border">
        <div className="p-6">
          <Link href="/dashboard" className="text-xl font-bold text-primary">
            BNI Plzen
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/guests">Hoste</NavLink>
          <NavLink href="/meetings">Schuzky</NavLink>
          <NavLink href="/archive">Archiv</NavLink>

          {isAdmin && (
            <>
              <div className="pt-4 pb-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Admin
                </span>
              </div>
              <NavLink href="/admin/members">Clenove</NavLink>
              <NavLink href="/admin/categories">Kategorie</NavLink>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="text-sm text-text-muted mb-2">
            {session.name || "Uzivatel"}
            {session.managementRole && (
              <span className="ml-1 text-xs text-primary">
                ({session.managementRole})
              </span>
            )}
          </div>
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" type="submit">
              Odhlasit se
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1">
        <header className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-border">
          <Link href="/dashboard" className="text-lg font-bold text-primary">
            BNI Hlasovani
          </Link>
          <MobileNav
            isAdmin={isAdmin}
            isManagement={isManagement}
            name={session.name || "Uzivatel"}
          />
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-lg text-sm font-medium text-text-main hover:bg-background transition-colors focus:outline-none focus:shadow-focus"
    >
      {children}
    </Link>
  );
}

function MobileNav({
  isAdmin,
  isManagement,
  name,
}: {
  isAdmin: boolean;
  isManagement: boolean;
  name: string;
}) {
  return (
    <details className="relative">
      <summary className="cursor-pointer p-2 rounded-lg hover:bg-background list-none">
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </summary>
      <div className="absolute right-0 top-full mt-2 w-56 bg-surface border border-border rounded-card shadow-lg z-50 p-2">
        <Link
          href="/dashboard"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
        >
          Dashboard
        </Link>
        <Link
          href="/guests"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
        >
          Hoste
        </Link>
        <Link
          href="/meetings"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
        >
          Schuzky
        </Link>
        <Link
          href="/archive"
          className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
        >
          Archiv
        </Link>
        {isAdmin && (
          <>
            <hr className="my-2 border-border" />
            <Link
              href="/admin/members"
              className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
            >
              Clenove
            </Link>
            <Link
              href="/admin/categories"
              className="block px-3 py-2 rounded-lg text-sm hover:bg-background"
            >
              Kategorie
            </Link>
          </>
        )}
        <hr className="my-2 border-border" />
        <div className="px-3 py-1 text-xs text-text-muted">{name}</div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="w-full text-left px-3 py-2 rounded-lg text-sm text-danger hover:bg-danger-light"
          >
            Odhlasit se
          </button>
        </form>
      </div>
    </details>
  );
}
