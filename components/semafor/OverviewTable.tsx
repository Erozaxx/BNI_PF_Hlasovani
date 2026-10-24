import type { OverviewItem } from "@/lib/semafor/overview";
import { SEMAFOR_TEXTS, colorBadgeText, fmtNum, myBonusText } from "@/lib/semafor/texts";
import { ColorBadge } from "@/components/semafor/ColorBadge";
import { AreaList } from "@/components/semafor/AreaList";
import { DeleteRowButton } from "@/components/semafor/DeleteButtons";

const DASH = SEMAFOR_TEXTS.overviewNoValue;

function NameCell({ item }: { item: OverviewItem }) {
  return (
    <span className="font-medium text-text-main">
      {item.name}
      {!item.active && <span className="ml-1 font-normal text-text-muted">{SEMAFOR_TEXTS.overviewInactive}</span>}
    </span>
  );
}

function ColorCell({ item }: { item: OverviewItem }) {
  if (!item.hasData || item.internal === null || item.internalColor === null) {
    return <span className="text-text-muted">{DASH}</span>;
  }
  return <ColorBadge color={item.internalColor} text={colorBadgeText(item.internalColor, item.internal)} />;
}

function BniCell({ item }: { item: OverviewItem }) {
  if (!item.hasData || item.total === null || item.bniColor === null) {
    return <span className="text-text-muted">{DASH}</span>;
  }
  return <span>{`${SEMAFOR_TEXTS.colors[item.bniColor]} · ${fmtNum(item.total)}`}</span>;
}

/**
 * iter-041 (arch 6.2, gate Z5, Z7, Z8): přehled se jmény pro držitele
 * `semafor.view_all`. Desktop tabulka, na 390 px karty. Tlačítko Smazat řádek
 * jen s `semafor.import`. Server komponenta, žádná data nejdou mimo vedení.
 */
export function OverviewTable({
  month,
  items,
  canDelete,
}: {
  month: string;
  items: OverviewItem[];
  canDelete: boolean;
}) {
  const [cMember, cColor, cScore, cBni, cBonus] = SEMAFOR_TEXTS.overviewColumns;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 pr-3 font-medium">{cMember}</th>
              <th className="py-2 pr-3 font-medium">{cColor}</th>
              <th className="py-2 pr-3 font-medium">{cScore}</th>
              <th className="py-2 pr-3 font-medium">{cBni}</th>
              <th className="py-2 pr-3 font-medium">{cBonus}</th>
              <th className="py-2 font-medium">{SEMAFOR_TEXTS.areas}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => (
              <tr key={item.memberId} className="align-top">
                <td className="py-2 pr-3">
                  <NameCell item={item} />
                </td>
                <td className="py-2 pr-3">
                  <ColorCell item={item} />
                </td>
                <td className="py-2 pr-3">{item.internal === null ? DASH : fmtNum(item.internal)}</td>
                <td className="py-2 pr-3">
                  <BniCell item={item} />
                </td>
                <td className="py-2 pr-3">{item.bonus === null ? DASH : `+${fmtNum(item.bonus.bonus)}`}</td>
                <td className="py-2">
                  {item.areas ? (
                    <details>
                      <summary className="flex min-h-[44px] cursor-pointer select-none items-center rounded text-navy focus:outline-none focus:shadow-focus">
                        {SEMAFOR_TEXTS.areas}
                      </summary>
                      <div className="mt-1 min-w-[16rem]">
                        <AreaList areas={item.areas} />
                      </div>
                    </details>
                  ) : (
                    <span className="text-text-muted">{DASH}</span>
                  )}
                  {canDelete && item.hasData && (
                    <div className="mt-1">
                      <DeleteRowButton month={month} memberId={item.memberId} name={item.name} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {items.map((item) => (
          <li key={item.memberId} className="rounded-card border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <NameCell item={item} />
              <ColorCell item={item} />
            </div>
            <p className="mt-2 text-sm text-text-muted">
              {item.hasData && item.bonus && item.total !== null && item.bniColor ? (
                <>
                  <span>{`${SEMAFOR_TEXTS.overviewColumns[3]}: ${SEMAFOR_TEXTS.colors[item.bniColor]} · ${fmtNum(item.total)}`}</span>
                  {" · "}
                  <span>{myBonusText(item.bonus.bonus)}</span>
                </>
              ) : (
                <span>{DASH}</span>
              )}
            </p>
            {item.areas && (
              <details className="mt-1">
                <summary className="flex min-h-[44px] cursor-pointer select-none items-center rounded text-sm font-medium text-navy focus:outline-none focus:shadow-focus">
                  {SEMAFOR_TEXTS.areas}
                </summary>
                <div className="mt-1">
                  <AreaList areas={item.areas} />
                </div>
              </details>
            )}
            {canDelete && item.hasData && (
              <div className="mt-2">
                <DeleteRowButton month={month} memberId={item.memberId} name={item.name} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
