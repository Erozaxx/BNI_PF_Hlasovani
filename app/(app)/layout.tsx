export const dynamic = "force-dynamic";

import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { MobileNav } from "@/components/layout/MobileNav";

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
          <NavLink href="/help">Nápověda</NavLink>

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

          {isManagement && (
            <>
              <div className="pt-4 pb-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Ucet
                </span>
              </div>
              <NavLink href="/settings">Nastaveni</NavLink>
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
