/**
 * Testy iter-045: odkaz na sekci u nadpisů /pravidla/<slug> (A), „Čeká na
 * započtení“ v Přehledu (B) a v Mém semaforu (C). Čisté moduly, statický
 * render a statické kontroly. Bez DATABASE_URL a bez sítě. SQL testy 7 a 8
 * jsou v test-iter-045-cekajici-sql.ts.
 *
 * Číslování podle arch_iter-045_T-001 sekce 6, doplněk gate T-002 4.2 a 4.3
 * (16, 17). Jména a čísla členů smyšlená.
 *
 * Spuštění: npm run test:iter-045-odkazy (součást test:iter-045)
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoPageView } from "../components/info/InfoPageView";
import { MyScoreCard } from "../components/semafor/MyScoreCard";
import { PendingList } from "../components/semafor/PendingList";
import { TEMPLATE_TEXTS } from "../content/pravidla/texty-sablony";
import { CHAPTER_NOTES } from "../content/pravidla/u-nas-v-chapteru";
import { INFO_PAGES } from "../lib/info-pages/registry";
import type { InfoPage } from "../lib/info-pages/types";
import { BONUS_CATEGORIES, filterBonusEvents, type BonusSources } from "../lib/semafor/bonus";
import { buildMonthView, type ScoreRecord } from "../lib/semafor/mine";
import {
  filterPending,
  parsePendingFilter,
  pendingMembers,
  pendingPoints,
  pendingRange,
  pendingSummary,
  sortPending,
  toPendingRows,
  type PendingRow,
} from "../lib/semafor/pending";
import {
  SEMAFOR_TEXTS,
  categoryName,
  pendingCountText,
  pendingIntroText,
  pendingMineNoteText,
  pendingWhatText,
} from "../lib/semafor/texts";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
const ALL: BonusSources = { mastermind: true, burza: true, points: true };

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function renderPage(page: InfoPage): string {
  return renderToStaticMarkup(createElement(InfoPageView, { page, notes: CHAPTER_NOTES, baseUrl: "" }));
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const LINK_RE = /<a href="#([^"]+)" class="info-section-link[^"]*" aria-label="([^"]*)"/g;

/** H2 v HTML a ikona hned za ním (`</h2><a href="#…" class="info-section-link`). */
function headings(html: string): { attrs: string; id: string | null; inner: string; link: string | null }[] {
  return Array.from(
    html.matchAll(/<h2([^>]*)>([\s\S]*?)<\/h2>(?:<a href="#([^"]+)" class="info-section-link)?/g)
  ).map((m) => ({ attrs: m[1], id: /id="([^"]+)"/.exec(m[1])?.[1] ?? null, inner: m[2], link: m[3] ?? null }));
}

function row(p: Partial<PendingRow> & { memberId: string; category: PendingRow["category"]; date: string }): PendingRow {
  return {
    key: `${p.category}:${p.memberId}:${p.date}`,
    memberName: `Člen ${p.memberId}`,
    active: true,
    points: pendingPoints(p.category, p.points),
    detail: null,
    fromName: null,
    ...p,
  };
}

const tests: TestCase[] = [
  // ── A: odkaz na sekci ────────────────────────────────────────
  {
    name: "1. každá sekce s H2 na /pravidla/<slug> má ikonu <a href=\"#id\">, kontakty #kontakty-title, Na stránce a tiskové Zdroje bez ikony",
    run: () => {
      assert.ok(INFO_PAGES.length >= 5);
      for (const page of INFO_PAGES) {
        const html = renderPage(page);
        const hs = headings(html);
        for (const m of html.matchAll(/<section id="([^"]+)" aria-labelledby="([^"]+)"/g)) {
          const [, sectionId, titleId] = m;
          const h = hs.find((x) => x.id === titleId);
          if (!h) continue;
          assert.equal(h.link, sectionId, `${page.slug}: sekce #${sectionId} má ikonu s odkazem na sebe`);
        }
        const contacts = hs.find((x) => x.id === "kontakty-title");
        if (page.contacts.length > 0) assert.equal(contacts?.link, "kontakty-title", `${page.slug}: kontakty`);
        const toc = hs.find((x) => x.id === "na-strance-title");
        if (toc) assert.equal(toc.link, null, `${page.slug}: Na stránce bez ikony`);
        const print = hs.find((x) => x.inner === TEMPLATE_TEXTS.sources.printTitle);
        if (print) assert.equal(print.link, null, `${page.slug}: tiskové Zdroje bez ikony`);
        // žádný nadpis sekce (H2 s id) mimo „Na stránce“ nezůstal bez ikony; H2 bez id
        // (tiskové Zdroje, legenda schématu vedení) nejsou sekce s kotvou
        const without = hs.filter((x) => x.link === null && x.id !== null && x !== toc);
        assert.deepEqual(without.map((x) => x.inner), [], `${page.slug}: H2 bez ikony`);
        // každá ikona míří na existující id
        for (const l of html.matchAll(LINK_RE)) assert.ok(html.includes(`id="${l[1]}"`), `${page.slug}: kotva #${l[1]} existuje`);
      }
      // stránka semafor: „Za co jsou body navíc“ jde poslat jako /pravidla/semafor#body
      const semafor = INFO_PAGES.find((p) => p.slug === "semafor");
      if (semafor) assert.ok(renderPage(semafor).includes('<a href="#body" class="info-section-link'));
      // rozcestník /pravidla ikony nemá (gate Q1 A)
      assert.ok(!read("app/pravidla/page.tsx").includes("SectionHeading"));
    },
  },
  {
    name: "2. obsah H2 se nemění, ikona je mimo H2 (aria-labelledby sekce zůstává čistý)",
    run: () => {
      for (const page of INFO_PAGES) {
        for (const h of headings(renderPage(page))) {
          assert.ok(!h.inner.includes("info-section-link"), `${page.slug}: ikona není uvnitř H2`);
          assert.ok(!h.inner.includes("<a "), `${page.slug}: v H2 žádný odkaz`);
        }
      }
      const page = INFO_PAGES[0];
      const html = renderPage(page);
      const title = escapeHtml(page.summary.title);
      assert.ok(new RegExp(`<h2 id="shrnuti-title"[^>]*>${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</h2>`).test(html));
      for (const c of [
        "components/info/StepScene.tsx",
        "components/info/BranchBlock.tsx",
        "components/info/ReferenceSection.tsx",
        "components/info/ListSections.tsx",
        "components/info/Summary.tsx",
        "components/info/ContactRoles.tsx",
      ]) {
        const src = stripComments(read(c));
        assert.ok(src.includes("<SectionHeading"), `${c}: SectionHeading`);
        assert.ok(!src.includes("<h2"), `${c}: žádné holé H2`);
      }
      assert.equal((read("components/info/BranchBlock.tsx").match(/<SectionHeading/g) ?? []).length, 1, "H3 možností bez ikony");
    },
  },
  {
    name: "3. bez hydratace aria-label „Odkaz na sekci {title}“, prázdný role=status v DOM, box 44 × 44 px",
    run: () => {
      for (const page of INFO_PAGES) {
        const html = renderPage(page);
        const links = Array.from(html.matchAll(LINK_RE));
        assert.ok(links.length > 0, page.slug);
        for (const l of links) {
          assert.ok(l[2].startsWith("Odkaz na sekci "), `${page.slug}: ${l[2]}`);
          assert.ok(l[2].length > "Odkaz na sekci ".length, "název obsahuje nadpis");
        }
        const status = html.match(/<span role="status" aria-live="polite" class="info-section-link-status[^"]*"><\/span>/g) ?? [];
        assert.equal(status.length, links.length, `${page.slug}: hlášení u každé ikony, prázdné`);
        const svg = html.match(/class="info-section-link[^"]*"[^>]*><svg[^>]*aria-hidden="true"/g) ?? [];
        assert.equal(svg.length, links.length, `${page.slug}: SVG aria-hidden`);
      }
      const summary = INFO_PAGES[0].summary.title;
      assert.ok(renderPage(INFO_PAGES[0]).includes(`aria-label="Odkaz na sekci ${escapeHtml(summary)}"`));
      const src = read("components/info/SectionLink.tsx");
      assert.ok(src.includes("min-h-[44px]") && src.includes("min-w-[44px]"));
      assert.equal(TEMPLATE_TEXTS.sectionLink.copied, "Odkaz zkopírován");
      assert.equal(TEMPLATE_TEXTS.sectionLink.label, "Zkopírovat odkaz na sekci {title}");
      assert.equal(TEMPLATE_TEXTS.sectionLink.labelNoJs, "Odkaz na sekci {title}");
    },
  },
  {
    name: "4. pravidla.css: ikona a hlášení v tisku skryté, .info-heading + * v obou pravidlech break-before, obal bez break-after",
    run: () => {
      const css = read("app/pravidla/pravidla.css");
      const prints = css.split("@media print").slice(1).join("\n");
      assert.ok(/\.info-section-link,\s*\.info-section-link-status\s*\{\s*display:\s*none !important;/.test(prints));
      assert.ok(/\.info-reference section > \.info-heading \+ \*\s*\{\s*break-before: avoid;/.test(css));
      assert.ok(/\.info-list-section > \.info-heading \+ \*\s*\{\s*break-before: avoid;/.test(css));
      assert.ok(/\.info-root \.info-heading,[^}]*break-after: avoid/.test(css));
      assert.ok(read("components/info/SectionHeading.tsx").includes('className="info-heading'));
    },
  },
  {
    name: "5. SectionLink: use client, location.origin + pathname, isSecureContext, writeText, fallback na hash, bez NEXT_PUBLIC_APP_URL",
    run: () => {
      const raw = read("components/info/SectionLink.tsx");
      const src = stripComments(raw);
      assert.ok(raw.startsWith('"use client"'));
      for (const needle of ["location.origin", "location.pathname", "isSecureContext", "writeText", "location.hash = anchor", "preventDefault()", "aria-live=\"polite\"", 'role="status"']) {
        assert.ok(src.includes(needle), needle);
      }
      assert.ok(!src.includes("NEXT_PUBLIC_APP_URL"));
      assert.ok(!/if \(!ready\) return null/.test(src), "bez JS se odkaz vykreslí");
      assert.ok(src.includes("T.copied") && src.includes("T.fallback"));
      const heading = read("components/info/SectionHeading.tsx");
      assert.ok(!heading.includes('"use client"'), "SectionHeading je serverová");
    },
  },

  // ── B a C: hranice, filtr, součet ────────────────────────────
  {
    name: "6. pendingRange: null bez měsíce, dnešek = konec měsíce je null, den po konci čeká, prosinec přejde na leden",
    run: () => {
      assert.equal(pendingRange(null, "2026-10-31"), null);
      assert.equal(pendingRange("2026-09-01", "2026-09-30"), null);
      assert.equal(pendingRange("2026-09-01", "2026-09-15"), null);
      assert.deepEqual(pendingRange("2026-09-01", "2026-10-01"), { after: "2026-09-30", to: "2026-10-01", nextMonth: "2026-10-01" });
      assert.deepEqual(pendingRange("2026-12-01", "2027-01-05"), { after: "2026-12-31", to: "2027-01-05", nextMonth: "2027-01-01" });
      assert.deepEqual(pendingRange("2027-02-01", "2027-03-10"), { after: "2027-02-28", to: "2027-03-10", nextMonth: "2027-03-01" });
    },
  },
  {
    name: "9. filterBonusEvents na PendingRow: vypnutý Master mind nebo Burza ty řádky odstraní",
    run: () => {
      const rows = [
        row({ memberId: "a", category: "mastermind", date: "2026-10-02" }),
        row({ memberId: "a", category: "burza", date: "2026-10-03" }),
        row({ memberId: "b", category: "thanks", date: "2026-10-04" }),
        row({ memberId: "b", category: "function", date: "2026-10-05" }),
      ];
      assert.equal(filterBonusEvents(rows, ALL).length, 4);
      assert.deepEqual(filterBonusEvents(rows, { ...ALL, mastermind: false }).map((r) => r.category), ["burza", "thanks", "function"]);
      assert.deepEqual(filterBonusEvents(rows, { ...ALL, burza: false }).map((r) => r.category), ["mastermind", "thanks", "function"]);
      assert.equal(filterBonusEvents(rows, { mastermind: false, burza: false, points: false }).length, 0);
      const q = stripComments(read("lib/db/queries/semafor.ts"));
      const fn = q.slice(q.indexOf("export async function listPendingForOverview"));
      assert.ok(fn.includes("filterBonusEvents(rows, sources)"), "přehled filtruje podle zapnutých částí");
    },
  },
  {
    name: "10. parsePendingFilter: cizí uuid, SQL text, pole a vypnutá kategorie se ignorují, platné hodnoty filtrují",
    run: () => {
      const a = "11111111-1111-4111-8111-111111111111";
      const b = "22222222-2222-4222-8222-222222222222";
      const rows = [
        row({ memberId: a, category: "thanks", date: "2026-10-02" }),
        row({ memberId: a, category: "mastermind", date: "2026-10-03" }),
        row({ memberId: b, category: "thanks", date: "2026-10-04" }),
      ];
      assert.deepEqual(parsePendingFilter({}, rows, ALL), {});
      assert.deepEqual(parsePendingFilter({ c: "33333333-3333-4333-8333-333333333333" }, rows, ALL), {}, "cizí uuid");
      assert.deepEqual(parsePendingFilter({ c: "' OR 1=1 --", k: "thanks'; DROP TABLE member;" }, rows, ALL), {}, "SQL text");
      assert.deepEqual(parsePendingFilter({ c: [a, b], k: ["thanks"] }, rows, ALL), {}, "pole");
      assert.deepEqual(parsePendingFilter({ k: "mastermind" }, rows, { ...ALL, mastermind: false }), {}, "vypnutá kategorie");
      assert.deepEqual(parsePendingFilter({ k: "toString" }, rows, ALL), {}, "vlastnost objektu není kategorie");
      const f = parsePendingFilter({ c: a, k: "thanks" }, rows, ALL);
      assert.deepEqual(f, { memberId: a, category: "thanks" });
      assert.equal(filterPending(rows, f).length, 1);
      assert.equal(filterPending(rows, { memberId: a }).length, 2);
      assert.equal(filterPending(rows, { category: "thanks" }).length, 2);
      assert.equal(filterPending(rows, {}).length, 3);
      // řazení: datum sestupně, pak jméno česky
      const sorted = sortPending([
        row({ memberId: "x", memberName: "Člen Šimon", category: "thanks", date: "2026-10-02" }),
        row({ memberId: "y", memberName: "Člen Čáp", category: "thanks", date: "2026-10-02" }),
        row({ memberId: "z", memberName: "Člen Adam", category: "thanks", date: "2026-10-05" }),
      ]);
      assert.deepEqual(sorted.map((r) => r.memberId), ["z", "y", "x"]);
      const members = pendingMembers([...rows, row({ memberId: a, category: "burza", date: "2026-10-09" })]);
      assert.equal(members.length, 2, "člen ve výběru jednou");
    },
  },
  {
    name: "11. pendingSummary: 7 poděkování = 7× / 7 bodů bez podstropu, funkce nejvýš 1, ostatní práce 12 ořez na 10, pořadí kategorií",
    run: () => {
      const ev = [
        ...Array.from({ length: 7 }, (_, i) => ({ category: "thanks" as const, points: undefined, d: i })),
        { category: "function" as const },
        { category: "function" as const },
        { category: "work" as const, points: 12 },
        { category: "work" as const, points: 3 },
        { category: "mastermind" as const },
      ];
      const s = pendingSummary(ev);
      assert.deepEqual(s.map((l) => l.category), ["mastermind", "function", "thanks", "work"]);
      assert.deepEqual(s.find((l) => l.category === "thanks"), { category: "thanks", count: 7, points: 7, each: 1 });
      assert.deepEqual(s.find((l) => l.category === "function"), { category: "function", count: 1, points: 5, each: 5 });
      assert.deepEqual(s.find((l) => l.category === "work"), { category: "work", count: 2, points: 13, each: null });
      assert.deepEqual(pendingSummary([{ category: "work", points: 12 }])[0].points, 10);
      assert.deepEqual(pendingSummary([]), []);
      assert.equal(pendingPoints("work", 12), 10);
      assert.equal(pendingPoints("work", Number.NaN), 0);
      assert.equal(pendingPoints("thanks"), 1);
      assert.equal(pendingPoints("host_member"), 10);
    },
  },
  {
    name: "12. /semafor/prehled: requirePageSession se semafor.view_all první, featureOff hned po něm, listPendingForOverview jen tady; PendingList serverový a bez .note",
    run: () => {
      const page = stripComments(read("app/(app)/semafor/prehled/page.tsx"));
      const body = page.slice(page.indexOf("export default async function"));
      const first = body.slice(body.indexOf("{", body.indexOf(")")) + 1).trim();
      assert.ok(/^const session = await requirePageSession\(\{ permission: "semafor\.view_all"/.test(first));
      const session = body.indexOf("await requirePageSession(");
      const off = body.indexOf('await featureOff("semafor")');
      const pending = body.indexOf("listPendingForOverview(");
      assert.ok(session >= 0 && off > session && pending > off, "pořadí: session, featureOff, data");
      assert.ok(page.includes("pendingRange(latest, pragueToday())"), "hranice z posledního nahraného měsíce, ne z ?m=");
      assert.ok(page.includes('action={`/semafor/prehled#${PENDING_ANCHOR}`}') && page.includes('const PENDING_ANCHOR = "cekajici"'));
      assert.ok(page.includes("parsePendingFilter(raw, rows, sources)"));
      assert.ok(page.includes("{canPoints && <TextsHint />}"), "věta o záložce Body jen s canPoints (gate 4.2)");
      assert.ok(page.includes('href="/semafor/body"'));
      // listPendingForOverview, pendingAutoSql volá jen tahle stránka
      const callers = ["app/(app)/semafor/page.tsx", "app/(app)/semafor/body/page.tsx", "app/(app)/semafor/import/page.tsx"];
      for (const f of callers) {
        const src = stripComments(read(f));
        assert.ok(!src.includes("listPendingForOverview") && !src.includes("pendingAutoSql"), f);
      }
      const list = read("components/semafor/PendingList.tsx");
      assert.ok(!list.includes('"use client"'));
      assert.ok(!/\.note\b/.test(stripComments(list)), "PendingList nečte note");
      assert.ok(!/\bnote\b/.test(stripComments(read("lib/semafor/pending.ts")).replace(/`note`/g, "")), "PendingRow ani vstup nemá note");
      // render: Za co s kategorií, neaktivní s dovětkem, bez Od koho pomlčka
      const html = renderToStaticMarkup(
        createElement(PendingList, {
          rows: [
            row({ memberId: "a", memberName: "Člen Alfa", category: "mastermind", date: "2026-10-08", detail: "Jak na ceník", fromName: "Člen Beta" }),
            row({ memberId: "b", memberName: "Člen Beta", active: false, category: "thanks", date: "2026-10-09" }),
          ],
        })
      );
      assert.ok(html.includes("Master mind: Jak na ceník") && html.includes("8. 10. 2026") && html.includes("7 bodů"));
      assert.ok(html.includes(SEMAFOR_TEXTS.overviewInactive) && html.includes(`>${SEMAFOR_TEXTS.pendingNoFrom}<`));
      for (const col of SEMAFOR_TEXTS.pendingColumns) assert.ok(html.includes(`>${col}</th>`), col);
    },
  },
  {
    name: "13. /semafor: listMyPendingEvents(session.memberId, bez seznamu vedení a bez searchParams; MyScoreCard bez myBonusLaterText, rozpis Čeká na započtení",
    run: () => {
      const mine = stripComments(read("app/(app)/semafor/page.tsx"));
      assert.ok(/listMyPendingEvents\(session\.memberId, range, sources\)/.test(mine));
      for (const forbidden of ["listPendingForOverview", "pendingAutoSql", "listPointsForManagement", "countMyEventsAfter"]) {
        assert.ok(!mine.includes(forbidden), forbidden);
      }
      assert.ok(!/searchParams|params/.test(mine), "memberId nikdy z URL");
      assert.ok(mine.includes("pendingRange(latest, today)") && mine.includes("pendingSummary(pending)"));
      const card = stripComments(read("components/semafor/MyScoreCard.tsx"));
      assert.ok(!card.includes("myBonusLaterText") && card.includes("<PendingLines"));
      assert.ok(!read("components/semafor/PendingLines.tsx").includes('"use client"'));
      const q = stripComments(read("lib/db/queries/semafor.ts"));
      assert.ok(!q.includes("countMyEventsAfter"));
      const fn = q.slice(q.indexOf("export async function listMyPendingEvents"), q.indexOf("export function pendingAutoSql"));
      assert.ok(fn.includes("listBonusEvents({ after: range.after, to: range.to, memberId, sources })") && fn.includes("eventsAfterSnapshot(events, range.after)"));
      assert.ok(!/name/.test(fn), "listMyPendingEvents nečte jména");

      // render karty
      const record: ScoreRecord = {
        month: "2026-09-01",
        memberId: "m1",
        totalScore: 60,
        attendanceRate: null,
        attendanceScore: null,
        ceuRate: null,
        ceuScore: null,
        oneToOneRate: null,
        oneToOneScore: null,
        referralsGivenRate: null,
        referralsGivenScore: null,
        tyfcb: null,
        tyfcbScore: null,
        visitors: null,
        visitorScore: null,
        sponsors: null,
        sponsorScore: null,
      };
      const view = buildMonthView(record, []);
      const lines = pendingSummary([{ category: "thanks" }, { category: "thanks" }, { category: "mastermind" }, { category: "function" }]);
      const html = renderToStaticMarkup(
        createElement(MyScoreCard, { view, pending: { lines, afterDate: "2026-09-30", nextMonth: "2026-10-01" }, sources: ALL })
      );
      assert.ok(html.includes(`>${SEMAFOR_TEXTS.pendingTitle}</h3>`));
      assert.ok(html.includes("Master mind: 1× po 7 bodech") && html.includes("Funkce v chapteru: 5 bodů") && html.includes("Poděkování: 2× po 1 bodu"));
      assert.ok(html.includes(pendingMineNoteText("2026-09-30", "2026-10-01")));
      const none = renderToStaticMarkup(createElement(MyScoreCard, { view, pending: null, sources: ALL }));
      assert.ok(!none.includes(SEMAFOR_TEXTS.pendingTitle), "bez čekajících se podsekce nevykreslí");
      const off = renderToStaticMarkup(
        createElement(MyScoreCard, { view, pending: { lines, afterDate: "2026-09-30", nextMonth: "2026-10-01" }, sources: { mastermind: false, burza: false, points: false } })
      );
      assert.ok(!off.includes(SEMAFOR_TEXTS.pendingTitle), "bez zdroje bonusu ani podsekce");
    },
  },
  {
    name: "14. texty iter-045 bez em dash, pendingIntroText s datem a měsícem, počet záznamů skloňuje",
    run: () => {
      assert.equal(
        pendingIntroText("2026-10-31", "2026-11-01"),
        "Co přibylo po 31. 10. 2026. Započte se s daty za listopad 2026, podstropy a strop se uplatní až tehdy."
      );
      assert.equal(pendingMineNoteText("2026-10-31", "2026-11-01"), pendingIntroText("2026-10-31", "2026-11-01"));
      assert.equal(pendingCountText(1), "1 záznam");
      assert.equal(pendingCountText(3), "3 záznamy");
      assert.equal(pendingCountText(5), "5 záznamů");
      const texts = [
        ...Object.entries(SEMAFOR_TEXTS)
          .filter(([k]) => k.startsWith("pending"))
          .flatMap(([, v]) => (Array.isArray(v) ? v : [String(v)])),
        ...Object.values(TEMPLATE_TEXTS.sectionLink),
        pendingIntroText("2026-12-31", "2027-01-01"),
        ...BONUS_CATEGORIES.map((c) => pendingWhatText(c, "x")),
      ];
      for (const t of texts) assert.ok(!t.includes(EM_DASH), t);
      assert.equal(SEMAFOR_TEXTS.pendingTextsHint, "Texty poděkování a popis ostatní práce najdeš v záložce Body.");
      // diff iter-045: žádný em dash v nových souborech
      for (const f of [
        "lib/semafor/pending.ts",
        "components/info/SectionLink.tsx",
        "components/info/SectionHeading.tsx",
        "components/semafor/PendingList.tsx",
        "components/semafor/PendingLines.tsx",
        "app/(app)/semafor/prehled/page.tsx",
      ]) {
        assert.ok(!read(f).includes(EM_DASH), f);
      }
      assert.ok(!stripComments(read("lib/db/queries/semafor.ts")).includes(["db", "transaction("].join(".")));
    },
  },
  {
    name: "16. gate 4.3: pendingWhatText vždy začíná názvem kategorie, null detail = jen název, detail za dvojtečkou",
    run: () => {
      for (const c of BONUS_CATEGORIES) {
        assert.equal(pendingWhatText(c, null), categoryName(c));
        assert.equal(pendingWhatText(c, "  "), categoryName(c));
        assert.ok(pendingWhatText(c, "Něco").startsWith(`${categoryName(c)}: `));
      }
      assert.equal(pendingWhatText("burza", SEMAFOR_TEXTS.pendingBurzaHelp), "Burza pomoci: pomoc");
      assert.equal(pendingWhatText("burza", SEMAFOR_TEXTS.pendingBurzaContact), "Burza pomoci: kontakt");
      assert.ok(read("components/semafor/PendingList.tsx").includes("pendingWhatText(row.category, row.detail)"));
    },
  },
  {
    name: "17. toPendingRows: Burza dostane pomoc/kontakt, akce název, host jméno nového člena, poděkování a práce bez detailu",
    run: () => {
      const rows = toPendingRows(
        [
          { key: "bh:1", member_id: "a", member_name: "Člen A", active: true, category: "burza", d: "2026-10-02", detail: null, kind: "help", from_name: "Člen B" },
          { key: "bc:2", member_id: "a", member_name: "Člen A", active: true, category: "burza", d: "2026-10-03", detail: null, kind: "contact", from_name: null },
          { key: "fn:a", member_id: "a", member_name: "Člen A", active: false, category: "function", d: "2026-10-04", detail: "Funkce X", kind: null, from_name: "Člen C" },
        ],
        [
          { id: "p1", memberId: "b", memberName: "Člen B", memberActive: true, category: "activity", earnedOn: "2026-10-05", points: null, authorName: "Člen A", activityTitle: "Akce Y", refName: null },
          { id: "p2", memberId: "b", memberName: "Člen B", memberActive: true, category: "host_member", earnedOn: "2026-10-06", points: null, authorName: null, activityTitle: null, refName: "Člen N" },
          { id: "p3", memberId: "b", memberName: "Člen B", memberActive: true, category: "thanks", earnedOn: "2026-10-07", points: null, authorName: "Člen A", activityTitle: null, refName: null },
          { id: "p4", memberId: "b", memberName: "Člen B", memberActive: true, category: "work", earnedOn: "2026-10-08", points: 4, authorName: "Člen A", activityTitle: null, refName: null },
        ]
      );
      assert.deepEqual(rows.map((r) => r.detail), ["pomoc", "kontakt", "Funkce X", "Akce Y", "Člen N", null, null]);
      assert.deepEqual(rows.map((r) => r.points), [5, 5, 5, 2, 10, 1, 4]);
      assert.equal(rows[2].active, false);
      assert.equal(rows[3].key, "sp:p1");
    },
  },
];

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.run();
      console.log(`ok   ${t.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${t.name}\n     ${(e as Error).stack?.split("\n").slice(0, 14).join("\n     ") ?? (e as Error).message}`);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} testů prošlo`);
  process.exit(failed ? 1 : 0);
})();
