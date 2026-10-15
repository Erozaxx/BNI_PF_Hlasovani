/**
 * Čisté funkce pro sekci pohovorů (arch iter-032 T-001b, sekce 4, 5, 6, 9;
 * gate T-004b U1 až U4): abecední řazení členů, stav odkazu, filtry obou
 * tabulek na /interviews a sestavení querystringu.
 *
 * Bez importu z lib/db, next ani React, aby šly testovat bez DB
 * (scripts/test-iter-032-interviews.ts). Typy řádků jsou lokální rozhraní.
 */

// ============================================================
// Abecední řazení (arch 5.1)
// ============================================================

const csCollator = new Intl.Collator("cs", { sensitivity: "base", numeric: true });

/** Řazení jmen po česku („Ch" za „H", háčky za základním písmenem). Při shodě
 *  podle collatoru rozhodne binární porovnání, aby pořadí bylo stabilní. */
export function compareMemberNames(a: string, b: string): number {
  const byCollator = csCollator.compare(a, b);
  if (byCollator !== 0) return byCollator;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Vrátí nové pole seřazené podle celého jména (= křestní, pak příjmení).
 *  Vstup nemění. Shodné jméno rozhodne id. */
export function sortMembersByName<T extends { id: string; name: string }>(
  list: readonly T[]
): T[] {
  return [...list].sort((a, b) => {
    const byName = compareMemberNames(a.name, b.name);
    if (byName !== 0) return byName;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
}

// ============================================================
// Datumy pro klienta (gate U1): vždy v Europe/Prague, na serveru
// ============================================================

const PRAGUE = "Europe/Prague";

/** „15. 10. 2026" v pražském čase (stejný formát jako dřív na /interviews). */
export function formatPragueDate(d: Date): string {
  return d.toLocaleDateString("cs-CZ", { timeZone: PRAGUE });
}

/** Krátký tvar „15. 10." pro sloupec Odkaz. */
export function formatPragueDayMonth(d: Date): string {
  return d.toLocaleDateString("cs-CZ", {
    timeZone: PRAGUE,
    day: "numeric",
    month: "numeric",
  });
}

// ============================================================
// Stav odkazu (arch 4.2, gate U2)
// ============================================================

export type LinkState = "na" | "neodeslan" | "odeslan" | "neplatny";

export interface LinkStateInput {
  status: string;
  linkLastSentAt: Date | null;
  linkRevokedAt: Date | null;
  /** NOT NULL v interview_link, takže null = řádek odkazu vůbec neexistuje. */
  linkExpiresAt: Date | null;
}

/** Stav odkazu pro sloupec Odkaz. Volá se na serveru s jedním `now` (U1). */
export function deriveLinkState(row: LinkStateInput, now: Date): LinkState {
  if (row.status !== "open") return "na";
  if (row.linkExpiresAt === null) return "neodeslan";
  // N1: nikdy neodeslaný odkaz je „neodeslán" i po expiraci (arch 4.2).
  if (row.linkLastSentAt === null) return "neodeslan";
  if (row.linkRevokedAt !== null) return "neplatny";
  if (row.linkExpiresAt.getTime() < now.getTime()) return "neplatny";
  return "odeslan";
}

// ============================================================
// Řádky seznamu pro klienta (gate U1: jen řetězce a výčty, žádné Date)
// ============================================================

export interface InterviewListSourceRow extends LinkStateInput {
  id: string;
  memberId: string;
  memberName: string;
  type: string;
  leaderId: string | null;
  leaderName: string | null;
  createdAt: Date;
  submittedAt: Date | null;
}

export interface InterviewListRow {
  id: string;
  memberId: string;
  memberName: string;
  type: string;
  status: string;
  leaderId: string | null;
  leaderName: string | null;
  linkState: LinkState;
  createdLabel: string;
  submittedLabel: string | null;
  /** „12. 10." jen u stavu odeslan, jinak null. */
  linkSentLabel: string | null;
}

export function buildInterviewListRows(
  rows: readonly InterviewListSourceRow[],
  now: Date
): InterviewListRow[] {
  return rows.map((r) => {
    const linkState = deriveLinkState(r, now);
    return {
      id: r.id,
      memberId: r.memberId,
      memberName: r.memberName,
      type: r.type,
      status: r.status,
      leaderId: r.leaderId,
      leaderName: r.leaderName,
      linkState,
      createdLabel: formatPragueDate(r.createdAt),
      submittedLabel: r.submittedAt ? formatPragueDate(r.submittedAt) : null,
      linkSentLabel:
        linkState === "odeslan" && r.linkLastSentAt
          ? formatPragueDayMonth(r.linkLastSentAt)
          : null,
    };
  });
}

// ============================================================
// Filtr seznamu pohovorů, parametry s_* (arch 4.2, gate U2)
// ============================================================

export interface FilterOption {
  value: string;
  label: string;
}

/** Minimální tvar řádku, který filtr potřebuje. */
export interface InterviewFilterRow {
  memberId: string;
  memberName: string;
  type: string;
  status: string;
  leaderId: string | null;
  leaderName: string | null;
  linkState: LinkState;
}

export const LIST_FILTER_KEYS = {
  clen: "s_clen",
  typ: "s_typ",
  stav: "s_stav",
  vedouci: "s_vedouci",
  odkaz: "s_odkaz",
} as const;

export type ListFilterField = keyof typeof LIST_FILTER_KEYS;

export const LEADER_NONE = "nikdo";

export type InterviewListFilters = Record<ListFilterField, string | null>;

export type InterviewListFilterOptions = Record<ListFilterField, FilterOption[]>;

const TYPE_FILTER: Record<string, string> = { "5": "month_5", "10": "month_10" };
const STATUS_FILTER: Record<string, string> = {
  otevreny: "open",
  odeslany: "submitted",
  zruseny: "cancelled",
};

/** Možnosti výběrů z nefiltrovaných řádků (bez kaskádování). Volba „Vše" /
 *  „Všichni" (prázdná hodnota) sem nepatří, přidává ji ColumnFilter. */
export function interviewListFilterOptions(
  rows: readonly InterviewFilterRow[]
): InterviewListFilterOptions {
  const memberMap = new Map<string, string>();
  const leaderMap = new Map<string, string>();
  let hasNoLeader = false;
  let hasCancelled = false;

  for (const r of rows) {
    memberMap.set(r.memberId, r.memberName);
    if (r.leaderId === null) hasNoLeader = true;
    else leaderMap.set(r.leaderId, r.leaderName ?? "");
    if (r.status === "cancelled") hasCancelled = true;
  }

  const toOptions = (map: Map<string, string>): FilterOption[] =>
    sortMembersByName([...map].map(([id, name]) => ({ id, name }))).map((m) => ({
      value: m.id,
      label: m.name,
    }));

  return {
    clen: toOptions(memberMap),
    typ: [
      { value: "5", label: "5 měsíců" },
      { value: "10", label: "10 měsíců" },
    ],
    stav: [
      { value: "otevreny", label: "Otevřený" },
      { value: "odeslany", label: "Odeslaný" },
      ...(hasCancelled ? [{ value: "zruseny", label: "Zrušený" }] : []),
    ],
    vedouci: [
      ...(hasNoLeader ? [{ value: LEADER_NONE, label: "Bez vedoucího" }] : []),
      ...toOptions(leaderMap),
    ],
    odkaz: [
      { value: "chybi", label: "Chybí" },
      { value: "odeslan", label: "Odeslán" },
    ],
  };
}

interface ParamsLike {
  get(key: string): string | null;
}

function pick(params: ParamsLike, key: string, options: readonly FilterOption[]): string | null {
  const raw = params.get(key);
  if (raw === null || raw === "") return null;
  return options.some((o) => o.value === raw) ? raw : null;
}

/** Hodnoty z URL. Neznámá hodnota se ignoruje (jako by nebyla), nikdy nehází.
 *  Opakovaný parametr: URLSearchParams.get vrací první. */
export function parseInterviewListFilters(
  params: ParamsLike,
  options: InterviewListFilterOptions
): InterviewListFilters {
  return {
    clen: pick(params, LIST_FILTER_KEYS.clen, options.clen),
    typ: pick(params, LIST_FILTER_KEYS.typ, options.typ),
    stav: pick(params, LIST_FILTER_KEYS.stav, options.stav),
    vedouci: pick(params, LIST_FILTER_KEYS.vedouci, options.vedouci),
    odkaz: pick(params, LIST_FILTER_KEYS.odkaz, options.odkaz),
  };
}

export function countActiveFilters(filters: Record<string, string | null>): number {
  return Object.values(filters).filter((v) => v !== null).length;
}

/** AND přes sloupce. Bez filtru vrací řádky ve stejném pořadí. */
export function filterInterviewList<T extends InterviewFilterRow>(
  rows: readonly T[],
  filters: InterviewListFilters
): T[] {
  return rows.filter((r) => {
    if (filters.clen !== null && r.memberId !== filters.clen) return false;
    if (filters.typ !== null && r.type !== TYPE_FILTER[filters.typ]) return false;
    if (filters.stav !== null && r.status !== STATUS_FILTER[filters.stav]) return false;
    if (filters.vedouci !== null) {
      if (filters.vedouci === LEADER_NONE) {
        if (r.leaderId !== null) return false;
      } else if (r.leaderId !== filters.vedouci) {
        return false;
      }
    }
    if (filters.odkaz === "chybi") {
      if (r.linkState !== "neodeslan" && r.linkState !== "neplatny") return false;
    } else if (filters.odkaz === "odeslan") {
      if (r.linkState !== "odeslan") return false;
    }
    return true;
  });
}

// ============================================================
// Vedoucí v řádku (arch 6.1, gate U4)
// ============================================================

/** Potvrzovat jen když už vedoucímu odešel platný odkaz (K7). */
export function leaderChangeNeedsConfirm(linkState: LinkState): boolean {
  return linkState === "odeslan";
}

/** true = akci nevolat: prázdná volba („Nepřiřazeno") nebo stejný vedoucí.
 *  Akce by jinak zbytečně zneplatnila odkaz (revokuje bez porovnání). */
export function isLeaderChangeNoop(currentLeaderId: string | null, newLeaderId: string): boolean {
  return newLeaderId === "" || newLeaderId === currentLeaderId;
}

// ============================================================
// Pohovory k založení, parametry z_* (arch 4.3)
// ============================================================

export interface DueFilterEntry {
  memberId: string;
  memberName: string;
  due5: boolean;
  due10: boolean;
  upcoming5: boolean;
  upcoming10: boolean;
}

export type DueChipState = "sviti" | "blizi" | "nic";

export const DUE_FILTER_KEYS = {
  clen: "z_clen",
  m5: "z_5",
  m10: "z_10",
} as const;

export type DueFilterField = keyof typeof DUE_FILTER_KEYS;
export type DueFilters = Record<DueFilterField, string | null>;
export type DueFilterOptions = Record<DueFilterField, FilterOption[]>;

const CHIP_OPTIONS: FilterOption[] = [
  { value: "sviti", label: "Svítí" },
  { value: "blizi", label: "Blíží se" },
  { value: "nic", label: "Nic" },
];

export function dueChipState(entry: DueFilterEntry, type: "5" | "10"): DueChipState {
  if (type === "5") {
    if (entry.due5) return "sviti";
    if (entry.upcoming5) return "blizi";
    return "nic";
  }
  if (entry.due10) return "sviti";
  if (entry.upcoming10) return "blizi";
  return "nic";
}

/** Do horní tabulky patří jen členové, u kterých něco svítí nebo se blíží. */
export function isDueRelevant(entry: DueFilterEntry): boolean {
  return entry.due5 || entry.due10 || entry.upcoming5 || entry.upcoming10;
}

export function dueFilterOptions(entries: readonly DueFilterEntry[]): DueFilterOptions {
  return {
    clen: sortMembersByName(entries.map((e) => ({ id: e.memberId, name: e.memberName }))).map(
      (m) => ({ value: m.id, label: m.name })
    ),
    m5: CHIP_OPTIONS,
    m10: CHIP_OPTIONS,
  };
}

export function parseDueFilters(params: ParamsLike, options: DueFilterOptions): DueFilters {
  return {
    clen: pick(params, DUE_FILTER_KEYS.clen, options.clen),
    m5: pick(params, DUE_FILTER_KEYS.m5, options.m5),
    m10: pick(params, DUE_FILTER_KEYS.m10, options.m10),
  };
}

export function filterDueEntries<T extends DueFilterEntry>(
  entries: readonly T[],
  filters: DueFilters
): T[] {
  return entries.filter((e) => {
    if (filters.clen !== null && e.memberId !== filters.clen) return false;
    if (filters.m5 !== null && dueChipState(e, "5") !== filters.m5) return false;
    if (filters.m10 !== null && dueChipState(e, "10") !== filters.m10) return false;
    return true;
  });
}

/** Svítící nahoře, pak blížící se, uvnitř skupiny abecedně (shoda: id). */
export function sortDueEntries<T extends DueFilterEntry>(entries: readonly T[]): T[] {
  const group = (e: DueFilterEntry) => (e.due5 || e.due10 ? 0 : 1);
  return [...entries].sort((a, b) => {
    const g = group(a) - group(b);
    if (g !== 0) return g;
    const byName = compareMemberNames(a.memberName, b.memberName);
    if (byName !== 0) return byName;
    if (a.memberId < b.memberId) return -1;
    if (a.memberId > b.memberId) return 1;
    return 0;
  });
}

// ============================================================
// Querystring (arch 4.4)
// ============================================================

/** Předvyplnění formuláře z /admin/members. Zápis filtru ho z URL odstraní. */
const PREFILL_KEYS = ["memberId", "type"] as const;

function cleanParams(current: string | URLSearchParams): URLSearchParams {
  const raw = typeof current === "string" ? current.replace(/^\?/, "") : current.toString();
  const next = new URLSearchParams(raw);
  for (const k of PREFILL_KEYS) next.delete(k);
  for (const k of [...new Set(next.keys())]) {
    if (next.getAll(k).every((v) => v === "")) next.delete(k);
  }
  return next;
}

/** Nový querystring bez úvodního „?". Prázdná hodnota parametr maže,
 *  parametry druhé tabulky zůstávají, memberId a type mizí. */
export function buildFilterSearch(
  current: string | URLSearchParams,
  key: string,
  value: string
): string {
  const next = cleanParams(current);
  if (value === "") next.delete(key);
  else next.set(key, value);
  return next.toString();
}

/** „Zrušit filtry": smaže všechny parametry s daným prefixem (s_ nebo z_). */
export function clearFilterSearch(current: string | URLSearchParams, prefix: string): string {
  const next = cleanParams(current);
  for (const k of [...new Set(next.keys())]) {
    if (k.startsWith(prefix)) next.delete(k);
  }
  return next.toString();
}
