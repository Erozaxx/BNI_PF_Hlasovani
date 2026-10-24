"use client";

import { useEffect, useState } from "react";
import { OfferCard, type OfferCardData } from "@/components/burza/OfferCard";
import { TEXTS, matchesQuery } from "@/lib/burza/rules";

/**
 * Karty řádků burzy s hledáním (6.7). Filtruje klientsky nad daty, která
 * stránka už má (desítky řádků, žádný další dotaz). Bez JS je pole skryté a
 * vidět jsou všechny karty. Pořadí (abecedně) určuje stránka.
 */
export function OfferList({
  offers,
  viewerId,
  viewerIsManagement,
  recordedByHelper,
  burzaEmpty,
  bonusOn = true,
}: {
  offers: OfferCardData[];
  /** V burze nejsou žádné řádky (ani vlastní). */
  burzaEmpty: boolean;
  viewerId: string;
  viewerIsManagement: boolean;
  recordedByHelper: Record<string, string>;
  /** Burza dává bonus do semaforu, viz `OfferCard`. */
  bonusOn?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => setReady(true), []);

  const shown = offers.filter((o) => matchesQuery(o, query));

  return (
    <div className="space-y-4">
      {ready && (
        <div className="flex flex-col gap-1">
          <label htmlFor="burza-search" className="text-sm font-medium text-text-main">
            Hledat (jméno, obor, s čím)
          </label>
          <input
            id="burza-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            className="h-11 w-full rounded-lg border border-border bg-white px-3.5 text-base text-text-main focus:outline-none focus:border-primary focus:shadow-focus"
          />
        </div>
      )}

      {offers.length === 0 ? (
        burzaEmpty ? <p className="text-sm text-text-muted">{TEXTS.emptyBurza}</p> : null
      ) : shown.length === 0 ? (
        <p className="text-sm text-text-muted" role="status">
          {TEXTS.noResults}
        </p>
      ) : (
        <div className="space-y-4">
          {shown.map((o) => (
            <OfferCard
              key={o.memberId}
              data={o}
              viewerId={viewerId}
              viewerIsManagement={viewerIsManagement}
              recordedHelpId={recordedByHelper[o.memberId] ?? null}
              bonusOn={bonusOn}
            />
          ))}
        </div>
      )}
    </div>
  );
}
