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
 * 7. iter-031 (T-007s, arch_iter-031_T-003s sekce 6, případy 68 až 86;
 *    T-007z případ 87, pořadí faktů v sekcích):
 *    vizuály process-track a meeting-agenda, comicWide, referenční seznamy,
 *    rejstřík série (fakta.ts), odkazy mezi stránkami, kontrakt kotev,
 *    rozcestník po stránkách, zákaz závazné/doporučené na nových stránkách,
 *    text absence a role beze změny (fixtures). Testy běží nad celým
 *    registrem, coder stránky je nemění. Spuštění: npm run test:iter-031
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PravidlaHubPage from "../app/pravidla/page";
import { ChapterNotes, chapterNoteLabel } from "../components/info/ChapterNoteBox";
import { comicWraps } from "../components/info/ComicStrip";
import { InfoPageView } from "../components/info/InfoPageView";
import { barRows, LeadershipChart } from "../components/info/visuals/LeadershipChart";
import { agendaBarText, agendaLine, MeetingAgenda } from "../components/info/visuals/MeetingAgenda";
import { processTrackPosition, stageState } from "../components/info/visuals/ProcessTrack";
import { hasVisual, keepsIntro, renderLegend } from "../components/info/visuals/registry";
import { CLENSTVI_SOURCES } from "../content/pravidla/clenstvi-zdroje";
import { mergeSources, SERIES_SOURCES, src as seriesSrc } from "../content/pravidla/fakta";
import { KODEX_SOURCES } from "../content/pravidla/kodex-zdroje";
import { OBOR_SOURCES } from "../content/pravidla/obor-zdroje";
import { ROLE_SOURCES } from "../content/pravidla/role-zdroje";
import { SCHUZKA_SOURCES } from "../content/pravidla/schuzka-zdroje";
import { STIZNOSTI_SOURCES } from "../content/pravidla/stiznosti-zdroje";
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
  InfoListSection,
  InfoPage,
  MeetingAgendaState,
  ProcessTrackState,
  RoleCard,
  RoleId,
  RoleRelation,
  Scene,
  VisualKind,
} from "../lib/info-pages/types";
import { AGENDA_BLOCKS, ROLE_IDS } from "../lib/info-pages/types";
import {
  assertValidRegistry,
  checkCrossLink,
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

/**
 * Registr se stránkami nahrazenými podle slugu, nové na konec (T-003s sekce 6).
 * Absence a role mají od iter-031 odkazy na ostatní stránky, proto testy
 * s fiktivní stránkou validují celý registr, ne jeho výřez.
 */
function registryWith(...pages: InfoPage[]): InfoPage[] {
  const bySlug = new Map(pages.map((p) => [p.slug, p]));
  const out = INFO_PAGES.map((p) => bySlug.get(p.slug) ?? p);
  for (const page of pages) if (!INFO_PAGES.some((p) => p.slug === page.slug)) out.push(page);
  return out;
}

/** Chyby registru bez odkazů na kotvy stránky `role`, kterou test nahradil fiktivní. */
function errorsWithFakeRole(pages: InfoPage[]): string[] {
  return validateRegistry(pages, CHAPTER_NOTES).errors.filter(
    (e) => !/odkaz „\/pravidla\/role#[^"]*" míří na kotvu/.test(e)
  );
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

// --- iter-031 (T-007s): fiktivní stránky pro nové vizuály, jen v testu ---

const TRACK_STAGES = ["Návštěva", "Přihláška", "Prověrka", "Rozhodnutí", "Začátek"];

function track(current: number, srText: string, extra: Partial<ProcessTrackState> = {}): ProcessTrackState {
  return { stages: [...TRACK_STAGES], current, srText, ...extra };
}

/** Stránka s vizuálem `process-track`: úvod, dvě scény, rozcestí s koncem cesty. */
function trackPage(): InfoPage<"process-track"> {
  return {
    slug: "test-postup",
    title: "Testovací postup",
    description: "Postup v etapách, testovací data.",
    updated: "2026-10-12",
    visual: "process-track",
    situations: [{ label: "Testovací situace postupu", anchor: "navsteva" }],
    intro: { question: "Jak to probíhá?", lead: ["Úvod."], visual: track(-1, "Postup má pět etap.") },
    steps: [
      { type: "scene", id: "navsteva", label: "Krok 1", title: "Návštěva", story: ["Přijdeš."], chapter: [testFact("Fakt.")], visual: track(0, "Jsi na návštěvě.") },
      { type: "scene", id: "prihlaska", label: "Krok 2", title: "Přihláška", story: ["Přihlásíš se."], chapter: [testFact("Fakt.")], visual: track(1, "Podáváš přihlášku.", { outcome: "Přihláška podaná" }) },
      {
        type: "branch",
        id: "vysledek",
        question: "Jak výbor rozhodne?",
        options: [
          { tone: "good", id: "prijeti", label: "Možnost 1", title: "Přijetí", story: ["Přijetí."], chapter: [testFact("Fakt.")], visual: track(4, "Jsi členem.") },
          { tone: "neutral", id: "odmitnuti", label: "Možnost 2", title: "Nepřijetí", story: ["Nepřijetí."], chapter: [testFact("Fakt.")], visual: track(3, "Cesta tu končí.", { outcome: "Přihláška neprošla", ended: true }) },
        ],
      },
    ],
    summary: { title: "Shrnutí", points: [{ text: "Bod." }], whereToFind: [{ doc: "ops-manual-2022", page: 34 }] },
    contacts: [],
    disclaimer: ["Stav k {updated}."],
  };
}

function cloneTrackPage(): InfoPage<"process-track"> {
  return JSON.parse(JSON.stringify(trackPage())) as InfoPage<"process-track">;
}

function agenda(current: MeetingAgendaState["current"], srText: string): MeetingAgendaState {
  return { current, srText };
}

const TEST_PANEL: ComicPanel = { src: "/pravidla/komiksy/test-siroky.webp", width: 960, height: 420, caption: "Široký panel.", alt: "Testovací kresba." };

/** Stránka s vizuálem `meeting-agenda` a širokým panelem v kroku. */
function agendaPage(): InfoPage<"meeting-agenda"> {
  return {
    slug: "test-program",
    title: "Testovací program",
    description: "Program schůzky, testovací data.",
    updated: "2026-10-12",
    visual: "meeting-agenda",
    situations: [{ label: "Testovací situace programu", anchor: "prichod" }],
    intro: { question: "Jak schůzka probíhá?", lead: ["Úvod."], visual: agenda([], "Program schůzky, devět bloků.") },
    steps: [
      {
        type: "scene",
        id: "prichod",
        label: "Krok 1",
        title: "Příchod",
        story: ["Přijdeš."],
        chapter: [testFact("Fakt.")],
        comic: { panels: [{ ...TEST_PANEL, src: "/pravidla/komiksy/test-1.webp", width: 440, caption: "Panel." }] },
        comicWide: { ...TEST_PANEL },
        visual: agenda(["uvod"], "Začátek, prezident."),
      },
      { type: "scene", id: "zpravy", label: "Krok 2", title: "Zprávy", story: ["Zprávy."], chapter: [testFact("Fakt.")], visual: agenda(["prezentace", "zprava"], "Zpráva a hlavní prezentace.") },
      { type: "scene", id: "rytmus", label: "Krok 3", title: "Rytmus", story: ["Rytmus."], chapter: [testFact("Fakt.")], visual: agenda([], "Celý program bez zvýraznění.") },
    ],
    summary: { title: "Shrnutí", points: [{ text: "Bod." }], whereToFind: [{ doc: "ops-manual-2022", page: 11 }] },
    contacts: [],
    disclaimer: ["Stav k {updated}."],
  };
}

function cloneAgendaPage(): InfoPage<"meeting-agenda"> {
  return JSON.parse(JSON.stringify(agendaPage())) as InfoPage<"meeting-agenda">;
}

const SECTION_REF = { doc: "general-policies" as const, page: 2, quoteEn: "Test quote for the code of ethics." };

/** Referenční seznamy (kodex číslovaný, respekt odrážkami) na stránce bez vizuálu. */
function sectionsPage(): InfoPage<"none"> {
  const sections: InfoListSection[] = [
    {
      id: "kodex",
      title: "Kodex",
      ordered: true,
      facts: [{ text: "Kodex platí pro každého člena. Body jsou níž.", sources: [SECTION_REF], link: { text: "Body jsou níž.", href: "#kodex-1" } }],
      items: [
        { id: "kodex-1", text: "První bod kodexu.", sources: [SECTION_REF] },
        { id: "kodex-2", text: "Druhý bod kodexu.", sources: [SECTION_REF] },
      ],
    },
    {
      id: "respekt",
      title: "Respekt",
      lead: ["Úvod sekce."],
      items: [{ id: "nediskriminace", text: "Chapter vybírá členy podle kvalifikace.", sources: [{ ...SECTION_REF, quoteEn: "Second test quote." }] }],
      chapterNotes: ["C3"],
    },
  ];
  return { ...nonePage(), slug: "test-sekce", situations: [{ label: "Testovací kodex", anchor: "kodex" }], sections };
}

/** Kontrakt kotev (arch_iter-031_T-003s sekce 4): stránky registru je musí mít. */
const ANCHOR_CONTRACT: Record<string, string[]> = {
  clenstvi: ["host", "navsteva", "prihlaska", "prestup", "hlasovani", "prijeti", "odmitnuti", "orientace", "passport"],
  obor: ["jeden-obor", "hlavni-profese", "vyber-oboru", "zmena-oboru", "spor-o-obor", "uvolneni-oboru"],
  stiznosti: ["nejdriv-rozhovor", "pisemna-stiznost", "domluva", "zkusebni-doba", "posouzeni"],
  kodex: ["slib", "kodex-1", "kodex-2", "kodex-3", "kodex-4", "kodex-5", "kodex-6", "kodex-7", "v-praxi", "hodnoty"],
  schuzka: ["program", "predstaveni", "hlavni-prezentace", "pozdni-prichod", "nahradnik", "jiny-chapter", "rytmus"],
  absence: ["uvod", "nahradnik", "treti-absence", "ctvrta-absence", "odchod-s-kreditem"],
  role: ["vedeni"],
};

/** Popisky odkazů L4 až L7, L10, L13: jediný nový text na stránce rolí (T-003s 1.8). */
const ROLE_NEW_LABELS = [
  "Od přihlášky po přijetí",
  "Jak probíhá přestup",
  "Jak probíhá Passport s mentory",
  "Co host na návštěvě zažije",
  "Jak se řeší překryv oborů",
  "Jak postup u stížnosti probíhá",
];

/** Všechny `Fact.link` stránky (kroky, možnosti, reference, sekce). */
function factLinksOf(page: InfoPage): { text: string; href: string }[] {
  const facts: Fact[] = [];
  for (const step of page.steps) {
    if (step.type === "scene") facts.push(...step.chapter);
    else for (const option of step.options) facts.push(...option.chapter);
  }
  if (page.reference) {
    facts.push(...page.reference.facts);
    for (const card of page.reference.roles) {
      for (const field of card.fields) facts.push(...field.facts);
      for (const sub of card.subAnchors ?? []) facts.push(...sub.facts);
    }
  }
  for (const section of page.sections ?? []) facts.push(...(section.facts ?? []));
  return facts.flatMap((f) => (f.link ? [f.link] : []));
}

/** Všechny fakty stránky (kontrola `obligation` na nových stránkách). */
function allFactsOf(page: InfoPage): Fact[] {
  const facts: Fact[] = [];
  for (const step of page.steps) {
    if (step.type === "scene") facts.push(...step.chapter);
    else for (const option of step.options) facts.push(...option.chapter);
  }
  if (page.reference) {
    facts.push(...page.reference.facts);
    for (const card of page.reference.roles) {
      for (const field of card.fields) facts.push(...field.facts);
      for (const sub of card.subAnchors ?? []) facts.push(...sub.facts);
    }
  }
  for (const section of page.sections ?? []) facts.push(...(section.facts ?? []));
  return facts;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Text článku bez tiskové přílohy (stejný řez jako fixture absence). */
function articleText(html: string): string {
  const cut = html.indexOf('<section class="info-print-only info-print-sources');
  assert.ok(cut > 0, "tisková příloha zdrojů");
  return textContent(html.slice(0, cut));
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
    name: "02. C1 az C13, C15 az C23 existuji, jsou approved a enabled (iter-029 C1 az C7, iter-030 C8 az C13, iter-031 C15 az C23, C14 neni)",
    run: () => {
      assert.deepEqual(
        CHAPTER_NOTES.map((n) => n.id),
        ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10", "C11", "C12", "C13", "C15", "C16", "C17", "C18", "C19", "C20", "C21", "C22", "C23"]
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
      // GP #5, manuál 55, Substitute Program 1 (limit 3 náhradníků odpadl, T-012v)
      assert.equal(sources.length, 3);
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
      assert.equal(formatCounter(0, sub), "náhradník 0");
      assert.equal(formatCounter(3, sub), "náhradník 3");
      assert.equal(formatCounter(4, sub), "náhradník 4");
      assert.equal(formatCounter(5, sub), "náhradník 5");
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
        () => assertValidRegistry(registryWith(bad), CHAPTER_NOTES),
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
      assert.deepEqual(validateRegistry(registryWith(page), CHAPTER_NOTES).errors, []);
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
      assert.deepEqual(errorsWithFakeRole(registryWith(rolePage())), []);
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
      // iter-031: pořadí T-003s 1.7 (role první podle K5 iter-030).
      assert.deepEqual(
        INFO_PAGES.map((p) => p.slug),
        ["role", "clenstvi", "schuzka", "absence", "obor", "kodex", "stiznosti"],
        "role první (K5), pak pořadí T-003s 1.7, kodex před stížnostmi (K3 gate T-004e)"
      );
      const pages = registryWith(rolePage());
      assert.deepEqual(errorsWithFakeRole(pages), []);
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
      const role = renderPage(getInfoPage("role")!);
      for (const page of INFO_PAGES) {
        const html = renderPage(page);
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
  // --- iter-031 (T-007s, arch_iter-031_T-003s sekce 6) ---
  {
    name: "68. fillTemplate {n} {total} {label} a radek pozice process-track (texty sablony T-005c, gate T-006c)",
    run: () => {
      const P = TEMPLATE_TEXTS.processTrack;
      assert.equal(P.position, "Etapa {n} ze {total}: {label}");
      assert.equal(P.overview, "Celkem {total} etap");
      assert.equal(P.ariaLabel, "Kde právě jsi");
      assert.equal(fillTemplate(P.position, { n: 2, total: 7, label: "Přihláška" }), "Etapa 2 ze 7: Přihláška");
      assert.equal(fillTemplate("{n}/{total} {label} {updated}", { n: 1, total: 3, label: "A", updated: "2026-10-12" }), "1/3 A 12. 10. 2026");
      assert.equal(fillTemplate("bez zástupců", { total: 3, label: "x" }), "bez zástupců");
      assert.equal(processTrackPosition(track(-1, "x")), "Celkem 5 etap");
      assert.equal(processTrackPosition(track(1, "x")), "Etapa 2 ze 5: Přihláška");
      assert.equal(processTrackPosition(track(1, "x", { outcome: "Přestup" })), "Etapa 2 ze 5: Přestup");
      const ended = track(2, "x", { ended: true });
      assert.deepEqual([0, 1, 2, 3, 4].map((i) => stageState(ended, i)), ["done", "done", "current", "ended", "ended"]);
      assert.deepEqual([0, 1, 2].map((i) => stageState(track(-1, "x"), i)), ["future", "future", "future"]);
    },
  },
  {
    name: "69. validator process-track: rozsah current, -1 jen v uvodu, stejne stages, ended jen u moznosti bez next, texty",
    run: () => {
      assert.deepEqual(errorsOf(trackPage()), []);
      const range = cloneTrackPage();
      (range.steps[0] as Scene<"process-track">).visual.current = 5;
      assertHasError(errorsOf(range), /krok navsteva\.visual: current 5 mimo rozsah -1 až 4/);
      const minus = cloneTrackPage();
      (minus.steps[1] as Scene<"process-track">).visual.current = -1;
      assertHasError(errorsOf(minus), /krok prihlaska\.visual: current -1 smí jen intro\.visual/);
      const stages = cloneTrackPage();
      (stages.steps[1] as Scene<"process-track">).visual.stages = ["Jiná", "Přihláška", "Prověrka", "Rozhodnutí", "Začátek"];
      assertHasError(errorsOf(stages), /krok prihlaska\.visual: stages se liší od ostatních stavů stránky/);
      const endedScene = cloneTrackPage();
      (endedScene.steps[0] as Scene<"process-track">).visual.ended = true;
      assertHasError(errorsOf(endedScene), /krok navsteva\.visual: ended smí jen možnost rozcestí bez next/);
      const endedNext = cloneTrackPage();
      const option = (endedNext.steps[2] as Branch<"process-track">).options[1];
      option.next = "navsteva";
      option.nextLabel = "Zpět na začátek";
      assertHasError(errorsOf(endedNext), /odmitnuti\.visual: ended smí jen možnost rozcestí bez next/);
      const intro = cloneTrackPage();
      intro.intro.visual.ended = true;
      assertHasError(errorsOf(intro), /intro\.visual: ended smí jen možnost rozcestí bez next/);
      const text = cloneTrackPage();
      (text.steps[1] as Scene<"process-track">).visual.outcome = "Přihláška — podaná";
      (text.steps[0] as Scene<"process-track">).visual.srText = "";
      text.intro.visual.stages = ["Návštěva", "", "Prověrka", "Rozhodnutí", "Začátek"];
      const errors = errorsOf(text);
      assertHasError(errors, /krok prihlaska\.visual\.outcome: em dash/);
      assertHasError(errors, /krok navsteva\.visual\.srText: prázdný text/);
      assertHasError(errors, /intro\.visual\.stages\[1\]: prázdný text/);
      const empty = cloneTrackPage();
      empty.intro.visual.stages = [];
      assertHasError(errorsOf(empty), /intro\.visual: stages je prázdné/);
    },
  },
  {
    name: "70. render process-track: sticky pruh i seznam v DOM, inline pozice a srText, konec cesty prerusovane, bez cervene",
    run: () => {
      assert.ok(hasVisual("process-track"));
      assert.equal(keepsIntro("process-track"), false);
      assert.equal(renderLegend("process-track", 2), null);
      const html = renderPage(trackPage() as InfoPage);
      const sticky = html.slice(html.indexOf('<div class="info-sticky"'), html.indexOf('<div class="info-flow'));
      assert.ok(sticky.includes('class="info-pt info-pt--sticky"'));
      assert.ok(sticky.includes('class="lg:hidden"') && sticky.includes('class="hidden lg:block"'));
      assert.ok(sticky.includes("Celkem 5 etap"), "sticky začíná stavem úvodu");
      assert.ok(sticky.includes('aria-label="Kde právě jsi"'));
      const flow = html.slice(html.indexOf('<div class="info-flow'));
      for (const line of ["Celkem 5 etap", "Etapa 1 ze 5: Návštěva", "Etapa 2 ze 5: Přihláška podaná", "Etapa 4 ze 5: Přihláška neprošla", "Cesta tu končí."]) {
        assert.ok(flow.includes(line), line);
      }
      const option = flow.slice(flow.indexOf('id="odmitnuti"'));
      const bar = option.slice(option.indexOf('class="info-pt-bar'), option.indexOf("</div>", option.indexOf('class="info-pt-bar')));
      assert.deepEqual(Array.from(bar.matchAll(/data-stage="([a-z]+)"/g)).map((m) => m[1]), ["done", "done", "done", "current", "ended"]);
      assert.ok(bar.includes("border-dashed"));
      assert.ok(!/danger|cf2031|#cf2e2e/i.test(sticky + bar), "červená se nepoužívá");
      assert.ok(flow.includes('role="img" aria-label="Jsi na návštěvě."'));
    },
  },
  {
    name: "71. validator meeting-agenda: neznamy blok, duplicitni blok, prazdny srText; platna stranka projde",
    run: () => {
      assert.deepEqual(AGENDA_BLOCKS, ["uvod", "seznam", "clenove", "hoste", "vzdelavani", "prezentace", "zprava", "doporuceni", "networking"]);
      assert.deepEqual(errorsOf(agendaPage()), []);
      const unknown = cloneAgendaPage();
      (unknown.steps[0] as Scene<"meeting-agenda">).visual.current = ["kava" as never];
      assertHasError(errorsOf(unknown), /krok prichod\.visual: neznámý blok programu „kava"/);
      const dup = cloneAgendaPage();
      (dup.steps[1] as Scene<"meeting-agenda">).visual.current = ["zprava", "zprava"];
      assertHasError(errorsOf(dup), /krok zpravy\.visual: blok zprava je ve stavu víckrát/);
      const sr = cloneAgendaPage();
      (sr.steps[2] as Scene<"meeting-agenda">).visual.srText = " ";
      assertHasError(errorsOf(sr), /krok rytmus\.visual\.srText: prázdný text/);
    },
  },
  {
    name: "72. render meeting-agenda: uvod cely program (keepIntro), krok jen pruh a srText, pruh bez (+n), okenko, bez cervene",
    run: () => {
      const A = TEMPLATE_TEXTS.agenda;
      assert.equal(A.blocks.vzdelavani.name, "Vzdělávací okénko, 5 minut");
      assert.equal(A.blocks.clenove.name, "Představení členů, každý 30 sekund");
      assert.ok(AGENDA_BLOCKS.every((id) => A.blocks[id].time === ""), "bloky bez času (gate T-012w2)");
      assert.ok(!("note" in A), "věta o orientačních časech zrušena");
      assert.equal(agendaBarText(agenda([], "x")), "Program otevřené schůzky");
      assert.equal(agendaBarText(agenda(["prezentace", "zprava"], "x")), "Hlavní prezentace, 5 minut");
      assert.equal(agendaBarText(agenda(["vzdelavani"], "x")), "Vzdělávací okénko, 5 minut");
      assert.equal(agendaLine("networking"), "Volný networking");
      assert.ok(hasVisual("meeting-agenda"));
      assert.equal(keepsIntro("meeting-agenda"), true);
      assert.equal(renderLegend("meeting-agenda", 2), null);

      const html = renderPage(agendaPage() as InfoPage);
      assert.equal((html.match(/class="info-agenda-list/g) ?? []).length, 2, "celý seznam jen v úvodu a ve sticky na desktopu");
      const intro = html.slice(html.indexOf('class="info-intro'), html.indexOf('id="prichod"'));
      assert.ok(intro.includes("info-inline-visual--keep"));
      assert.equal((intro.match(/data-block="/g) ?? []).length, 9);
      assert.ok(!/min\.|90 minut/.test(intro), "bez minutových značek a 90 minut");
      const rytmus = html.slice(html.indexOf('id="rytmus"'));
      assert.ok(rytmus.includes("Program otevřené schůzky") && rytmus.includes("Celý program bez zvýraznění."));
      const zpravy = html.slice(html.indexOf('id="zpravy"'), html.indexOf('id="rytmus"'));
      assert.ok(zpravy.includes("Hlavní prezentace, 5 minut"));
      assert.ok(!html.includes("(+"), "pruh bez (+n), gate T-012p úprava 22");

      const sticky = renderToStaticMarkup(createElement(MeetingAgenda, { state: agenda(["zprava", "prezentace"], "x"), size: "sticky" }));
      assert.ok(sticky.includes('class="lg:hidden"') && sticky.includes('class="hidden lg:block"'));
      assert.equal((sticky.match(/data-active="true"/g) ?? []).length, 2);
      assert.ok(sticky.includes("border-navy") && !/danger|cf2031|#cf2e2e/i.test(sticky));
      assert.ok(!/chvilk/i.test(html), "vzdělávací okénko, ne chvilka");
    },
  },
  {
    name: "73. comicWide: validator jako hero (src, alt, caption, rozmery), vykresli se pod komiksem kroku pres celou sirku",
    run: () => {
      const bad = cloneAgendaPage();
      const wide = (bad.steps[0] as Scene<"meeting-agenda">).comicWide!;
      wide.src = "/obrazky/c5.webp";
      wide.alt = "";
      wide.caption = "";
      wide.width = 0;
      const errors = errorsOf(bad);
      assertHasError(errors, /krok prichod\.comicWide: src „\/obrazky\/c5\.webp" není pod \/pravidla\/komiksy\//);
      assertHasError(errors, /krok prichod\.comicWide: prázdný alt/);
      assertHasError(errors, /krok prichod\.comicWide: prázdný caption/);
      assertHasError(errors, /krok prichod\.comicWide: width 0 není kladné celé číslo/);
      const html = renderPage(agendaPage() as InfoPage);
      const step = html.slice(html.indexOf('id="prichod"'), html.indexOf('id="zpravy"'));
      const strip = step.search(/class="info-comic(?: info-comic--single)? mt-4"/);
      const wideAt = step.indexOf('class="info-comic info-comic--wide mt-3"');
      assert.ok(strip > 0 && wideAt > strip, "široký panel pod komiksem");
      assert.ok(step.includes('src="/pravidla/komiksy/test-siroky.webp"') && step.includes('width="960" height="420"'));
      assert.ok(step.includes("Široký panel."));
    },
  },
  {
    name: "74. referencni seznamy (sections): kotvy, zdroj u polozky, obligation, render ol/ul mimo layout, tisk citace jednou",
    run: () => {
      const page = sectionsPage();
      assert.deepEqual(errorsOf(page), []);
      const dup = sectionsPage();
      dup.sections![1].items[0].id = "krok-a";
      assertHasError(errorsOf(dup), /id „krok-a" není unikátní/);
      const noSource = sectionsPage();
      noSource.sections![0].items[1].sources = [];
      assertHasError(errorsOf(noSource), /sekce kodex\/kodex-2: položka nemá zdroj/);
      const obligation = sectionsPage();
      obligation.sections![0].facts![0].obligation = "must";
      assertHasError(errorsOf(obligation), /sekce kodex\.facts\[0\]: referenční část nerozlišuje/);
      const empty = sectionsPage();
      empty.sections![1].items = [];
      assertHasError(errorsOf(empty), /sekce respekt: sekce nemá žádnou položku/);
      const link = sectionsPage();
      link.sections![0].facts![0].link = { text: "Body jsou níž.", href: "#neni" };
      assertHasError(errorsOf(link), /sekce kodex\.facts\[0\]: odkaz „#neni" nemíří na kotvu stránky/);
      const text = sectionsPage();
      text.sections![1].lead = ["Úvod — sekce."];
      assertHasError(errorsOf(text), /sekce respekt\.lead\[0\]: em dash/);

      const html = renderPage(page);
      const layoutEnd = html.indexOf('<section id="kodex"');
      assert.ok(layoutEnd > html.indexOf('id="krok-a"') && layoutEnd < html.indexOf(`id="shrnuti"`), "sekce za příběhem, před shrnutím");
      const kodex = html.slice(layoutEnd, html.indexOf('<section id="respekt"'));
      assert.ok(/<h2 id="kodex-title"[^>]*>Kodex<\/h2>/.test(kodex));
      assert.ok(kodex.includes("<ol class=\"info-rights") && kodex.includes('id="kodex-1"') && kodex.includes('href="#kodex-1"'));
      const respekt = html.slice(html.indexOf('<section id="respekt"'));
      assert.ok(respekt.includes("<ul class=\"info-rights") && respekt.includes(CHAPTER_NOTES.find((n) => n.id === "C3")!.text));
      const print = html.slice(html.indexOf('class="info-print-only info-print-sources'));
      assert.equal((print.match(/Test quote for the code of ethics\./g) ?? []).length, 1, "citace v tisku jednou");
      assert.ok(print.includes("Second test quote.") && print.includes(">Kodex</h3>") && print.includes(">Respekt</h3>"));
    },
  },
  {
    name: "75. SERIES_SOURCES (fakta.ts): unikatni klice, zadna shodna citace pod dvema id, src() neznamy klic vyhodi, prefixy, zrusene id",
    run: () => {
      const registries = { ROLE_SOURCES, CLENSTVI_SOURCES, OBOR_SOURCES, STIZNOSTI_SOURCES, SCHUZKA_SOURCES, KODEX_SOURCES };
      const total = Object.values(registries).reduce((sum, r) => sum + Object.keys(r).length, 0);
      assert.equal(Object.keys(SERIES_SOURCES).length, total, "žádný klíč ve dvou rejstřících");
      assert.throws(() => mergeSources({ a: { X1: SECTION_REF }, b: { X1: SECTION_REF } }), /citace X1 je v rejstříku a i b/);
      const norm = (q: string) => q.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim().toLowerCase();
      const seen = new Map<string, string>();
      for (const [id, ref] of Object.entries(SERIES_SOURCES)) {
        const key = `${ref.doc}|${ref.page}|${norm(ref.quoteEn)}`;
        assert.ok(!seen.has(key), `shodná citace ${seen.get(key)} a ${id}`);
        seen.set(key, id);
        assert.ok(ref.quoteEn.trim() !== "", id);
        assert.ok(ref.page >= 1 && ref.page <= SOURCE_DOCS[ref.doc].pageCount, `${id}: strana ${ref.page}`);
        assert.ok(!/[—]/.test(ref.rule ?? ""), id);
      }
      const prefixes: [Record<string, unknown>, RegExp][] = [
        [CLENSTVI_SOURCES, /^H\d+$/],
        [OBOR_SOURCES, /^O[GM]\d+$/],
        [STIZNOSTI_SOURCES, /^S[GM]\d+$/],
        [SCHUZKA_SOURCES, /^Q[GM]\d+$/],
        [KODEX_SOURCES, /^K[GM]\d+$/],
      ];
      for (const [registry, re] of prefixes) for (const id of Object.keys(registry)) assert.match(id, re);
      // T-003s 1.3 (rušené duplicity) a gate T-004 3s / T-006x (citace bez faktu).
      for (const id of ["H31", "H102", "SM55", "QG3", "OG5", "OM33", "OM8", "QM13", "SM53", "QM47", "QM45", "SM59", "SM37", "SM49", "OM39", "OM44", "OM36", "OG4", "SM52", "OM37", "OM20", "SM47", "QM41", "QM42", "OM35", "H38", "H12", "H96", "H101", "SG2", "SG3", "SG4", "SG5", "SG6", "SG7", "SG8", "SM1", "SM2", "SM58"]) {
        assert.ok(!(id in SERIES_SOURCES), `${id} v rejstříku být nemá`);
      }
      for (const id of ["H22", "H68", "H70", "H72", "H105", "QM49", "H87", "H100", "OM4", "OM12", "OM17", "SM13", "SM25", "SM30", "QG10", "KG1", "KG2", "KG3", "KG4", "KG5", "KG6", "KG7", "KM1", "KM3"]) {
        assert.ok(id in SERIES_SOURCES, `${id} v rejstříku chybí`);
      }
      assert.throws(() => seriesSrc("neni"), /citace neni není v rejstříku série/);
      assert.equal(seriesSrc("H01").quoteEn, "Visitors may attend BNI chapter meetings up to two times in a six-month period.");
      assert.equal(seriesSrc("G12", "pozn.").noteCs, "pozn.");
      assert.equal(seriesSrc("G12").noteCs, undefined);
    },
  },
  {
    name: "76. glosar: hostitel v jednotnem cisle odkazuje na tym hostitelu, absence a role tvary nemaji",
    run: () => {
      const entry = ROLE_GLOSSARY.find((e) => e.id === "hostitele")!;
      for (const form of ["hostitel", "hostitele", "hostiteli", "hostitelem", "hostitelé"]) assert.ok(entry.forms.includes(form), form);
      for (const text of ["Hostitel ti zavolá.", "Zavolá ti hostitel.", "S hostitelem.", "Řekni hostiteli.", "Bez hostitele."]) {
        const segments = linkRoles(text, { selfSlug: "clenstvi", enabled: true, seen: new Set() });
        assert.ok(segments.some((s) => s.role === "hostitele"), text);
        assert.equal(segments.map((s) => s.text).join(""), text);
      }
      const plain = (p: InfoPage) => textContent(renderPage(p, { roleLinks: false }));
      for (const slug of ["absence", "role"]) {
        assert.ok(!/(?<!\p{L})(hostitel|hostitele|hostiteli|hostitelem)(?!\p{L})/iu.test(plain(getInfoPage(slug)!)), slug);
      }
    },
  },
  {
    name: "77. krizove odkazy: platny projde; neexistujici stranka, kotva a plna cesta na sebe = chyba, i u DecisionRow a RoleCard",
    run: () => {
      const ids = new Map([
        ["absence", new Set(["nahradnik", "shrnuti"])],
        ["role", new Set(["vedeni"])],
      ]);
      assert.equal(checkCrossLink("role", "/pravidla/absence#nahradnik", ids), undefined);
      assert.equal(checkCrossLink("role", "/pravidla/absence", ids), undefined);
      assert.equal(checkCrossLink("role", "/pravidla", ids), undefined);
      assert.match(checkCrossLink("role", "/pravidla/neni#x", ids) ?? "", /stránku neni, která není v registru/);
      assert.match(checkCrossLink("role", "/pravidla/absence#neni", ids) ?? "", /kotvu neni, kterou stránka absence nemá/);
      assert.match(checkCrossLink("absence", "/pravidla/absence#nahradnik", ids) ?? "", /míří na vlastní stránku, použij jen „#nahradnik"/);
      assert.match(checkCrossLink("role", "/pravidla/Absence", ids) ?? "", /není ve tvaru/);

      // Fakt: validateInfoPage odkaz jen uloží, cíl ověří registr.
      const fact = clonePage();
      scene(fact, "uvod").chapter[0].link = { text: scene(fact, "uvod").chapter[0].text.slice(0, 5), href: "/pravidla/obor#neni-tu" };
      const page = validateInfoPage(fact, CHAPTER_NOTES);
      assert.ok(!page.errors.some((e) => /neni-tu/.test(e)));
      assert.ok(page.crossLinks.some((l) => l.href === "/pravidla/obor#neni-tu"));
      assertHasError(validateRegistry(registryWith(fact), CHAPTER_NOTES).errors, /\[absence\] krok uvod\.chapter\[0\]: odkaz „\/pravidla\/obor#neni-tu" míří na kotvu neni-tu, kterou stránka obor nemá/);
      const self = clonePage();
      scene(self, "uvod").chapter[0].link = { text: scene(self, "uvod").chapter[0].text.slice(0, 5), href: "/pravidla/absence#uvod" };
      assertHasError(validateRegistry(registryWith(self), CHAPTER_NOTES).errors, /míří na vlastní stránku/);
      const missing = clonePage();
      scene(missing, "uvod").chapter[0].link = { text: scene(missing, "uvod").chapter[0].text.slice(0, 5), href: "/pravidla/neexistuje" };
      assertHasError(validateRegistry(registryWith(missing), CHAPTER_NOTES).errors, /stránku neexistuje, která není v registru/);
      // In-page odkaz: zpráva beze změny proti iter-030.
      const local = clonePage();
      scene(local, "uvod").chapter[0].link = { text: scene(local, "uvod").chapter[0].text.slice(0, 5), href: "#neni" };
      assertHasError(errorsOf(local), /odkaz „#neni" nemíří na kotvu stránky/);

      // DecisionRow.link a RoleCard.link: stejná kontrola cíle.
      const role = cloneRolePage();
      role.reference!.decisions[1].link = { href: "/pravidla/absence#neni", label: "Popisek" };
      role.reference!.roles[0].link = { href: "#neni", label: "Popisek karty" };
      role.reference!.roles[1].link = { href: "/pravidla/role#prezident", label: "Na sebe" };
      role.reference!.roles[2].link = { href: "https://example.com", label: "Ven" };
      assertHasError(errorsOf(role), /karta prezident: odkaz „#neni" nemíří na kotvu stránky/);
      assertHasError(errorsOf(role), /karta clensky-vybor: odkaz „https:\/\/example\.com" nevede na \/pravidla ani na kotvu/);
      const reg = validateRegistry(registryWith(role), CHAPTER_NOTES).errors;
      assertHasError(reg, /\[role\] situace situace-ctvrta-absence: odkaz „\/pravidla\/absence#neni" míří na kotvu neni/);
      assertHasError(reg, /\[role\] karta viceprezident: odkaz „\/pravidla\/role#prezident" míří na vlastní stránku/);
      const ok = cloneRolePage();
      ok.reference!.roles[0].link = { href: "#kdo-rozhoduje", label: "Tabulka" };
      assert.deepEqual(errorsOf(ok), []);
    },
  },
  {
    name: "78. registr a kontrakt kotev: nove stranky s finalnim slugem a titulkem, vsechny kotvy sekce 4 existuji",
    run: () => {
      const titles: Record<string, string> = {
        clenstvi: "Od hosta ke členovi",
        obor: "Jeden obor, jeden člověk",
        stiznosti: "Stížnost a spor",
        schuzka: "Jak probíhá čtvrteční schůzka",
        kodex: "Etický kodex",
      };
      for (const [slug, title] of Object.entries(titles)) assert.equal(getInfoPage(slug)?.title, title, slug);
      for (const [slug, anchors] of Object.entries(ANCHOR_CONTRACT)) {
        const page = getInfoPage(slug);
        assert.ok(page, slug);
        const ids = validateInfoPage(page, CHAPTER_NOTES).ids;
        for (const anchor of anchors) assert.ok(ids.has(anchor), `${slug}#${anchor}`);
      }
      // T-007z: zástupné stránky jsou pryč, žádná stránka registru není zástupná.
      assert.ok(!existsSync(join(process.cwd(), "content", "pravidla", "zastupna-stranka.ts")));
      for (const page of INFO_PAGES) {
        assert.ok(!renderPage(page).includes("Připravuje se."), `[${page.slug}] zástupný text „Připravuje se."`);
      }
    },
  },
  {
    name: "79. kazdy Fact.link vsech stranek se vykresli jako <a href> se stejnym href (fraze nekoliduje s rolí); L1 az L14 v datech",
    run: () => {
      for (const page of INFO_PAGES) {
        const html = renderPage(page);
        for (const link of factLinksOf(page)) {
          const re = new RegExp(`<a href="${escapeRe(escapeHtml(link.href))}"[^>]*>${escapeRe(escapeHtml(link.text))}</a>`);
          assert.ok(re.test(html), `[${page.slug}] odkaz „${link.text}" -> ${link.href} se nevykreslil`);
        }
      }
      const absence = factLinksOf(basePage).map((l) => `${l.text} -> ${l.href}`);
      for (const l of ["Náhradník -> /pravidla/schuzka#nahradnik", "zkušební doby -> /pravidla/stiznosti#zkusebni-doba", "Místo se smí uvolnit -> /pravidla/obor#uvolneni-oboru"]) {
        assert.ok(absence.includes(l), l);
      }
      const role = getInfoPage("role")!;
      const roleLinks = factLinksOf(role).map((l) => `${l.text} -> ${l.href}`);
      for (const l of ["náhradníky -> /pravidla/schuzka#nahradnik", "pořadí prezentací -> /pravidla/schuzka#hlavni-prezentace", "změnit obor -> /pravidla/obor#zmena-oboru", "stížnost -> /pravidla/stiznosti#pisemna-stiznost"]) {
        assert.ok(roleLinks.includes(l), l);
      }
      const ref = role.reference!;
      const row = (id: string) => ref.decisions.find((d) => d.id === id)!.link;
      const card = (id: string) => ref.roles.find((c) => c.id === id)!.link;
      assert.deepEqual(row("situace-prihlaska"), { href: "/pravidla/clenstvi#prihlaska", label: "Od přihlášky po přijetí" });
      assert.deepEqual(row("situace-prevod"), { href: "/pravidla/clenstvi#prestup", label: "Jak probíhá přestup" });
      assert.deepEqual(card("koordinator-mentoru"), { href: "/pravidla/clenstvi#passport", label: "Jak probíhá Passport s mentory" });
      assert.deepEqual(card("hostitele"), { href: "/pravidla/clenstvi#navsteva", label: "Co host na návštěvě zažije" });
      assert.deepEqual(row("situace-obor"), { href: "/pravidla/obor#spor-o-obor", label: "Jak se řeší překryv oborů" });
      assert.deepEqual(row("situace-stiznost"), { href: "/pravidla/stiznosti", label: "Jak postup u stížnosti probíhá" });
      assert.ok(!role.situations.some((s) => s.label === "Chci si stěžovat na člena"), "L14");
    },
  },
  {
    name: "80. rozcestnik: situace po strankach v <details> s titulkem a poctem, odkazy na kotvy; popisky situaci unikatni napric registrem",
    run: () => {
      const html = renderToStaticMarkup(createElement(PravidlaHubPage));
      const situations = html.slice(html.indexOf('id="situace-title"'));
      for (const page of INFO_PAGES.filter((p) => p.situations.length > 0)) {
        const summary = `${escapeHtml(page.title)} · ${page.situations.length}</summary>`;
        const at = situations.indexOf(summary);
        assert.ok(at > 0, `summary ${page.slug}`);
        const group = situations.slice(at, situations.indexOf("</details>", at));
        for (const s of page.situations) assert.ok(group.includes(`href="/pravidla/${page.slug}#${s.anchor}"`), `${page.slug}#${s.anchor}`);
      }
      const labels = INFO_PAGES.flatMap((p) => p.situations.map((s) => s.label.toLowerCase()));
      assert.equal(new Set(labels).size, labels.length, "popisky situací unikátní");
      const dup = { ...nonePage(), slug: "test-dup", situations: [{ label: basePage.situations[0].label, anchor: "krok-a" }] } as InfoPage;
      assertHasError(validateRegistry(registryWith(dup), CHAPTER_NOTES).errors, /\[test-dup\] situace „.*" je v rozcestníku i u stránky absence/);
    },
  },
  {
    name: "91. rozcestnik T-012x: karty temat pred situacemi, 7 karet s odkazem na stranku, všechny karty s obrázkem (role náhradní), skupiny v zavrenych <details>",
    run: () => {
      const html = renderToStaticMarkup(createElement(PravidlaHubPage));
      const topicsAt = html.indexOf('id="temata-title"');
      const situationsAt = html.indexOf('id="situace-title"');
      assert.ok(topicsAt > 0 && situationsAt > topicsAt, "karty před situacemi");
      const topics = html.slice(topicsAt, situationsAt);
      assert.equal(INFO_PAGES.length, 7);
      assert.equal((topics.match(/<li class="info-hub-card"/g) ?? []).length, 7, "7 karet");
      assert.equal((topics.match(/<a /g) ?? []).length, 7, "jeden odkaz na kartu, žádné vnořené");
      for (const page of INFO_PAGES) {
        assert.ok(topics.includes(`href="/pravidla/${page.slug}"`), `karta ${page.slug}`);
        const src = page.hero?.src ?? (page.slug === "role" ? "/pravidla/komiksy/role-r10-2.webp" : undefined);
        assert.ok(src && topics.includes(`src="${src}"`), `obrázek ${page.slug}`);
      }
      assert.equal((topics.match(/<img /g) ?? []).length, 7, "obrázek u všech 7 karet");
      assert.ok(!/<img [^>]*alt="[^"]+"/.test(topics), "alt prázdný, název je pod obrázkem");
      assert.ok(/<img [^>]*loading="lazy"/.test(topics), "lazy");
      assert.equal((topics.match(/<img [^>]*class="info-hub-card-image"/g) ?? []).length, 7, "třída jednotného poměru stran u všech karet");
      assert.ok(/\.info-hub-card-image\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9[^}]*object-fit:\s*cover/.test(readFileSync(join(process.cwd(), "app/pravidla/pravidla.css"), "utf8")), "CSS 16/9 cover");
      for (const card of topics.split('<li class="info-hub-card"').slice(1)) {
        if (card.includes("<img")) assert.ok(card.indexOf("<img") < card.indexOf("<h3"), "obrázek nad titulkem");
      }
      const situations = html.slice(situationsAt);
      const groups = INFO_PAGES.filter((p) => p.situations.length > 0).length;
      assert.equal((situations.match(/<details /g) ?? []).length, groups, "skupina = details");
      assert.ok(!/<details [^>]*\bopen\b/.test(situations), "zavřené");
      assert.ok(!situations.includes("<h3"), "bez h3 skupin");
      const printAt = situations.indexOf("info-hub-print");
      assert.ok(printAt > 0 && /info-print-only/.test(situations.slice(printAt - 40, printAt + 20)), "tiskový blok");
      const printBlock = situations.slice(printAt);
      const total = INFO_PAGES.reduce((n, p) => n + p.situations.length, 0);
      assert.equal((printBlock.match(/<a /g) ?? []).length, total, "tiskový blok má všechny odkazy situací");
      for (const s of INFO_PAGES.flatMap((p) => p.situations)) assert.ok(printBlock.includes(`>${s.label}</a>`), `tisk: ${s.label}`);
      assert.ok(!printBlock.includes("<details"), "tiskový blok bez details");
    },
  },
  {
    name: "81. nove stranky: zadne zavazne/doporucene/navrh v ceskem textu, obligation ani draft v datech",
    run: () => {
      const drafts = new Set(CHAPTER_NOTES.filter((n) => n.status === "draft").map((n) => n.id));
      for (const page of INFO_PAGES.filter((p) => p.slug !== "role" && p.slug !== "absence")) {
        const html = renderPage(page).replace(/<blockquote lang="en"[\s\S]*?<\/blockquote>/g, "");
        const text = textContent(html);
        for (const re of [/závazn/i, /doporučen[éáýo]/i, /doporuču/i, /(?<!\p{L})návrh/iu, /MUSÍ/, /DOPORUČENO/]) {
          assert.ok(!re.test(text), `[${page.slug}] ${re}`);
        }
        assert.ok(!html.includes("info-tag"), page.slug);
        for (const fact of allFactsOf(page)) assert.equal(fact.obligation, undefined, `[${page.slug}] ${fact.text}`);
        const used = [
          ...page.steps.flatMap((s) => (s.type === "scene" ? s.chapterNotes ?? [] : s.options.flatMap((o) => o.chapterNotes ?? []))),
          ...(page.sections ?? []).flatMap((s) => s.chapterNotes ?? []),
          ...(page.reference?.chapterNotes ?? []),
        ];
        for (const id of used) assert.ok(!drafts.has(id), `[${page.slug}] ${id} je draft`);
      }
      // „doporučení" (referral) projde, sloveso a přídavné jméno ne.
      assert.ok(!/doporučen[éáýo]|doporuču/i.test("Předávání doporučení a doporučením."));
    },
  },
  {
    name: "82. role: textContent shodny s fixture z HEAD 2da25d2 po odebrani novych popisku L4 az L7, L10, L13",
    run: () => {
      const fixture = readFileSync(join(process.cwd(), "scripts", "fixtures", "role-iter-030.txt"), "utf8");
      let text = articleText(renderPage(getInfoPage("role")!));
      for (const label of ROLE_NEW_LABELS) {
        assert.equal(text.split(label).length - 1, 1, `popisek „${label}" právě jednou`);
        text = text.replace(label, "");
      }
      assert.equal(text, fixture, "text stránky rolí se proti iter-030 změnil");
    },
  },
  {
    name: "83. U nas v chapteru C15 az C17: C15 podle gate T-012p, C16 podle T-006d, C17 uzivatel 13. 10., approved, C16 jen s franšizantem",
    run: () => {
      const note = (id: string) => CHAPTER_NOTES.find((n) => n.id === id)!;
      assert.equal(
        note("C15").text,
        "Každá druhá čtvrteční schůzka je u nás interní, bez hostů. Na otevřené schůzce se věnujeme hostům. Na interní pracujeme na vlastním růstu, víc se propojujeme mezi sebou a probíráme, jak dopadla schůzka s hosty. Na jejím konci se schází členský výbor a rozhoduje o přihláškách."
      );
      assert.equal(note("C16").text, "Střídání otevřených a interních schůzek je u nás výjimka, kterou schválil franšízant. Ostatní chaptery se jím inspirují.");
      assert.equal(note("C17").text, "Výsledek přihlášky hostovi oznámí vybraný člen chapteru.");
      for (const id of ["C15", "C16", "C17"]) {
        assert.equal(note(id).status, "approved");
        assert.equal(note(id).enabled, true);
      }
      assert.ok(!CHAPTER_NOTES.some((n) => n.id === "C14"));
      assert.ok(!/ředitel|konzultant/.test(note("C16").text));
    },
  },
  {
    name: "84. CSS iter-031: tisk adresy u odkazu /pravidla/ mimo role a PDF, styly vizualu, comicWide, sekce",
    run: () => {
      const css = readFileSync(join(process.cwd(), "app", "pravidla", "pravidla.css"), "utf8");
      assert.ok(css.includes('.info-article a[href^="/pravidla/"]:not(.info-role-link):not([href^="/pravidla/zdroje/"])::after'));
      assert.ok(css.includes('content: " (" attr(href) ")";'));
      for (const selector of [".info-pt--sticky .info-pt-position", ".info-agenda-list", ".info-comic--wide", ".info-root .info-sections [id]"]) {
        assert.ok(css.includes(selector), selector);
      }
      assert.ok(/line-clamp: 2/.test(css), "pozice na mobilu nejvýš dva řádky");
    },
  },
  {
    name: "85. absence: L1 az L3 jen obali existujici text (textContent beze zmeny, odkazy v HTML)",
    run: () => {
      const html = renderPage(basePage);
      for (const [href, text] of [
        ["/pravidla/schuzka#nahradnik", "Náhradník"],
        ["/pravidla/stiznosti#zkusebni-doba", "zkušební doby"],
        ["/pravidla/obor#uvolneni-oboru", "Místo se smí uvolnit"],
      ]) {
        assert.ok(html.includes(`<a href="${href}"`) && html.includes(`>${text}</a>`), href);
      }
      const fixture = readFileSync(join(process.cwd(), "scripts", "fixtures", "absence-iter-029.txt"), "utf8");
      const note = `<p class="info-print-only">${TEMPLATE_TEXTS.roleLinks.printNote} /pravidla/role.</p>`;
      assert.equal(articleText(html.replace(note, "")), fixture);
    },
  },
  {
    name: "86. package.json: test:iter-031 spousti test:info-pages",
    run: () => {
      const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
      assert.equal(pkg.scripts["test:iter-031"], "npm run test:info-pages");
    },
  },
  {
    name: "87. sections: fakta pod seznamem, factsFirst nad seznamem, tisk ve stejnem poradi; stiznosti: respekt M58 pod, sekce eticky-kodex zanikla",
    run: () => {
      const order = (html: string, id: string) => {
        const start = html.indexOf(`<section id="${id}"`);
        const end = html.indexOf("</section>", start);
        const part = html.slice(start, end);
        return { facts: part.indexOf('class="info-facts'), list: part.search(/<[ou]l class="info-rights/) };
      };
      // Tisk: citace faktu a položek v pořadí obrazovky (fakt má vlastní citaci).
      const printOrder = (html: string) => {
        const print = html.slice(html.indexOf('class="info-print-only info-print-sources'));
        return { fact: print.indexOf("Fact quote."), item: print.indexOf("Test quote for the code of ethics.") };
      };
      const withFactQuote = (factsFirst: boolean) => {
        const p = sectionsPage();
        p.sections![0].facts![0].sources = [{ ...SECTION_REF, quoteEn: "Fact quote." }];
        if (factsFirst) p.sections![0].factsFirst = true;
        return p;
      };
      // Fiktivní stránka: výchozí pořadí = fakta pod seznamem, factsFirst = nad ním.
      const belowHtml = renderPage(withFactQuote(false));
      const below = order(belowHtml, "kodex");
      assert.ok(below.list >= 0 && below.facts > below.list, "fakta pod seznamem");
      const belowPrint = printOrder(belowHtml);
      assert.ok(belowPrint.item >= 0 && belowPrint.fact > belowPrint.item, "tisk: citace položek před faktem");
      const first = withFactQuote(true);
      assert.deepEqual(errorsOf(first), []);
      const aboveHtml = renderPage(first);
      const above = order(aboveHtml, "kodex");
      assert.ok(above.facts >= 0 && above.facts < above.list, "factsFirst: fakta nad seznamem");
      const abovePrint = printOrder(aboveHtml);
      assert.ok(abovePrint.fact >= 0 && abovePrint.item > abovePrint.fact, "tisk factsFirst: citace faktu první");
      const noFacts = sectionsPage();
      noFacts.sections![1].factsFirst = true;
      assertHasError(errorsOf(noFacts), /sekce respekt: factsFirst bez faktů/);

      // Stránka stížností podle textů T-005c, sekce kodexu se přesunula na /pravidla/kodex (T-007e).
      const page = getInfoPage("stiznosti")!;
      const html = renderPage(page);
      const respekt = order(html, "respekt");
      assert.ok(respekt.list >= 0 && respekt.facts > respekt.list, "respekt: M58 pod seznamem");
      assert.ok(!html.includes('id="eticky-kodex"'), "sekce eticky-kodex na stížnostech zanikla");
    },
  },
  // --- iter-031 T-012r (opravné kolo po náhledu v1) ---
  {
    name: "88. T-012r MAJOR-1: jednopanelovy pruh ma info-comic--single (23 na 5 strankach) s max-width 480 px, vicepanelove a comicWide ne",
    run: () => {
      const css = readFileSync(join(process.cwd(), "app", "pravidla", "pravidla.css"), "utf8");
      assert.match(css, /\.info-comic--single \{\s*max-width: 480px;\s*\}/);
      const expected: Record<string, number> = { clenstvi: 9, obor: 3, schuzka: 3, stiznosti: 1, kodex: 7, absence: 0, role: 0 };
      for (const page of INFO_PAGES) {
        const html = renderPage(page);
        const figures = Array.from(html.matchAll(/<figure class="info-comic([^"]*)"[^>]*>([\s\S]*?)<\/figure>/g));
        let singles = 0;
        for (const [, cls, body] of figures) {
          const imgs = (body.match(/<img /g) ?? []).length;
          const single = cls.includes("info-comic--single");
          if (single) singles++;
          if (cls.includes("info-comic--wide") || cls.includes("info-comic--illustration") || imgs > 1) {
            assert.ok(!single, `${page.slug}: ${cls.trim()} bez --single`);
          }
          if (single) assert.equal(imgs, 1, `${page.slug}: --single má jeden panel`);
        }
        assert.equal(singles, expected[page.slug], page.slug);
      }
    },
  },
  {
    name: "89. T-012r: paticka bez vety o ceske verzi (7 stranek), C17 u odmitnuti clenstvi, M76 se na clenstvi nepouziva",
    run: () => {
      for (const page of INFO_PAGES) {
        assert.equal(page.disclaimer[0], "Tahle stránka je výklad našeho chapteru.", page.slug);
        assert.ok(!renderPage(page).includes("Oficiální česká verze"), page.slug);
      }
      const clenstvi = getInfoPage("clenstvi")!;
      const odmitnuti = branch(clenstvi, "vysledek").options.find((o) => o.id === "odmitnuti")!;
      assert.deepEqual(odmitnuti.chapterNotes, ["C17"]);
      const html = renderPage(clenstvi);
      assert.ok(html.includes("Výsledek přihlášky hostovi oznámí vybraný člen chapteru."));
      assert.ok(!JSON.stringify(clenstvi).includes("In all cases, these letters"), "M76 se na clenstvi nepoužívá");
    },
  },
  // --- iter-031 T-007e: stránka Etický kodex ---
  {
    name: "90. kodex: data podle textu a gate (none, hero K0, kroky slib/kodex-1 az 7/v-praxi, 7 bodu KG1 az KG7 doslova, hodnoty KM5 az KM11, C22 jen u slib, bez QM9)",
    run: () => {
      const page = getInfoPage("kodex")!;
      assert.ok(page);
      assert.deepEqual(errorsOf(page), []);
      assert.equal(page.visual, "none");
      assert.equal(page.hero?.src, "/pravidla/komiksy/kodex-k0.webp");
      assert.deepEqual(page.contacts, []);
      assert.deepEqual(
        page.steps.map((s) => s.id),
        ["slib", "kodex-1", "kodex-2", "kodex-3", "kodex-4", "kodex-5", "kodex-6", "kodex-7", "v-praxi"]
      );
      assert.equal(page.intro.lead.length, 1, "úvod má jeden odstavec (gate T-006e 3.1)");
      // Znění bodů beze změny oproti schválenému textu na stížnostech (T-005c, gate T-006c).
      const wording = [
        "Poskytnu služby v kvalitě a za ceny, které jsem nabídl.",
        "Budu jednat pravdivě se členy i s lidmi, které od nich dostanu jako doporučení.",
        "Budu budovat dobré vztahy a důvěru se členy i s lidmi z jejich doporučení.",
        "Na doporučení, která dostanu, se ozvu. Je to moje odpovědnost.",
        "Budu mít pozitivní a vstřícný přístup.",
        "Budu dodržovat etická pravidla své profese.",
        "Když má moje profese vlastní kodex s přísnějšími pravidly, řídím se tím přísnějším.",
      ];
      wording.forEach((text, i) => {
        const step = scene(page, `kodex-${i + 1}`);
        assert.equal(step.chapter.length, 1, `kodex-${i + 1}: jediný fakt`);
        assert.equal(step.chapter[0].text, text);
        assert.deepEqual(step.chapter[0].sources.map((r) => r.quoteEn), [KODEX_SOURCES[`KG${i + 1}`].quoteEn]);
        assert.ok(step.comic && step.comic.panels.length === 1, `kodex-${i + 1}: jeden panel`);
        assert.equal(step.comic!.panels[0].src, `/pravidla/komiksy/kodex-k${i + 1}.webp`);
      });
      const slib = scene(page, "slib");
      assert.deepEqual(slib.chapterNotes, ["C22"]);
      assert.equal(slib.comic, undefined, "K0 je hero, slib komiks nemá");
      assert.equal(slib.chapter[0].text, "Při přijetí do BNI se každý člen zavazuje kodex dodržovat.");
      const withNotes = page.steps.filter((s) => s.type === "scene" && (s.chapterNotes ?? []).length > 0).map((s) => s.id);
      assert.deepEqual(withNotes, ["slib"], "chapterNotes jen u slib");
      assert.ok(!(page.sections ?? []).some((sec) => (sec.chapterNotes ?? []).length > 0));
      // v-praxi: dva fakty, jediný odkaz, zkušební doba -> stížnosti#posouzeni.
      const praxe = scene(page, "v-praxi");
      assert.equal(praxe.chapter.length, 2);
      assert.equal(praxe.chapter[0].text, "Kodex není výčet konkrétních situací. Výbor ho v principu použije skoro na každý spor.");
      assert.deepEqual(factLinksOf(page), [{ text: "zkušební dobu", href: "/pravidla/stiznosti#posouzeni" }]);
      // hodnoty
      const hodnoty = page.sections!.find((sec) => sec.id === "hodnoty")!;
      assert.equal(page.sections!.length, 1);
      assert.equal(hodnoty.ordered, true);
      assert.equal(hodnoty.facts, undefined, "gate T-004e 3.2: bez faktu");
      assert.equal(hodnoty.lead, undefined, "gate T-004e 3.2: bez úvodu");
      assert.equal(hodnoty.items.length, 7);
      hodnoty.items.forEach((item, i) => {
        assert.equal(item.id, `hodnota-${i + 1}`);
        assert.deepEqual(item.sources.map((r) => r.quoteEn), [KODEX_SOURCES[`KM${i + 5}`].quoteEn]);
      });
      // Žádný zdroj QM9 a žádný anglický název hodnoty 6 v českém textu.
      const json = JSON.stringify(page);
      assert.ok(!json.includes("Quick Rundown") && !json.includes("Value of the Week"), "QM9 se na kodexu nepoužívá");
      assert.ok(!/Accountability/.test(json.replace(/"quoteEn":"[^"]*"/g, "")));
      assert.ok(!/obligation/.test(json));
      // Odkazy: stížnosti posouzení -> hodnoty BNI, nic nevede na zaniklou kotvu.
      const stiznosti = getInfoPage("stiznosti")!;
      const posouzeni = scene(stiznosti, "posouzeni");
      const g2 = posouzeni.chapter.find((f) => f.sources.some((r) => r.quoteEn.startsWith("Membership Committees may put")))!;
      assert.deepEqual(g2.link, { text: "hodnoty BNI", href: "/pravidla/kodex#hodnoty" });
      for (const p of INFO_PAGES) {
        assert.ok(!JSON.stringify(p).includes("stiznosti#eticky-kodex"), `${p.slug}: odkaz na zaniklou kotvu`);
        assert.ok(!factLinksOf(p).some((l) => l.href.endsWith("#eticky-kodex")), p.slug);
      }
      const prijeti = branch(getInfoPage("clenstvi")!, "vysledek").options.find((o) => o.id === "prijeti")!;
      assert.ok(prijeti.chapter.some((f) => f.link?.href === "/pravidla/kodex"));
      // Situace "Co je etický kodex BNI" je jen u kodexu.
      const owners = INFO_PAGES.filter((p) => p.situations.some((s) => s.label === "Co je etický kodex BNI")).map((p) => p.slug);
      assert.deepEqual(owners, ["kodex"]);
      // Vykreslená stránka: osm obrázků, sedm bodů a sedm hodnot, bez em dash.
      const html = renderPage(page);
      assert.equal((html.match(/kodex-k\d\.webp/g) ?? []).length, 8);
      assert.ok(!html.includes("\u2014"), "bez em dash");
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
