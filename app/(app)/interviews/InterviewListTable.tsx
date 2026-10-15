"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { updateInterviewLeaderAction } from "@/actions/interviews";
import {
  LIST_FILTER_KEYS,
  countActiveFilters,
  filterInterviewList,
  interviewListFilterOptions,
  isLeaderChangeNoop,
  leaderChangeNeedsConfirm,
  parseInterviewListFilters,
  type InterviewListFilterOptions,
  type InterviewListFilters,
  type InterviewListRow,
  type ListFilterField,
} from "@/lib/interviews/list-filters";
import { ColumnFilter, FilterHeader, clearFilters } from "./ColumnFilter";

export interface LeaderOption {
  id: string;
  name: string;
  email: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  month_5: "5 měsíců",
  month_10: "10 měsíců",
};

const STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  open: { label: "Otevřený", variant: "info" },
  submitted: { label: "Odeslaný", variant: "success" },
  cancelled: { label: "Zrušený", variant: "neutral" },
};

const FILTER_COLUMNS: Array<{ field: ListFilterField; label: string; allLabel: string }> = [
  { field: "clen", label: "Člen", allLabel: "Všichni" },
  { field: "typ", label: "Typ", allLabel: "Vše" },
  { field: "stav", label: "Stav", allLabel: "Vše" },
  { field: "vedouci", label: "Vedoucí", allLabel: "Všichni" },
  { field: "odkaz", label: "Odkaz", allLabel: "Vše" },
];

function leaderLabel(m: LeaderOption): string {
  return m.email ? m.name : `${m.name} (bez emailu)`;
}

/**
 * Seznam pohovorů s filtrem u hlaviček, sloupcem Odkaz a změnou vedoucího
 * v řádku (arch iter-032 T-001b 4.2, 6, 7; gate T-004b U1, U2, U4).
 * Řádky přicházejí ze serveru hotové: datumy jako řetězce v Europe/Prague
 * a linkState spočítaný jedním `now` (U1). Členové jdou jednou pro celou
 * tabulku, ne do každého řádku (R1).
 */
export function InterviewListTable({
  rows,
  members,
}: {
  rows: InterviewListRow[];
  members: LeaderOption[];
}) {
  const searchParams = useSearchParams();
  const options = useMemo(() => interviewListFilterOptions(rows), [rows]);
  const filters = parseInterviewListFilters(searchParams, options);
  const visible = filterInterviewList(rows, filters);
  const activeCount = countActiveFilters(filters);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-text-main">
          Seznam pohovorů (
          {activeCount > 0 ? `${visible.length} z ${rows.length}` : rows.length})
        </h2>
        {activeCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px] sm:min-h-0"
            onClick={() => clearFilters("s_")}
          >
            Zrušit filtry
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Zatím žádné pohovory"
            description="Založte první pohovor pomocí formuláře výše."
          />
        </Card>
      ) : (
        <>
          <MobileFilters filters={filters} options={options} activeCount={activeCount} />
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b-2 border-primary text-left">
                  <th className="px-3 sm:px-4 py-3 font-semibold sticky left-0 z-10 bg-surface">
                    <FilterHeader label="Člen" active={filters.clen !== null} />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <FilterHeader label="Typ" active={filters.typ !== null} />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <FilterHeader label="Stav" active={filters.stav !== null} />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <FilterHeader label="Vedoucí" active={filters.vedouci !== null} />
                  </th>
                  <th className="px-4 py-3 font-semibold">
                    <FilterHeader label="Odkaz" active={filters.odkaz !== null} />
                  </th>
                  <th className="px-4 py-3 font-semibold">Založeno</th>
                  <th className="px-4 py-3 font-semibold">Odesláno</th>
                  <th className="px-4 py-3 font-semibold" aria-label="Akce"></th>
                </tr>
                <tr className="hidden sm:table-row border-b border-border">
                  {FILTER_COLUMNS.map((c) => (
                    <th
                      key={c.field}
                      className={`px-4 py-2 ${c.field === "clen" ? "sticky left-0 z-10 bg-surface" : ""}`}
                    >
                      <ColumnFilter
                        column={c.label}
                        paramKey={LIST_FILTER_KEYS[c.field]}
                        value={filters[c.field]}
                        options={options[c.field]}
                        allLabel={c.allLabel}
                        variant="head"
                      />
                    </th>
                  ))}
                  <th colSpan={3}></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-text-muted">
                      Žádný pohovor neodpovídá filtru.{" "}
                      <button
                        type="button"
                        className="text-navy hover:underline"
                        onClick={() => clearFilters("s_")}
                      >
                        Zrušit filtry
                      </button>
                    </td>
                  </tr>
                ) : (
                  visible.map((row, idx) => {
                    const badge = STATUS_BADGE[row.status] ?? {
                      label: row.status,
                      variant: "neutral" as const,
                    };
                    const rowBg = idx % 2 === 1 ? "bg-background" : "bg-surface";
                    return (
                      <tr key={row.id} className={`border-b border-border ${rowBg}`}>
                        <td className={`px-3 sm:px-4 py-3 font-medium sticky left-0 z-10 ${rowBg}`}>
                          {row.memberName}
                        </td>
                        <td className="px-4 py-3">{TYPE_LABELS[row.type] ?? row.type}</td>
                        <td className="px-4 py-3">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="px-4 py-2">
                          <LeaderCell
                            key={`${row.id}:${row.leaderId ?? ""}`}
                            row={row}
                            members={members}
                            filters={filters}
                          />
                        </td>
                        <td className="px-4 py-3 text-text-muted whitespace-nowrap">
                          <LinkStateLabel row={row} />
                        </td>
                        <td className="px-4 py-3 text-text-muted">{row.createdLabel}</td>
                        <td className="px-4 py-3 text-text-muted">{row.submittedLabel ?? "–"}</td>
                        <td className="px-4 py-3">
                          <Link href={`/interviews/${row.id}`}>
                            <Button variant="secondary" size="sm" className="min-h-[44px] sm:min-h-0">
                              Detail
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function MobileFilters({
  filters,
  options,
  activeCount,
}: {
  filters: InterviewListFilters;
  options: InterviewListFilterOptions;
  activeCount: number;
}) {
  return (
    <details className="sm:hidden mb-3 rounded-lg border border-border bg-surface">
      <summary className="px-4 py-3 text-sm font-semibold cursor-pointer">
        Filtr{activeCount > 0 ? ` (${activeCount})` : ""}
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {FILTER_COLUMNS.map((c) => (
          <ColumnFilter
            key={c.field}
            column={c.label}
            paramKey={LIST_FILTER_KEYS[c.field]}
            value={filters[c.field]}
            options={options[c.field]}
            allLabel={c.allLabel}
            variant="stacked"
          />
        ))}
      </div>
    </details>
  );
}

function LinkStateLabel({ row }: { row: InterviewListRow }) {
  switch (row.linkState) {
    case "neodeslan":
      return <>Neodeslán</>;
    case "neplatny":
      return <span className="text-warning">Neplatný</span>;
    case "odeslan":
      return <>Odeslán{row.linkSentLabel ? ` ${row.linkSentLabel}` : ""}</>;
    default:
      return <>–</>;
  }
}

/**
 * Výběr vedoucího v řádku (arch 6.1, gate U4). Uloží se hned po výběru.
 * Stejný vedoucí nebo „Nepřiřazeno" akci nevolá: updateInterviewLeaderAction
 * revokuje odkaz i bez změny. Potvrzení jen když už odešel odkaz (K7).
 */
function LeaderCell({
  row,
  members,
  filters,
}: {
  row: InterviewListRow;
  members: LeaderOption[];
  filters: InterviewListFilters;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const original = row.leaderId ?? "";
  const [value, setValue] = useState(original);
  const [pending, setPending] = useState(false);
  // M1: select zůstane neaktivní, dokud nedoběhne router.refresh(), jinak by
  // isLeaderChangeNoop a potvrzení pracovaly se starým row.leaderId a linkState.
  const [isRefreshing, startRefresh] = useTransition();
  const inFlight = useRef(false);

  if (row.status !== "open") {
    return (
      <span
        className="text-text-muted"
        title="Vedoucího lze změnit jen u otevřeného pohovoru."
      >
        {row.leaderName ?? "–"}
      </span>
    );
  }

  const leaderMissing = row.leaderId !== null && !members.some((m) => m.id === row.leaderId);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newId = e.target.value;
    if (inFlight.current) return;
    if (isLeaderChangeNoop(row.leaderId, newId)) {
      setValue(original);
      return;
    }

    const newLeader = members.find((m) => m.id === newId);
    const newName = newLeader?.name ?? "nový vedoucí";
    const linkWasSent = leaderChangeNeedsConfirm(row.linkState);

    if (linkWasSent) {
      const ok = window.confirm(
        `Vedoucímu ${row.leaderName ?? "původnímu vedoucímu"} už odešel odkaz na vyplnění. ` +
          `Po změně přestane platit a ${newName} dostane nový, až mu ho pošlete z detailu. ` +
          "Změnit vedoucího?"
      );
      if (!ok) {
        setValue(original);
        return;
      }
    }

    inFlight.current = true;
    setValue(newId);
    setPending(true);
    try {
      const result = await updateInterviewLeaderAction(row.id, newId);
      if (result.success) {
        let text = `Vedoucí změněn na ${newName}.`;
        if (linkWasSent) {
          text += " Odkaz mu pošlete z detailu, filtr Odkaz „Chybí“ ukáže, komu ještě chybí.";
        }
        // M5: hláška jen když řádek po změně (nový vedoucí, odkaz po
        // revokaci neplatný) opravdu přestane odpovídat aktivním filtrům.
        const afterChange: InterviewListRow = {
          ...row,
          leaderId: newId,
          leaderName: newName,
          linkState: linkWasSent ? "neplatny" : row.linkState,
        };
        if (countActiveFilters(filters) > 0 && filterInterviewList([afterChange], filters).length === 0) {
          text += " Řádek už neodpovídá filtru.";
        }
        showToast("success", text);
      } else {
        setValue(original);
        showToast("error", result.error);
      }
    } catch {
      setValue(original);
      showToast("error", "Nepodařilo se změnit vedoucího.");
    } finally {
      inFlight.current = false;
      setPending(false);
      startRefresh(() => {
        router.refresh();
      });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label={`Vedoucí pohovoru pro ${row.memberName}`}
        value={value}
        onChange={handleChange}
        disabled={pending || isRefreshing}
        className="h-11 sm:h-9 min-w-[10rem] rounded-lg border border-border bg-white px-2 text-sm text-text-main focus:outline-none focus:border-primary focus:shadow-focus disabled:bg-background disabled:text-text-disabled"
      >
        {row.leaderId === null && <option value="">Nepřiřazeno</option>}
        {leaderMissing && (
          <option value={row.leaderId ?? ""}>{row.leaderName ?? "Neznámý vedoucí"}</option>
        )}
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {leaderLabel(m)}
          </option>
        ))}
      </select>
      {(pending || isRefreshing) && (
        <svg
          className="animate-spin h-4 w-4 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-label="Ukládám"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
    </div>
  );
}
