import type { PendingRow } from "@/lib/semafor/pending";
import { formatCzDate } from "@/lib/members/activity";
import { pointsText } from "@/lib/text/plural";
import { SEMAFOR_TEXTS, pendingWhatText } from "@/lib/semafor/texts";

const NO_FROM = SEMAFOR_TEXTS.pendingNoFrom;

function MemberCell({ row }: { row: PendingRow }) {
  return (
    <span className="font-medium text-text-main">
      {row.memberName}
      {!row.active && <span className="ml-1 font-normal text-text-muted">{SEMAFOR_TEXTS.overviewInactive}</span>}
    </span>
  );
}

/**
 * iter-045 (arch 3.3, gate 4.3): seznam „Čeká na započtení“ v Přehledu. Od
 * `md` tabulka, na 390 px karty pod sebou (vzor `OverviewTable`). Server
 * komponenta za `semafor.view_all`. Řádek nemá pole `note`: text poděkování
 * ani popis ostatní práce se tu nevypisuje (gate Q3).
 */
export function PendingList({ rows }: { rows: PendingRow[] }) {
  const [cDate, cMember, cWhat, cFrom, cPoints] = SEMAFOR_TEXTS.pendingColumns;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-3 font-medium">{cDate}</th>
              <th className="py-2 pr-3 font-medium">{cMember}</th>
              <th className="py-2 pr-3 font-medium">{cWhat}</th>
              <th className="py-2 pr-3 font-medium">{cFrom}</th>
              <th className="py-2 text-right font-medium">{cPoints}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.key} className="align-top">
                <td className="whitespace-nowrap py-2 pr-3">{formatCzDate(row.date)}</td>
                <td className="py-2 pr-3">
                  <MemberCell row={row} />
                </td>
                <td className="py-2 pr-3">{pendingWhatText(row.category, row.detail)}</td>
                <td className="py-2 pr-3">{row.fromName ?? NO_FROM}</td>
                <td className="whitespace-nowrap py-2 text-right">{pointsText(row.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={row.key} className="rounded-card border border-border bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <MemberCell row={row} />
              <span className="font-medium text-text-main">{pointsText(row.points)}</span>
            </div>
            <p className="mt-1 text-text-main">{pendingWhatText(row.category, row.detail)}</p>
            <p className="mt-1 text-text-muted">
              {`${formatCzDate(row.date)} · ${cFrom}: ${row.fromName ?? NO_FROM}`}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
