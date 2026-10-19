/**
 * iter-035 (T-005, arch T-001, gate T-004 Z1 až Z7): čistá pravidla Burzy pomoci.
 *
 * Čistý modul: žádný import DB, Next ani Resend. Jde spustit v holém Node
 * (tsx) bez DATABASE_URL, viz scripts/test-iter-035-burza.ts.
 *
 * Pravidla „kdo smí co“ žijí tady. UI z nich skrývá tlačítka, akce je volá
 * před příkazem a WHERE v lib/db/queries/burza.ts je opakuje v DB
 * (autorita je SQL, ne UI).
 *
 * Datumy jsou řetězce „YYYY-MM-DD“ (kalendářní dny), „dnešek“ dodává volající
 * z todayInPrague().
 */
import { daysBetween, isValidIsoDate, isUuid } from "../mastermind/rules";

export { isUuid };

// ── Limity (UI je přísnější než DB, vzor iter-033) ──

export const OFFER_MAX = 400;
export const CONTACT_MAX = 200;
export const NOTE_MAX = 300;
export const HELP_NOTE_MAX = 300;
/** Revize: řádek starší než tolik dní od posledního potvrzení je „starý“ (Z4). */
export const REVIEW_DAYS = 90;
/** Okno počtu pomoci v boxu pomocníka (měsíce, počítá SQL). */
export const HELP_WINDOW_MONTHS = 6;
/** Okno záznamů pomoci pro vedení (měsíce, počítá SQL). */
export const HELP_RECORDS_MONTHS = 12;
/** Strop počtu záznamů na `/burza/pomoc`. */
export const HELP_RECORDS_LIMIT = 200;
/** Položka „Na koho mám kontakt“: délka v UI (DB dovolí 400). */
export const CONTACT_LABEL_MAX = 150;
/** Nejvíc položek kontaktů na člena (K18). */
export const CONTACT_ITEMS_LIMIT = 10;

// ── Texty (Z7, LL-014). Členské stránky tykají, nápověda vyká. ──

export const TEXTS = {
  boundary:
    "Pomoc z burzy je nezištná: rada nebo krátká konzultace. Když z ní vznikne zakázka, je to běžný obchod a patří do doporučení.",
  boundaryField: "Rada nebo krátká konzultace. Zakázka patří do doporučení.",
  noteHint: "Třeba kdy se hodí volat.",
  contactPlaceholder: "Telefon nebo e-mail",
  helpMissingMember: "Kdo tu chybí, nemá řádek v burze. Napřed mu ho zapiš, pak pomoc.",
  noOffer: "Ještě nemáš řádek v burze.",
  emptyBurza: "Burza je zatím prázdná.",
  noResults: "Nic nenalezeno.",
  staleOwn: "Tvůj řádek v burze je starší než 3 měsíce. Platí pořád?",
  // iter-035 doplnění (gate T-012, sekce 5, texty doslova)
  tabsLabel: "Burza pomoci",
  tabHelp: "Pomoc",
  tabContacts: "Kontakty",
  usedToggle: "Využil(a) jsem",
  usedThisMonth: "tento měsíc",
  contactsIntro: "Kontakt tu přímo není. Když ho chceš, řekni si tomu, kdo ho nabízí.",
  myContactsTitle: "Tvoje kontakty",
  noContacts: "Ještě tu nemáš žádný kontakt.",
  addContact: "Přidat kontakt",
  editContacts: "Upravit kontakty",
  contactsSearch: "Hledat (jméno, obor, kontakt)",
  contactLabel: "Na koho mám kontakt",
  emptyContacts: "Od ostatních tu zatím žádný kontakt není.",
  manageOwnTitle: "Tvoje kontakty v burze",
  backToContacts: "Zpět na Kontakty",
  contactHint:
    "Třeba ředitel logistiky ve firmě X. Jméno ani telefon toho člověka sem nepiš, kdo kontakt chce, řekne si tobě.",
  contactAdd: "Přidat",
  contactLimitFull: "Víc než 10 kontaktů tu mít nejde. Když chceš přidat další, nějaký smaž.",
  contactDeleteConfirm: "Opravdu smazat tento kontakt?",
  contactAdded: "Kontakt přidán.",
  contactSaved: "Kontakt uložen.",
  contactDeleted: "Kontakt smazán.",
  contactUseDeleteConfirm: "Opravdu smazat záznam o využití kontaktu?",
  helpDeleteConfirm: "Opravdu smazat záznam pomoci?",
  helpKindLabel: "Pomoc",
  contactGoneKindLabel: "Kontakt, který už v burze není",
  myContactsCount: (n: number) => `Zapsané kontakty: ${n} z ${CONTACT_ITEMS_LIMIT}`,
  contactsUsedByOthers: (n: number) =>
    `Tvoje kontakty využili ostatní za posledních 6 měsíců: ${n}`,
  manageOtherTitle: (name: string) => `Kontakty v burze: ${name}`,
  offeredBy: (parts: string) => `Nabízí: ${parts}`,
} as const;

// ── Texty hlášek (sdílené akcemi a testy) ──

export const MESSAGES = {
  invalidInput: "Neplatný vstup.",
  denied: "Na tuhle akci nemáš oprávnění.",
  generic: "Akci se nepodařilo provést.",
  memberGone: "Člen už v aplikaci není.",
  // iter-037 (T-003b, gate sekce 5): karta neaktivního člena je skrytá.
  cardUnavailable: "Karta teď není k dispozici.",
  // iter-037 (security L-3): vedení nezapisuje za neaktivního člena.
  memberInactive: "Člen je neaktivní, zápis za něj nejde.",
  offerEmpty: "Napiš, s čím pomůžeš.",
  offerGone: "Řádek už v burze není.",
  alreadyCreated: "Řádek mezitím někdo založil. Načti stránku znovu.",
  deletedMeanwhile: "Řádek mezitím někdo smazal. Načti stránku znovu.",
  helpGone: "Záznam už neexistuje.",
  selfHelp: "Sám sobě pomoc zapsat nejde.",
  helperIsActor:
    "Pomoc, kterou jsi poskytl(a) ty, zapíše někdo jiný z vedení nebo ten, komu jsi pomohl(a).",
  helperGone: (name: string) => `${name} už v burze není.`,
  alreadyRecorded: "Tento měsíc už zapsáno.",
  contactEmpty: "Napiš, na koho máš kontakt.",
  contactGone: "Kontakt už v burze není.",
  contactSelf: "Vlastní kontakt si zaškrtnout nejde.",
  contactDeletedMeanwhile: "Kontakt mezitím někdo smazal. Načti stránku znovu.",
  contactLimit: "Víc než 10 kontaktů tu mít nejde.",
} as const;

// ── Validace vstupu ──

export interface OfferInput {
  offer: string;
  contact?: string | null;
  note?: string | null;
}

export interface CleanOfferInput {
  offer: string;
  contact: string | null;
  note: string | null;
}

export type OfferInputResult =
  | { ok: true; value: CleanOfferInput }
  | { ok: false; error: string };

function optionalText(v: unknown): string | null | undefined {
  // undefined = vstup je neplatný
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/**
 * `trim`, povinné „S čím pomůžu“ (400), kontakt (200, jeden řádek) a poznámka
 * (300). Prázdný kontakt a poznámka = `null`. Přesah délky nebo jiný typ než
 * řetězec = `MESSAGES.invalidInput`, do DB nic nejde.
 */
export function validateOfferInput(input: Partial<OfferInput> | null | undefined): OfferInputResult {
  if (typeof input !== "object" || input === null) return { ok: false, error: MESSAGES.invalidInput };
  if (typeof input.offer !== "string") return { ok: false, error: MESSAGES.invalidInput };
  const offer = input.offer.trim();
  if (offer.length === 0) return { ok: false, error: MESSAGES.offerEmpty };
  if (offer.length > OFFER_MAX) return { ok: false, error: MESSAGES.invalidInput };

  const rawContact = optionalText(input.contact);
  const note = optionalText(input.note);
  if (rawContact === undefined || note === undefined) return { ok: false, error: MESSAGES.invalidInput };
  // Kontakt je jednořádkový volný text.
  const contact = rawContact === null ? null : rawContact.replace(/\s+/g, " ");
  if (contact !== null && contact.length > CONTACT_MAX) return { ok: false, error: MESSAGES.invalidInput };
  if (note !== null && note.length > NOTE_MAX) return { ok: false, error: MESSAGES.invalidInput };

  return { ok: true, value: { offer, contact, note } };
}

export type HelpNoteResult = { ok: true; value: string | null } | { ok: false; error: string };

/** Poznámka k pomoci: prázdná = `null`, nejvýš 300 znaků. */
export function validateHelpNote(note: unknown): HelpNoteResult {
  const t = optionalText(note);
  if (t === undefined) return { ok: false, error: MESSAGES.invalidInput };
  if (t !== null && t.length > HELP_NOTE_MAX) return { ok: false, error: MESSAGES.invalidInput };
  return { ok: true, value: t };
}

/** `isNew` a cílový stav přepínače musí být boolean, cokoli jiného = `MESSAGES.invalidInput`. */
export function validateBoolean(v: unknown): v is boolean {
  return typeof v === "boolean";
}

export type ContactLabelResult = { ok: true; value: string } | { ok: false; error: string };

/**
 * Položka „Na koho mám kontakt“: řetězec, `trim`, vnitřní bílé znaky na jednu
 * mezeru (jednořádkové), prázdné = `contactEmpty`, nad 150 = `invalidInput`.
 */
export function validateContactLabel(v: unknown): ContactLabelResult {
  if (typeof v !== "string") return { ok: false, error: MESSAGES.invalidInput };
  const label = v.replace(/\s+/g, " ").trim();
  if (label.length === 0) return { ok: false, error: MESSAGES.contactEmpty };
  if (label.length > CONTACT_LABEL_MAX) return { ok: false, error: MESSAGES.invalidInput };
  return { ok: true, value: label };
}

/**
 * Chyby z DB: 23503 (cizí klíč) = člen už není, 23514 (CHECK délky) a 22P02
 * (špatný formát) = neplatný vstup, jiný kód = obecná chyba. Na pětistovku
 * nic z toho nespadne.
 */
export function mapDbError(code: string | null | undefined): string {
  if (code === "23503") return MESSAGES.memberGone;
  if (code === "23514" || code === "22P02") return MESSAGES.invalidInput;
  return MESSAGES.generic;
}

// ── Kalendářní dny, revize (Z4) ──

/** Revize: pravda, když od posledního potvrzení uplynulo aspoň REVIEW_DAYS dní. */
export function isStale(confirmedDay: string, todayPrague: string): boolean {
  if (!isValidIsoDate(confirmedDay) || !isValidIsoDate(todayPrague)) return false;
  return daysBetween(confirmedDay, todayPrague) >= REVIEW_DAYS;
}

/** První den měsíce pro `used_month`: „2026-10-16“ -> „2026-10-01“. */
export function monthStart(day: string): string {
  if (!isValidIsoDate(day)) throw new Error(`Neplatné datum: ${day}`);
  return `${day.slice(0, 7)}-01`;
}

/** „10/2026“ z „2026-10-16“. */
export function formatMonthYear(day: string): string {
  if (!isValidIsoDate(day)) return day;
  const [y, m] = day.split("-");
  return `${m}/${y}`;
}

// ── Kdo smí co ──

export interface Actor {
  memberId: string;
  isManagement: boolean;
}

/** Řádek smí psát, měnit a mazat vlastník a vedení. */
export function canEditOffer(actor: Actor, targetId: string): boolean {
  return actor.isManagement || actor.memberId === targetId;
}

/** Přepínač „Využil(a) jsem“ je jen na cizí kartě (pomoc i kontakt). */
export function canRecordHelp(viewerId: string, helperId: string): boolean {
  return viewerId !== helperId;
}

/** Položky kontaktů smí psát, měnit a mazat vlastník a vedení (stejně jako řádek). */
export function canEditContacts(actor: Actor, targetId: string): boolean {
  return canEditOffer(actor, targetId);
}

/** Záznam pomoci smaže příjemce svůj, vedení jakýkoli. */
export function canRemoveHelp(actor: Actor, recipientId: string | null): boolean {
  if (actor.isManagement) return true;
  return recipientId !== null && recipientId === actor.memberId;
}

// ── Řazení a hledání ──

const csCollator = new Intl.Collator("cs", { sensitivity: "base", numeric: true });

function compareNames(a: string, b: string): number {
  const byCollator = csCollator.compare(a, b);
  if (byCollator !== 0) return byCollator;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Abecedně podle jména (česká kolace), shoda jména podle `memberId`. */
export function sortOffers<T extends { memberId: string; name: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const byName = compareNames(a.name, b.name);
    if (byName !== 0) return byName;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
}

function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface SearchableOffer {
  name: string;
  company: string | null;
  obor: string | null;
  offer: string;
  note: string | null;
}

/**
 * Hledání bez ohledu na velikost písmen a diakritiku ve jménu, firmě, oboru,
 * „s čím“ a poznámce. Kontakt se neprohledává. Více slov = všechna musí sedět.
 * Prázdný dotaz = vše.
 */
export function matchesQuery(row: SearchableOffer, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;
  const haystack = normalizeText(
    [row.name, row.company ?? "", row.obor ?? "", row.offer, row.note ?? ""].join(" ")
  );
  return words.every((w) => haystack.includes(w));
}

export interface ContactItemSortable {
  id: string;
  memberId: string;
  name: string;
  createdAt: string;
}

/** Jméno nabízejícího (česká kolace), pak pořadí přidání, pak `id`. Vstup se nemění. */
export function sortContactItems<T extends ContactItemSortable>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    const byName = compareNames(a.name, b.name);
    if (byName !== 0) return byName;
    if (a.memberId !== b.memberId) return a.memberId < b.memberId ? -1 : 1;
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export interface SearchableContact {
  name: string;
  company: string | null;
  obor: string | null;
  label: string;
}

/** Hledání v textu položky, jménu, firmě a oboru; stejná normalizace jako `matchesQuery`. */
export function matchesContactQuery(row: SearchableContact, query: string): boolean {
  const words = normalizeText(query).split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return true;
  const haystack = normalizeText(
    [row.name, row.company ?? "", row.obor ?? "", row.label].join(" ")
  );
  return words.every((w) => haystack.includes(w));
}

// ── Dashboard (Z4): jen výzva vlastníkovi se starým řádkem ──

export interface DashboardBurzaInput {
  /** Potvrzení vlastního řádku, „YYYY-MM-DD“, nebo null, když řádek není. */
  ownConfirmedDay: string | null;
}

export type DashboardBurzaSummary = { kind: "own-stale" };

export function summarizeDashboardBurza(
  input: DashboardBurzaInput,
  todayPrague: string
): DashboardBurzaSummary | null {
  if (input.ownConfirmedDay === null) return null;
  return isStale(input.ownConfirmedDay, todayPrague) ? { kind: "own-stale" } : null;
}

// ── Popisky záznamů pomoci (vedení) ──

export interface HelpParties {
  recipientId: string | null;
  recipientName: string | null;
  createdBy: string | null;
  createdByName: string | null;
}

/** Texty pro chybějící členy: „komu“ a „kdo zapsal“. */
export function helpPartyLabel(p: HelpParties): { recipient: string; createdBy: string } {
  const recipient = p.recipientId === null ? "příjemce už není členem" : (p.recipientName ?? "příjemce už není členem");
  let createdBy: string;
  if (p.createdBy === null) createdBy = "autor už není členem";
  else if (p.recipientId !== null && p.createdBy === p.recipientId) createdBy = "sám/sama";
  else createdBy = p.createdByName ?? "autor už není členem";
  return { recipient, createdBy };
}

// ── Společný seznam pomoci a využitých kontaktů (vedení, /burza/pomoc) ──

export interface MergeableUse {
  id: string;
  /** „YYYY-MM-DD“ */
  usedOn: string;
  /** Text, ISO nebo `timestamptz::text`, řadí se jako řetězec. */
  createdAt: string;
}

/**
 * Spojí oba druhy záznamů, seřadí podle dne sestupně, pak `createdAt`
 * sestupně, pak `id`, a ořízne na `limit`. Druh nese samotný řádek.
 */
export function mergeUseRecords<T extends MergeableUse>(
  help: readonly T[],
  contacts: readonly T[],
  limit: number
): T[] {
  return [...help, ...contacts]
    .sort((a, b) => {
      if (a.usedOn !== b.usedOn) return a.usedOn < b.usedOn ? 1 : -1;
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .slice(0, Math.max(0, limit));
}

/** První část řádku záznamu: „Pomoc“, „Kontakt: {text}“, nebo smazaná položka. */
export function recordKindLabel(kind: "help" | "contact", contactLabel: string | null): string {
  if (kind === "help") return TEXTS.helpKindLabel;
  return contactLabel === null ? TEXTS.contactGoneKindLabel : `Kontakt: ${contactLabel}`;
}
