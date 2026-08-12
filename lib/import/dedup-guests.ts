/**
 * Dedup rozhodovací logika pro import hostů z xlsx (iter-025).
 *
 * PRAVIDLO: TENTO SOUBOR NESMÍ MÍT ŽÁDNÝ IMPORT. Ani z "@/lib/db/schema",
 * ani z "xlsx", ani z "next" — vůbec žádný. Důvod: modul musí jít spustit
 * v holém Node procesu bez DATABASE_URL (projekt nemá dev databázi, testy
 * v scripts/test-dedup-guests.ts jsou jediná zpětná vazba, kterou lze bez
 * ní získat) a zároveň ho musí unést klientská ("use client") komponenta
 * ImportGuestsButton.tsx, aniž by se do bundlu zatáhl serverový kód.
 * Než sem přidáš `import`, ověř si, jestli hodnotu nejde předat jako
 * parametr z route.ts místo importu typu/knihovny.
 *
 * Dedup klíč je dvojice (normalizovaný email, normalizované jméno), viz
 * architecture_iter-025_T-001.md sekce 2. Diakritika se v normalizaci
 * NESKLÁPÍ — je to vědomé rozhodnutí (návrh, sekce 8, alternativa A3):
 * falešné sloučení dvou různých lidí je horší chyba než založení karty
 * navíc (ta je vidět a jde smazat, sloučený člověk tiše zmizí ze schůzky).
 */

/** Jeden řádek dat z xlsx, po parsingu a před jakýmkoli rozhodnutím o DB. */
export type ImportGuestRow = {
  /**
   * Číslo řádku tak, jak ho moderátor vidí v Excelu (hlavička = 1,
   * první datový řádek = 2). Nese se do reportu, aby šlo dohledat,
   * o který řádek souboru jde.
   */
  rowNumber: number;
  /** Po trim; může být prázdný řetězec — pak se řádek přeskočí. */
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  description: string | null;
  categoryName: string | null;
};

/**
 * Minimální projekce hosta už uloženého v DB. Záměrně to není typ
 * odvozený z drizzle schématu — jinak by modul musel importovat schema
 * a přestal by být spustitelný bez DB vrstvy.
 *
 * Route předává kandidáty seřazené (created_at ASC, id ASC). Při dvou
 * záznamech se shodným klíčem vyhrává první v pořadí.
 */
export type ExistingGuest = {
  id: string;
  name: string;
  email: string | null;
};

export type DedupDecision =
  | {
      kind: "create";
      row: ImportGuestRow;
      dedupKey: string;
    }
  | {
      kind: "reuse-existing";
      row: ImportGuestRow;
      dedupKey: string;
      /** guest.id, na který se řádek navěsí. */
      guestId: string;
      /** Jméno a email tak, jak jsou uložené na nalezené kartě. */
      matchedName: string;
      matchedEmail: string | null;
    }
  | {
      kind: "duplicate-in-file";
      row: ImportGuestRow;
      dedupKey: string;
      /** rowNumber prvního řádku s tímto klíčem — ten, který „vyhrál". */
      firstRowNumber: number;
      firstName: string;
    }
  | {
      kind: "skipped-no-name";
      row: ImportGuestRow;
    };

export type DedupPlan = {
  /** Rozhodnutí ve stejném pořadí, v jakém řádky přišly ze souboru. */
  decisions: DedupDecision[];
  counts: {
    create: number;
    reuseExisting: number;
    duplicateInFile: number;
    skippedNoName: number;
  };
};

/** Jeden nově založený host (P2 — jmenovitý report importu). */
export type GuestImportCreatedRow = {
  rowNumber: number;
  name: string;
  email: string | null;
};

/** Jeden řádek, který nedostal vlastní kartu. */
export type GuestImportMergedRow =
  | {
      reason: "existing-guest";
      /** Řádek v souboru tak, jak ho vidí moderátor v Excelu. */
      rowNumber: number;
      /** Jméno a email z importovaného řádku. */
      name: string;
      email: string | null;
      /** Karta, do které řádek spadl — tohle je odpověď na „s kým sloučeno". */
      guestId: string;
      matchedName: string;
      matchedEmail: string | null;
    }
  | {
      reason: "duplicate-row";
      rowNumber: number;
      name: string;
      email: string | null;
      /** Dřívější řádek téhož souboru, který kartu dostal. */
      firstRowNumber: number;
      firstName: string;
    };

/** Řádek, který se vůbec nedal uložit. */
export type GuestImportSkippedRow = {
  rowNumber: number;
  name: string | null;
  email: string | null;
  reason: "missing-name";
};

export type GuestImportResult = {
  // --- počty (created/existing/linkedToMeeting/skipped zachovány z iter-009) ---
  /** Nově založené karty hosta. */
  created: number;
  /** Řádky napojené na kartu, která už v DB byla. */
  existing: number;
  /** Řádky, které byly duplicitou dřívějšího řádku téhož souboru. NOVÉ. */
  duplicates: number;
  /** Řádky, které nešlo uložit (chybí jméno). */
  skipped: number;
  /** Zpracované datové řádky (po ořezu na MAX_ROWS, po filtru prázdných řádků — P1). NOVÉ. */
  totalRows: number;

  // --- vazba na schůzku ---
  /** Nově vytvořené vazby meeting_guest. */
  linkedToMeeting: number;
  /** Hosté, kteří na schůzce už byli. NOVÉ. */
  alreadyLinked: number;

  // --- soubor ---
  /** Soubor měl víc než MAX_ROWS datových řádků a byl oříznut. NOVÉ. */
  truncated: boolean;

  // --- jmenovité seznamy ---
  /** Nově založené karty, jmenovitě (P2). */
  createdRows: GuestImportCreatedRow[];
  merged: GuestImportMergedRow[];
  skippedRows: GuestImportSkippedRow[];
};

/**
 * Sjednotí jednu složku klíče. Exportovaná kvůli testu a kvůli tomu,
 * aby route mohla stejnou funkcí mapovat RETURNING řádky zpět na klíč.
 *
 * Pořadí kroků je závazné: NFC musí být před lowercase, jinak se
 * rozložené a složené diakritické znaky rozejdou i po sjednocení
 * velikosti písmen. Používá se toLowerCase(), ne toLocaleLowerCase() —
 * locale-závislé sklápění by udělalo z klíče funkci prostředí, a
 * serverless runtime nemá zaručenou locale.
 */
export function normalizeDedupPart(value: string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Složí klíč z jména a emailu. Pořadí argumentů (name, email) odpovídá
 * pořadí sloupců na kartě hosta, ne pořadí uvnitř klíče.
 *
 * Oddělovač \u0000 je zvolený proto, že se nemůže vyskytnout ani v jedné
 * složce — Postgres text NUL bajt neuloží a xlsx buňka ho nepřinese.
 */
export function buildDedupKey(
  name: string,
  email: string | null | undefined
): string {
  return normalizeDedupPart(email) + "\u0000" + normalizeDedupPart(name);
}

/**
 * Rozhodne pro každý řádek, co se s ním má stát. Čistá funkce:
 * žádné I/O, žádný Date.now(), žádná mutace vstupů, deterministický výstup.
 *
 * @param rows      řádky ze souboru v pořadí, v jakém byly v listu
 * @param existing  kandidáti z tabulky guest, seřazení (created_at, id).
 *                  Při dvou záznamech se shodným klíčem vyhrává PRVNÍ v poli.
 *                  Interní mapa se proto plní s `if (!byKey.has(key))` guardem,
 *                  ne prostým `byKey.set(...)` — to by dalo „poslední vyhrává".
 */
export function planGuestDedup(
  rows: ImportGuestRow[],
  existing: ExistingGuest[]
): DedupPlan {
  const byKey = new Map<string, ExistingGuest>();
  for (const g of existing) {
    const key = buildDedupKey(g.name, g.email);
    // Guard je povinný (2.4, R11): Map.set na existující klíč by hodnotu
    // přepsal, takže by vyhrál poslední záznam místo prvního.
    if (!byKey.has(key)) byKey.set(key, g);
  }

  const firstRowNumberByKey = new Map<string, number>();
  const firstNameByKey = new Map<string, string>();

  const decisions: DedupDecision[] = [];
  let create = 0;
  let reuseExisting = 0;
  let duplicateInFile = 0;
  let skippedNoName = 0;

  for (const row of rows) {
    if (row.name.trim().length === 0) {
      decisions.push({ kind: "skipped-no-name", row });
      skippedNoName++;
      continue;
    }

    const dedupKey = buildDedupKey(row.name, row.email);

    const existingMatch = byKey.get(dedupKey);
    if (existingMatch) {
      decisions.push({
        kind: "reuse-existing",
        row,
        dedupKey,
        guestId: existingMatch.id,
        matchedName: existingMatch.name,
        matchedEmail: existingMatch.email,
      });
      reuseExisting++;
      continue;
    }

    const firstRowNumber = firstRowNumberByKey.get(dedupKey);
    if (firstRowNumber !== undefined) {
      decisions.push({
        kind: "duplicate-in-file",
        row,
        dedupKey,
        firstRowNumber,
        firstName: firstNameByKey.get(dedupKey) ?? row.name,
      });
      duplicateInFile++;
      continue;
    }

    firstRowNumberByKey.set(dedupKey, row.rowNumber);
    firstNameByKey.set(dedupKey, row.name);
    decisions.push({ kind: "create", row, dedupKey });
    create++;
  }

  return {
    decisions,
    counts: { create, reuseExisting, duplicateInFile, skippedNoName },
  };
}

/** Kompletní GuestImportResult se samými nulami a prázdnými poli. */
export function emptyGuestImportResult(): GuestImportResult {
  return {
    created: 0,
    existing: 0,
    duplicates: 0,
    skipped: 0,
    totalRows: 0,
    linkedToMeeting: 0,
    alreadyLinked: 0,
    truncated: false,
    createdRows: [],
    merged: [],
    skippedRows: [],
  };
}
