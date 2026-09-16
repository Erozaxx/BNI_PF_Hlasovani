/**
 * iter-028 (T-006, arch 4.7, 8.1) — hláška na členské stránce při neplatném
 * odkazu, u všech variant D4. Dnes stránka při `401` ukazuje holý text z API
 * (`Invalid token`, `Token revoked`, ...) — tenhle modul ho převede na
 * srozumitelnou českou větu.
 *
 * Čistý modul: žádný import next/server, next/cache, drizzle-orm ani
 * @/lib/db/*. Jde spustit v holém Node (tsx) bez DATABASE_URL — viz
 * scripts/test-meeting-token.ts (H1).
 *
 * `tokenErrorText` je jediná exportovaná funkce podle 8.1 (rozhoduje jen
 * `{ reason }`, ne hotovou větu) — `MEETING_TOKEN_PAGE_TEXT` a
 * `meetingTokenActionError` jsou coder rozšíření (mimo výslovný seznam 8.1):
 * tři komponenty (page.tsx, MeetingVoteButtons, MeetingNoteForm) potřebují
 * stejné, konzistentní texty ze 4.7 pro stejný `reason` a bez sdíleného
 * modulu by se dřív nebo později rozjely. Zapsáno v handoffu jako odchylka.
 */

export type MeetingTokenErrorReason = "invalid" | "revoked" | "expired";

/**
 * Rozhodne, jaký důvod (pokud vůbec) ukázat pro daný `status`/`error` z API
 * (4.7). Jen `401` má rozpoznávanou hlášku — `Token revoked` a
 * `Token expired` mají vlastní důvod, cokoli jiného na `401` (vč. `Invalid
 * token`, prázdného řetězce, jiného textu) je `invalid`. Jiný stav vrací
 * `null` a volající se chová jako dnes (holý text z API, pokud nějaký je).
 */
export function tokenErrorText(
  status: number,
  error: unknown
): { reason: MeetingTokenErrorReason } | null {
  if (status !== 401) return null;
  if (error === "Token revoked") return { reason: "revoked" };
  if (error === "Token expired") return { reason: "expired" };
  return { reason: "invalid" };
}

/** Nadpis a text pro `MeetingExpired` (4.7, sloupec "Stránka"). Bez diakritiky, vyká — stejný styl jako zbytek členské stránky. */
export const MEETING_TOKEN_PAGE_TEXT: Record<
  MeetingTokenErrorReason,
  { title: string; body: string }
> = {
  invalid: {
    title: "Odkaz uz neplati",
    body: "Mezitim vam nejspis prisel novejsi odkaz. Otevrete prosim ten z posledniho mailu. Kdyz zadny nemate, napiste organizatorovi schuzky.",
  },
  revoked: {
    title: "Odkaz byl zrusen",
    body: "Organizator schuzky tento odkaz zrusil. Pokud mate hlasovat, napiste mu.",
  },
  expired: {
    title: "Odkaz vyprsel",
    body: "Hlasovani k teto schuzce uz skoncilo.",
  },
};

/**
 * Věta pro tlačítko hlasu / poznámky (4.7, sloupec "Hlas nebo poznámka").
 * Architektura dává doslovné znění jen pro hlas — pro poznámku myslela u
 * všech tří důvodů jen náhradu začátku věty ("Hlas se neulozil" →
 * "Poznamka se neulozila", review T-007 N2), zbytek věty zůstává stejný.
 */
export function meetingTokenActionError(
  reason: MeetingTokenErrorReason,
  kind: "vote" | "note"
): string {
  if (kind === "note") {
    if (reason === "expired") return "Poznamka se neulozila, platnost odkazu skoncila.";
    if (reason === "revoked") return "Poznamka se neulozila, odkaz byl zrusen.";
    return "Poznamka se neulozila, odkaz uz neplati. Otevrete prosim odkaz z posledniho mailu.";
  }

  if (reason === "expired") return "Hlas se neulozil, platnost odkazu skoncila.";
  if (reason === "revoked") return "Hlas se neulozil, odkaz byl zrusen.";
  return "Hlas se neulozil, odkaz uz neplati. Otevrete prosim odkaz z posledniho mailu.";
}
