"use client";

import { useEffect, useState } from "react";
import { ContactCard, type ContactCardData } from "@/components/burza/ContactCard";
import { TEXTS, matchesContactQuery } from "@/lib/burza/rules";

/**
 * Karty položek kontaktů s hledáním (arch 6.9). Filtruje klientsky nad daty
 * stránky, vzor `OfferList`. Bez JS je pole skryté a vidět jsou všechny karty.
 * Pořadí určuje stránka. Karty ukazují jen cizí položky (Z11).
 */
export function ContactList({
  items,
  viewerId,
  viewerIsManagement,
  usedContactIds,
}: {
  items: ContactCardData[];
  viewerId: string;
  viewerIsManagement: boolean;
  usedContactIds: string[];
}) {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => setReady(true), []);

  const used = new Set(usedContactIds);
  const shown = items.filter((i) => matchesContactQuery(i, query));

  return (
    <div className="space-y-4">
      {ready && (
        <div className="flex flex-col gap-1">
          <label htmlFor="contact-search" className="text-sm font-medium text-text-main">
            {TEXTS.contactsSearch}
          </label>
          <input
            id="contact-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-border bg-white px-3.5 text-base text-text-main focus:outline-none focus:border-primary focus:shadow-focus"
          />
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{TEXTS.emptyContacts}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-text-muted" role="status">
          {TEXTS.noResults}
        </p>
      ) : (
        <div className="space-y-4">
          {shown.map((i) => (
            <ContactCard
              key={`${i.id}-${used.has(i.id)}`}
              data={i}
              viewerId={viewerId}
              viewerIsManagement={viewerIsManagement}
              used={used.has(i.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
