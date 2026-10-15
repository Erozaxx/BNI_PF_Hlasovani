"use client";

import { buildFilterSearch, clearFilterSearch, type FilterOption } from "@/lib/interviews/list-filters";

/**
 * Filtr jednoho sloupce (arch iter-032 T-001b 4.4, 7). Stav žije jen v URL:
 * změna přepíše querystring přes window.history.replaceState (Next 14.2 to
 * synchronizuje s useSearchParams, žádný dotaz na server). replaceState, ne
 * pushState: tlačítko Zpět má vést pryč ze stránky.
 *
 * Obyčejný <select>, ne Select z components/ui (ten má pevné h-11 a text-base).
 */
export function replaceSearch(search: string) {
  const url = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
  window.history.replaceState(null, "", url);
}

export function clearFilters(prefix: string) {
  replaceSearch(clearFilterSearch(window.location.search, prefix));
}

interface ColumnFilterProps {
  /** Název sloupce, jde do aria-label a do popisku v mobilní variantě. */
  column: string;
  paramKey: string;
  value: string | null;
  options: readonly FilterOption[];
  /** Text volby bez filtru („Vše", „Všichni"). */
  allLabel: string;
  /** head = pod hlavičkou tabulky (od sm), stacked = mobilní <details>. */
  variant: "head" | "stacked";
}

export function ColumnFilter({
  column,
  paramKey,
  value,
  options,
  allLabel,
  variant,
}: ColumnFilterProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    replaceSearch(buildFilterSearch(window.location.search, paramKey, e.target.value));
  }

  const active = value !== null;
  const select = (
    <select
      aria-label={`Filtr sloupce ${column}`}
      value={value ?? ""}
      onChange={handleChange}
      className={`rounded-lg border bg-white text-text-main focus:outline-none focus:border-primary focus:shadow-focus ${
        active ? "border-primary font-semibold" : "border-border"
      } ${variant === "head" ? "h-9 w-full min-w-[7rem] px-2 text-sm font-normal" : "h-11 w-full px-3 text-base"}`}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );

  if (variant === "head") return select;

  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-text-main">
      {column}
      {select}
    </label>
  );
}

/** Hlavička sloupce; aktivní filtr = tučně a tečka (arch 4.2). */
export function FilterHeader({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={active ? "font-bold text-primary" : undefined}>
      {label}
      {active && (
        <>
          <span aria-hidden="true" className="ml-1">
            •
          </span>
          <span className="sr-only"> (filtr aktivní)</span>
        </>
      )}
    </span>
  );
}
