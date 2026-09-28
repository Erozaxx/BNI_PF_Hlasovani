/**
 * Validátor info stránek (iter-029, T-007, arch_iter-029_T-001 sekce 12).
 * Čistá funkce bez DB, bez Reactu. Spouští ji `scripts/test-info-pages.ts`.
 *
 * Hlídá jen obecné věci šablony. Jména ani detaily žádného konkrétního
 * případu sem nepatří (repo je veřejné), kontrola prosaku běží mimo repo.
 */
import { SOURCE_DOCS } from "./sources";
import { SUMMARY_ANCHOR } from "./types";
import type {
  AbsenceTimelineState,
  ChapterNote,
  ComicPanel,
  Fact,
  InfoPage,
  SourceLocation,
  VisualKind,
} from "./types";

export interface ValidationResult {
  errors: string[];
  /** Informace, ne chyby (vypnuté a nepotvrzené položky „u nás v chapteru"). */
  infos: string[];
}

const ANCHOR_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Adresář kreseb minikomiksů (T-010k). */
export const COMIC_DIR = "/pravidla/komiksy/";
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Slugy, které by kolidovaly s adresářem PDF nebo s OG obrázkem rozcestníku. */
const RESERVED_SLUGS = new Set(["zdroje", "opengraph-image"]);
/** Pevná id v layoutu stránky, s kterými nesmí kolidovat id kroků. */
const RESERVED_IDS = new Set(["info", "info-title", "kontakty-title", "situace-title"]);
const WEEKS = 26;

/** Zkratky, které se v českém textu nesmí objevit bez vysvětlení. */
const UNEXPLAINED_TERMS: { term: string; re: RegExp }[] = [
  { term: "PALMS", re: /\bPALMS\b/ },
  { term: "VP", re: /\bVP\b/ },
  { term: "Accountability", re: /\bAccountability\b/i },
];

/**
 * Problémy českého textu: em dash, pomlčka „ – " ve větě, nevysvětlené
 * zkratky. Anglické citace (`quoteEn`) se sem nikdy nepředávají.
 */
export function findTextIssues(where: string, text: string): string[] {
  const issues: string[] = [];
  if (text.includes("—")) issues.push(`${where}: em dash „—" v textu`);
  if (/\s–\s/.test(text)) issues.push(`${where}: pomlčka „ – " v textu`);
  for (const { term, re } of UNEXPLAINED_TERMS) {
    if (re.test(text)) issues.push(`${where}: nevysvětlená zkratka ${term}`);
  }
  if (text.trim() === "") issues.push(`${where}: prázdný text`);
  return issues;
}

function checkLocation(where: string, ref: SourceLocation, errors: string[]): void {
  const doc = SOURCE_DOCS[ref.doc];
  if (!doc) {
    errors.push(`${where}: neznámý dokument ${String(ref.doc)}`);
    return;
  }
  if (!Number.isInteger(ref.page) || ref.page < 1 || ref.page > doc.pageCount) {
    errors.push(`${where}: strana ${ref.page} mimo rozsah 1 až ${doc.pageCount} (${ref.doc})`);
  }
}

/**
 * Panel komiksu: `src` pod `/pravidla/komiksy/`, neprázdný `alt`, kladné
 * rozměry. `caption` je povinný všude kromě ilustrace karty rozcestí.
 */
function checkComicPanel(
  where: string,
  panel: ComicPanel,
  allowEmptyCaption: boolean,
  errors: string[]
): void {
  if (!panel.src.startsWith(COMIC_DIR) || panel.src.includes("..")) {
    errors.push(`${where}: src „${panel.src}" není pod ${COMIC_DIR}`);
  }
  if (panel.alt.trim() === "") errors.push(`${where}: prázdný alt`);
  if (!allowEmptyCaption && panel.caption.trim() === "") errors.push(`${where}: prázdný caption`);
  for (const [name, value] of [
    ["width", panel.width],
    ["height", panel.height],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) errors.push(`${where}: ${name} ${value} není kladné celé číslo`);
  }
}

function checkTimeline(where: string, state: AbsenceTimelineState, errors: string[]): void {
  const weeks = new Set<number>();
  for (const { week } of state.marks) {
    if (!Number.isInteger(week) || week < 1 || week > WEEKS) {
      errors.push(`${where}: týden ${week} mimo rozsah 1 až ${WEEKS}`);
    }
    if (weeks.has(week)) errors.push(`${where}: týden ${week} má víc značek`);
    weeks.add(week);
  }
  if (state.counters) {
    const absences = state.marks.filter((m) => m.mark === "A").length;
    const substitutes = state.marks.filter((m) => m.mark === "S").length;
    if (absences !== state.counters.absences) {
      errors.push(`${where}: počitadlo absencí ${state.counters.absences}, značek A ${absences}`);
    }
    if (substitutes !== state.counters.substitutes) {
      errors.push(
        `${where}: počitadlo náhradníků ${state.counters.substitutes}, značek S ${substitutes}`
      );
    }
  }
}

function isTimelineState(kind: VisualKind, state: unknown): state is AbsenceTimelineState {
  return kind === "absence-timeline" && typeof state === "object" && state !== null;
}

export function validateInfoPage(page: InfoPage, notes: ChapterNote[]): ValidationResult {
  const errors: string[] = [];
  const infos: string[] = [];
  const texts: { where: string; text: string }[] = [];
  const addText = (where: string, text: string | undefined) => {
    if (text !== undefined) texts.push({ where, text });
  };

  // Stránka
  if (!ANCHOR_RE.test(page.slug)) errors.push(`slug „${page.slug}" není [a-z0-9-]`);
  if (RESERVED_SLUGS.has(page.slug)) errors.push(`slug „${page.slug}" je rezervovaný`);
  if (!ISO_DATE_RE.test(page.updated) || Number.isNaN(Date.parse(page.updated))) {
    errors.push(`updated „${page.updated}" není ISO datum`);
  }
  addText("title", page.title);
  addText("description", page.description);

  const checkVisual = (where: string, state: unknown) => {
    if (isTimelineState(page.visual, state)) {
      checkTimeline(where, state, errors);
      addText(`${where}.statusLabel`, state.statusLabel);
      addText(`${where}.srText`, state.srText);
    }
  };

  if (page.hero) {
    checkComicPanel("hero", page.hero, false, errors);
    addText("hero.caption", page.hero.caption);
    addText("hero.alt", page.hero.alt);
  }

  addText("intro.question", page.intro.question);
  page.intro.lead.forEach((t, i) => addText(`intro.lead[${i}]`, t));
  checkVisual("intro.visual", page.intro.visual);

  // Id a kotvy
  const ids = new Set<string>([SUMMARY_ANCHOR]);
  const registerId = (id: string) => {
    if (!ANCHOR_RE.test(id)) errors.push(`id „${id}" není [a-z0-9-]`);
    if (RESERVED_IDS.has(id) || id.endsWith("-title")) errors.push(`id „${id}" je rezervované`);
    if (ids.has(id)) errors.push(`id „${id}" není unikátní`);
    ids.add(id);
  };

  const noteById = new Map(notes.map((n) => [n.id, n]));
  const usedNotes = new Set<string>();
  const nexts: { from: string; next: string }[] = [];

  const checkFacts = (where: string, facts: Fact[]) => {
    facts.forEach((fact, i) => {
      const fw = `${where}.chapter[${i}]`;
      addText(fw, fact.text);
      if (fact.sources.length === 0) errors.push(`${fw}: fakt nemá zdroj`);
      fact.sources.forEach((ref, j) => {
        const sw = `${fw}.sources[${j}]`;
        if (ref.quoteEn.trim() === "") errors.push(`${sw}: prázdná quoteEn`);
        checkLocation(sw, ref, errors);
        addText(`${sw}.noteCs`, ref.noteCs);
        addText(`${sw}.labelCs`, ref.labelCs);
      });
    });
  };

  const checkContent = (
    where: string,
    step: {
      label: string;
      title: string;
      story: string[];
      chapter: Fact[];
      chapterNotes?: string[];
      sourcesSummary?: string;
      comic?: { panels: ComicPanel[] };
      visual: unknown;
    },
    allowEmptyCaption = false
  ) => {
    if (step.comic) {
      if (step.comic.panels.length === 0) errors.push(`${where}.comic: žádný panel`);
      step.comic.panels.forEach((panel, i) => {
        const pw = `${where}.comic[${i}]`;
        checkComicPanel(pw, panel, allowEmptyCaption, errors);
        if (panel.caption !== "") addText(`${pw}.caption`, panel.caption);
        addText(`${pw}.alt`, panel.alt);
      });
    }
    addText(`${where}.label`, step.label);
    addText(`${where}.title`, step.title);
    addText(`${where}.sourcesSummary`, step.sourcesSummary);
    if (step.story.length === 0) errors.push(`${where}: prázdný story`);
    step.story.forEach((t, i) => addText(`${where}.story[${i}]`, t));
    checkFacts(where, step.chapter);
    for (const noteId of step.chapterNotes ?? []) {
      const note = noteById.get(noteId);
      if (!note) {
        errors.push(`${where}: odkaz na neexistující položku „u nás v chapteru" ${noteId}`);
        continue;
      }
      usedNotes.add(noteId);
      if (!note.enabled) infos.push(`${where}: položka ${noteId} je vypnutá, nevykreslí se`);
    }
    checkVisual(`${where}.visual`, step.visual);
  };

  for (const step of page.steps) {
    registerId(step.id);
    if (step.type === "scene") {
      const where = `krok ${step.id}`;
      checkContent(where, step);
      if (step.chapter.length === 0) errors.push(`${where}: scéna nemá žádný fakt`);
      continue;
    }

    const where = `rozcestí ${step.id}`;
    addText(`${where}.question`, step.question);
    if (step.options.length < 2) errors.push(`${where}: méně než 2 možnosti`);
    if (step.options.length > 0 && step.options[0].tone !== "good") {
      errors.push(`${where}: první možnost není dobrý konec (tone good)`);
    }
    step.options.forEach((option, i) => {
      if (option.tone === "serious" && i !== step.options.length - 1) {
        errors.push(`${where}: možnost ${option.id} (serious) není poslední`);
      }
    });
    for (const option of step.options) {
      registerId(option.id);
      const ow = `${where}/${option.id}`;
      checkContent(ow, option, true);
      addText(`${ow}.nextLabel`, option.nextLabel);
      if (option.next) {
        nexts.push({ from: ow, next: option.next });
        if (!option.nextLabel) errors.push(`${ow}: next bez nextLabel`);
      } else if (option.chapter.length === 0) {
        errors.push(`${ow}: možnost bez faktů musí mít next`);
      }
    }
  }

  for (const { from, next } of nexts) {
    if (!ids.has(next) || next === SUMMARY_ANCHOR) {
      errors.push(`${from}: next „${next}" míří na neexistující krok`);
    }
  }

  page.situations.forEach((s, i) => {
    addText(`situations[${i}].label`, s.label);
    if (!ids.has(s.anchor)) errors.push(`situations[${i}]: kotva „${s.anchor}" neexistuje`);
  });

  // Shrnutí
  addText("summary.title", page.summary.title);
  addText("summary.subtitle", page.summary.subtitle);
  page.summary.points.forEach((p, i) => addText(`summary.points[${i}]`, p.text));
  // Cíle deklaruje stránka sama (T-007r, m-1). Bez `goals` se pokrytí nekontroluje.
  const declared = page.summary.goals;
  if (declared) {
    const covered = new Set(page.summary.points.map((p) => p.goal));
    for (const goal of declared) {
      if (!covered.has(goal)) errors.push(`summary: chybí bod pro cíl ${goal}`);
    }
  }
  page.summary.points.forEach((p, i) => {
    if (p.goal !== undefined && !(declared ?? []).includes(p.goal)) {
      errors.push(`summary.points[${i}]: cíl ${p.goal} stránka nedeklaruje v summary.goals`);
    }
  });
  page.summary.whereToFind.forEach((ref, i) => {
    const where = `summary.whereToFind[${i}]`;
    checkLocation(where, ref, errors);
    addText(`${where}.labelCs`, ref.labelCs);
  });

  page.contacts.forEach((c, i) => {
    addText(`contacts[${i}].role`, c.role);
    addText(`contacts[${i}].when`, c.when);
  });
  page.disclaimer.forEach((t, i) => addText(`disclaimer[${i}]`, t));

  // „U nás v chapteru"
  for (const note of notes) {
    if (!note.enabled) continue;
    addText(`chapterNote ${note.id}`, note.text);
    if (usedNotes.has(note.id) && note.status === "draft") {
      infos.push(`položka ${note.id} je ve stavu draft (štítek „návrh")`);
    }
  }

  for (const { where, text } of texts) errors.push(...findTextIssues(where, text));

  return { errors, infos };
}

export { SUMMARY_ANCHOR };

/** Kontrola celé série: unikátní slugy + validace každé stránky. */
export function validateRegistry(pages: InfoPage[], notes: ChapterNote[]): ValidationResult {
  const errors: string[] = [];
  const infos: string[] = [];
  const slugs = new Set<string>();
  const noteIds = new Set<string>();
  for (const note of notes) {
    if (noteIds.has(note.id)) errors.push(`položka „u nás v chapteru" ${note.id} není unikátní`);
    noteIds.add(note.id);
  }
  for (const page of pages) {
    if (slugs.has(page.slug)) errors.push(`slug „${page.slug}" není unikátní`);
    slugs.add(page.slug);
    const result = validateInfoPage(page, notes);
    errors.push(...result.errors.map((e) => `[${page.slug}] ${e}`));
    infos.push(...result.infos.map((e) => `[${page.slug}] ${e}`));
  }
  return { errors, infos };
}

/**
 * Pojistka pro build (T-007r, M-1): repo nemá CI a Vercel pouští jen
 * `next build`, proto se registr validuje v `generateStaticParams`.
 * Chyba shodí build s čitelným výpisem, informace se jen vypíšou.
 */
export function assertValidRegistry(pages: InfoPage[], notes: ChapterNote[]): void {
  const { errors, infos } = validateRegistry(pages, notes);
  for (const info of infos) console.warn(`[info-pages] ${info}`);
  if (errors.length > 0) {
    throw new Error(
      `Info stránky /pravidla neprošly validací (${errors.length}):\n` +
        errors.map((e) => `  - ${e}`).join("\n")
    );
  }
}
