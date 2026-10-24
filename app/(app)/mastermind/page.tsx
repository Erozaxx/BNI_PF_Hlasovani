import Link from "next/link";
import { requirePageSession } from "@/lib/auth/page-guard";
import { can } from "@/lib/auth/permissions";
import { getCasesForOverview, getThursdayData, type CaseListRow } from "@/lib/db/queries/mastermind";
import { todayInPrague } from "@/lib/meetings/voting-window";
import { sortCases } from "@/lib/mastermind/sort";
import {
  formatDM,
  formatWeekdayDM,
  MESSAGES,
  thursdayOptions,
  type ThursdayOption,
} from "@/lib/mastermind/rules";
import { Card } from "@/components/ui/Card";
import { CaseCard, type CaseCardData } from "@/components/mastermind/CaseCard";
import { ConfirmPresentedButtons } from "@/components/mastermind/ConfirmPresentedButtons";

function toCardData(r: CaseListRow): CaseCardData {
  return {
    id: r.id,
    title: r.title,
    memberId: r.memberId,
    presenterName: r.presenterName,
    situation: r.situation,
    path: r.path,
    takeaway: r.takeaway,
    ask: r.ask,
    status: r.status,
    internalDate: r.internalDate,
    createdDay: r.createdDay,
    interested: r.interested,
  };
}

function byDate(a: CaseListRow, b: CaseListRow): number {
  const da = a.internalDate ?? "";
  const db = b.internalDate ?? "";
  return da < db ? -1 : da > db ? 1 : a.id < b.id ? -1 : 1;
}

export default async function MastermindPage() {
  const session = await requirePageSession();
  const isManagement = can(session, "mastermind.manage");
  const viewer = { memberId: session.memberId, name: session.name, isManagement };
  const today = todayInPrague();

  const rows = await getCasesForOverview();

  let thursdays: ThursdayOption[] | undefined;
  let meetingDates = new Set<string>();
  if (isManagement) {
    const data = await getThursdayData(today);
    meetingDates = new Set(data.meetingDates);
    thursdays = thursdayOptions(today, data.meetingDates, data.caseDates);
  }

  const awaiting = rows
    .filter((r) => r.status === "scheduled" && r.internalDate !== null && r.internalDate < today)
    .sort(byDate);
  const upcoming = rows
    .filter((r) => r.status === "scheduled" && r.internalDate !== null && r.internalDate >= today)
    .sort(byDate);
  const proposed = sortCases(
    rows
      .filter((r) => r.status === "proposed")
      .map((r) => ({ ...r, interestCount: r.interested.length, createdAt: r.createdAtMs }))
  );
  const presented = rows
    .filter((r) => r.status === "presented")
    .sort((a, b) => byDate(b, a));

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-text-main">Master mind</h1>
        <p className="mt-2 text-sm text-text-muted">
          Na interní schůzce přinese jeden člen téma ze své praxe a probereme ho u kulatého stolu. Témata čekají v zásobníku, vedení z něj vybírá.
        </p>
        <div className="mt-4">
          <Link
            href="/mastermind/new"
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-btn bg-primary px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus:shadow-focus sm:w-auto"
          >
            Přihlásit případ
          </Link>
        </div>
      </div>

      {isManagement && awaiting.length > 0 && (
        <section aria-labelledby="mm-awaiting">
          <h2 id="mm-awaiting" className="mb-3 text-lg font-semibold text-text-main">
            Čeká na potvrzení
          </h2>
          <ul className="space-y-3">
            {awaiting.map((r) => (
              <li key={r.id}>
                <Card className="!p-4">
                  <p className="text-sm font-medium text-text-main break-words">
                    Interní {formatDM(r.internalDate ?? "")}: {r.title}, {r.presenterName}
                  </p>
                  <div className="mt-3">
                    <ConfirmPresentedButtons
                      caseId={r.id}
                      mode="scheduled"
                      canConfirm={r.memberId !== session.memberId}
                    />
                    {r.memberId === session.memberId && (
                      <p className="mt-2 text-sm text-text-muted">{MESSAGES.ownCase}</p>
                    )}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="mm-upcoming">
        <h2 id="mm-upcoming" className="mb-3 text-lg font-semibold text-text-main">
          Na řadě
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-text-muted">Zatím není nic zařazeno.</p>
        ) : (
          <div className="space-y-4">
            {upcoming.map((r) => (
              <div key={r.id}>
                <p className="mb-2 text-sm font-semibold text-text-main">
                  {formatWeekdayDM(r.internalDate ?? "")}
                </p>
                <CaseCard
                  data={toCardData(r)}
                  viewer={viewer}
                  today={today}
                  collision={isManagement && r.internalDate !== null && meetingDates.has(r.internalDate)}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="mm-pool">
        <h2 id="mm-pool" className="mb-3 text-lg font-semibold text-text-main">
          Zásobník
        </h2>
        {proposed.length === 0 ? (
          <p className="text-sm text-text-muted">Zásobník je prázdný.</p>
        ) : (
          <div className="space-y-4">
            {proposed.map((r) => (
              <CaseCard
                key={r.id}
                data={toCardData(r)}
                viewer={viewer}
                today={today}
                thursdays={thursdays}
              />
            ))}
          </div>
        )}
      </section>

      {presented.length > 0 && (
        <section aria-labelledby="mm-presented">
          <details>
            <summary
              id="mm-presented"
              className="cursor-pointer select-none py-2 text-lg font-semibold text-text-main focus:outline-none focus:shadow-focus rounded"
            >
              Proběhlé ({presented.length})
            </summary>
            <div className="mt-3 space-y-4">
              {presented.map((r) => (
                <CaseCard key={r.id} data={toCardData(r)} viewer={viewer} today={today} />
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
