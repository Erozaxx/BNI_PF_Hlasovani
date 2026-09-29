/**
 * Datový formát info stránek série „Pravidla chapteru" (iter-029, T-007,
 * arch_iter-029_T-001 sekce 5.2).
 *
 * Obsah je čistá data bez JSX a bez tříd Tailwindu. Typy vynucuje `tsc`,
 * zbytek hlídá `validateInfoPage()` v `lib/info-pages/validate.ts`.
 *
 * Rozšíření proti návrhu (brief T-007, rozhodnutí 3 a report T-007):
 *   - `SourceRef.labelCs`   krátký český popisek pro „Kde to najdeš"
 *   - `SourceLocation`      odkaz na místo v PDF bez citace (jen shrnutí)
 *   - `StepContent.sourcesSummary`  text `<summary>` u zdrojů, doslova z textů
 *   - `BranchOption.nextLabel`      text odkazu u možnosti s `next`
 *   - `summary.subtitle`            volitelný podtitul shrnutí
 *   - `summary.goals`               cíle, které stránka deklaruje (T-007r, m-1)
 *
 * iter-030 (T-007a, arch_iter-030_T-001 sekce 7): vizuál `leadership-chart`,
 * referenční část `InfoPage.reference` a vypínač odkazů rolí `glossary`.
 * Nové typy nemají žádné pole pro rozlišení závazné / doporučené.
 */

/** Id, které stránka používá pro shrnutí (odkaz „Přeskočit na shrnutí"). */
export const SUMMARY_ANCHOR = "shrnuti";

/** Pevné kotvy referenční části (arch_iter-030 sekce 3.1 a 7.2). */
export const REFERENCE_ANCHORS = {
  intro: "vedeni",
  roles: "role-karty",
  decisions: "kdo-rozhoduje",
  rights: "prava-regionu",
} as const;

export type Obligation = "must" | "recommended"; // MUSÍ / DOPORUČENO (BNI)
export type SourceDocId = "ops-manual-2022" | "general-policies";

export interface SourceRef {
  doc: SourceDocId;
  /** PDF strana (u manuálu = vytištěné číslo, nález N1). */
  page: number;
  /** "General Policy #5", "Administrative Policy #5" */
  rule?: string;
  /** Doslovná citace z PDF, anglicky, apostrofy jako v PDF. */
  quoteEn: string;
  /** Volitelná poznámka k citaci (např. nález N6). */
  noteCs?: string;
  /** Krátký český popisek místa v pravidlech (používá „Kde to najdeš"). */
  labelCs?: string;
}

/** Místo v pravidlech bez citace: dokument, strana, pravidlo, popisek. */
export type SourceLocation = Omit<SourceRef, "quoteEn" | "noteCs">;

export interface Fact {
  /** Český výklad, 1–2 věty. */
  text: string;
  /** Bez hodnoty = kontext, bez štítku. */
  obligation?: Obligation;
  /** Aspoň jeden zdroj (validátor). */
  sources: SourceRef[];
  /** Část textu jako odkaz na kotvu stránky (`text` musí být v `Fact.text`). */
  link?: { text: string; href: string };
}

/** Položka „U nás v chapteru" (content/pravidla/u-nas-v-chapteru.ts). */
export interface ChapterNote {
  /** "C1" … "C7" */
  id: string;
  text: string;
  /** `draft` přidá ke štítku slovo „návrh". */
  status: "draft" | "approved";
  /** false = nikde se nevykreslí (nouzový vypínač). */
  enabled: boolean;
}

/** Registr vizuálů: klíč = druh sticky prvku, hodnota = tvar stavu u scény. */
export interface VisualStateMap {
  "absence-timeline": AbsenceTimelineState;
  "leadership-chart": LeadershipChartState;
  none: Record<string, never>;
}
export type VisualKind = keyof VisualStateMap;

export type WeekMark = "S" | "A" | "M" | "A-expired";

export type TimelineStatus =
  | "ok"
  | "watch"
  | "committee"
  | "leave"
  | "probation"
  | "open"
  | "left"
  | "none";

export interface AbsenceTimelineState {
  /** Týdny 1–26, ostatní = přítomen. */
  marks: { week: number; mark: WeekMark }[];
  status: TimelineStatus;
  statusLabel: string;
  counters?: { absences: number; substitutes: number };
  /** Věta pro čtečky a pro režim bez sticky. */
  srText: string;
}

/** Role ve schématu vedení (arch_iter-030 sekce 7.1). `clen` = ty, čtenář. */
export const ROLE_IDS = [
  "clen",
  "prezident",
  "viceprezident",
  "clensky-vybor",
  "vybor-rust",
  "vybor-prihlasky",
  "vybor-zapojeni",
  "vybor-vztahy",
  "sekretar-pokladnik",
  "vzdelavaci-koordinator",
  "koordinator-mentoru",
  "hostitele",
  "konzultant-regionu",
  "reditel-regionu",
  "region",
] as const;
export type RoleId = (typeof ROLE_IDS)[number];

/**
 * Vztah role ke kroku, v pořadí priority pro kompaktní pruh:
 * rozhoduje > musí souhlasit > radí > provádí > dozví se.
 */
export const ROLE_RELATIONS = ["decides", "approves", "advises", "acts", "informed"] as const;
export type RoleRelation = (typeof ROLE_RELATIONS)[number];

export interface LeadershipChartState {
  /**
   * Prázdné = celé schéma bez zvýraznění (úvod). Každá role nejvýš jednou.
   * `label` = název role v pruhu podle textu kroku (např. „regionální tým BNI").
   */
  roles: { role: RoleId; relation: RoleRelation; label?: string }[];
  /** Věta pro čtečky a tisk. */
  srText: string;
}

/** Panel minikomiksu (T-010k): kresba bez textu, text panelu je HTML. */
export interface ComicPanel {
  /** Cesta pod `/pravidla/komiksy/`. */
  src: string;
  /** Skutečné rozměry PNG kvůli CLS. */
  width: number;
  height: number;
  /** Text panelu (verzálky, ruční písmo). Prázdný jen u ilustrace karty rozcestí. */
  caption: string;
  /** Popis kresby pro čtečky. */
  alt: string;
}

export interface Comic {
  panels: ComicPanel[];
}

interface StepContent<K extends VisualKind> {
  /** Kotva [a-z0-9-], unikátní na stránce. */
  id: string;
  label: string;
  title: string;
  /** Co zažíváš ty, odstavec = položka. */
  story: string[];
  /** Co v tu chvíli dělá chapter. */
  chapter: Fact[];
  /** Id z ChapterNote. */
  chapterNotes?: string[];
  /** Text `<summary>` zdrojů bez „Zdroj: ", jinak se složí automaticky. */
  sourcesSummary?: string;
  /** Minikomiks pod nadpisem kroku (T-010k). */
  comic?: Comic;
  visual: VisualStateMap[K];
}

export interface Scene<K extends VisualKind> extends StepContent<K> {
  type: "scene";
  variant?: "main" | "detour";
}

export interface BranchOption<K extends VisualKind> extends StepContent<K> {
  tone: "good" | "neutral" | "serious";
  /** Id kroku, kam větev vede. */
  next?: string;
  /** Text odkazu na `next`. */
  nextLabel?: string;
}

export interface Branch<K extends VisualKind> {
  type: "branch";
  id: string;
  question: string;
  options: BranchOption<K>[];
}

export type Step<K extends VisualKind> = Scene<K> | Branch<K>;

/** Pole karty role v pevném pořadí (arch_iter-030 sekce 3). */
export const ROLE_CARD_FIELD_KINDS = ["does", "decides", "approval", "notDecides", "notDefined"] as const;
export type RoleCardFieldKind = (typeof ROLE_CARD_FIELD_KINDS)[number];

export interface RoleCard {
  /** Kotva karty, role musí být v glosáři (`content/pravidla/role-glosar.ts`). */
  id: RoleId;
  title: string;
  /** Jedna věta, co role je (pro vstup z odkazu). */
  lead: string;
  /** Řádek „Ve schématu: …" (např. „pod prezidentem, vede výbor"). */
  inChart?: string;
  /**
   * Pevné pořadí `ROLE_CARD_FIELD_KINDS`. Karta ukáže vždy všech pět polí,
   * pole bez faktu (nebo chybějící) vypíše větu šablony (gate T-006).
   * `does` a `notDecides` musí mít aspoň jeden fakt.
   */
  fields: { kind: RoleCardFieldKind; facts: Fact[] }[];
  /** Pod-kotvy karty (4 specializace výboru, ředitel regionu). */
  subAnchors?: { id: RoleId; title: string; facts: Fact[] }[];
  /** Id z ChapterNote. */
  chapterNotes?: string[];
  /** Minikomiks pod nadpisem karty (T-011). */
  comic?: Comic;
  /** Odkaz z karty (karta regionu na úplný seznam práv, gate T-006). */
  link?: { href: string; label: string };
}

export interface DecisionRow {
  /** Kotva řádku (`situace-…`). */
  id: string;
  situation: string;
  decides: string;
  approves: string;
  advises: string;
  informed: string;
  sources: SourceRef[];
  /** Odkaz jinam (např. řádek čtvrté absence na stránku absence). */
  link?: { href: string; label: string };
}

export interface RightsItem {
  /** Kotva položky (`r1` …). */
  id: string;
  text: string;
  sources: SourceRef[];
}

/**
 * Referenční část za příběhem, před shrnutím (arch_iter-030 sekce 7.2).
 * Úvod (vedení obecně, kotva `vedeni`) a tři podsekce s pevnými kotvami
 * `role-karty`, `kdo-rozhoduje`, `prava-regionu`.
 */
export interface InfoReference {
  /** Nadpis úvodu referenční části (H2, kotva `vedeni`). */
  title: string;
  /** Odstavce úvodu. */
  lead: string[];
  /** Fakta úvodu se zdroji (vedení obecně, arch 3.1). */
  facts: Fact[];
  chapterNotes?: string[];
  roles: RoleCard[];
  decisions: DecisionRow[];
  rights: RightsItem[];
}

export interface InfoPage<K extends VisualKind = VisualKind> {
  /** "absence" */
  slug: string;
  /** H1, OG, karta v rozcestníku. */
  title: string;
  description: string;
  /** ISO datum, tiskne se jako „Stav k". */
  updated: string;
  visual: K;
  /** Úvodní ilustrace u H1 s textem bubliny (T-010k). */
  hero?: ComicPanel;
  /**
   * Rychlá navigace „Na stránce" pod úvodem (T-010r3). `children` = druhý
   * řádek odkazů (např. jednotlivé karty rolí). Bez hodnoty se nevykreslí.
   */
  toc?: { label: string; anchor: string; children?: { label: string; anchor: string }[] }[];
  /** Rozcestník, sekce 8. */
  situations: { label: string; anchor: string }[];
  intro: {
    question: string;
    lead: string[];
    visual: VisualStateMap[K];
    /** Minikomiks úvodu pod otázkou (stránka rolí, R10; `hero` zůstává jeden panel). */
    comic?: Comic;
  };
  steps: Step<K>[];
  /** Referenční část (karty rolí, tabulka situací, práva), iter-030. */
  reference?: InfoReference;
  /** `false` = na stránce se názvy rolí neodkazují (výjimka k variantě G, arch 7.3). */
  glossary?: false;
  summary: {
    title: string;
    subtitle?: string;
    /** Cíle stránky, které musí body shrnutí pokrýt (validátor). Bez hodnoty = nekontroluje se. */
    goals?: number[];
    points: { text: string; goal?: number }[];
    /** `href` = odkaz popisku na kotvu stránky (např. seznam práv), PDF zůstává. */
    whereToFind: (SourceLocation & { href?: string })[];
  };
  /** Jen role, bez kontaktů. */
  contacts: { role: string; when: string }[];
  /** Odstavce patičky, `{updated}` se nahradí datem. */
  disclaimer: string[];
}
