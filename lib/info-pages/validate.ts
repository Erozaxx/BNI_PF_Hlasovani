/**
 * Validátor info stránek (iter-029, T-007, arch_iter-029_T-001 sekce 12).
 * Čistá funkce bez DB, bez Reactu. Spouští ji `scripts/test-info-pages.ts`.
 *
 * iter-030 (T-007a, arch_iter-030_T-001 sekce 7.3 a 7.5): stav vizuálu
 * `leadership-chart`, referenční část (karty rolí, tabulka situací, práva)
 * a glosář rolí napříč registrem.
 *
 * Hlídá jen obecné věci šablony. Jména ani detaily žádného konkrétního
 * případu sem nepatří (repo je veřejné), kontrola prosaku běží mimo repo.
 */
import { ROLE_GLOSSARY, type RoleGlossaryEntry } from "@/content/pravidla/role-glosar";
import { normalizeForm, ROLE_PAGE_SLUG } from "./glossary";
import { SOURCE_DOCS } from "./sources";
import {
  REFERENCE_ANCHORS,
  ROLE_CARD_FIELD_KINDS,
  ROLE_IDS,
  ROLE_RELATIONS,
  SUMMARY_ANCHOR,
} from "./types";
import type {
  AbsenceTimelineState,
  ChapterNote,
  ComicPanel,
  Fact,
  InfoPage,
  InfoReference,
  LeadershipChartState,
  SourceLocation,
  SourceRef,
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

const ROLE_ID_SET = new Set<string>(ROLE_IDS);
const RELATION_SET = new Set<string>(ROLE_RELATIONS);

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

function isLeadershipState(kind: VisualKind, state: unknown): state is LeadershipChartState {
  return kind === "leadership-chart" && typeof state === "object" && state !== null;
}

/** Stav schématu vedení: platné role a vztahy, každá role nejvýš jednou. */
function checkLeadership(where: string, state: LeadershipChartState, errors: string[]): void {
  if (!Array.isArray(state.roles)) {
    errors.push(`${where}: roles není pole`);
    return;
  }
  const seen = new Set<string>();
  for (const { role, relation, label } of state.roles) {
    if (label !== undefined && label.trim() === "") errors.push(`${where}: prázdný label u role ${role}`);
    if (!ROLE_ID_SET.has(role)) errors.push(`${where}: neznámá role „${String(role)}"`);
    if (!RELATION_SET.has(relation)) errors.push(`${where}: neznámý vztah „${String(relation)}" u role ${role}`);
    if (seen.has(role)) errors.push(`${where}: role ${role} je ve stavu víckrát`);
    seen.add(role);
  }
  if (typeof state.srText !== "string") errors.push(`${where}: chybí srText`);
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
    if (isLeadershipState(page.visual, state)) {
      checkLeadership(where, state, errors);
      addText(`${where}.srText`, typeof state.srText === "string" ? state.srText : "");
      for (const r of state.roles) addText(`${where}.label`, r.label);
    }
  };

  if (page.hero) {
    checkComicPanel("hero", page.hero, false, errors);
    addText("hero.caption", page.hero.caption);
    addText("hero.alt", page.hero.alt);
  }

  addText("intro.question", page.intro.question);
  if (page.intro.comic) {
    if (page.intro.comic.panels.length === 0) errors.push("intro.comic: žádný panel");
    page.intro.comic.panels.forEach((panel, i) => {
      checkComicPanel(`intro.comic[${i}]`, panel, false, errors);
      addText(`intro.comic[${i}].caption`, panel.caption);
      addText(`intro.comic[${i}].alt`, panel.alt);
    });
  }
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
  const factLinks: { where: string; text: string; link: { text: string; href: string } }[] = [];
  const usedNotes = new Set<string>();
  const nexts: { from: string; next: string }[] = [];

  const checkSources = (where: string, sources: SourceRef[]) => {
    sources.forEach((ref, j) => {
      const sw = `${where}.sources[${j}]`;
      if (ref.quoteEn.trim() === "") errors.push(`${sw}: prázdná quoteEn`);
      checkLocation(sw, ref, errors);
      addText(`${sw}.noteCs`, ref.noteCs);
      addText(`${sw}.labelCs`, ref.labelCs);
    });
  };

  const checkFacts = (where: string, facts: Fact[], field = "chapter") => {
    facts.forEach((fact, i) => {
      const fw = `${where}.${field}[${i}]`;
      addText(fw, fact.text);
      if (fact.sources.length === 0) errors.push(`${fw}: fakt nemá zdroj`);
      checkSources(fw, fact.sources);
      if (fact.link) factLinks.push({ where: fw, text: fact.text, link: fact.link });
    });
  };

  const checkComic = (where: string, comic: { panels: ComicPanel[] } | undefined) => {
    if (!comic) return;
    if (comic.panels.length === 0) errors.push(`${where}.comic: žádný panel`);
    comic.panels.forEach((panel, i) => {
      checkComicPanel(`${where}.comic[${i}]`, panel, false, errors);
      addText(`${where}.comic[${i}].caption`, panel.caption);
      addText(`${where}.comic[${i}].alt`, panel.alt);
    });
  };

  const checkNoteIds = (where: string, noteIds: string[] | undefined) => {
    for (const noteId of noteIds ?? []) {
      const note = noteById.get(noteId);
      if (!note) {
        errors.push(`${where}: odkaz na neexistující položku „u nás v chapteru" ${noteId}`);
        continue;
      }
      usedNotes.add(noteId);
      if (!note.enabled) infos.push(`${where}: položka ${noteId} je vypnutá, nevykreslí se`);
    }
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
    checkNoteIds(where, step.chapterNotes);
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

  if (page.reference) {
    checkReference(page.reference, {
      registerId,
      addText,
      checkFacts,
      checkSources,
      checkNoteIds,
      checkComic,
      errors,
    });
  }

  for (const { where, text, link } of factLinks) {
    if (link.text === "" || !text.includes(link.text)) errors.push(`${where}: link.text není v textu faktu`);
    if (!link.href.startsWith("#") || !ids.has(link.href.slice(1))) {
      errors.push(`${where}: odkaz „${link.href}" nemíří na kotvu stránky`);
    }
  }

  for (const { from, next } of nexts) {
    if (!ids.has(next) || next === SUMMARY_ANCHOR) {
      errors.push(`${from}: next „${next}" míří na neexistující krok`);
    }
  }

  (page.toc ?? []).forEach((item, i) => {
    const entries = [item, ...(item.children ?? [])];
    entries.forEach((entry, j) => {
      const where = j === 0 ? `toc[${i}]` : `toc[${i}].children[${j - 1}]`;
      addText(`${where}.label`, entry.label);
      if (!ids.has(entry.anchor)) errors.push(`${where}: kotva „${entry.anchor}" neexistuje`);
    });
  });

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
    if (ref.href !== undefined) {
      if (!ref.href.startsWith("#") || !ids.has(ref.href.slice(1))) {
        errors.push(`${where}: odkaz „${ref.href}" nemíří na kotvu stránky`);
      }
      if (!ref.labelCs) errors.push(`${where}: odkaz bez labelCs`);
    }
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

export { REFERENCE_ANCHORS, SUMMARY_ANCHOR };

interface ReferenceChecks {
  registerId: (id: string) => void;
  addText: (where: string, text: string | undefined) => void;
  checkFacts: (where: string, facts: Fact[], field?: string) => void;
  checkSources: (where: string, sources: SourceRef[]) => void;
  checkNoteIds: (where: string, noteIds: string[] | undefined) => void;
  checkComic: (where: string, comic: { panels: ComicPanel[] } | undefined) => void;
  errors: string[];
}

/** Pole, která nesmí být prázdná (ostatní ukážou větu šablony, gate T-006). */
const REQUIRED_FIELDS = new Set<string>(["does", "notDecides"]);

function checkLink(where: string, link: { href: string; label: string }, c: ReferenceChecks): void {
  c.addText(`${where}.link.label`, link.label);
  if (!/^(\/pravidla(\/|$|#)|#)/.test(link.href)) {
    c.errors.push(`${where}: odkaz „${link.href}" nevede na /pravidla ani na kotvu`);
  }
}

/** Fakta referenční části nenesou `obligation` (arch_iter-030 sekce 2.1 a 10). */
function checkNoObligation(where: string, facts: Fact[], errors: string[]): void {
  facts.forEach((fact, i) => {
    if (fact.obligation !== undefined) errors.push(`${where}[${i}]: referenční část nerozlišuje závazné a doporučené (obligation)`);
  });
}

/**
 * Referenční část (arch_iter-030 sekce 7.5): kotvy ve stejné množině jako
 * kroky, karty s poli v pevném pořadí a povinným „Nerozhoduje", zdroj
 * u každého řádku tabulky a každého práva, kontrola textů.
 */
function checkReference(ref: InfoReference, c: ReferenceChecks): void {
  const { errors } = c;
  // Podsekce se vykreslí jen neprázdné, jen jejich kotvy existují.
  c.registerId(REFERENCE_ANCHORS.intro);
  if (ref.roles.length > 0) c.registerId(REFERENCE_ANCHORS.roles);
  if (ref.decisions.length > 0) c.registerId(REFERENCE_ANCHORS.decisions);
  if (ref.rights.length > 0) c.registerId(REFERENCE_ANCHORS.rights);

  c.addText("reference.title", ref.title);
  ref.lead.forEach((t, i) => c.addText(`reference.lead[${i}]`, t));
  c.checkFacts("reference", ref.facts, "facts");
  checkNoObligation("reference.facts", ref.facts, errors);
  c.checkNoteIds("reference", ref.chapterNotes);

  ref.roles.forEach((card) => {
    const where = `karta ${card.id}`;
    c.registerId(card.id);
    if (!ROLE_ID_SET.has(card.id) || card.id === "clen") errors.push(`${where}: id není role s kartou`);
    c.addText(`${where}.title`, card.title);
    c.addText(`${where}.lead`, card.lead);
    c.addText(`${where}.inChart`, card.inChart);
    let lastIndex = -1;
    for (const field of card.fields) {
      const index = ROLE_CARD_FIELD_KINDS.indexOf(field.kind);
      if (index === -1) errors.push(`${where}: neznámé pole ${String(field.kind)}`);
      else if (index <= lastIndex) errors.push(`${where}: pole ${field.kind} není v pevném pořadí (${ROLE_CARD_FIELD_KINDS.join(", ")})`);
      lastIndex = Math.max(lastIndex, index);
      if (field.facts.length === 0 && REQUIRED_FIELDS.has(field.kind)) {
        errors.push(`${where}: pole ${field.kind} nemá žádný fakt`);
      }
      c.checkFacts(where, field.facts, field.kind);
      checkNoObligation(`${where}.${field.kind}`, field.facts, errors);
    }
    for (const kind of REQUIRED_FIELDS) {
      const field = card.fields.find((f) => f.kind === kind);
      if (!field || field.facts.length === 0) errors.push(`${where}: chybí pole ${kind} s aspoň jedním faktem`);
    }
    c.checkComic(where, card.comic);
    if (card.link) checkLink(where, card.link, c);
    for (const sub of card.subAnchors ?? []) {
      const sw = `${where}/${sub.id}`;
      c.registerId(sub.id);
      if (!ROLE_ID_SET.has(sub.id)) errors.push(`${sw}: id není role`);
      c.addText(`${sw}.title`, sub.title);
      if (sub.facts.length === 0) errors.push(`${sw}: pod-kotva nemá žádný fakt`);
      c.checkFacts(sw, sub.facts, "facts");
      checkNoObligation(`${sw}.facts`, sub.facts, errors);
    }
    c.checkNoteIds(where, card.chapterNotes);
  });

  ref.decisions.forEach((row) => {
    const where = `situace ${row.id}`;
    c.registerId(row.id);
    for (const key of ["situation", "decides", "approves", "advises", "informed"] as const) {
      c.addText(`${where}.${key}`, row[key]);
    }
    if (row.sources.length === 0) errors.push(`${where}: řádek nemá zdroj`);
    c.checkSources(where, row.sources);
    if (row.link) checkLink(where, row.link, c);
  });

  ref.rights.forEach((item) => {
    const where = `právo ${item.id}`;
    c.registerId(item.id);
    c.addText(`${where}.text`, item.text);
    if (item.sources.length === 0) errors.push(`${where}: položka nemá zdroj`);
    c.checkSources(where, item.sources);
  });
}

/**
 * Glosář rolí (arch_iter-030 sekce 7.3): platná a unikátní id, neprázdné
 * tvary, tvar patří jen jedné roli. Když je v registru stránka `role`,
 * má každá role z glosáře na ní kartu nebo pod-kotvu.
 */
export function validateGlossary(glossary: RoleGlossaryEntry[], pages: InfoPage[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const forms = new Map<string, string>();
  for (const entry of glossary) {
    if (!ROLE_ID_SET.has(entry.id) || entry.id === "clen") errors.push(`glosář: „${entry.id}" není role s kartou`);
    if (ids.has(entry.id)) errors.push(`glosář: role ${entry.id} je v glosáři víckrát`);
    ids.add(entry.id);
    if (entry.forms.length === 0) errors.push(`glosář: role ${entry.id} nemá žádný tvar`);
    for (const form of entry.forms) {
      if (form.trim() === "") {
        errors.push(`glosář: role ${entry.id} má prázdný tvar`);
        continue;
      }
      const key = normalizeForm(form);
      const owner = forms.get(key);
      if (owner !== undefined && owner !== entry.id) errors.push(`glosář: tvar „${form}" má role ${owner} i ${entry.id}`);
      else if (owner === entry.id) errors.push(`glosář: tvar „${form}" je u role ${entry.id} dvakrát`);
      forms.set(key, entry.id);
    }
  }
  const rolePage = pages.find((p) => p.slug === ROLE_PAGE_SLUG);
  if (rolePage) {
    const anchors = new Set<string>();
    for (const card of rolePage.reference?.roles ?? []) {
      anchors.add(card.id);
      for (const sub of card.subAnchors ?? []) anchors.add(sub.id);
    }
    for (const entry of glossary) {
      if (!anchors.has(entry.id)) errors.push(`glosář: role ${entry.id} nemá na stránce ${ROLE_PAGE_SLUG} kartu ani pod-kotvu`);
    }
  }
  return errors;
}

/** Kontrola celé série: unikátní slugy + validace každé stránky. */
export function validateRegistry(
  pages: InfoPage[],
  notes: ChapterNote[],
  glossary: RoleGlossaryEntry[] = ROLE_GLOSSARY
): ValidationResult {
  const errors: string[] = [...validateGlossary(glossary, pages)];
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
