import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { getMeetingsForDates } from "@/lib/db/queries/meetings";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { addDaysIso, findDraftWarnings } from "@/lib/meetings/draft-warning";

/** "YYYY-MM-DD" -> "D. M." (bez roku — arch iter-026 8.2 doslova). */
function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${m}.`;
}

/**
 * Pruh nad neaktivovanou schůzkou (arch iter-026 T-001, sekce 8). Renderuje
 * se v app/(app)/layout.tsx nad {children}, na KAŽDÉ stránce aplikace —
 * záměrně ne jen na dashboardu, protože příčinou incidentu 13. 8. bylo, že
 * "nikde to nesvítilo", ne že by na dashboard nikdo nepřišel.
 *
 * Self-gating: server component si sám čte session (iron-session, cookie,
 * bez DB dotazu) a při ne-management uživateli i při žádné relevantní
 * schůzce vrací `null` — žádný prázdný box, žádný posun layoutu (arch 8.2).
 */
export async function DraftMeetingBanner() {
  const session = await getSession();
  const isManagement =
    session.managementRole === "admin" || session.managementRole === "moderator";
  if (!isManagement) return null;

  const today = todayInPrague();
  const tomorrow = addDaysIso(today, 1);
  const meetings = await getMeetingsForDates([today, tomorrow]);
  const warnings = findDraftWarnings(meetings, today);

  if (warnings.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {warnings.map((w) => {
        const isToday = w.level === "today";
        const colorClasses = isToday
          ? "bg-red-50 border-red-300 text-red-800"
          : "bg-yellow-50 border-yellow-300 text-yellow-800";

        return (
          <div
            key={w.meetingId}
            className={`flex flex-col gap-2 rounded-lg border p-3 text-sm sm:flex-row sm:items-center sm:justify-between ${colorClasses}`}
          >
            <span>
              Schůzka {formatDateShort(w.date)} je{" "}
              <strong>{isToday ? "dnes" : "zítra"}</strong> a hlasování{" "}
              {isToday ? "neběží" : "zatím neběží"}.
            </span>
            <Link
              href={`/meetings/${w.meetingId}`}
              className="shrink-0 font-medium underline underline-offset-2"
            >
              Spustit hlasování →
            </Link>
          </div>
        );
      })}
    </div>
  );
}
