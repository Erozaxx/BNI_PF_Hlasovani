/**
 * Testy info stránek /pravidla (iter-029, T-007, arch_iter-029_T-001
 * sekce 12 a 13.1 bod 15 a 16).
 *
 * Bez DATABASE_URL, bez sítě. Spuštění: npm run test:info-pages
 *
 * 1. Validátor nad všemi stránkami registru (reálná data) bez chyb.
 * 2. Jednotkové případy validátoru na upravených kopiích dat.
 * 3. Čisté funkce (formát data, šablony, shrnutí zdrojů, odkazy na PDF).
 * 4. Statický render stránky přes react-dom/server (bez JS, bez DB):
 *    štítky „u nás v chapteru", vypnutá položka, citace s lang="en".
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChapterNotes, chapterNoteLabel } from "../components/info/ChapterNoteBox";
import { comicWraps } from "../components/info/ComicStrip";
import { InfoPageView } from "../components/info/InfoPageView";
import { CHAPTER_NOTES } from "../content/pravidla/u-nas-v-chapteru";
import { TEMPLATE_TEXTS } from "../content/pravidla/texty-sablony";
import {
  fillTemplate,
  formatCounter,
  formatDateCs,
  formatSourcesSummary,
  joinCs,
  uniqueSources,
} from "../lib/info-pages/format";
import { INFO_PAGES, getInfoPage } from "../lib/info-pages/registry";
import { pickActiveStep } from "../lib/info-pages/scrolly";
import { SOURCE_DOCS, sourceHref, sourceLinkText, sourceShortRef } from "../lib/info-pages/sources";
import type {
  Branch,
  ChapterNote,
  Comic,
  ComicPanel,
  Fact,
  InfoPage,
  Scene,
  VisualKind,
} from "../lib/info-pages/types";
import {
  assertValidRegistry,
  findTextIssues,
  validateInfoPage,
  validateRegistry,
} from "../lib/info-pages/validate";

const absence = getInfoPage("absence");
if (!absence) throw new Error("stránka absence chybí v registru");
const basePage: InfoPage = absence;

/** Hluboká kopie dat, aby si případy navzájem nepřepisovaly stav. */
function clonePage(): InfoPage {
  return JSON.parse(JSON.stringify(basePage)) as InfoPage;
}

function cloneNotes(): ChapterNote[] {
  return JSON.parse(JSON.stringify(CHAPTER_NOTES)) as ChapterNote[];
}

function scene(page: InfoPage, id: string): Scene<VisualKind> {
  const step = page.steps.find((s) => s.id === id);
  if (!step || step.type !== "scene") throw new Error(`scéna ${id} nenalezena`);
  return step;
}

function branch(page: InfoPage, id: string): Branch<VisualKind> {
  const step = page.steps.find((s) => s.id === id);
  if (!step || step.type !== "branch") throw new Error(`rozcestí ${id} nenalezeno`);
  return step;
}

function errorsOf(page: InfoPage, notes: ChapterNote[] = CHAPTER_NOTES): string[] {
  return validateInfoPage(page, notes).errors;
}

function assertHasError(errors: string[], pattern: RegExp): void {
  assert.ok(
    errors.some((e) => pattern.test(e)),
    `čekána chyba ${pattern}, dostal jsem: ${JSON.stringify(errors)}`
  );
}

function pdfPageCount(path: string): number {
  const data = readFileSync(path).toString("latin1");
  const counts = Array.from(data.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)).map((m) =>
    Number(m[1])
  );
  if (counts.length > 0) return Math.max(...counts);
  return (data.match(/\/Type\s*\/Page\b(?!s)/g) ?? []).length;
}

/** Minimální fiktivní stránka bez vizuálu a bez cílů (jen v testu, ne v registru). */
function nonePage(): InfoPage<"none"> {
  const ref = { doc: "ops-manual-2022" as const, page: 55, quoteEn: "Test quote." };
  return {
    slug: "test-bez-osy",
    title: "Testovací stránka",
    description: "Stránka bez osy.",
    updated: "2026-09-28",
    visual: "none",
    situations: [{ label: "Situace", anchor: "krok-a" }],
    intro: { question: "Otázka?", lead: ["Úvod."], visual: {} },
    steps: [
      {
        type: "scene",
        id: "krok-a",
        label: "Krok 1",
        title: "První krok",
        story: ["Příběh."],
        chapter: [{ text: "Fakt.", obligation: "must", sources: [ref] }],
        visual: {},
      },
      {
        type: "branch",
        id: "rozcesti",
        question: "Co dál?",
        options: [
          { tone: "good", id: "dobre", label: "Možnost 1", title: "Dobře", story: ["Text."], chapter: [{ text: "Fakt.", sources: [ref] }], visual: {} },
          { tone: "serious", id: "dal", label: "Možnost 2", title: "Dál", story: ["Text."], chapter: [], next: "krok-a", nextLabel: "Zpět", visual: {} },
        ],
      },
    ],
    summary: { title: "Shrnutí", points: [{ text: "Bod." }], whereToFind: [{ doc: "general-policies", page: 1 }] },
    contacts: [],
    disclaimer: ["Stav k {updated}."],
  };
}

/** Všechny soubory pod adresářem (rekurzivně). */
function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

/** Posloupnost úrovní nadpisů v HTML (bez aria-hidden sticky prvku). */
function headingLevels(html: string): number[] {
  const visible = html.replace(/<div class="info-sticky"[\s\S]*?(?=<div class="info-flow)/, "");
  return Array.from(visible.matchAll(/<h([1-6])\b/g)).map((m) => Number(m[1]));
}

type TestCase = { name: string; run: () => void };

const cases: TestCase[] = [
  // --- 1. Reálná data ---
  {
    name: "01. registr: vsechny stranky projdou validatorem bez chyb",
    run: () => {
      const result = validateRegistry(INFO_PAGES, CHAPTER_NOTES);
      assert.deepEqual(result.errors, []);
    },
  },
  {
    name: "02. C1 az C7 existuji, jsou approved a enabled (brief T-007, rozhodnuti 1)",
    run: () => {
      assert.deepEqual(
        CHAPTER_NOTES.map((n) => n.id),
        ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]
      );
      for (const note of CHAPTER_NOTES) {
        assert.equal(note.status, "approved", note.id);
        assert.equal(note.enabled, true, note.id);
      }
      const infos = validateInfoPage(basePage, CHAPTER_NOTES).infos;
      assert.ok(!infos.some((i) => /draft/.test(i)), JSON.stringify(infos));
    },
  },
  {
    name: "03. krok vysledek ma neutralni stav osy (brief T-007, rozhodnuti 2)",
    run: () => {
      const visual = scene(basePage, "vysledek").visual as { status: string; statusLabel: string };
      assert.equal(visual.status, "none");
      assert.equal(visual.statusLabel, "Rozhodnuto");
    },
  },
  {
    name: "04. PDF: soubory existuji v public/ a pageCount sedi se skutecnym PDF",
    run: () => {
      for (const doc of Object.values(SOURCE_DOCS)) {
        const path = join(process.cwd(), "public", doc.href);
        assert.ok(existsSync(path), `chybí ${path}`);
        assert.equal(pdfPageCount(path), doc.pageCount, doc.href);
      }
    },
  },
  {
    name: "05. zadna stranka nema slug zdroje a slugy jsou unikatni",
    run: () => {
      const slugs = INFO_PAGES.map((p) => p.slug);
      assert.ok(!slugs.includes("zdroje"));
      assert.equal(new Set(slugs).size, slugs.length);
    },
  },

  // --- 2. Jednotkové případy validátoru ---
  {
    name: "06. duplicitni id kroku -> chyba",
    run: () => {
      const page = clonePage();
      scene(page, "nahradnik").id = "uvod";
      assertHasError(errorsOf(page), /id „uvod" není unikátní/);
    },
  },
  {
    name: "07. id koliduje s kotvou shrnuti -> chyba",
    run: () => {
      const page = clonePage();
      scene(page, "uvod").id = "shrnuti";
      assertHasError(errorsOf(page), /id „shrnuti" není unikátní/);
    },
  },
  {
    name: "08. kotva mimo [a-z0-9-] -> chyba",
    run: () => {
      const page = clonePage();
      scene(page, "uvod").id = "Úvod";
      assertHasError(errorsOf(page), /není \[a-z0-9-\]/);
    },
  },
  {
    name: "09. next miri na neexistujici krok -> chyba",
    run: () => {
      const page = clonePage();
      branch(page, "co-ted").options[1].next = "neexistuje";
      assertHasError(errorsOf(page), /next „neexistuje" míří na neexistující krok/);
    },
  },
  {
    name: "10. prvni moznost rozcesti neni dobry konec -> chyba",
    run: () => {
      const page = clonePage();
      const b = branch(page, "vysledek-vyboru");
      b.options = [b.options[1], b.options[0], b.options[2]];
      assertHasError(errorsOf(page), /první možnost není dobrý konec/);
    },
  },
  {
    name: "11. serious moznost neni posledni -> chyba",
    run: () => {
      const page = clonePage();
      const b = branch(page, "vysledek-vyboru");
      b.options = [b.options[0], b.options[2], b.options[1]];
      assertHasError(errorsOf(page), /\(serious\) není poslední/);
    },
  },
  {
    name: "12. moznost s prazdnym chapter a next projde, bez next -> chyba",
    run: () => {
      const ok = clonePage();
      const option = branch(ok, "co-ted").options[1];
      assert.equal(option.chapter.length, 0);
      assert.ok(option.next);
      assert.deepEqual(errorsOf(ok), []);

      const bad = clonePage();
      delete branch(bad, "co-ted").options[1].next;
      assertHasError(errorsOf(bad), /možnost bez faktů musí mít next/);
    },
  },
  {
    name: "13. fakt bez zdroje -> chyba",
    run: () => {
      const page = clonePage();
      scene(page, "uvod").chapter[0].sources = [];
      assertHasError(errorsOf(page), /fakt nemá zdroj/);
    },
  },
  {
    name: "14. prazdna quoteEn -> chyba",
    run: () => {
      const page = clonePage();
      scene(page, "uvod").chapter[0].sources[0].quoteEn = "  ";
      assertHasError(errorsOf(page), /prázdná quoteEn/);
    },
  },
  {
    name: "15. strana citace mimo rozsah PDF -> chyba (manual 83, GP 5, 0)",
    run: () => {
      for (const [doc, page] of [
        ["ops-manual-2022", 83],
        ["general-policies", 5],
        ["ops-manual-2022", 0],
      ] as const) {
        const p = clonePage();
        const ref = scene(p, "uvod").chapter[0].sources[0];
        ref.doc = doc;
        ref.page = page;
        assertHasError(errorsOf(p), /mimo rozsah/);
      }
    },
  },
  {
    name: "16. strana ve whereToFind mimo rozsah -> chyba",
    run: () => {
      const page = clonePage();
      page.summary.whereToFind[0].page = 99;
      assertHasError(errorsOf(page), /summary\.whereToFind\[0\]: strana 99 mimo rozsah/);
    },
  },
  {
    name: "17. em dash a pomlcka ' – ' v ceskem textu -> chyba",
    run: () => {
      const a = clonePage();
      scene(a, "uvod").story[0] = "Chapter se schází — každý čtvrtek.";
      assertHasError(errorsOf(a), /em dash/);
      const b = clonePage();
      scene(b, "uvod").chapter[0].text = "Docházka – důležitá věc.";
      assertHasError(errorsOf(b), /pomlčka/);
    },
  },
  {
    name: "18. PALMS, VP, Accountability v ceskem textu -> chyba, v quoteEn ne",
    run: () => {
      for (const term of ["PALMS", "VP", "Accountability"]) {
        const page = clonePage();
        scene(page, "prvni-absence").chapter[0].text = `Zápis do ${term} do 48 hodin.`;
        assertHasError(errorsOf(page), new RegExp(`nevysvětlená zkratka ${term}`));
      }
      // Reálná data mají PALMS i Accountability v citacích a projdou (případ 01).
      const quotes = basePage.steps
        .flatMap((s): { chapter: Fact[] }[] => (s.type === "scene" ? [s] : s.options))
        .flatMap((s) => s.chapter)
        .flatMap((f) => f.sources)
        .map((r) => r.quoteEn)
        .join(" ");
      assert.match(quotes, /PALMS/);
      assert.match(quotes, /Accountability/);
      assert.deepEqual(findTextIssues("x", "viceprezident a členský výbor"), []);
    },
  },
  {
    name: "19. slug zdroje a duplicitni slug v registru -> chyba",
    run: () => {
      const page = clonePage();
      page.slug = "zdroje";
      assertHasError(errorsOf(page), /slug „zdroje" je rezervovaný/);
      const result = validateRegistry([basePage, clonePage()], CHAPTER_NOTES);
      assertHasError(result.errors, /slug „absence" není unikátní/);
    },
  },
  {
    name: "20. kotva situace v rozcestniku neexistuje -> chyba",
    run: () => {
      const page = clonePage();
      page.situations[0].anchor = "neni-tu";
      assertHasError(errorsOf(page), /kotva „neni-tu" neexistuje/);
    },
  },
  {
    name: "21. chapterNotes: neexistujici id -> chyba, vypnute -> jen informace",
    run: () => {
      const page = clonePage();
      scene(page, "druha-absence").chapterNotes = ["C4", "C99"];
      assertHasError(errorsOf(page), /neexistující položku „u nás v chapteru" C99/);

      const notes = cloneNotes();
      notes.find((n) => n.id === "C4")!.enabled = false;
      const result = validateInfoPage(basePage, notes);
      assert.deepEqual(result.errors, []);
      assert.ok(result.infos.some((i) => /C4 je vypnutá/.test(i)), JSON.stringify(result.infos));
    },
  },
  {
    name: "22. polozka ve stavu draft -> informace, ne chyba",
    run: () => {
      const notes = cloneNotes();
      notes.find((n) => n.id === "C1")!.status = "draft";
      const result = validateInfoPage(basePage, notes);
      assert.deepEqual(result.errors, []);
      assert.ok(result.infos.some((i) => /C1 je ve stavu draft/.test(i)), JSON.stringify(result.infos));
    },
  },
  {
    name: "23. pocitadlo absenci nesedi se znackami A -> chyba",
    run: () => {
      const page = clonePage();
      const visual = scene(page, "druha-absence").visual as { counters: { absences: number } };
      visual.counters.absences = 3;
      assertHasError(errorsOf(page), /počitadlo absencí 3, značek A 2/);
    },
  },
  {
    name: "24. tyden mimo 1 az 26 -> chyba",
    run: () => {
      const page = clonePage();
      const visual = scene(page, "nahradnik").visual as { marks: { week: number }[] };
      visual.marks[0].week = 27;
      assertHasError(errorsOf(page), /týden 27 mimo rozsah/);
    },
  },
  {
    name: "25. shrnuti nepokryva cil 6 -> chyba",
    run: () => {
      const page = clonePage();
      page.summary.points = page.summary.points.filter((p) => p.goal !== 6);
      assertHasError(errorsOf(page), /chybí bod pro cíl 6/);
    },
  },
  {
    name: "26. neplatne datum updated -> chyba",
    run: () => {
      const page = clonePage();
      page.updated = "28. 9. 2026";
      assertHasError(errorsOf(page), /není ISO datum/);
    },
  },

  // --- 3. Čisté funkce ---
  {
    name: "27. formatDateCs a fillTemplate",
    run: () => {
      assert.equal(formatDateCs("2026-09-28"), "28. 9. 2026");
      assert.equal(formatDateCs("2026-01-05"), "5. 1. 2026");
      assert.equal(formatDateCs("nesmysl"), "nesmysl");
      assert.equal(fillTemplate(TEMPLATE_TEXTS.updated, { updated: "2026-09-28" }), "Stav k 28. 9. 2026");
      assert.equal(fillTemplate(TEMPLATE_TEXTS.timeline.absences, { n: 2 }), "absence 2 ze 3");
      assert.equal(joinCs(["39", "54", "55", "61"]), "39, 54, 55 a 61");
      assert.equal(joinCs(["59"]), "59");
    },
  },
  {
    name: "28. sourceHref, sourceLinkText, sourceShortRef",
    run: () => {
      const ref = { doc: "ops-manual-2022" as const, page: 55 };
      assert.equal(sourceHref(ref), "/pravidla/zdroje/bni-chapter-operations-manual-2022-2023.pdf#page=55");
      assert.equal(sourceLinkText(ref), "Otevřít PDF, strana 55 (PDF, 1,7 MB)");
      assert.equal(sourceShortRef(ref), "manuál str. 55");
      assert.equal(
        sourceShortRef({ doc: "general-policies", page: 1, rule: "General Policy #5" }),
        "General Policy #5"
      );
      assert.equal(
        sourceHref({ doc: "general-policies", page: 2 }),
        "/pravidla/zdroje/bni-general-policies.pdf#page=2"
      );
    },
  },
  {
    name: "29. uniqueSources odstrani duplicitni citace (citace jako vyse)",
    run: () => {
      const sources = uniqueSources(scene(basePage, "nahradnik").chapter);
      // GP #5, Substitute Program 3, manuál 55, Substitute Program 1
      assert.equal(sources.length, 4);
    },
  },
  {
    name: "30. formatSourcesSummary sedi s texty T-005 u kroku jen s manualem",
    run: () => {
      for (const id of ["prvni-absence", "druha-absence", "treti-absence", "ctvrta-absence", "vysledek"]) {
        const s = scene(basePage, id);
        assert.equal(formatSourcesSummary(uniqueSources(s.chapter)), s.sourcesSummary, id);
      }
    },
  },

  {
    name: "39. T-010r: formatCounter pro n = 0, 3, 4, 5 (absence i nahradnik)",
    run: () => {
      const T = TEMPLATE_TEXTS.timeline;
      const abs = { within: T.absences, overByOne: T.absencesOverByOne, over: T.absencesOver };
      const sub = { within: T.substitutes, overByOne: T.substitutesOverByOne, over: T.substitutesOver };
      assert.equal(formatCounter(0, abs), "absence 0 ze 3");
      assert.equal(formatCounter(3, abs), "absence 3 ze 3");
      assert.equal(formatCounter(4, abs), "absence 4, o jednu nad limit");
      assert.equal(formatCounter(5, abs), "absence 5, nad limitem 3");
      assert.equal(formatCounter(0, sub), "náhradník 0 ze 3");
      assert.equal(formatCounter(3, sub), "náhradník 3 ze 3");
      assert.equal(formatCounter(4, sub), "náhradník 4, o jednu nad limit");
      assert.equal(formatCounter(5, sub), "náhradník 5, nad limitem 3");
    },
  },
  {
    name: "40. T-010r: render ctvrte absence ukazuje pocitadlo nad limitem, ne '4 ze 3'",
    run: () => {
      const html = renderToStaticMarkup(
        createElement(InfoPageView, { page: basePage, notes: CHAPTER_NOTES, baseUrl: "" })
      );
      assert.ok(html.includes("absence 4, o jednu nad limit"));
      assert.ok(!html.includes("absence 4 ze 3"));
      assert.ok(html.includes("absence 3 ze 3"));
      const volno = scene(basePage, "volno");
      assert.equal(volno.story.length, 3);
      assert.equal(
        volno.story[2],
        "Když jednou chybíš kvůli chřipce, je to absence, nebo pošleš náhradníka. Volno je na delší dobu, kdy víš, že několik schůzek po sobě nepřijdeš."
      );
    },
  },

  {
    name: "41. T-010r2: pickActiveStep (krok v pasmu, navrat k uvodu, mezera mezi kroky)",
    run: () => {
      const order = ["uvod", "nahradnik", "prvni-absence"];
      // Pásmo protíná krok: poslední protínající v pořadí dokumentu.
      assert.equal(pickActiveStep(order, new Set(["nahradnik"]), null, false), "nahradnik");
      assert.equal(pickActiveStep(order, new Set(["prvni-absence", "nahradnik"]), "uvod", false), "prvni-absence");
      // Návrat úplně nahoru k úvodu: výchozí stav, i když byl aktivní pozdější krok.
      assert.equal(pickActiveStep(order, new Set(), "prvni-absence", true), null);
      assert.equal(pickActiveStep(order, new Set(), null, true), null);
      // Mezera mezi kroky: drží se předchozí stav, osa nebliká.
      assert.equal(pickActiveStep(order, new Set(), "nahradnik", false), "nahradnik");
      // Protínající krok má přednost před pozicí prvního kroku.
      assert.equal(pickActiveStep(order, new Set(["uvod"]), "prvni-absence", true), "uvod");
    },
  },

  {
    name: "42. T-010r4: bez stitku zavazne/doporucene, vsechny fakty zustavaji, vybor jedna cervene",
    run: () => {
      const html = renderToStaticMarkup(
        createElement(InfoPageView, { page: basePage, notes: CHAPTER_NOTES, baseUrl: "" })
      );
      const text = html.replace(/<[^>]+>/g, " ");
      assert.ok(!/závazné|doporučené/.test(text), "štítek nebo legenda závazné/doporučené na stránce");
      assert.ok(!html.includes("info-tag"));
      const facts = basePage.steps
        .flatMap((s): { chapter: Fact[] }[] => (s.type === "scene" ? [s] : s.options))
        .flatMap((s) => s.chapter);
      assert.ok(facts.some((f) => f.obligation), "obligation zůstává v datech");
      const rendered = (html.match(/<ul class="info-facts[^"]*">([\s\S]*?)<\/ul>/g) ?? [])
        .map((ul) => (ul.match(/<li\b/g) ?? []).length)
        .reduce((a, b) => a + b, 0);
      assert.equal(rendered, facts.length);
      for (const fact of facts) assert.ok(html.includes(fact.text.replace(/"/g, "&quot;")), fact.text);
      const committee = renderToStaticMarkup(
        createElement(InfoPageView, { page: basePage, notes: CHAPTER_NOTES, baseUrl: "" })
      ).includes("bg-[#cf2031]");
      assert.ok(committee, "stav committee má červenou tečku");
      assert.ok(!html.includes("bg-navy"), "navy u stavu osy už není");
    },
  },

  {
    name: "43. T-010k: popisky komiksu presne podle tabulky briefu, soubory existuji a rozmery sedi s PNG",
    run: () => {
      const expected: Record<string, string[]> = {
        uvod: ["Každý čtvrtek se potkáváme.", "Poznáváme se, doporučujeme si a rosteme společně.", "Tvoje účast má smysl."],
        nahradnik: ["Ve čtvrtek nemůžu na schůzku.", "Pošlu za sebe náhradníka.", "Skvěle. To se nepočítá jako absence."],
        "prvni-absence": ["Po první absenci ti přijde e-mail.", "A ozve se ti někdo z výboru, jestli je všechno v pořádku."],
        "druha-absence": ["Po druhé absenci ti zavoláme.", "A pošleme ti varovný dopis."],
        "treti-absence": ["1. absence", "2. absence", "3. absence, pořád v limitu.", "4. absence už je nad limit."],
        volno: ["Čeká mě náročné období.", "Požádám předem o volno.", "Volno se schválí a absence se nepočítá."],
        "ctvrta-absence": ["Po čtvrté absenci může výbor začít jednat.", "Není to automatické. Vždy záleží na okolnostech."],
        slyseni: ["Pozveme tě na rozhovor.", "Můžeš říct, jak to vidíš ty.", "Z rozhovoru se pořídí písemný záznam."],
        hlasovani: ["Členský výbor situaci prodiskutuje.", "A rozhodne společným hlasováním."],
        vysledek: ["Nejdřív ti zavoláme.", "A potom ti pošleme oficiální dopis."],
        "chodis-dal": [""],
        "potrebujes-volno": [""],
        "odchod-s-kreditem": [""],
      };
      assert.equal(basePage.hero?.caption, "Stejná pravidla pro všechny. Jasná a férová.");
      const items = basePage.steps.flatMap((s): { id: string; comic?: Comic }[] =>
        s.type === "scene" ? [s] : s.options
      );
      const withComic = items.filter((i) => i.comic).map((i) => i.id);
      assert.deepEqual(withComic.sort(), Object.keys(expected).sort());
      for (const item of items) {
        if (!item.comic) continue;
        assert.deepEqual(item.comic.panels.map((p) => p.caption), expected[item.id], item.id);
      }
      // Soubory a rozměry (IHDR v PNG)
      const panels: ComicPanel[] = [basePage.hero!, ...items.flatMap((i) => i.comic?.panels ?? [])];
      for (const p of panels) {
        const path = join(process.cwd(), "public", p.src);
        assert.ok(existsSync(path), `chybí ${path}`);
        const buf = readFileSync(path);
        assert.equal(buf.toString("latin1", 1, 4), "PNG", p.src);
        assert.equal(buf.readUInt32BE(16), p.width, `${p.src} width`);
        assert.equal(buf.readUInt32BE(20), p.height, `${p.src} height`);
        assert.ok(buf.length < 25 * 1024, `${p.src} má ${buf.length} B`);
        assert.ok(p.alt.trim().length > 0, `${p.src} bez alt`);
      }
    },
  },
  {
    name: "44. T-010k: validator komiksu (src mimo adresar, prazdny alt, prazdny caption u kroku, u karty povolen)",
    run: () => {
      const a = clonePage();
      scene(a, "uvod").comic!.panels[0].src = "/obrazky/x.png";
      assertHasError(errorsOf(a), /není pod \/pravidla\/komiksy\//);
      const b = clonePage();
      scene(b, "uvod").comic!.panels[1].alt = " ";
      assertHasError(errorsOf(b), /prázdný alt/);
      const c = clonePage();
      scene(c, "uvod").comic!.panels[2].caption = "";
      assertHasError(errorsOf(c), /prázdný caption/);
      const d = clonePage();
      d.hero!.caption = "";
      assertHasError(errorsOf(d), /hero: prázdný caption/);
      const e = clonePage();
      scene(e, "uvod").comic!.panels[0].width = 0;
      assertHasError(errorsOf(e), /width 0 není kladné/);
      const ok = clonePage();
      assert.equal(branch(ok, "co-ted").options[0].comic!.panels[0].caption, "");
      assert.deepEqual(errorsOf(ok), []);
    },
  },
  {
    name: "45. T-010k: zalomeni pruhu na uzkem displeji jen u 4 uzkych panelu",
    run: () => {
      assert.equal(comicWraps(scene(basePage, "treti-absence").comic!.panels), true);
      for (const id of ["uvod", "nahradnik", "volno", "slyseni", "prvni-absence", "hlasovani"]) {
        assert.equal(comicWraps(scene(basePage, id).comic!.panels), false, id);
      }
    },
  },
  {
    name: "46. T-010k: render komiksu (popisky jako text, lazy krome hero, rozmery img, poradi nadpis > komiks > pribeh)",
    run: () => {
      const html = renderToStaticMarkup(
        createElement(InfoPageView, { page: basePage, notes: CHAPTER_NOTES, baseUrl: "" })
      );
      assert.ok(html.includes("Stejná pravidla pro všechny. Jasná a férová."));
      assert.ok(html.includes("4. absence už je nad limit."));
      const imgs = Array.from(html.matchAll(/<img\b[^>]*src="(\/pravidla\/komiksy\/[^"]+)"[^>]*>/g));
      assert.equal(imgs.length, 30, "30 kreseb: 26 panelů, 3 karty, hero");
      for (const [tag, src] of imgs) {
        assert.match(tag, /width="\d+"/);
        assert.match(tag, /height="\d+"/);
        if (src.endsWith("hero-1.png")) assert.ok(!/loading="lazy"/.test(tag), "hero nesmí být lazy");
        else assert.match(tag, /loading="lazy"/, src);
      }
      const section = html.slice(html.indexOf('id="nahradnik"'));
      const iTitle = section.indexOf("Nemůžeš přijít, pošleš náhradníka");
      const iComic = section.indexOf("info-comic");
      const iStory = section.indexOf("Ve třetím týdnu máš");
      assert.ok(iTitle < iComic && iComic < iStory, "komiks má být mezi nadpisem a příběhem");
    },
  },

  // --- 4. Statický render ---
  {
    name: "31. stitek u nas v chapteru: approved bez 'navrh', draft s 'navrh', vypnuta se nevykresli",
    run: () => {
      const approved = CHAPTER_NOTES[0];
      assert.equal(chapterNoteLabel(approved), "U nás v chapteru");
      assert.equal(chapterNoteLabel({ ...approved, status: "draft" }), "U nás v chapteru · návrh");

      const notes = cloneNotes();
      notes.find((n) => n.id === "C6")!.enabled = false;
      const html = renderToStaticMarkup(createElement(ChapterNotes, { ids: ["C4", "C6"], notes }));
      assert.ok(html.includes(notes.find((n) => n.id === "C4")!.text));
      assert.ok(!html.includes(notes.find((n) => n.id === "C6")!.text));
    },
  },
  {
    name: "32. render cele stranky: vsechny kroky, citace lang=en, zadne 'navrh', zadne odkazy do aplikace",
    run: () => {
      const html = renderToStaticMarkup(
        createElement(InfoPageView, { page: basePage, notes: CHAPTER_NOTES, baseUrl: "" })
      );
      for (const step of basePage.steps) {
        assert.ok(html.includes(`id="${step.id}"`), step.id);
        if (step.type === "branch") {
          for (const option of step.options) assert.ok(html.includes(`id="${option.id}"`), option.id);
        }
      }
      assert.ok(html.includes('id="shrnuti"'));
      assert.ok(!html.includes("návrh"), "štítek „návrh“ se nesmí vykreslit");
      assert.equal((html.match(/U nás v chapteru/g) ?? []).length >= 7, true);
      assert.ok(html.includes('lang="en"'));
      assert.ok(html.includes("<details"));
      assert.ok(html.includes('role="img"'));
      assert.ok(!/href="\/(dashboard|meetings|admin|members|login)/.test(html));
      assert.ok(!html.includes("—"), "em dash ve výstupu");
    },
  },
  {
    name: "33. M-1: assertValidRegistry vyhodi pri chybe, pri informacich (draft, vypnuta) ne",
    run: () => {
      assert.doesNotThrow(() => assertValidRegistry(INFO_PAGES, CHAPTER_NOTES));
      const bad = clonePage();
      branch(bad, "co-ted").options[1].next = "neexistuje";
      scene(bad, "uvod").chapter[0].sources[0].page = 999;
      assert.throws(
        () => assertValidRegistry([bad], CHAPTER_NOTES),
        (e: unknown) =>
          e instanceof Error &&
          /neprošly validací \(2\)/.test(e.message) &&
          /next „neexistuje"/.test(e.message) &&
          /strana 999/.test(e.message)
      );
      const notes = cloneNotes();
      notes[0].status = "draft";
      notes[1].enabled = false;
      const warn = console.warn;
      console.warn = () => {};
      try {
        assert.doesNotThrow(() => assertValidRegistry(INFO_PAGES, notes));
      } finally {
        console.warn = warn;
      }
    },
  },
  {
    name: "34. m-1: cile deklaruje stranka, bez goals projde, nepokryty nebo nedeklarovany cil -> chyba",
    run: () => {
      assert.deepEqual(basePage.summary.goals, [1, 2, 3, 4, 5, 6]);
      const none = nonePage();
      assert.deepEqual(validateInfoPage(none, CHAPTER_NOTES).errors, []);

      const extra = clonePage();
      extra.summary.goals = [1, 2, 3, 4, 5, 6, 7];
      assertHasError(errorsOf(extra), /chybí bod pro cíl 7/);

      const undeclared = clonePage();
      delete undeclared.summary.goals;
      assertHasError(errorsOf(undeclared), /cíl 1 stránka nedeklaruje/);
    },
  },
  {
    name: "35. m-2: fiktivni stranka s visual none projde validatorem a vyrenderuje se bez osy",
    run: () => {
      const page = nonePage();
      assert.deepEqual(validateRegistry([basePage, page], CHAPTER_NOTES).errors, []);
      const html = renderToStaticMarkup(
        createElement(InfoPageView, { page, notes: CHAPTER_NOTES, baseUrl: "" })
      );
      assert.ok(html.includes("info-layout--none"));
      assert.ok(!html.includes("info-sticky"), "sticky se nesmí vykreslit");
      assert.ok(!html.includes('role="img"'), "mini osa se nesmí vykreslit");
      assert.ok(!html.includes("Půl roku v chapteru"), "legenda osy se nesmí vykreslit");
      assert.ok(html.includes('id="krok-a"') && html.includes('id="dal"'));
      const css = readFileSync(join(process.cwd(), "app", "pravidla", "pravidla.css"), "utf8");
      assert.match(css, /\.info-layout:not\(\.info-layout--none\) \.info-step \{\s*min-height: 70vh/);
    },
  },
  {
    name: "36. m-3: nadpisy na strance nepreskakuji uroven (H1 -> H2 -> H3)",
    run: () => {
      for (const page of [basePage, nonePage()]) {
        const html = renderToStaticMarkup(
          createElement(InfoPageView, { page, notes: CHAPTER_NOTES, baseUrl: "" })
        );
        const levels = headingLevels(html);
        assert.equal(levels[0], 1, page.slug);
        levels.forEach((level, i) => {
          if (i > 0) assert.ok(level <= levels[i - 1] + 1, `${page.slug}: h${levels[i - 1]} -> h${level}`);
        });
      }
    },
  },
  {
    name: "37. m-4: pod app/pravidla neni route.* ani \"use server\"",
    run: () => {
      const files = listFiles(join(process.cwd(), "app", "pravidla"));
      assert.ok(files.length > 0);
      for (const file of files) {
        assert.ok(!/(^|[\\/])route\.(ts|tsx|js|jsx|mjs)$/.test(file), `route soubor: ${file}`);
        if (/\.(ts|tsx|js|jsx|mjs)$/.test(file)) {
          const src = readFileSync(file, "utf8");
          assert.ok(!/["']use server["']/.test(src), `server action: ${file}`);
        }
      }
    },
  },
  {
    name: "38. rezervovany slug opengraph-image a id koncici -title -> chyba",
    run: () => {
      const page = clonePage();
      page.slug = "opengraph-image";
      assertHasError(errorsOf(page), /slug „opengraph-image" je rezervovaný/);
      const ids = clonePage();
      scene(ids, "uvod").id = "kontakty-title";
      assertHasError(errorsOf(ids), /id „kontakty-title" je rezervované/);
    },
  },
];

let passed = 0;
let failed = 0;

for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`OK   ${testCase.name}`);
    passed++;
  } catch (error) {
    failed++;
    console.error(`FAIL ${testCase.name}`);
    if (error instanceof Error) {
      console.error(`     ${error.message}`);
    } else {
      console.error(`     ${String(error)}`);
    }
  }
}

const registry = validateRegistry(INFO_PAGES, CHAPTER_NOTES);
for (const info of registry.infos) console.log(`INFO ${info}`);

console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);

if (failed > 0) {
  process.exitCode = 1;
}
