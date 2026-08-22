import Link from "next/link";
import { Card } from "@/components/ui/Card";

interface StatusFiltersProps {
  members: { id: string; name: string }[];
  meetings: { id: string; date: string }[];
  current: {
    member?: string;
    meeting?: string;
    severity?: string;
    from?: string;
    to?: string;
  };
  hasActiveFilter: boolean;
}

/**
 * Pruh 2 „Filtr" (arch iter-027 T-001, sekce 7.2): "Querystring,
 * server-rendered, žádný stav v klientovi." Obyčejný `<form method="get">`
 * bez JS — hodnoty přežívají reload jen díky URL, žádný `useState`, žádná
 * `"use client"` direktiva. Přesně tenhle filtr na členovi je krok 2 case
 * Kateřiny Černé (7.4).
 */
export function StatusFilters({ members, meetings, current, hasActiveFilter }: StatusFiltersProps) {
  return (
    <Card>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter-member" className="text-sm font-medium text-text-main">
            Clen
          </label>
          <select
            id="status-filter-member"
            name="member"
            defaultValue={current.member ?? ""}
            className="h-10 px-3 rounded-lg border border-border bg-white text-sm"
          >
            <option value="">Vsichni</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter-meeting" className="text-sm font-medium text-text-main">
            Schuzka
          </label>
          <select
            id="status-filter-meeting"
            name="meeting"
            defaultValue={current.meeting ?? ""}
            className="h-10 px-3 rounded-lg border border-border bg-white text-sm"
          >
            <option value="">Vsechny</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.date}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter-severity" className="text-sm font-medium text-text-main">
            Zavaznost
          </label>
          <select
            id="status-filter-severity"
            name="severity"
            defaultValue={current.severity ?? ""}
            className="h-10 px-3 rounded-lg border border-border bg-white text-sm"
          >
            <option value="">Vse</option>
            <option value="info">Info</option>
            <option value="warn">Varovani</option>
            <option value="error">Chyba</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter-from" className="text-sm font-medium text-text-main">
            Od
          </label>
          <input
            id="status-filter-from"
            type="date"
            name="from"
            defaultValue={current.from ?? ""}
            className="h-10 px-3 rounded-lg border border-border bg-white text-sm"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter-to" className="text-sm font-medium text-text-main">
            Do
          </label>
          <input
            id="status-filter-to"
            type="date"
            name="to"
            defaultValue={current.to ?? ""}
            className="h-10 px-3 rounded-lg border border-border bg-white text-sm"
          />
        </div>

        <button
          type="submit"
          className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-hover focus:outline-none focus:shadow-focus"
        >
          Filtrovat
        </button>

        {hasActiveFilter && (
          <Link
            href="/status"
            className="h-10 flex items-center px-2 text-sm text-text-muted underline"
          >
            Zrusit filtr
          </Link>
        )}
      </form>
    </Card>
  );
}
