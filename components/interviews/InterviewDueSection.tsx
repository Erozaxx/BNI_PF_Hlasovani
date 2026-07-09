import { getInterviewDueList } from "@/lib/db/queries/interviews";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

/**
 * "Pohovory k zalozeni" widget (arch section 7.2, T-006d) — admin/moderator
 * only, computed-on-read (no cron, per závazné rozhodnutí 3). Purely
 * informational: it lists members whose 5- or 10-month interview is due or
 * coming up, plus the "unverified joined_at" heuristic (arch 7.1). It does
 * NOT offer a "founding" action — creating the interview itself is T-007.
 *
 * Caller is responsible for only rendering this for admin/moderator sessions.
 */
export async function InterviewDueSection() {
  const entries = await getInterviewDueList();

  const due = entries.filter((e) => e.due5 || e.due10);
  const upcoming = entries.filter(
    (e) => !e.due5 && !e.due10 && (e.upcoming5 || e.upcoming10)
  );

  if (due.length === 0 && upcoming.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-main">
          Pohovory k zalozeni (5 / 10 mesicu)
        </h2>
        {due.length > 0 && <Badge variant="danger">{due.length}</Badge>}
      </div>

      <Card>
        <ul className="divide-y divide-border">
          {due.map((entry) => (
            <DueRow key={`due-${entry.memberId}`} entry={entry} />
          ))}
          {upcoming.map((entry) => (
            <DueRow key={`upcoming-${entry.memberId}`} entry={entry} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

function daysLabel(days: number): string {
  if (days === 1) return "den";
  if (days >= 2 && days <= 4) return "dny";
  return "dni";
}

function DueRow({
  entry,
}: {
  entry: Awaited<ReturnType<typeof getInterviewDueList>>[number];
}) {
  return (
    <li className="py-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <span className="font-medium text-text-main">{entry.memberName}</span>
        {entry.joinedAtUnverified && (
          <Badge variant="warning" className="ml-2">
            Neoverene datum vstupu
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2 items-center text-sm">
        {entry.due5 && entry.due5SinceDays !== null && (
          <Badge variant="danger">
            5 mesicu — po terminu {entry.due5SinceDays}{" "}
            {daysLabel(entry.due5SinceDays)}
          </Badge>
        )}
        {entry.due10 && entry.due10SinceDays !== null && (
          <Badge variant="danger">
            10 mesicu — po terminu {entry.due10SinceDays}{" "}
            {daysLabel(entry.due10SinceDays)}
          </Badge>
        )}
        {!entry.due5 && entry.upcoming5 && (
          <Badge variant="info">5 mesicu — blizi se</Badge>
        )}
        {!entry.due10 && entry.upcoming10 && (
          <Badge variant="info">10 mesicu — blizi se</Badge>
        )}
      </div>
    </li>
  );
}
