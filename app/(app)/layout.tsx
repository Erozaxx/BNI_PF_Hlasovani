export const dynamic = "force-dynamic";

import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can, hasPasswordSession } from "@/lib/auth/permissions";
import { sessionHeaderLabel } from "@/lib/members/labels";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/Button";
import { MobileNav } from "@/components/layout/MobileNav";
import { DraftMeetingBanner } from "@/components/meetings/DraftMeetingBanner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // iter-032 (7.3): plné načtení bez ověřené session -> /login. Rozhodující
  // je volání ve stránce, layout se při měkké navigaci nevykresluje.
  const session = await requirePageSession();
  // iter-037 (arch 6.3): menu podle práv. Dnešní moderátor vidí totéž co
  // před iter-037 (Akce, Časovače, Pohovory, Provoz, Heslo), Členové a
  // Kategorie jen admin (`members.manage`, `categories.manage`).
  // iter-042: vypnuté části (Master mind, Burza, Semafor) zmizí z menu.
  const settings = await getChapterSettings();
  const show = {
    mastermind: settings.mastermindEnabled,
    burza: settings.burzaEnabled,
    semafor: settings.semaforEnabled,
    chapterSettings: can(session, "chapter.settings"),
    events: can(session, "events.manage"),
    timers: can(session, "timers.manage"),
    interviews: can(session, "interviews.manage"),
    status: can(session, "ops.view"),
    members: can(session, "members.manage"),
    categories: can(session, "categories.manage"),
    settings: hasPasswordSession(session),
  };

  // iter-037 (T-003c): v záhlaví funkce a role, ne jen technická role.
  const headerLabel = sessionHeaderLabel(session);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex md:flex-col md:w-60 bg-surface border-r border-border">
        <div className="p-6">
          <Link href="/dashboard" className="text-xl font-bold text-primary">
            BNI Plzeň
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          <NavLink href="/dashboard">Dashboard</NavLink>
          <NavLink href="/guests">Hosté</NavLink>
          <NavLink href="/meetings">Schůzky</NavLink>
          {show.mastermind && <NavLink href="/mastermind">Master mind</NavLink>}
          {show.burza && <NavLink href="/burza">Burza pomoci</NavLink>}
          {show.semafor && <NavLink href="/semafor">Semafor</NavLink>}
          <NavLink href="/dochazka">Docházka</NavLink>
          {show.events && <NavLink href="/events">Akce</NavLink>}
          {show.timers && <NavLink href="/timers">Časovače</NavLink>}
          {show.interviews && <NavLink href="/interviews">Pohovory</NavLink>}
          {show.status && <NavLink href="/status">Provoz</NavLink>}
          <NavLink href="/archive">Archiv</NavLink>
          <NavLink href="/help">Nápověda</NavLink>

          {(show.members || show.categories || show.chapterSettings) && (
            <>
              <div className="pt-4 pb-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Admin
                </span>
              </div>
              {show.members && <NavLink href="/admin/members">Členové</NavLink>}
              {show.categories && <NavLink href="/admin/categories">Kategorie</NavLink>}
              {show.chapterSettings && (
                <NavLink href="/admin/nastaveni">Nastavení chapteru</NavLink>
              )}
            </>
          )}

          {show.settings && (
            <>
              <div className="pt-4 pb-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Účet
                </span>
              </div>
              <NavLink href="/settings">Heslo</NavLink>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="text-sm text-text-muted mb-2">
            {session.name || "Uživatel"}
            {headerLabel && (
              <span className="ml-1 text-xs text-primary">
                ({headerLabel})
              </span>
            )}
          </div>
          <form action={logoutAction}>
            <Button variant="ghost" size="sm" type="submit">
              Odhlásit se
            </Button>
          </form>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="md:hidden flex items-center justify-between p-4 bg-surface border-b border-border">
          <Link href="/dashboard" className="text-lg font-bold text-primary">
            BNI Hlasování
          </Link>
          <MobileNav
            show={show}
            name={session.name || "Uživatel"}
          />
        </header>

        <main className="flex-1 p-4 md:p-8">
          <DraftMeetingBanner />
          {children}
        </main>
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
