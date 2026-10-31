export const dynamic = "force-dynamic";

import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { pragueToday } from "@/lib/members/activity";
import { monthEnd, monthOf, monthStart, shiftMonth } from "@/lib/attendance/rules";
import {
  countMyEventsAfter,
  getChapterCounts,
  getLatestMonth,
  listMyBonusEvents,
  listMyScores,
} from "@/lib/db/queries/semafor";
import { buildMonthView } from "@/lib/semafor/mine";
import { bonusSources, bonusWindow, hasBonusSource } from "@/lib/semafor/bonus";
import { pointDateRange } from "@/lib/semafor/points";
import {
  POINT_TEXTS,
  SEMAFOR_TEXTS,
  colorBadgeText,
  fmtNum,
  monthLabel,
  myIntroText,
  myMissingText,
} from "@/lib/semafor/texts";
import { listMyPoints, listMyWrittenThanks, listThanksRecipients } from "@/lib/db/queries/semafor-points";
import { MyPointsCard } from "@/components/semafor/MyPointsCard";
import { ThanksCard } from "@/components/semafor/ThanksCard";
import { getChapterSettings } from "@/lib/db/queries/chapter-settings";
import { featureOff } from "@/lib/chapter/feature-guard";
import { FeatureOff } from "@/components/chapter/FeatureOff";
import { Card } from "@/components/ui/Card";
import { ColorBadge } from "@/components/semafor/ColorBadge";
import { SemaforTabs } from "@/components/semafor/SemaforTabs";
import { MyScoreCard } from "@/components/semafor/MyScoreCard";
import { ChapterSummaryCard } from "@/components/semafor/ChapterSummaryCard";

/**
 * iter-041 (arch 6.2, gate Z4, Z8): „Můj semafor“ pro každého přihlášeného.
 * `memberId` je jen ze session, nikdy z URL. Do klientských komponent (a do
 * HTML) jde jen vlastní řádek, vlastní rozpad bonusu a čtyři počty souhrnu
 * chapteru, nikdy řádky ostatních členů.
 *
 * iter-042: vypnutý semafor ukáže `FeatureOff` (Z10), bonus jen ze zapnutých
 * částí (BK2, Z3).
 *
 * iter-044: karty „Body za 6 měsíců“ a „Poděkovat“. `listMyPoints` a
 * `listMyWrittenThanks` se volají jen se `session.memberId`, nikdy s cizím id,
 * cizí body ani poděkování sem nejdou. Bez migrace (chybí tabulky) místo karet
 * věta `readNoTable`, bonus se spočítá bez ručních bodů.
 */
export default async function SemaforPage() {
  const session = await requirePageSession();
  if (await featureOff("semafor")) return <FeatureOff canManageSettings={can(session, "chapter.settings")} />;
  const sources = bonusSources(await getChapterSettings());
  const canViewAll = can(session, "semafor.view_all");
  const canImport = can(session, "semafor.import");
  const canPoints = can(session, "semafor.points");

  const latest = await getLatestMonth();
  let body: React.ReactNode;
  const today = pragueToday();

  if (!latest) {
    body = (
      <Card>
        <p className="text-sm text-text-muted">{SEMAFOR_TEXTS.myNone}</p>
      </Card>
    );
  } else {
    const mine = await listMyScores(session.memberId, 12);
    const events = await listMyBonusEvents(session.memberId, mine.map((r) => r.month), sources);
    const views = mine.map((r) => buildMonthView(r, events));
    const current = views.find((v) => v.month === latest) ?? null;
    const history = views.filter((v) => v.month !== latest);

    const { year, month: m } = monthOf(latest);
    const afterDate = monthEnd(year, m);
    const next = shiftMonth(year, m, 1);
    const laterCount = await countMyEventsAfter(session.memberId, afterDate, today, sources);
    const counts = await getChapterCounts(latest, sources);

    body = (
      <>
        {current ? (
          <MyScoreCard
            view={current}
            later={laterCount > 0 ? { afterDate, nextMonth: monthStart(next.year, next.month) } : null}
            sources={sources}
          />
        ) : (
          <Card>
            <p className="text-sm text-text-main">{myMissingText(latest)}</p>
          </Card>
        )}

        {history.length > 0 && (
          <Card>
            <h2 className="text-base font-semibold text-text-main">{SEMAFOR_TEXTS.history}</h2>
            <ul className="mt-2 divide-y divide-border">
              {history.map((v) => (
                <li key={v.month} className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-text-main">{monthLabel(v.month)}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <ColorBadge color={v.internalColor} text={colorBadgeText(v.internalColor, v.internal)} />
                    {hasBonusSource(sources) && <span className="text-text-muted">{`BNI ${fmtNum(v.total)}`}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <ChapterSummaryCard month={latest} counts={counts} />
      </>
    );
  }

  // iter-044: vlastní záznamy a poděkování. Okno posledního měsíce snímku, jinak 6 měsíců od dneška.
  const pointsAfter = latest ? bonusWindow(latest).after : pointDateRange(today).after;
  const writtenAfter = pointDateRange(today).after;
  const [myPoints, written, recipients] = await Promise.all([
    listMyPoints(session.memberId, pointsAfter, today),
    listMyWrittenThanks(session.memberId, writtenAfter),
    listThanksRecipients(session.memberId),
  ]);
  let snapshotEnd: string | null = null;
  let nextMonthStart: string | null = null;
  if (latest) {
    const { year, month: m } = monthOf(latest);
    snapshotEnd = monthEnd(year, m);
    const nx = shiftMonth(year, m, 1);
    nextMonthStart = monthStart(nx.year, nx.month);
  }
  const pointsBody =
    myPoints.missing || written.missing ? (
      <Card>
        <p className="text-sm text-text-muted">{POINT_TEXTS.readNoTable}</p>
      </Card>
    ) : (
      <>
        <MyPointsCard points={myPoints.value} afterDate={snapshotEnd} nextMonth={nextMonthStart} />
        <ThanksCard recipients={recipients} written={written.value} />
      </>
    );

  return (
    <div className="max-w-3xl space-y-6">
      <SemaforTabs active="mine" canViewAll={canViewAll} canImport={canImport} canPoints={canPoints} />
      <div>
        <h1 className="text-2xl font-bold text-text-main">{SEMAFOR_TEXTS.myTitle}</h1>
        <p className="mt-2 text-sm text-text-muted">{myIntroText(sources)}</p>
      </div>
      {body}
      {pointsBody}
    </div>
  );
}
