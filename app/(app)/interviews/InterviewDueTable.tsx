"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createInterviewAction } from "@/actions/interviews";
import type { InterviewType } from "@/lib/db/queries/interviews";
import {
  DUE_FILTER_KEYS,
  countActiveFilters,
  dueChipState,
  dueFilterOptions,
  filterDueEntries,
  parseDueFilters,
  type DueFilterField,
  type DueFilterOptions,
  type DueFilters,
} from "@/lib/interviews/list-filters";
import { ColumnFilter, FilterHeader, clearFilters } from "./ColumnFilter";
import type { LeaderOption } from "./InterviewListTable";

export interface DueTableEntry {
  memberId: string;
  memberName: string;
  joinedAtUnverified: boolean;
  due5: boolean;
  due10: boolean;
  due5SinceDays: number | null;
  due10SinceDays: number | null;
  upcoming5: boolean;
  upcoming10: boolean;
  /** iter-037 (K15): štítek „Neaktivní“, pohovor jde dál založit. */
  isInactive: boolean;
}

type ChipType = "5" | "10";

const TYPE_LABEL: Record<ChipType, string> = { "5": "5 měsíců", "10": "10 měsíců" };
const TYPE_VALUE: Record<ChipType, InterviewType> = { "5": "month_5", "10": "month_10" };

const FILTER_COLUMNS: Array<{ field: DueFilterField; label: string; allLabel: string }> = [
  { field: "clen", label: "Člen", allLabel: "Všichni" },
  { field: "m5", label: "5 měsíců", allLabel: "Vše" },
  { field: "m10", label: "10 měsíců", allLabel: "Vše" },
];

function daysLabel(days: number): string {
  if (days === 1) return "den";
  if (days >= 2 && days <= 4) return "dny";
  return "dní";
}

/**
 * Horní tabulka „Pohovory k založení" (arch iter-032 T-001b 4.3, 8; gate
 * T-004b U3). Filtr z_* v URL, klik na chip rozbalí panel jen s výběrem
 * vedoucího a založí pohovor stávající akcí. Pořadí řádků připraví server
 * (sortDueEntries). Když nejsou žádné záznamy, sekce se nevykreslí.
 */
export function InterviewDueTable({
  entries,
  members,
}: {
  entries: DueTableEntry[];
  members: LeaderOption[];
}) {
  const searchParams = useSearchParams();
  const options = useMemo(() => dueFilterOptions(entries), [entries]);
  const filters = parseDueFilters(searchParams, options);
  const visible = filterDueEntries(entries, filters);
  const activeCount = countActiveFilters(filters);
  const dueCount = entries.filter((e) => e.due5 || e.due10).length;
  const [openKey, setOpenKey] = useState<string | null>(null);

  // N5: panel otevřeného chipu nepřežije skrytí řádku filtrem.
  useEffect(() => {
    if (openKey === null) return;
    const memberId = openKey.split(":")[0];
    if (!visible.some((e) => e.memberId === memberId)) setOpenKey(null);
  }, [openKey, visible]);

  if (entries.length === 0) return null;

  function toggle(key: string) {
    setOpenKey((current) => (current === key ? null : key));
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text-main">
            Pohovory k založení (
            {activeCount > 0 ? `${visible.length} z ${entries.length}` : entries.length})
          </h2>
          {dueCount > 0 && <Badge variant="danger">{dueCount}</Badge>}
        </div>
        {activeCount > 0 && (
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px] sm:min-h-0"
            onClick={() => clearFilters("z_")}
          >
            Zrušit filtry
          </Button>
        )}
      </div>

      <p className="text-sm text-text-muted mb-3">
        Na řadě = od vstupu člena uplynulo 5 nebo 10 měsíců. Blíží se = bude na řadě brzy.
      </p>

      <MobileFilters filters={filters} options={options} activeCount={activeCount} />
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-primary text-left">
              <th className="px-3 sm:px-4 py-3 font-semibold">
                <FilterHeader label="Člen" active={filters.clen !== null} />
              </th>
              <th className="px-3 sm:px-4 py-3 font-semibold">
                <FilterHeader label="5 měsíců" active={filters.m5 !== null} />
              </th>
              <th className="px-3 sm:px-4 py-3 font-semibold">
                <FilterHeader label="10 měsíců" active={filters.m10 !== null} />
              </th>
            </tr>
            <tr className="hidden sm:table-row border-b border-border">
              {FILTER_COLUMNS.map((c) => (
                <th key={c.field} className="px-4 py-2">
                  <ColumnFilter
                    column={c.label}
                    paramKey={DUE_FILTER_KEYS[c.field]}
                    value={filters[c.field]}
                    options={options[c.field]}
                    allLabel={c.allLabel}
                    variant="head"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-text-muted">
                  Žádný člen neodpovídá filtru.{" "}
                  <button
                    type="button"
                    className="text-navy hover:underline"
                    onClick={() => clearFilters("z_")}
                  >
                    Zrušit filtry
                  </button>
                </td>
              </tr>
            ) : (
              visible.map((entry) => {
                const panelType: ChipType | null =
                  openKey === `${entry.memberId}:5`
                    ? "5"
                    : openKey === `${entry.memberId}:10`
                      ? "10"
                      : null;
                return (
                  <Fragment key={entry.memberId}>
                    <tr className="border-b border-border">
                      <td className="px-3 sm:px-4 py-3">
                        <span className="font-medium text-text-main">{entry.memberName}</span>
                        {entry.isInactive && (
                          <Badge variant="neutral" className="ml-2">
                            Neaktivní
                          </Badge>
                        )}
                        {entry.joinedAtUnverified && (
                          <Badge variant="warning" className="ml-2">
                            Neověřené datum vstupu
                          </Badge>
                        )}
                      </td>
                      {(["5", "10"] as const).map((t) => (
                        <td key={t} className="px-3 sm:px-4 py-3">
                          <DueChip
                            entry={entry}
                            type={t}
                            expanded={panelType === t}
                            onToggle={() => toggle(`${entry.memberId}:${t}`)}
                          />
                        </td>
                      ))}
                    </tr>
                    {panelType && (
                      <tr className="border-b border-border bg-background">
                        <td colSpan={3} className="px-3 sm:px-4 py-4">
                          <ChipPanel
                            key={openKey ?? ""}
                            entry={entry}
                            type={panelType}
                            members={members}
                            onClose={() => setOpenKey(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MobileFilters({
  filters,
  options,
  activeCount,
}: {
  filters: DueFilters;
  options: DueFilterOptions;
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
            paramKey={DUE_FILTER_KEYS[c.field]}
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

function DueChip({
  entry,
  type,
  expanded,
  onToggle,
}: {
  entry: DueTableEntry;
  type: ChipType;
  expanded: boolean;
  onToggle: () => void;
}) {
  const state = dueChipState(entry, type);
  if (state === "nic") return <span className="text-text-muted">–</span>;

  const sinceDays = type === "5" ? entry.due5SinceDays : entry.due10SinceDays;
  const text =
    state === "sviti"
      ? sinceDays !== null
        ? `Na řadě ${sinceDays} ${daysLabel(sinceDays)}`
        : "Na řadě"
      : "Blíží se";
  const color =
    state === "sviti"
      ? "bg-danger-light text-danger border-danger"
      : "bg-info-light text-info border-info";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`Založit pohovor ${TYPE_LABEL[type]} pro ${entry.memberName}`}
      className={`inline-flex items-center min-h-[44px] sm:min-h-0 rounded-full border px-2.5 py-1 text-xs font-medium text-left hover:shadow-sm focus:outline-none focus:shadow-focus ${color} ${
        expanded ? "ring-2 ring-offset-1 ring-current" : ""
      }`}
    >
      {text}
    </button>
  );
}

/**
 * Panel pod řádkem: jen výběr vedoucího (prázdný, K6), Založit a Zrušit.
 * Ochrana proti dvojkliku: useRef + loading (arch 8.2). Při jakékoli chybě
 * text v panelu i v toastu, panel zůstane a stránka se obnoví (gate U3).
 */
function ChipPanel({
  entry,
  type,
  members,
  onClose,
}: {
  entry: DueTableEntry;
  type: ChipType;
  members: LeaderOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [leaderId, setLeaderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const selectedLeader = members.find((m) => m.id === leaderId);
  const selectId = `chip-leader-${entry.memberId}-${type}`;

  async function handleCreate() {
    if (inFlight.current || !leaderId) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const result = await createInterviewAction(entry.memberId, TYPE_VALUE[type], leaderId);
      if (result.success) {
        showToast(
          "success",
          `Pohovor ${TYPE_LABEL[type]} pro ${entry.memberName} založen, vede ${selectedLeader?.name ?? "vybraný vedoucí"}.`
        );
        onClose();
      } else {
        setError(result.error);
        showToast("error", result.error);
      }
    } catch {
      const msg = "Nepodařilo se založit pohovor.";
      setError(msg);
      showToast("error", msg);
    } finally {
      inFlight.current = false;
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-text-main">
        Založit pohovor {TYPE_LABEL[type]}: {entry.memberName}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[16rem]">
          <label htmlFor={selectId} className="text-sm font-medium text-text-main">
            Vedoucí pohovoru
          </label>
          <select
            id={selectId}
            value={leaderId}
            onChange={(e) => setLeaderId(e.target.value)}
            disabled={loading}
            className="h-11 w-full rounded-lg border border-border bg-white px-3 text-base sm:text-sm text-text-main focus:outline-none focus:border-primary focus:shadow-focus disabled:bg-background"
          >
            <option value="" disabled>
              Vyber vedoucího…
            </option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.email ? m.name : `${m.name} (bez emailu)`}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="w-full sm:w-auto h-11"
          loading={loading}
          disabled={!leaderId}
          onClick={handleCreate}
        >
          Založit
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto h-11"
          disabled={loading}
          onClick={onClose}
        >
          Zrušit
        </Button>
      </div>
      {selectedLeader && !selectedLeader.email && (
        <p className="text-sm text-warning">
          Vybraný vedoucí nemá e-mail. Odkaz na vyplnění půjde poslat až po doplnění e-mailu.
        </p>
      )}
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
