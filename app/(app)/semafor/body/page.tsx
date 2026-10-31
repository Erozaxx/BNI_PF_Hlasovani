export const dynamic = "force-dynamic";

import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { pragueToday } from "@/lib/members/activity";
import { featureOff } from "@/lib/chapter/feature-guard";
import { FeatureOff } from "@/components/chapter/FeatureOff";
import {
  holdsCommitteeFunction,
  listPointsForManagement,
  listRecentNewMembers,
  listThanksRecipients,
} from "@/lib/db/queries/semafor-points";
import { POINT_CATEGORIES, isPointCategory, pointDateRange } from "@/lib/semafor/points";
import { bonusSources } from "@/lib/semafor/bonus";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { POINT_TEXTS, categoryName, workGuideText } from "@/lib/semafor/texts";
import { Card } from "@/components/ui/Card";
import { SemaforTabs } from "@/components/semafor/SemaforTabs";
import { ActivityForm, HostMemberForm, TrainingForm, WorkForm } from "@/components/semafor/PointsForms";
import { PointsList } from "@/components/semafor/PointsList";

/**
 * iter-044 (arch 7.2): záložka „Body“ pro držitele `semafor.points`. Prvním
 * příkazem je `requirePageSession` s právem (bez práva přesměruje na /semafor).
 * Formuláře školení, přivedeného hosta a akcí vidí celé vedení, formulář
 * ostatní práce jen držitel funkce Člen výboru (`holdsCommitteeFunction`,
 * `memberId` jen ze session), ostatním věta `workOnlyCommittee`. Seznam
 * záznamů se jmény a texty vidí jen tahle role. Bez migrace (42P01) místo
 * formulářů a seznamu věta `errNoTable`.
 */
export default async function SemaforPointsPage({
  searchParams,
}: {
  searchParams?: { k?: string | string[] };
}) {
  const session = await requirePageSession({ permission: "semafor.points", denyTo: "/semafor" });
  if (await featureOff("semafor")) return <FeatureOff canManageSettings={can(session, "chapter.settings")} />;

  const sources = bonusSources(await getChapterSettings());
  const today = pragueToday();
  const range = pointDateRange(today);
  const raw = Array.isArray(searchParams?.k) ? searchParams?.k[0] : searchParams?.k;
  const filter = isPointCategory(raw) ? raw : undefined;

  const [isCommittee, members, newMembers, list] = await Promise.all([
    holdsCommitteeFunction(session.memberId),
    listThanksRecipients(session.memberId),
    listRecentNewMembers(range.after, today),
    listPointsForManagement(range.after, today, filter),
  ]);

  // Nejstarší povolené datum je den po hranici okna, nejnovější dnešek.
  const [y, m, d] = range.after.split("-").map(Number);
  const minDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);

  const noTable = newMembers.missing || list.missing;

  return (
    <div className="max-w-3xl space-y-6">
      <SemaforTabs
        active="points"
        canViewAll={can(session, "semafor.view_all")}
        canImport={can(session, "semafor.import")}
        canPoints
      />
      <div>
        <h1 className="text-2xl font-bold text-text-main">{POINT_TEXTS.pointsTitle}</h1>
        <p className="mt-2 text-sm text-text-muted">{POINT_TEXTS.pointsIntro}</p>
      </div>

      {noTable ? (
        <Card>
          <p className="text-sm text-text-muted">{POINT_TEXTS.errNoTable}</p>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            <TrainingForm members={members} min={minDate} max={today} />
            <HostMemberForm members={members} newMembers={newMembers.missing ? [] : newMembers.value} />
            <ActivityForm members={members} min={minDate} max={today} />
            {isCommittee ? (
              <WorkForm members={members} min={minDate} max={today} guide={workGuideText(sources)} />
            ) : (
              <p className="text-sm text-text-muted">{POINT_TEXTS.workOnlyCommittee}</p>
            )}
          </div>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-text-main">{POINT_TEXTS.pointsListTitle}</h2>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
                {POINT_TEXTS.pointsColumns[1]}
                <select
                  name="k"
                  defaultValue={filter ?? ""}
                  className="h-11 rounded-lg border border-border bg-white px-3 text-base"
                >
                  <option value="">{POINT_TEXTS.pointsFilterAll}</option>
                  {POINT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {categoryName(c)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="min-h-[44px] rounded-lg border border-border bg-white px-4 text-sm text-text-main hover:bg-background focus:outline-none focus:shadow-focus"
              >
                {POINT_TEXTS.pointsFilterShow}
              </button>
            </form>
            {list.missing ? null : <PointsList rows={list.value} />}
          </section>
        </>
      )}
    </div>
  );
}
