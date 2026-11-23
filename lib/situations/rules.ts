/**
 * iter-049 (arch 6, 7, gate T-004): čistá pravidla klientských situací. Typy,
 * limity, texty, validace a rozhodnutí „kdo smí co“.
 *
 * Čistý modul: žádný import DB, Next ani Resend. Jde spustit v holém Node
 * (tsx) bez DATABASE_URL, viz scripts/test-iter-049-situace.ts.
 *
 * Autorita je SQL (lib/db/queries/client-situations.ts), UI z těchto pravidel
 * jen skrývá tlačítka. Texty členské části tykají (nápověda členů vyká).
 */
import { isUuid } from "../mastermind/rules";

export { isUuid };

// ── Typy a limity (Q10 A) ──

export const SLOTS = [1, 2, 3] as const;
export type Slot = (typeof SLOTS)[number];

export const ITEM_KINDS = ["trait", "need", "fear", "desire", "related"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Pole hlavičky situace (sekce A). Název sloupce se z toho skládá switchem v SQL, ne z klienta. */
export const HEAD_FIELDS = ["client", "title", "description"] as const;
export type HeadField = (typeof HEAD_FIELDS)[number];

export const CLIENT_MAX = 80;
export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const ITEM_TEXT_MAX = 300;
export const TRAIT_TEXT_MAX = 40;
/** Kartiček na sloupec (need, fear, desire, related). */
export const ITEM_LIMIT = 30;
/** Lístečků (trait) na situaci. */
export const TRAIT_LIMIT = 12;

export const HEAD_MAX: Record<HeadField, number> = {
  client: CLIENT_MAX,
  title: TITLE_MAX,
  description: DESCRIPTION_MAX,
};

export function itemLimitFor(kind: ItemKind): number {
  return kind === "trait" ? TRAIT_LIMIT : ITEM_LIMIT;
}

export function textMaxFor(kind: ItemKind): number {
  return kind === "trait" ? TRAIT_TEXT_MAX : ITEM_TEXT_MAX;
}

/** Poslední den, do kterého členové situace doplňují (zadání Evy). Po něm věta o termínu zmizí. */
export const DEADLINE_ISO = "2026-12-01";

export function isDeadlineActive(todayIso: string): boolean {
  return todayIso <= DEADLINE_ISO;
}

// ── Texty (gate změny 2 až 13, LL-014) ──

export interface SectionText {
  title: string;
  question: string;
  hint: string;
  add: string;
}

export const SECTION_TEXTS: Record<Exclude<ItemKind, "trait">, SectionText> & {
  head: Omit<SectionText, "add">;
} = {
  head: {
    title: "Kdo je klient a v jaké situaci se nachází?",
    question: "Kdo je klient a v jaké situaci se nachází?",
    hint: "Koho se situace týká? Co se mu děje? Co ho přivedlo k hledání řešení?",
  },
  need: {
    title: "Potřeby",
    question: "Co klient potřebuje?",
    hint: "Co potřebuje udělat, vyřešit, změnit, zajistit nebo zvládnout? Co je pro něj důležité?",
    add: "+ Přidat potřebu",
  },
  fear: {
    title: "Obavy",
    question: "Co klienta trápí?",
    hint: "Co mu překáží? Z čeho má strach? Co nechce, aby se stalo? Co může ztratit?",
    add: "+ Přidat obavu",
  },
  desire: {
    title: "Touhy",
    question: "Čeho chce klient dosáhnout?",
    hint: "Co si skutečně přeje? Jak by měl vypadat ideální výsledek? Co chce získat nebo prožívat?",
    add: "+ Přidat touhu",
  },
  related: {
    title: "Související potřeby",
    question: "Co dalšího klient řeší a já mu to neposkytuji?",
    hint: "Co potřebuje vyřešit před mou službou, současně s ní nebo po ní? Jaké další problémy či úkoly souvisejí s jeho situací?",
    add: "+ Přidat související potřebu",
  },
};

export const UI_TEXTS = {
  pageTitle: "Klientské situace",
  mine: "Tvoje situace",
  intro: "Z tvých situací skládáme mapu společných potřeb klientů v chapteru.",
  deadline: "Doplň je prosím do 1. 12.",
  fillMine: "Vyplnit své situace",
  empty: "–",
  forLeadership: "Pro vedení",
  fillForMember: "Vyplnit za člena",
  fillForMemberPlaceholder: "Vyber člena",
  leadershipViaLink:
    "Vyplnit situace za jiného člena a stáhnout data pro mapu jde jen po přihlášení heslem.",
  downloadCsv: "Stáhnout tabulku (CSV)",
  downloadJson: "Stáhnout data pro mapu (JSON)",
  backToOverview: "Zpět na přehled",
  previous: "Předchozí",
  next: "Další situace",
  stepOf: (n: number) => `Situace ${n} ze 3`,
  fillingFor: (name: string) => `Vyplňuješ za člena: ${name}`,
  traitsAdd: "+ Přidat vlastnost",
  traitPlaceholder: "např. B2B, cca 100 lidí, ČR",
  clientPlaceholder: "např. majitel firmy",
  titleLabel: "Krátký název situace (zobrazí se v mapě)",
  descriptionLabel: "Stručný popis",
  originalTitle: "Původní text z workshopu 22. 10.",
  originalQ1: "Co klient řeší, co ho trápí a čeho chce dosáhnout?",
  originalQ2: "Co dalšího potřebuje, ale já mu to neposkytuji?",
  originalName: "Původní název",
  fromWorkshop: "z workshopu",
  edited: "upraveno",
  originalWording: "Původní znění",
  edit: "Upravit",
  remove: "Smazat",
  save: "Uložit",
  saving: "Ukládám…",
  saved: "Uloženo",
  retry: "Zkusit znovu",
  confirmDelete: "Opravdu smazat kartičku?",
  statusLabels: {
    edited: "upraveno",
    workshop: "z workshopu",
    notStarted: "nezačato",
  },
  cardsOverview: "Situace členů",
  readOnlyInactive: "Tento člen je neaktivní, jeho situace už upravit nejde.",
  unsavedBlock: "Něco se ještě neuložilo. Zkontroluj kartičky s chybou.",
  originalEdited: "Původní znění:",
  head: "Situace",
} as const;

export const MESSAGES = {
  invalidInput: "Neplatný vstup.",
  denied: "Na tuhle akci nemáš oprávnění.",
  generic: "Akci se nepodařilo provést.",
  saveFailed: "Nepodařilo se uložit.",
  sessionExpired: "Přihlášení vypršelo. Zkopíruj si text, přihlas se znovu a vlož ho.",
  itemGone: "Kartička už neexistuje nebo ji nemůžeš upravit.",
  memberGone: "Člen už v aplikaci není.",
  memberInactive: "Tento člen je neaktivní, jeho situace už upravit nejde.",
  itemLimit: "Do jednoho sloupce můžeš dát nejvýš 30 kartiček.",
  textEmpty: "Napiš text kartičky.",
  textTooLong: "Text může mít nejvýš 300 znaků.",
  traitLimit: "Vlastností můžeš mít nejvýš 12.",
  traitTooLong: "Vlastnost může mít nejvýš 40 znaků.",
  clientTooLong: "Klient může mít nejvýš 80 znaků.",
  titleTooLong: "Název situace může mít nejvýš 120 znaků.",
  descriptionTooLong: "Popis může mít nejvýš 1000 znaků.",
} as const;

// ── Rozlišitelný kód chyby (gate změna 12) ──

export type SituationErrorCode =
  | "session_expired"
  | "denied"
  | "invalid"
  | "inactive"
  | "gone"
  | "limit"
  | "failed";

export type SituationActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: SituationErrorCode };

export function fail(code: SituationErrorCode, error: string): { success: false; error: string; code: SituationErrorCode } {
  return { success: false, error, code };
}

// ── Validace vstupu ──

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
/** Neviditelné a směrové znaky (zero-width, značky směru, BOM). Ze vstupu se tiše odstraní. */
const INVISIBLE_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

/** NFC, bez řídicích a neviditelných znaků, konce řádků na `\n`, `trim`. */
export function cleanText(raw: string, multiline: boolean): string {
  const base = raw.normalize("NFC").replace(/\r\n?/g, "\n").replace(INVISIBLE_RE, "").replace(CONTROL_RE, "");
  const text = multiline ? base.replace(/[ \t]+\n/g, "\n") : base.replace(/\s+/g, " ");
  return text.trim();
}

export function isSlot(value: unknown): value is Slot {
  return value === 1 || value === 2 || value === 3;
}

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === "string" && (ITEM_KINDS as readonly string[]).includes(value);
}

export function isHeadField(value: unknown): value is HeadField {
  return typeof value === "string" && (HEAD_FIELDS as readonly string[]).includes(value);
}

export type TextResult = { ok: true; value: string } | { ok: false; error: string };

/** Text kartičky nebo lístečku: povinný, `trim`, limit podle typu (300 / 40). */
export function validateItemText(kind: ItemKind, raw: unknown): TextResult {
  if (typeof raw !== "string") return { ok: false, error: MESSAGES.invalidInput };
  const value = cleanText(raw, kind !== "trait");
  if (value.length === 0) return { ok: false, error: MESSAGES.textEmpty };
  if ([...value].length > textMaxFor(kind)) {
    return { ok: false, error: kind === "trait" ? MESSAGES.traitTooLong : MESSAGES.textTooLong };
  }
  return { ok: true, value };
}

/** Pole hlavičky: může být prázdné (vymazání), jinak limit podle pole. */
export function validateHeadValue(field: HeadField, raw: unknown): TextResult {
  if (typeof raw !== "string") return { ok: false, error: MESSAGES.invalidInput };
  const value = cleanText(raw, field === "description");
  if ([...value].length > HEAD_MAX[field]) {
    const error =
      field === "client"
        ? MESSAGES.clientTooLong
        : field === "title"
          ? MESSAGES.titleTooLong
          : MESSAGES.descriptionTooLong;
    return { ok: false, error };
  }
  return { ok: true, value };
}

// ── Práva ──

export interface SituationActor {
  memberId: string;
  /** Session má právo `situations.manage` (jen přihlášení heslem). */
  canManage: boolean;
}

/** Vlastní situace smí psát každý přihlášený, cizí jen držitel `situations.manage`. UI jen skrývá, autorita je v SQL. */
export function canEditSituations(actor: SituationActor | null | undefined, targetId: string): boolean {
  if (!actor || !actor.memberId) return false;
  return actor.memberId === targetId || actor.canManage;
}

// ── Stav situace ──

export type SituationStatus = "edited" | "workshop" | "notStarted";

/**
 * „upraveno“, když `updated_by IS NOT NULL` (od importu někdo něco skutečně
 * změnil, otevření ani uložení beze změny to nezpůsobí), jinak „z workshopu“,
 * když má `original`, jinak „nezačato“.
 */
export function situationStatus(input: { touched: boolean; hasOriginal: boolean }): SituationStatus {
  if (input.touched) return "edited";
  if (input.hasOriginal) return "workshop";
  return "notStarted";
}

export function situationStatusLabel(status: SituationStatus): string {
  return UI_TEXTS.statusLabels[status];
}

/** „1 kartička“, „2 kartičky“, „5 kartiček“. */
export function cardsLabel(n: number): string {
  if (n === 1) return `${n} kartička`;
  if (n >= 2 && n <= 4) return `${n} kartičky`;
  return `${n} kartiček`;
}

/** Nadpis situace v přehledu: klient, jinak název, jinak pomlčka. */
export function situationHeading(s: { client: string; title: string }): string {
  return s.client.trim() || s.title.trim() || UI_TEXTS.empty;
}

// ── Původní text z workshopu ──

export interface OriginalSnapshot {
  name: string;
  q1: string;
  q2: string;
}

/** Bezpečné čtení `original` JSONB (tvar situace.json), cokoli jiného než řetězec = prázdno. */
export function readOriginal(raw: unknown): OriginalSnapshot | null {
  let obj: unknown = raw;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return { name: s(o.nazev), q1: s(o.puvodni_q1), q2: s(o.puvodni_q2) };
}

// ── Rozhodnutí při 0 řádcích guarded SQL (arch 6.2) ──

/** Kartička tak, jak ji vrací SQL a čte klient. Časy jsou ISO řetězce v UTC. */
export interface ItemRow {
  id: string;
  kind: ItemKind;
  text: string;
  importedText: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Stav pro rozhodnutí, proč guarded zápis nic nezapsal (jedno čtení, jen při 0 řádcích). */
export interface WriteState {
  /** `target = actor` nebo aktér má `situations.manage` v DB. */
  allowed: boolean;
  /** Cílový člen je aktivní. */
  active: boolean;
  /** Kartička s daným id patřící cílovému členovi, jinak `null`. */
  item: ItemRow | null;
  /** Počet kartiček stejného typu v dané situaci. */
  kindCount: number;
  /** Hlavička: pole už má požadovanou hodnotu. */
  headUnchanged: boolean;
}

export type Miss =
  | { type: "ok"; item: ItemRow | null }
  | { type: "denied" }
  | { type: "inactive" }
  | { type: "gone" }
  | { type: "limit" }
  | { type: "failed" };

function base(state: WriteState): Miss | null {
  if (!state.allowed) return { type: "denied" };
  if (!state.active) return { type: "inactive" };
  return null;
}

/** Hlavička: stejná hodnota = úspěch bez zápisu. */
export function decideHeadMiss(state: WriteState): Miss {
  return base(state) ?? (state.headUnchanged ? { type: "ok", item: null } : { type: "failed" });
}

/** Přidání: stejné `itemId` už existuje (dvojí odeslání) = vrátí se existující kartička. */
export function decideAddMiss(state: WriteState, kind: ItemKind): Miss {
  const b = base(state);
  if (b) return b;
  if (state.item) return { type: "ok", item: state.item };
  if (state.kindCount >= itemLimitFor(kind)) return { type: "limit" };
  return { type: "failed" };
}

/** Úprava: kartička už má tenhle text = úspěch, neexistující nebo cizí = `gone`. */
export function decideUpdateMiss(state: WriteState, kind: ItemKind, text: string): Miss {
  const b = base(state);
  if (b) return b;
  if (!state.item || state.item.kind !== kind) return { type: "gone" };
  if (state.item.text === text) return { type: "ok", item: state.item };
  return { type: "failed" };
}

/** Smazání: kartička už není = cíl splněn. */
export function decideRemoveMiss(state: WriteState): Miss {
  return base(state) ?? { type: "ok", item: null };
}

export function missToResult(miss: Miss, kind?: ItemKind): { code: SituationErrorCode; error: string } | null {
  switch (miss.type) {
    case "ok":
      return null;
    case "denied":
      return { code: "denied", error: MESSAGES.denied };
    case "inactive":
      return { code: "inactive", error: MESSAGES.memberInactive };
    case "gone":
      return { code: "gone", error: MESSAGES.itemGone };
    case "limit":
      return { code: "limit", error: kind === "trait" ? MESSAGES.traitLimit : MESSAGES.itemLimit };
    case "failed":
      return { code: "failed", error: MESSAGES.saveFailed };
  }
}
