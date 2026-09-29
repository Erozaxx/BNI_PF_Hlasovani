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
 * 6. iter-030 (T-007b, T-011, případy 58 až 60): reálná stránka rolí,
 *    odkazy z absence na její kotvy, ilustrace R1 až R11.
 * 5. iter-030 (T-007a, případy 47 až 57): glosář a `linkRoles`, absence
 *    s odkazy beze změny textu, schéma vedení, referenční část a validátor
 *    nad fiktivní stránkou `role` (jen v testu, ne v registru), zákaz
 *    rozlišení závazné / doporučené. Spuštění: npm run test:iter-030
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChapterNotes, chapterNoteLabel } from "../components/info/ChapterNoteBox";
import { comicWraps } from "../components/info/ComicStrip";
import { InfoPageView } from "../components/info/InfoPageView";
import { barRows, LeadershipChart } from "../components/info/visuals/LeadershipChart";
import { ROLE_GLOSSARY, ROLE_NAMES, type RoleGlossaryEntry } from "../content/pravidla/role-glosar";
import { ROLE_COMICS } from "../content/pravidla/role-komiksy";
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
import {
  createRoleLinker,
  linkRoles,
  roleHref,
  roleLinksEnabled,
  type Segment,
} from "../lib/info-pages/glossary";
import { INFO_PAGES, getInfoPage } from "../lib/info-pages/registry";
import { popoverPosition, roleSummaries } from "../lib/info-pages/role-popover";
import { pickActiveStep } from "../lib/info-pages/scrolly";
import { SOURCE_DOCS, sourceHref, sourceLinkText, sourceShortRef } from "../lib/info-pages/sources";
import type {
  Branch,
  ChapterNote,
  Comic,
  ComicPanel,
  Fact,
  InfoPage,
  RoleCard,
  RoleId,
  RoleRelation,
  Scene,
  VisualKind,
} from "../lib/info-pages/types";
import { ROLE_IDS } from "../lib/info-pages/types";
import {
  assertValidRegistry,
  findTextIssues,
  validateGlossary,
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

// --- iter-030 (T-007a): fiktivní stránka rolí, jen v testu, ne v registru ---

const TEST_REF = { doc: "ops-manual-2022" as const, page: 34, quoteEn: "Test quote for the role page." };

function testFact(text: string): Fact {
  return { text, sources: [TEST_REF] };
}

/** Karta s povinným polem „Nerozhoduje" (texty fiktivní, bez jmen). */
function testCard(id: RoleId, title: string, extra: Partial<RoleCard> = {}): RoleCard {
  return {
    id,
    title,
    lead: `${title} je role v chapteru.`,
    fields: [
      { kind: "does", facts: [testFact("Dělá testovací věc.")] },
      { kind: "notDecides", facts: [testFact("O členství rozhoduje členský výbor.")] },
    ],
    ...extra,
  };
}

/** Minimální stránka `role` se schématem vedení a referenční částí. */
function rolePage(): InfoPage<"leadership-chart"> {
  return {
    slug: "role",
    title: "Testovací stránka rolí",
    description: "Kdo o čem rozhoduje, testovací data.",
    updated: "2026-09-29",
    visual: "leadership-chart",
    situations: [
      { label: "Kdo rozhoduje o přijetí", anchor: "situace-prihlaska" },
      { label: "Kdo je konzultant regionu", anchor: "konzultant-regionu" },
      { label: "Co smí region", anchor: "prava-regionu" },
    ],
    intro: {
      question: "Kdo o čem rozhoduje?",
      lead: ["Viceprezident vede členský výbor. Výbor rozhoduje o členství."],
      visual: { roles: [], srText: "Celé schéma vedení bez zvýraznění." },
    },
    steps: [
      {
        type: "scene",
        id: "prihlaska-1",
        label: "Přihláška, krok 1",
        title: "Host přijde na schůzku",
        story: [
          "Tým hostitelů tě přivítá. Hostitelé ti po schůzce vysvětlí přihlášku.",
          "Hostitelé a regionální tým pomáhají, viceprezident zatím čeká.",
        ],
        chapter: [testFact("Konzultant regionu může pomoct.")],
        visual: {
          roles: [
            { role: "hostitele", relation: "acts" },
            { role: "region", relation: "advises" },
          ],
          srText: "Provádí tým hostitelů, radí regionální kancelář.",
        },
      },
      {
        type: "scene",
        id: "prihlaska-2",
        label: "Přihláška, krok 2",
        title: "Výbor hlasuje",
        story: ["Člen výboru pro posouzení přihlášek prověří obor, pak hlasuje členský výbor."],
        chapter: [testFact("Rozhoduje členský výbor.")],
        visual: {
          roles: [
            { role: "clen", relation: "informed" },
            { role: "vybor-prihlasky", relation: "acts" },
            { role: "konzultant-regionu", relation: "approves" },
            { role: "clensky-vybor", relation: "decides" },
            { role: "viceprezident", relation: "advises" },
          ],
          srText: "Rozhoduje členský výbor, musí souhlasit konzultant regionu.",
        },
      },
    ],
    reference: {
      title: "Vedení chapteru",
      lead: ["Jádro vedení tvoří prezident, viceprezident a sekretář/pokladník."],
      facts: [testFact("Neobsazené role vedení se obsadí do měsíce.")],
      roles: [
        testCard("prezident", "Prezident", { inChart: "nahoře" }),
        testCard("viceprezident", "Viceprezident"),
        testCard("clensky-vybor", "Členský výbor", {
          fields: [
            { kind: "does", facts: [testFact("Členský výbor přijímá nové členy, viceprezident ho vede.")] },
            { kind: "decides", facts: [testFact("Výbor rozhoduje o volnu.")] },
            { kind: "approval", facts: [testFact("Konzultant regionu potvrdí postup.")] },
            { kind: "notDecides", facts: [testFact("O poplatcích nerozhoduje.")] },
            { kind: "notDefined", facts: [testFact("Pravidla neurčují, kdo obsadí uvolněné místo ve výboru.")] },
          ],
          subAnchors: [
            { id: "vybor-rust", title: "Růst chapteru", facts: [testFact("Volá chybějícím.")] },
            { id: "vybor-prihlasky", title: "Posouzení přihlášek", facts: [testFact("Prověřuje uchazeče.")] },
            { id: "vybor-zapojeni", title: "Zapojení členů", facts: [testFact("Hlídá prodloužení.")] },
            { id: "vybor-vztahy", title: "Vztahy mezi členy", facts: [testFact("Přijímá stížnosti.")] },
          ],
        }),
        testCard("sekretar-pokladnik", "Sekretář/pokladník"),
        testCard("vzdelavaci-koordinator", "Vzdělávací koordinátor"),
        testCard("koordinator-mentoru", "Koordinátor mentorů"),
        testCard("hostitele", "Tým hostitelů"),
        testCard("konzultant-regionu", "Konzultant regionu"),
        testCard("region", "BNI a region", {
          subAnchors: [{ id: "reditel-regionu", title: "Ředitel regionu", facts: [testFact("Souhlasí s výjimkou.")] }],
        }),
      ],
      decisions: [
        {
          id: "situace-prihlaska",
          situation: "Přihláška nového člena",
          decides: "členský výbor",
          approves: "–",
          advises: "člen výboru pro přihlášky prověřuje, viceprezident určí termín",
          informed: "uchazeč, prezident",
          sources: [TEST_REF],
        },
        {
          id: "situace-ctvrta-absence",
          situation: "Čtvrtá absence",
          decides: "členský výbor",
          approves: "viceprezident a konzultant regionu",
          advises: "člen výboru volá",
          informed: "regionální kancelář",
          sources: [TEST_REF],
          link: { href: "/pravidla/absence#ctvrta-absence", label: "Podrobně na stránce absence" },
        },
      ],
      rights: [
        { id: "r1", text: "Pravidla se můžou měnit.", sources: [TEST_REF] },
        { id: "r2", text: "Konzultanti regionu smí mít na schůzce prezentaci.", sources: [TEST_REF] },
      ],
    },
    summary: { title: "Shrnutí", points: [{ text: "O členství rozhoduje členský výbor." }], whereToFind: [{ doc: "ops-manual-2022", page: 34 }] },
    contacts: [{ role: "Viceprezident", when: "Když nevíš, kdo o tvé věci rozhoduje." }],
    disclaimer: ["Stav k {updated}."],
  };
}

function cloneRolePage(): InfoPage<"leadership-chart"> {
  return JSON.parse(JSON.stringify(rolePage())) as InfoPage<"leadership-chart">;
}

function renderPage(page: InfoPage, extra: { roleLinks?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(InfoPageView, { page, notes: CHAPTER_NOTES, baseUrl: "", ...extra })
  );
}

/** Text bez značek (odkazy rolí jsou jen obal, text se nesmí změnit). */
function textContent(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

/** Odstavce a položky, ve kterých se počítají odkazy rolí. */
function blocks(html: string): string[] {
  return Array.from(html.matchAll(/<(p|li|td|dd)\b[^>]*>([\s\S]*?)<\/\1>/g)).map((m) => m[2]);
}

function roleLinkHrefs(html: string): string[] {
  return Array.from(html.matchAll(/<a href="([^"]+)"[^>]*class="info-role-link/g)).map((m) => m[1]);
}

/** Rozměry WebP (VP8, VP8L, VP8X) bez závislostí. */
function webpSize(buf: Buffer): { width: number; height: number } {
  assert.equal(buf.toString("latin1", 0, 4), "RIFF");
  assert.equal(buf.toString("latin1", 8, 12), "WEBP");
  const chunk = buf.toString("latin1", 12, 16);
  if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  throw new Error(`neznámý WebP chunk ${chunk}`);
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
    name: "02. C1 az C13 existuji, jsou approved a enabled (iter-029 C1 az C7, iter-030 C8 az C13, C14 neni)",
    run: () => {
      assert.deepEqual(
        CHAPTER_NOTES.map((n) => n.id),
        ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13"]
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
      // Od iter-030 jsou v textu odkazy na role, text se porovnává bez značek.
      const plain = text.replace(/\s+/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      const noTags = html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      for (const fact of facts) assert.ok(noTags.includes(fact.text) || plain.includes(fact.text), fact.text);
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
  // --- iter-030 (T-007a): glosář, odkazy rolí, schéma vedení, referenční část ---
  {
    name: "47. glosar: realna data bez chyb, clen neni v glosari, tvary unikatni a neprazdne",
    run: () => {
      assert.deepEqual(validateGlossary(ROLE_GLOSSARY, INFO_PAGES), []);
      assert.ok(!ROLE_GLOSSARY.some((e) => e.id === "clen"));
      for (const id of ["vybor-prihlasky", "vybor-rust", "vybor-zapojeni", "vybor-vztahy", "reditel-regionu"]) {
        assert.ok(ROLE_GLOSSARY.some((e) => e.id === id), id);
      }
      // Specializace výboru bez anglického názvu (arch 3.5, K7).
      for (const e of ROLE_GLOSSARY.filter((x) => x.id.startsWith("vybor-"))) assert.equal(e.en, undefined, e.id);
      for (const id of ROLE_IDS) assert.ok(ROLE_NAMES[id].trim().length > 0, id);

      const dup: RoleGlossaryEntry[] = [...ROLE_GLOSSARY, { id: "prezident", forms: ["Výboru"] }];
      const errors = validateGlossary(dup, INFO_PAGES);
      assertHasError(errors, /role prezident je v glosáři víckrát/);
      assertHasError(errors, /tvar „Výboru" má role clensky-vybor i prezident/);
      assertHasError(validateGlossary([{ id: "prezident", forms: [" "] }], []), /prázdný tvar/);
      assertHasError(validateGlossary([{ id: "clen", forms: ["člen"] }], []), /„clen" není role s kartou/);
      assertHasError(validateGlossary([{ id: "prezident", forms: [] }], []), /nemá žádný tvar/);
    },
  },
  {
    name: "48. linkRoles: nejdelsi shoda, prezident ve viceprezidentovi, diakritika, velke pismeno, prvni vyskyt, seen, uvozovky",
    run: () => {
      const on = { selfSlug: "absence", enabled: true };
      const run = (text: string, seen = new Set<RoleId>()) => linkRoles(text, { ...on, seen });
      const linked = (segments: Segment[]) => segments.filter((s) => s.role).map((s) => `${s.role}:${s.text}`);
      const join = (segments: Segment[]) => segments.map((s) => s.text).join("");

      const a = run("Hlasuje členský výbor a výbor pak pošle dopis.");
      assert.deepEqual(linked(a), ["clensky-vybor:členský výbor"]);
      assert.equal(join(a), "Hlasuje členský výbor a výbor pak pošle dopis.");

      const b = run("Viceprezident a prezident.");
      assert.deepEqual(linked(b), ["viceprezident:Viceprezident", "prezident:prezident"]);
      assert.deepEqual(linked(run("Rozhoduje viceprezidentem vedený výbor.")), [
        "viceprezident:viceprezidentem",
        "clensky-vybor:výbor",
      ]);

      const c = run("Napiš členovi výboru, výbory se neodkazují, výboru ano.");
      assert.deepEqual(linked(c), ["clensky-vybor:výboru"]);
      assert.equal(c.find((s) => s.role)!.text, "výboru");
      assert.equal(join(c), "Napiš členovi výboru, výbory se neodkazují, výboru ano.");
      assert.deepEqual(linked(run("Výbor.")), ["clensky-vybor:Výbor"]);
      assert.deepEqual(linked(run("Předvýbor a výborový nejsou role.")), []);

      const seen = new Set<RoleId>();
      assert.deepEqual(linked(run("Konzultant regionu radí.", seen)), ["konzultant-regionu:Konzultant regionu"]);
      assert.deepEqual(linked(run("Konzultant regionu potvrdí postup.", seen)), [], "druhý odstavec kroku");

      const q = run("Role se jmenuje „ředitel regionu“, pak ředitel regionu souhlasí.");
      assert.deepEqual(linked(q), ["reditel-regionu:ředitel regionu"]);
      assert.ok(q[0].text.includes("„ředitel regionu“"), "výskyt v uvozovkách zůstal textem");
      assert.deepEqual(linked(run('Citace "Vice President and viceprezident" zůstává.')), []);
      assert.deepEqual(linked(run("Adresa /pravidla/role#viceprezident není role.")), []);
      assert.deepEqual(
        linked(linkRoles("Členský výbor jiného spolku.", { ...on, seen: new Set(), noLink: ["výbor jiného spolku"] })),
        []
      );

      const link = a.find((s) => s.role)!;
      assert.equal(link.role && link.href, "/pravidla/role#clensky-vybor");
      assert.equal(link.role && link.title, "Membership Committee");
      const self = linkRoles("Viceprezident vede výbor.", { selfSlug: "role", enabled: true, seen: new Set() });
      assert.deepEqual(self.filter((s) => s.role).map((s) => s.role && s.href), ["#viceprezident", "#clensky-vybor"]);
      assert.equal(roleHref("region", "absence"), "/pravidla/role#region");

      assert.deepEqual(linkRoles("Viceprezident.", { selfSlug: "absence", enabled: false, seen: new Set() }), [
        { text: "Viceprezident." },
      ]);
      const pre = createRoleLinker(on, ["viceprezident"]);
      assert.deepEqual(linked(pre("Viceprezident vede výbor.")), ["clensky-vybor:výbor"]);
      assert.deepEqual(linked(pre("Výbor znovu.")), []);
      assert.deepEqual(linked(run("Sekretářem/pokladníkem a vzdělávacím koordinátorem.")), [
        "sekretar-pokladnik:Sekretářem/pokladníkem",
        "vzdelavaci-koordinator:vzdělávacím koordinátorem",
      ]);
    },
  },
  {
    name: "49. odkazy rolí jen se strankou role v registru, glossary false vypne",
    run: () => {
      assert.equal(roleLinksEnabled(INFO_PAGES, basePage), true, "stránka role je v registru (T-007b)");
      assert.equal(roleLinksEnabled([basePage], basePage), false);
      assert.equal(roleLinksEnabled([{ slug: "role" }, basePage], basePage), true);
      assert.equal(roleLinksEnabled([{ slug: "role" }, basePage], { glossary: false }), false);
      assert.ok(!renderPage(basePage, { roleLinks: false }).includes("info-role-link"));
      assert.ok(renderPage(basePage).includes("info-role-link"), "absence má odkazy na role");
      const off = clonePage();
      off.glossary = false;
      assert.ok(!renderPage(off, { roleLinks: true }).includes("info-role-link"));
    },
  },
  {
    name: "50. absence s odkazy: textContent shodny s iter-029 (fixture z HEAD + schvalena vyjimka T-010r6), odkazy na /pravidla/role#<role>, max 1 na roli v odstavci, nic v citacich",
    run: () => {
      const plain = renderPage(basePage, { roleLinks: false });
      const linked = renderPage(basePage);
      const note = `<p class="info-print-only">${TEMPLATE_TEXTS.roleLinks.printNote} /pravidla/role.</p>`;
      assert.ok(linked.includes(note), "patička tisku s odkazem na stránku rolí");
      assert.equal(textContent(linked.replace(note, "")), textContent(plain));
      // Review T-008, S-6: text článku proti stavu iter-029 (vykresleno z commitu
      // e98ec2e, bez tiskové přílohy Zdrojů, ta se v iter-030 čísluje).
      // Fixture obsahuje jedinou schválenou výjimku z 29. 9. 2026 (T-010r6,
      // rozhodnutí uživatele): u ředitele regionu vypuštěno „, tedy ten, kdo
      // odpovídá za celý region BNI".
      const fixture = readFileSync(join(process.cwd(), "scripts", "fixtures", "absence-iter-029.txt"), "utf8");
      const article = linked.replace(note, "");
      const cut = article.indexOf('<section class="info-print-only info-print-sources');
      assert.ok(cut > 0);
      assert.equal(textContent(article.slice(0, cut)), fixture, "text absence se proti iter-029 změnil");

      const hrefs = roleLinkHrefs(linked);
      assert.ok(hrefs.length > 0);
      const glossaryIds = new Set<string>(ROLE_GLOSSARY.map((e) => e.id));
      for (const href of hrefs) {
        const m = /^\/pravidla\/role#([a-z-]+)$/.exec(href);
        assert.ok(m && glossaryIds.has(m[1]), href);
      }
      for (const id of ["viceprezident", "konzultant-regionu", "clensky-vybor", "reditel-regionu"]) {
        assert.ok(hrefs.includes(`/pravidla/role#${id}`), id);
      }
      for (const block of blocks(linked)) {
        const inBlock = roleLinkHrefs(block);
        assert.equal(new Set(inBlock).size, inBlock.length, `víc odkazů na stejnou roli: ${block.slice(0, 120)}`);
      }
      for (const quote of linked.match(/<blockquote[\s\S]*?<\/blockquote>/g) ?? []) {
        assert.ok(!quote.includes("info-role-link"), "odkaz v anglické citaci");
      }
      for (const heading of linked.match(/<h[1-6][\s\S]*?<\/h[1-6]>/g) ?? []) {
        assert.ok(!heading.includes("info-role-link"), "odkaz v nadpisu");
      }
      for (const box of linked.match(/<aside class="info-note[\s\S]*?<\/aside>/g) ?? []) {
        assert.ok(!box.includes("info-role-link"), "odkaz v rámečku u nás v chapteru");
      }
      assert.ok(!/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/.test(linked), "vnořený odkaz");
      // Stránka absence se jinak nemění (test 42 dál platí i s odkazy).
      assert.ok(!linked.includes("bg-navy") && !linked.includes("info-tag"));
    },
  },
  {
    name: "51. validator leadership-chart: neznama role a vztah, duplicitni role, prazdny srText; fiktivni stranka role projde",
    run: () => {
      assert.deepEqual(validateRegistry([rolePage(), basePage], CHAPTER_NOTES).errors, []);
      const bad = cloneRolePage();
      const step = bad.steps[1] as Scene<"leadership-chart">;
      step.visual.roles.push({ role: "kral" as RoleId, relation: "decides" });
      step.visual.roles.push({ role: "prezident", relation: "vetuje" as RoleRelation });
      step.visual.roles.push({ role: "clensky-vybor", relation: "acts" });
      bad.intro.visual.srText = " ";
      const errors = errorsOf(bad);
      assertHasError(errors, /neznámá role „kral"/);
      assertHasError(errors, /neznámý vztah „vetuje"/);
      assertHasError(errors, /role clensky-vybor je ve stavu víckrát/);
      assertHasError(errors, /intro\.visual\.srText: prázdný text/);
    },
  },
  {
    name: "52. validator referencni casti: poradi poli, notDecides, zdroje, kotvy, glosar napric registrem, obligation, odkaz",
    run: () => {
      const order = cloneRolePage();
      order.reference!.roles[2].fields.reverse();
      assertHasError(errorsOf(order), /karta clensky-vybor: pole .* není v pevném pořadí/);

      const noNot = cloneRolePage();
      noNot.reference!.roles[0].fields = noNot.reference!.roles[0].fields.filter((f) => f.kind !== "notDecides");
      assertHasError(errorsOf(noNot), /karta prezident: chybí pole notDecides/);

      const emptyField = cloneRolePage();
      emptyField.reference!.roles[0].fields[0].facts = [];
      assertHasError(errorsOf(emptyField), /karta prezident: pole does nemá žádný fakt/);

      const rowSrc = cloneRolePage();
      rowSrc.reference!.decisions[0].sources = [];
      assertHasError(errorsOf(rowSrc), /situace situace-prihlaska: řádek nemá zdroj/);

      const rightSrc = cloneRolePage();
      rightSrc.reference!.rights[1].sources = [];
      assertHasError(errorsOf(rightSrc), /právo r2: položka nemá zdroj/);

      const dupAnchor = cloneRolePage();
      dupAnchor.steps[0].id = "viceprezident";
      assertHasError(errorsOf(dupAnchor), /id „viceprezident" není unikátní/);
      const dupRef = cloneRolePage();
      dupRef.reference!.rights[0].id = "situace-prihlaska";
      assertHasError(errorsOf(dupRef), /id „situace-prihlaska" není unikátní/);

      const noCard = cloneRolePage();
      noCard.reference!.roles = noCard.reference!.roles.filter((c) => c.id !== "hostitele");
      noCard.reference!.roles.find((c) => c.id === "region")!.subAnchors = [];
      const reg = validateRegistry([noCard, basePage], CHAPTER_NOTES).errors;
      assertHasError(reg, /role hostitele nemá na stránce role kartu ani pod-kotvu/);
      assertHasError(reg, /role reditel-regionu nemá na stránce role kartu/);

      const obligation = cloneRolePage();
      obligation.reference!.roles[1].fields[0].facts[0].obligation = "must";
      assertHasError(errorsOf(obligation), /karta viceprezident\.does\[0\]: referenční část nerozlišuje/);

      const appLink = cloneRolePage();
      appLink.reference!.decisions[1].link!.href = "/dashboard";
      assertHasError(errorsOf(appLink), /odkaz „\/dashboard" nevede na \/pravidla/);

      const dash = cloneRolePage();
      dash.reference!.rights[0].text = "Pravidla — mění BNI.";
      assertHasError(errorsOf(dash), /právo r1\.text: em dash/);

      const quote = cloneRolePage();
      quote.reference!.decisions[0].sources[0].quoteEn = "";
      assertHasError(errorsOf(quote), /situace-prihlaska\.sources\[0\]: prázdná quoteEn/);

      const note = cloneRolePage();
      note.reference!.roles[0].chapterNotes = ["C99"];
      assertHasError(errorsOf(note), /karta prezident: odkaz na neexistující položku „u nás v chapteru" C99/);

      // Bez steps (forma B) validátor kroky nevyžaduje, kotvy reference platí pro rozcestník.
      const onlyRef = cloneRolePage();
      onlyRef.steps = [];
      assert.deepEqual(errorsOf(onlyRef), []);
    },
  },
  {
    name: "53. render stranky role: kotvy, karty jako dl v pevnem poradi, tabulka se scope a data-label, prava v ol, odkazy #role",
    run: () => {
      const page = rolePage();
      const html = renderPage(page, { roleLinks: true });
      for (const id of ["vedeni", "role-karty", "kdo-rozhoduje", "prava-regionu", "shrnuti"]) {
        assert.ok(html.includes(`id="${id}"`), id);
      }
      const ref = page.reference!;
      for (const card of ref.roles) {
        assert.match(html, new RegExp(`<section id="${card.id}"[^>]*class="info-role-card`), card.id);
        for (const sub of card.subAnchors ?? []) assert.ok(html.includes(`id="${sub.id}"`), sub.id);
      }
      const vybor = html.slice(html.indexOf('<section id="clensky-vybor"'), html.indexOf('<section id="sekretar-pokladnik"'));
      const labels = Array.from(vybor.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)).map((m) => m[1]);
      const F = TEMPLATE_TEXTS.reference.fields;
      assert.deepEqual(labels, [F.does, F.decides, F.approval, F.notDecides, F.notDefined]);
      assert.ok(!vybor.includes('href="#clensky-vybor"'), "karta neodkazuje sama na sebe");
      assert.ok(!vybor.includes('href="#vybor-rust"'), "karta neodkazuje na vlastní pod-kotvu");
      assert.ok(vybor.includes('href="#viceprezident"'), "karta odkazuje jinou roli");

      assert.equal((html.match(/<th[^>]*scope="col"/g) ?? []).length, 6);
      assert.equal((html.match(/<th[^>]*scope="row"/g) ?? []).length, ref.decisions.length);
      for (const row of ref.decisions) assert.match(html, new RegExp(`<tr id="${row.id}"`));
      assert.ok(html.includes('data-label="Rozhoduje"'));
      assert.ok(html.includes('href="/pravidla/absence#ctvrta-absence"'));
      const rights = html.slice(html.indexOf('<ol class="info-rights'));
      assert.equal((rights.match(/<li id="r\d+"/g) ?? []).length, ref.rights.length);

      const hrefs = roleLinkHrefs(html);
      assert.ok(hrefs.length > 0);
      assert.ok(hrefs.every((h) => h.startsWith("#")), "na stránce role vedou odkazy na kotvy stejné stránky");
      assert.ok(!html.includes("Role jsou vysvětlené na"), "stránka role nemá patičku s odkazem na sebe");

      // Pořadí stránky: příběh, reference, shrnutí.
      const iStep = html.indexOf('id="prihlaska-2"');
      const iRef = html.indexOf('id="vedeni"');
      const iSum = html.indexOf('id="shrnuti"');
      assert.ok(iStep < iRef && iRef < iSum);
      assert.ok(html.indexOf("info-reference") > html.lastIndexOf("info-flow"), "reference je mimo info-layout");

      // Příloha tisku obsahuje citace referenční části.
      const print = html.slice(html.indexOf("info-print-sources"));
      assert.ok(print.includes(TEMPLATE_TEXTS.reference.decisionsTitle));
      assert.ok(print.includes(TEMPLATE_TEXTS.reference.rightsTitle));
      assert.ok(print.includes(`${TEMPLATE_TEXTS.reference.rolesTitle}: Členský výbor`));

      const levels = headingLevels(html);
      levels.forEach((level, i) => {
        if (i > 0) assert.ok(level <= levels[i - 1] + 1, `h${levels[i - 1]} -> h${level}`);
      });
      assert.ok(!html.includes("—"));
    },
  },
  {
    name: "54. zakaz obligation: zadne zavazne/doporucene/info-tag ve strance role ani s obligation v datech, komponenty pole nectou",
    run: () => {
      const clean = renderPage(rolePage(), { roleLinks: true });
      const marked = cloneRolePage();
      for (const card of marked.reference!.roles) for (const f of card.fields) for (const fact of f.facts) fact.obligation = "must";
      for (const fact of marked.reference!.facts) fact.obligation = "recommended";
      for (const s of marked.steps) if (s.type === "scene") for (const fact of s.chapter) fact.obligation = "must";
      const html = renderPage(marked, { roleLinks: true });
      assert.equal(html, clean, "obligation nesmí změnit výstup");
      assert.ok(!/závazné|doporučené/.test(textContent(html)));
      assert.ok(!html.includes("info-tag"));
      for (const file of [
        "ReferenceSection.tsx",
        "RoleCards.tsx",
        "DecisionTable.tsx",
        "RightsList.tsx",
        "RichText.tsx",
        "ChapterSide.tsx",
        "visuals/LeadershipChart.tsx",
      ]) {
        const src = readFileSync(join(process.cwd(), "components", "info", file), "utf8");
        const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        assert.ok(!/obligation/.test(code), `${file} čte obligation`);
      }
    },
  },
  {
    name: "55. schema vedeni: pruh max 3 radky v poradi vztahu, sticky obe varianty, uvod cele schema, bez cervene",
    run: () => {
      const step = (rolePage().steps[1] as Scene<"leadership-chart">).visual;
      assert.deepEqual(
        barRows(step).map((r) => r.relation),
        ["decides", "approves", "advises"],
        "rozhoduje > musí souhlasit > radí, max 3"
      );
      assert.deepEqual(barRows(step)[0].names, ["členský výbor"]);
      assert.deepEqual(barRows({ roles: [], srText: "x" }), []);

      const sticky = renderToStaticMarkup(createElement(LeadershipChart, { state: step, size: "sticky" }));
      assert.match(sticky, /<div class="lg:hidden"><ul class="info-lc-bar/);
      assert.match(sticky, /<div class="hidden lg:block"><div class="info-lc-chart/);
      assert.ok(sticky.includes("Rozhoduje:</span> členský výbor"));
      assert.ok(sticky.includes("musí souhlasit") && sticky.includes("<svg"), "zámek u musí souhlasit");
      assert.ok(sticky.includes('data-role="vybor-prihlasky" class="info-lc-node info-lc-node--acts'));
      assert.ok(sticky.includes('info-lc-node--idle'), "nezvýrazněné role jsou šedé");
      assert.ok(!sticky.includes("vybor-prihlasky\" class=\"info-lc-node info-lc-node--idle"));

      const intro = renderToStaticMarkup(
        createElement(LeadershipChart, { state: { roles: [], srText: "x" }, size: "inline" })
      );
      assert.ok(intro.includes("info-lc-chart") && !intro.includes("info-lc-bar"), "úvod: celé schéma bez pruhu");
      assert.ok(!intro.includes("hidden lg:block"), "úvod: schéma na všech šířkách");
      assert.ok(!intro.includes("info-lc-node--idle") && intro.includes("info-lc-node--plain"));
      assert.ok(!intro.includes("info-lc-note"), "věta pod schématem vypuštěna (T-010r2)");

      const inline = renderToStaticMarkup(createElement(LeadershipChart, { state: step, size: "inline" }));
      assert.match(inline, /info-lc-bar[\s\S]*<div class="mt-3 hidden lg:block print:block"><div class="info-lc-chart/);

      for (const html of [sticky, intro, inline]) {
        assert.ok(!/#cf2031|primary|danger|text-red|bg-red/.test(html), "červená se ve schématu nepoužívá");
      }

      const page = renderPage(rolePage());
      assert.match(page, /class="info-inline-visual [^"]*info-inline-visual--keep" role="img" aria-label="Celé schéma/);
      assert.ok(page.includes(TEMPLATE_TEXTS.leadership.legendTitle), "legenda vztahů v úvodu");
      assert.ok(!renderPage(basePage).includes("info-inline-visual--keep"), "absence beze změny");
    },
  },
  {
    name: "56. CSS: tabulka jako karty pod 768 px, uvodni schema zustava, odkaz role teckovane, kotvy reference, tisk",
    run: () => {
      const css = readFileSync(join(process.cwd(), "app", "pravidla", "pravidla.css"), "utf8");
      assert.match(css, /@media \(max-width: 767px\) \{\s*\.info-decisions,/);
      assert.match(css, /\.info-decisions td::before \{\s*content: attr\(data-label\)/);
      assert.match(css, /\.info-root\[data-scrolly="on"\] \.info-inline-visual--keep \{\s*position: static/);
      assert.match(css, /\.info-role-link \{[^}]*text-decoration-style: dotted/);
      assert.match(css, /\.info-root \.info-reference \[id\] \{\s*scroll-margin-top/);
      assert.match(css, /@media print \{[^}]*\.info-role-field,/);
      assert.match(css, /\.info-root h2,\s*\.info-root h3,[^}]*break-after: avoid/);
      assert.match(css, /content: attr\(data-label\) \/ "";/);
    },
  },
  {
    name: "57. registr: role prvni, fiktivni stranka role projde validaci",
    run: () => {
      assert.deepEqual(
        INFO_PAGES.map((p) => p.slug),
        ["role", "absence"],
        "role první (K5)"
      );
      const pages = [rolePage(), basePage] as InfoPage[];
      assert.doesNotThrow(() => assertValidRegistry(pages, CHAPTER_NOTES));
      const situations = pages.flatMap((p) => p.situations.map((s) => `/pravidla/${p.slug}#${s.anchor}`));
      assert.equal(situations[0], "/pravidla/role#situace-prihlaska");
    },
  },
  // --- iter-030 (T-007b, T-011): reálná stránka rolí a její ilustrace ---
  {
    name: "58. stranka role: data podle textu a gate (8 kroku, 10 situaci, prava r1 az r27, pet poli na karte, C8 az C13)",
    run: () => {
      const role = getInfoPage("role")!;
      assert.ok(role, "stránka role je v registru");
      assert.deepEqual(validateInfoPage(role, CHAPTER_NOTES).errors, []);
      assert.equal(role.steps.length, 8);
      const ref = role.reference!;
      assert.equal(ref.decisions.length, 10);
      assert.deepEqual(ref.rights.map((r) => r.id), Array.from({ length: 27 }, (_, i) => `r${i + 1}`));
      // Gate T-006: úpravy 1, 6, 7, 8, 9, 10 a odkaz karty regionu.
      assert.equal(role.description, "Kdo v chapteru přijímá nové členy, kdo řeší stížnosti a jak se mění vedení.");
      const decision = role.steps.find((s) => s.id === "stiznost-rozhodnuti") as Scene<"leadership-chart">;
      assert.deepEqual(decision.visual.roles.map((r) => r.role), ["clensky-vybor", "konzultant-regionu"]);
      const card = (id: string) => ref.roles.find((c) => c.id === id)!;
      const field = (id: string, kind: string) => card(id).fields.find((f) => f.kind === kind)?.facts ?? [];
      assert.equal(field("viceprezident", "approval").length, 0);
      // T-010r2: M61 jen na kartě výboru (dřív gate úprava 7 na kartě viceprezidenta).
      const m61 = (f: Fact) => f.sources.some((s) => /for support PRIOR/.test(s.quoteEn));
      assert.ok(!card("viceprezident").fields.some((x) => x.facts.some(m61)));
      assert.ok(
        field("clensky-vybor", "does").some(
          (f) => m61(f) && f.text === "Než výbor u stížnosti postoupí dál, viceprezident se obrátí na konzultanta regionu pro podporu."
        )
      );
      assert.equal(field("region", "approval").length, 0);
      assert.equal(field("region", "notDefined").length, 0);
      assert.equal(field("clensky-vybor", "notDefined").length, 1);
      assert.deepEqual(card("region").link, { href: "#prava-regionu", label: "Všechna práva BNI a regionu" });
      const html = renderPage(role);
      for (const c of ref.roles) {
        const section = html.slice(html.indexOf(`<section id="${c.id}"`));
        const cardHtml = section.slice(0, section.indexOf("</dl>"));
        assert.equal((cardHtml.match(/<dt\b/g) ?? []).length, 5, `${c.id}: pět polí`);
      }
      assert.ok(
        html.includes(`<span aria-hidden="true">–</span><span class="sr-only">${TEMPLATE_TEXTS.reference.emptyFieldSr}</span>`),
        "prázdné pole jako pomlčka, čtečka „nic“"
      );
      assert.ok(!/Pravidla tu nic neuvádějí|žádnou mezeru nenašli/.test(html));
      for (const id of ["C8", "C9", "C10", "C11", "C12", "C13"]) {
        assert.ok(html.includes(CHAPTER_NOTES.find((n) => n.id === id)!.text), id);
      }
      const text = textContent(html);
      assert.ok(!/závazné|doporučené/.test(text), "žádné závazné ani doporučené");
      // Slovo „návrh" je v textu jen jako návrh změny pravidel (G7), ne jako štítek.
      const labels = Array.from(html.matchAll(/<p class="info-note-label[^"]*">([^<]*)<\/p>/g)).map((m) => m[1]);
      assert.ok(labels.length >= 6);
      assert.ok(labels.every((l) => l === TEMPLATE_TEXTS.chapterNote.label), JSON.stringify(labels));
      assert.equal((text.match(/návrh/g) ?? []).length, 2, "návrh jen u změny pravidel (karta regionu, R1)");
      assert.ok(!html.includes("info-tag"));
      assert.ok(!html.includes("—"));
      const levels = headingLevels(html);
      levels.forEach((level, i) => {
        if (i > 0) assert.ok(level <= levels[i - 1] + 1, `h${levels[i - 1]} -> h${level}`);
      });
    },
  },
  {
    name: "59. odkazy z absence vedou na existujici kotvy stranky role",
    run: () => {
      const role = renderPage(getInfoPage("role")!);
      const hrefs = roleLinkHrefs(renderPage(basePage));
      assert.ok(hrefs.length > 20);
      for (const href of new Set(hrefs)) {
        const id = href.split("#")[1];
        assert.ok(role.includes(`id="${id}"`), `kotva ${id} na stránce role`);
      }
      for (const href of roleLinkHrefs(role)) assert.ok(role.includes(`id="${href.slice(1)}"`), href);
    },
  },
  {
    name: "60. T-011: komiksy role (soubory WebP, rozmery, < 40 kB na panel, < 600 kB celkem, popisky z gate, umisteni)",
    run: () => {
      const role = getInfoPage("role")!;
      const ref = role.reference!;
      const comicOf = (id: string) => role.steps.find((s) => s.id === id)?.type === "scene"
        ? (role.steps.find((s) => s.id === id) as Scene<VisualKind>).comic
        : undefined;
      const R = ROLE_COMICS;
      assert.equal(role.intro.comic, R.R10, "R10 v úvodu");
      assert.equal(role.hero, undefined, "hero se nerozšiřuje");
      const cards: [string, Comic][] = [
        ["prezident", R.R1], ["viceprezident", R.R2], ["clensky-vybor", R.R3], ["konzultant-regionu", R.R4],
        ["region", R.R5], ["sekretar-pokladnik", R.R6], ["vzdelavaci-koordinator", R.R7],
        ["koordinator-mentoru", R.R8], ["hostitele", R.R9],
      ];
      for (const [id, comic] of cards) assert.equal(ref.roles.find((c) => c.id === id)!.comic, comic, id);
      assert.equal(comicOf("prihlaska-host"), R.R9);
      assert.equal(comicOf("stiznost-postup"), R.R4);
      assert.equal(comicOf("stiznost-rozhodnuti"), R.R3);
      assert.equal(comicOf("vedeni-vyber"), R.R11);
      assert.equal(R.R3.panels[2].caption, "Dopis jde vždy za výbor, nikdy za jednotlivce.");
      assert.equal(R.R11.panels[0].caption, "Období vedení trvá šest měsíců.");
      let total = 0;
      const panels = Object.values(R).flatMap((c) => c.panels);
      assert.equal(panels.length, 28);
      for (const p of panels) {
        assert.match(p.src, /^\/pravidla\/komiksy\/role-r\d{2}-\d\.webp$/);
        const path = join(process.cwd(), "public", p.src);
        assert.ok(existsSync(path), `chybí ${path}`);
        const buf = readFileSync(path);
        const { width, height } = webpSize(buf);
        assert.equal(width, p.width, `${p.src} width`);
        assert.equal(height, p.height, `${p.src} height`);
        assert.ok(buf.length < 40 * 1024, `${p.src} má ${buf.length} B`);
        assert.ok(p.caption.trim() && p.alt.trim(), p.src);
        total += buf.length;
      }
      assert.ok(total < 600 * 1024, `celkem ${total} B`);
      const html = renderPage(role);
      const intro = html.slice(html.indexOf("info-intro"), html.indexOf('id="prihlaska-host"'));
      assert.ok(intro.includes("role-r10-1.webp"), "pruh R10 v úvodu");
    },
  },
  // --- iter-030 (T-008r): opravy po code review ---
  {
    name: "61. T-008r: Kde to najdes bez vytazeneho prava (S-1), srText uvodu s vetou N2 (S-3), pruh s celym nazvem a labelem (N-1, N-2)",
    run: () => {
      const role = getInfoPage("role")! as InfoPage<"leadership-chart">;
      assert.ok(!role.summary.whereToFind.some((w) => w.rule === "Administrative Policy #7"));
      const all = role.summary.whereToFind.find((w) => w.href === "#prava-regionu");
      assert.equal(all?.labelCs, "Všechna práva BNI, regionu a franšízanta");
      const html = renderPage(role);
      const summary = html.slice(html.indexOf('id="shrnuti"'));
      assert.ok(summary.includes('href="#prava-regionu"'));
      assert.ok(!html.includes("Kdo o čem rozhoduje, z něj nevyčteš."), "věta „z něj nevyčteš“ vypuštěna (T-010r2)");
      const bad = cloneRolePage();
      bad.summary.whereToFind = [{ doc: "general-policies", page: 2, labelCs: "X", href: "#neni" }];
      assertHasError(errorsOf(bad), /odkaz „#neni" nemíří na kotvu stránky/);

      const podani = (role.steps.find((s) => s.id === "stiznost-podani") as Scene<"leadership-chart">).visual;
      assert.deepEqual(barRows(podani).find((r) => r.relation === "acts")?.names, ["člen výboru pro vztahy mezi členy"]);
      const host = (role.steps.find((s) => s.id === "prihlaska-host") as Scene<"leadership-chart">).visual;
      assert.deepEqual(barRows(host).find((r) => r.relation === "advises")?.names, ["regionální tým BNI"]);
    },
  },
  {
    name: "62. T-008r: neaktivni role bez pruhlednosti s kontrastem >= 4,5:1 (S-2)",
    run: () => {
      const state = (getInfoPage("role")!.steps[1] as Scene<"leadership-chart">).visual;
      const html = renderToStaticMarkup(createElement(LeadershipChart, { state, size: "sticky" }));
      assert.ok(!html.includes("opacity-"), "žádná průhlednost ve schématu");
      assert.ok(html.includes("info-lc-node--idle") && html.includes("text-[#666]"));
      const lum = (hex: string) => {
        const c = [0, 2, 4]
          .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
          .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      };
      const ratio = (1 + 0.05) / (lum("666666") + 0.05);
      assert.ok(ratio >= 4.5, `kontrast ${ratio.toFixed(2)}`);
    },
  },
  {
    name: "63. T-008r: tiskova priloha tiskne kazdou citaci jednou, opakovani cislem (S-4)",
    run: () => {
      for (const page of INFO_PAGES) {
        const html = renderPage(page);
        const appendix = html.slice(html.indexOf("info-print-sources"));
        const quotes = Array.from(appendix.matchAll(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/g)).map((m) => m[1]);
        assert.equal(new Set(quotes).size, quotes.length, `${page.slug}: citace v příloze víckrát`);
        const numbers = Array.from(appendix.matchAll(/>\[(\d+)\] /g)).map((m) => Number(m[1]));
        assert.deepEqual(numbers, numbers.map((_, i) => i + 1), `${page.slug}: čísla citací 1..n`);
        const refs = Array.from(appendix.matchAll(/\[(\d+)\]/g)).map((m) => Number(m[1]));
        for (const n of refs) assert.ok(n <= numbers.length, `${page.slug}: odkaz na neexistující citaci [${n}]`);
      }
      const role = renderPage(getInfoPage("role")!);
      assert.ok(role.includes(TEMPLATE_TEXTS.sources.printRepeated), "role má opakované citace jen číslem");
    },
  },
  {
    name: "64. T-010r2: prezident bez nejednoznacneho tematu, slozeni vyboru na zacatku karty, veta o schematu s odkazem na tabulku",
    run: () => {
      const role = getInfoPage("role")!;
      const ref = role.reference!;
      const prezident = ref.roles.find((c) => c.id === "prezident")!;
      assert.ok(!prezident.fields.some((f) => f.facts.some((x) => /téma/.test(x.text))), "téma schůzky na kartě prezidenta není");
      assert.ok(ref.decisions.find((d) => d.id === "situace-schuzka")!.decides.includes("Téma jednou měsíčně vybírá vedení."));
      const vybor = ref.roles.find((c) => c.id === "clensky-vybor")!;
      const first = vybor.fields.find((f) => f.kind === "does")!.facts[0];
      assert.equal(
        first.text,
        "Členský výbor se skládá z členů, kteří zastupují tyto role: posouzení přihlášek, růst chapteru, zapojení členů a vztahy mezi členy. Vede ho viceprezident, který hlasuje stejně jako ostatní."
      );
      assert.ok(!vybor.fields.some((f) => f.facts.some((x) => x.text === "Vede ho viceprezident a hlasuje v něm jako ostatní členové.")));
      const html = renderPage(role);
      assert.ok(html.includes('najdeš v tabulce <a href="#kdo-rozhoduje"'), "odkaz na tabulku v úvodu reference");
      assert.ok(html.includes(">Kdo o čem rozhoduje.</a>"));
      // Validátor: odkaz faktu jen na existující kotvu a jen na text faktu.
      const bad = cloneRolePage();
      bad.reference!.facts[0].link = { text: "neni v textu", href: "#vedeni" };
      assertHasError(errorsOf(bad), /link.text není v textu faktu/);
      const bad2 = cloneRolePage();
      bad2.reference!.facts[0].link = { text: "Neobsazené", href: "#neni" };
      assertHasError(errorsOf(bad2), /odkaz „#neni" nemíří na kotvu stránky/);
      // Věty „z něj nevyčteš“ nikde (šablona, srText, data).
      assert.ok(!JSON.stringify(role).includes("Kdo o čem rozhoduje, z něj nevyčteš."));
    },
  },
  {
    name: "65. T-010r3: karta prezidenta, pole Co dela uplne (manual str. 35 a 36), Rozhoduje a Nerozhoduje beze zmeny",
    run: () => {
      const prezident = getInfoPage("role")!.reference!.roles.find((c) => c.id === "prezident")!;
      const facts = (kind: string) => prezident.fields.find((f) => f.kind === kind)!.facts.map((f) => f.text);
      assert.deepEqual(facts("does"), [
        "Vede týdenní schůzku podle agendy BNI.",
        "Vede měsíční setkání vedení, a to jeho první polovinu.",
        "Dohlíží, aby všechny role ve vedení plnily svoje úkoly.",
        "Dává chapteru směr a motivaci, aby splnil svoje cíle.",
        "Každý týden mluví s konzultantem regionu.",
        "Po schválení výborem zavolá přijatým uchazečům a přivítá je.",
      ]);
      assert.deepEqual(facts("decides"), ["Schvaluje platby, které platí sekretář/pokladník."]);
      assert.equal(facts("notDecides").length, 2);
      const does = prezident.fields.find((f) => f.kind === "does")!.facts;
      assert.ok(does.every((f) => f.sources.every((s) => s.doc === "ops-manual-2022" && s.page >= 35 && s.page <= 36)));
      assert.ok(does[1].sources.some((s) => s.quoteEn === "facilitates monthly Leadership Team Meetings"));
      assert.ok(!/pouze/.test(JSON.stringify(prezident)));
    },
  },
  {
    name: "66. T-010r3: navigace Na strance u role (kotvy existuji, druhy radek karet, v tisku skryta), absence bez navigace",
    run: () => {
      const role = getInfoPage("role")!;
      const html = renderPage(role);
      const nav = html.slice(html.indexOf('<nav aria-labelledby="na-strance-title"'), html.indexOf("</nav>") + 6);
      assert.ok(nav.length > 100, "navigace chybí");
      assert.ok(nav.includes(">Na stránce</h2>"));
      assert.match(nav, /class="info-toc[^"]*print:hidden/);
      const labels = Array.from(nav.matchAll(/<a href="#([^"]+)"[^>]*>([^<]+)<\/a>/g)).map((m) => [m[1], m[2]]);
      assert.deepEqual(labels.slice(0, 5).map((l) => l[1]), [
        "Příběhy",
        "Vedení chapteru",
        "Role",
        "Kdo o čem rozhoduje",
        "Práva BNI a regionu",
      ]);
      assert.equal(labels.length, 14, "5 hlavních + 9 karet");
      for (const [anchor] of labels) assert.ok(html.includes(`id="${anchor}"`), anchor);
      // Navigace je pod úvodní větou, před úvodním schématem.
      assert.ok(html.indexOf("Každá věc v chapteru") < html.indexOf("na-strance-title"));
      assert.ok(html.indexOf("na-strance-title") < html.indexOf("info-inline-visual--keep"));
      assert.ok(!renderPage(basePage).includes("na-strance"), "absence navigaci nemá");
      const bad = cloneRolePage();
      bad.toc = [{ label: "Nic", anchor: "neni" }];
      assertHasError(errorsOf(bad), /toc\[0\]: kotva „neni" neexistuje/);
    },
  },
  {
    name: "67. T-010r4: bublina u role (shrnuti z dat karet, kazda role z glosare ma shrnuti, umisteni na 390 px, bez JS odkaz)",
    run: () => {
      const summaries = roleSummaries(INFO_PAGES);
      const ref = getInfoPage("role")!.reference!;
      for (const card of ref.roles) {
        assert.deepEqual(summaries[card.id], { title: card.title, text: card.lead }, card.id);
        for (const sub of card.subAnchors ?? []) {
          assert.deepEqual(summaries[sub.id], { title: sub.title, text: sub.facts[0].text }, sub.id);
        }
      }
      assert.equal(summaries.prezident?.text, "Vede týdenní schůzky a dává chapteru směr.");
      for (const entry of ROLE_GLOSSARY) assert.ok(summaries[entry.id], `shrnutí pro ${entry.id}`);
      assert.equal(summaries.clen, undefined);

      // Umístění: 390 px, bublina celá v okně, pod slovem.
      const vp = { width: 390, scrollX: 0, scrollY: 1000 };
      const right = popoverPosition({ left: 360, bottom: 200 }, vp);
      assert.equal(right.width, 300);
      assert.equal(right.left, 390 - 8 - 300);
      assert.equal(right.top, 1206);
      assert.equal(popoverPosition({ left: 2, bottom: 10 }, vp).left, 8);
      const narrow = popoverPosition({ left: 50, bottom: 10 }, { width: 280, scrollX: 0, scrollY: 0 });
      assert.equal(narrow.width, 264);
      assert.ok(narrow.left + narrow.width <= 280 - 8);

      // Bez JS: server vykreslí odkazy s href na existující kartu, bublina v HTML není.
      for (const page of INFO_PAGES) {
        const html = renderPage(page);
        const role = renderPage(getInfoPage("role")!);
        const links = Array.from(html.matchAll(/<a href="([^"]+)" title="[^"]*" data-role="([a-z-]+)" class="info-role-link/g));
        assert.ok(links.length > 0, page.slug);
        for (const [, href, id] of links) {
          assert.ok(href.endsWith(`#${id}`), href);
          assert.ok(role.includes(`id="${id}"`), id);
        }
        assert.ok(!html.includes("info-role-popover"), `${page.slug}: bublina není v HTML ze serveru`);
      }
      const css = readFileSync(join(process.cwd(), "app", "pravidla", "pravidla.css"), "utf8");
      assert.match(css, /\.info-role-popover \{\s*display: none !important;/);
      const src = readFileSync(join(process.cwd(), "components", "info", "RolePopover.tsx"), "utf8");
      for (const needle of ['"use client"', "aria-expanded", "aria-controls", 'role="dialog"', "Escape", "createPortal"]) {
        assert.ok(src.includes(needle), needle);
      }
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
