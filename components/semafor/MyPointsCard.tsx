import { Card } from "@/components/ui/Card";
import { BONUS_POINTS, CATEGORY_CAPS } from "@/lib/semafor/bonus";
import type { MyPointRow } from "@/lib/db/queries/semafor-points";
import { formatCzDate } from "@/lib/members/activity";
import { POINT_TEXTS, categoryCapText, categoryName, monthLabel } from "@/lib/semafor/texts";
import { pointsText } from "@/lib/text/plural";

function detailOf(r: MyPointRow): string {
  if (r.category === "activity") return r.activityTitle ?? POINT_TEXTS.noValue;
  if (r.category === "host_member") return r.refName ?? POINT_TEXTS.noValue;
  return r.note?.trim() ? r.note : POINT_TEXTS.noValue;
}

function pointsOf(r: MyPointRow): number {
  if (r.category === "work") return r.points ?? 0;
  return BONUS_POINTS[r.category];
}

/**
 * iter-044 (arch 7.1): „Body za 6 měsíců“. Vlastní záznamy přihlášeného člena
 * (`points` ze `listMyPoints(session.memberId, …)`), nejnovější první: datum,
 * kategorie, body, od koho (smazaný autor je „bývalý člen“) a text. Záznam po
 * konci měsíce snímku má dovětek „započte se s daty za {měsíc}“. Prázdný seznam
 * = karta se nevykreslí (bonus má vlastní větu `bonusNone`).
 */
export function MyPointsCard({
  points,
  afterDate,
  nextMonth,
}: {
  points: MyPointRow[];
  /** Poslední den měsíce snímku, `null` = žádný snímek. */
  afterDate: string | null;
  nextMonth: string | null;
}) {
  if (points.length === 0) return null;
  const hasThanks = points.some((r) => r.category === "thanks");
  // F-10: seznam ukazuje každý záznam, do bonusu se počítá nejvýš podstrop kategorie.
  const sum = (c: "thanks" | "activity") =>
    points.filter((r) => r.category === c).reduce((acc, r) => acc + pointsOf(r), 0);
  const capNotes = (["thanks", "activity"] as const)
    .filter((c) => sum(c) > CATEGORY_CAPS[c])
    .map((c) => categoryCapText(c));
  return (
    <Card>
      <h2 className="text-base font-semibold text-text-main">{POINT_TEXTS.myPointsTitle}</h2>
      <ul className="mt-2 divide-y divide-border">
        {points.map((r) => (
          <li key={r.id} className="py-2 text-sm">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium text-text-main">
                {`${categoryName(r.category)}: ${pointsText(pointsOf(r))}`}
              </span>
              <span className="text-text-muted">{formatCzDate(r.earnedOn)}</span>
            </p>
            <p className="text-text-main">{detailOf(r)}</p>
            <p className="text-text-muted">
              {POINT_TEXTS.pointFrom.replace("{jméno}", r.authorName ?? POINT_TEXTS.formerMember)}
              {afterDate && nextMonth && r.earnedOn > afterDate
                ? `, ${POINT_TEXTS.pointLater.replace("{měsíc}", monthLabel(nextMonth))}`
                : ""}
            </p>
          </li>
        ))}
      </ul>
      {capNotes.length > 0 && <p className="mt-2 text-sm text-text-muted">{capNotes.join(" ")}</p>}
      {hasThanks && <p className="mt-2 text-sm text-text-muted">{POINT_TEXTS.thanksReport}</p>}
    </Card>
  );
}
