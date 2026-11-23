import Link from "next/link";
import { GUIDE_LINK_TEXT, GUIDE_PATH } from "@/lib/situations/guide";
import { MemberPicker } from "@/components/situations/MemberPicker";
import type { OverviewRow, SelectableMember } from "@/lib/db/queries/client-situations";
import {
  SLOTS,
  UI_TEXTS,
  cardsLabel,
  situationHeading,
  situationStatus,
  situationStatusLabel,
} from "@/lib/situations/rules";

/**
 * iter-049 (arch 7.2, gate změny 3, 6): přehled `/situace`. Nahoře tři situace
 * přihlášeného, pod nimi aktivní členové s nadpisy jejich situací. Prázdné
 * pole je „–“ bez vatové věty. Blok „Pro vedení“ jen s `situations.manage`,
 * vedení přihlášené odkazem dostane větu o přihlášení heslem.
 */
export function SituationsOverview({
  viewerId,
  rows,
  deadlineActive,
  canManage,
  leadershipViaLink,
  members,
}: {
  viewerId: string;
  rows: OverviewRow[];
  deadlineActive: boolean;
  canManage: boolean;
  leadershipViaLink: boolean;
  members: SelectableMember[];
}) {
  const byMember = new Map<string, { name: string; rows: OverviewRow[] }>();
  for (const r of rows) {
    const entry = byMember.get(r.memberId) ?? { name: r.name, rows: [] };
    if (r.slot !== null) entry.rows.push(r);
    byMember.set(r.memberId, entry);
  }
  const mine = byMember.get(viewerId)?.rows ?? [];
  const others = [...byMember.entries()].filter(([id]) => id !== viewerId);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-main">{UI_TEXTS.pageTitle}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {UI_TEXTS.intro}
          {deadlineActive && ` ${UI_TEXTS.deadline}`}
        </p>
        <Link
          href={GUIDE_PATH}
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-navy underline hover:text-primary-hover focus:outline-none focus:shadow-focus"
        >
          {GUIDE_LINK_TEXT}
        </Link>
      </div>

      <section aria-labelledby="situations-mine" className="space-y-3">
        <h2 id="situations-mine" className="text-lg font-semibold text-text-main">
          {UI_TEXTS.mine}
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {SLOTS.map((slot) => {
            const s = mine.find((r) => r.slot === slot);
            const status = situationStatus({
              touched: s?.touched ?? false,
              hasOriginal: s?.hasOriginal ?? false,
            });
            return (
              <li key={slot}>
                <Link
                  href={`/situace/${viewerId}?s=${slot}`}
                  className="flex min-h-[44px] flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm hover:bg-background focus:outline-none focus:shadow-focus"
                >
                  <span className="font-medium text-text-main">
                    {slot}. {s ? situationHeading(s) : UI_TEXTS.empty}
                  </span>
                  <span className="text-xs text-text-muted">
                    {cardsLabel(s?.itemCount ?? 0)}, {situationStatusLabel(status)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <Link
          href={`/situace/${viewerId}`}
          className="inline-flex min-h-[44px] items-center rounded-btn bg-primary px-6 text-sm font-semibold text-white hover:bg-primary-hover focus:outline-none focus:shadow-focus"
        >
          {UI_TEXTS.fillMine}
        </Link>
      </section>

      <section aria-labelledby="situations-all" className="space-y-3">
        <h2 id="situations-all" className="text-lg font-semibold text-text-main">
          {UI_TEXTS.cardsOverview}
        </h2>
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {others.map(([id, m]) => {
            const headings = m.rows.map((r) => situationHeading(r)).filter((h) => h !== UI_TEXTS.empty);
            const total = m.rows.reduce((sum, r) => sum + r.itemCount, 0);
            return (
              <li key={id}>
                <Link
                  href={`/situace/${id}`}
                  className="block min-h-[44px] px-4 py-2 text-sm hover:bg-background focus:outline-none focus:shadow-focus"
                >
                  <span className="block font-medium text-text-main">{m.name}</span>
                  <span className="block text-xs text-text-muted">
                    {headings.length > 0 ? headings.join(" · ") : UI_TEXTS.empty}
                    {total > 0 && ` (${cardsLabel(total)})`}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <a
          href="/api/situace/export/csv"
          className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline hover:text-primary-hover focus:outline-none focus:shadow-focus"
        >
          {UI_TEXTS.downloadCsv}
        </a>
      </section>

      {canManage && (
        <section aria-labelledby="situations-management" className="space-y-3">
          <h2 id="situations-management" className="text-lg font-semibold text-text-main">
            {UI_TEXTS.forLeadership}
          </h2>
          <MemberPicker members={members} />
          <a
            href="/api/situace/export/json"
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-primary underline hover:text-primary-hover focus:outline-none focus:shadow-focus"
          >
            {UI_TEXTS.downloadJson}
          </a>
        </section>
      )}
      {!canManage && leadershipViaLink && (
        <p className="text-sm text-text-muted">{UI_TEXTS.leadershipViaLink}</p>
      )}
    </div>
  );
}
