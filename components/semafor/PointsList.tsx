import { BONUS_POINTS } from "@/lib/semafor/bonus";
import type { ManagedPointRow } from "@/lib/db/queries/semafor-points";
import { formatCzDate } from "@/lib/members/activity";
import { DeleteActivityButton, DeletePointButton } from "@/components/semafor/DeleteButtons";
import { POINT_TEXTS, activityParticipantsText, categoryName } from "@/lib/semafor/texts";
import { pointsText } from "@/lib/text/plural";

function pointsOf(r: ManagedPointRow): number {
  return r.category === "work" ? (r.points ?? 0) : BONUS_POINTS[r.category];
}

function detailOf(r: ManagedPointRow): string {
  if (r.category === "host_member") return r.refName ?? POINT_TEXTS.noValue;
  return r.note?.trim() ? r.note : POINT_TEXTS.noValue;
}

/**
 * iter-044 (arch 7.2): seznam „Záznamy za 6 měsíců“ pro držitele
 * `semafor.points`. Karty v jednom sloupci (390 px). Akce jsou seskupené:
 * rozbalení se jmény účastníků a mazáním jednotlivce, „Smazat akci“. Ostatní
 * záznamy mají tlačítko Smazat s potvrzením. Server komponenta, texty
 * poděkování a popisy práce vidí jen vedení.
 */
export function PointsList({ rows }: { rows: ManagedPointRow[] }) {
  const activities = new Map<string, ManagedPointRow[]>();
  const singles: ManagedPointRow[] = [];
  for (const r of rows) {
    if (r.category === "activity" && r.activityId) {
      const g = activities.get(r.activityId) ?? [];
      g.push(r);
      activities.set(r.activityId, g);
    } else {
      singles.push(r);
    }
  }
  if (rows.length === 0) return <p className="text-sm text-text-muted">{POINT_TEXTS.pointsListEmpty}</p>;
  return (
    <ul className="space-y-3">
      {Array.from(activities.entries()).map(([id, group]) => {
        const head = group[0];
        const title = head.activityTitle ?? POINT_TEXTS.noValue;
        return (
          <li key={`a-${id}`} className="rounded-card border border-border bg-surface p-4">
            <details>
              <summary className="flex min-h-[44px] cursor-pointer select-none flex-wrap items-center justify-between gap-2 text-sm font-medium text-text-main focus:outline-none focus:shadow-focus">
                <span>{`${categoryName("activity")} ${title}, ${formatCzDate(head.earnedOn)}: ${activityParticipantsText(group.length)}`}</span>
              </summary>
              <ul className="mt-2 divide-y divide-border">
                {group.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                    <span className="text-text-main">{r.memberName}</span>
                    <DeletePointButton pointId={r.id} category={categoryName("activity")} name={r.memberName} />
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <DeleteActivityButton activityId={id} title={title} participants={group.length} />
              </div>
            </details>
          </li>
        );
      })}
      {singles.map((r) => (
        <li key={r.id} className="rounded-card border border-border bg-surface p-4 text-sm">
          <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="font-medium text-text-main">{`${categoryName(r.category)}: ${pointsText(pointsOf(r))}`}</span>
            <span className="text-text-muted">{formatCzDate(r.earnedOn)}</span>
          </p>
          <p className="text-text-main">{`${POINT_TEXTS.pointsColumns[2]}: ${r.memberName}`}</p>
          <p className="text-text-muted">{`${POINT_TEXTS.pointsColumns[4]}: ${r.authorName ?? POINT_TEXTS.formerMember}`}</p>
          <p className="mt-1 text-text-main">{detailOf(r)}</p>
          <div className="mt-2">
            <DeletePointButton pointId={r.id} category={categoryName(r.category)} name={r.memberName} />
          </div>
        </li>
      ))}
    </ul>
  );
}
