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
 */

/** Id, které stránka používá pro shrnutí (odkaz „Přeskočit na shrnutí"). */
export const SUMMARY_ANCHOR = "shrnuti";

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
  /** Rozcestník, sekce 8. */
  situations: { label: string; anchor: string }[];
  intro: { question: string; lead: string[]; visual: VisualStateMap[K] };
  steps: Step<K>[];
  summary: {
    title: string;
    subtitle?: string;
    /** Cíle stránky, které musí body shrnutí pokrýt (validátor). Bez hodnoty = nekontroluje se. */
    goals?: number[];
    points: { text: string; goal?: number }[];
    whereToFind: SourceLocation[];
  };
  /** Jen role, bez kontaktů. */
  contacts: { role: string; when: string }[];
  /** Odstavce patičky, `{updated}` se nahradí datem. */
  disclaimer: string[];
}
