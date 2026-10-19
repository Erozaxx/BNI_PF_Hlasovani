/**
 * Testy iter-035 (T-005): Burza pomoci (arch iter-035 T-001 sekce 14, gate
 * T-004 Z1 až Z7). Bez DATABASE_URL, bez sítě, bez Resendu. Testované moduly
 * jsou čisté (rules, events, ops types). Statické kontroly čtou zdrojáky z disku.
 *
 * SQL pojistky (jeden řádek na člena, zákaz pomoci sám sobě, jeden záznam na
 * dvojici a měsíc) bez DB ověřit nejde: testy 12 a 13 jen staticky hlídají
 * jejich tvar, chování ověří QA na větvi Neonu.
 *
 * Repo je veřejné: žádná skutečná jména, kontakty ani nabídky (Člen A, Nabídka 1).
 *
 * Spuštění: npm run test:iter-035-burza (součást npm run test:iter-035)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { BURZA_EVENT_KINDS, helpRemovedEvent, offerEvent, type BurzaEventCtx } from "../lib/burza/events";
import {
  CONTACT_MAX,
  HELP_NOTE_MAX,
  HELP_RECORDS_LIMIT,
  MESSAGES,
  NOTE_MAX,
  OFFER_MAX,
  REVIEW_DAYS,
  TEXTS,
  canEditOffer,
  canRecordHelp,
  canRemoveHelp,
  formatMonthYear,
  helpPartyLabel,
  isStale,
  mapDbError,
  matchesQuery,
  monthStart,
  sortOffers,
  summarizeDashboardBurza,
  validateBoolean,
  validateHelpNote,
  validateOfferInput,
  type Actor,
} from "../lib/burza/rules";
import { TERMINAL_KINDS } from "../lib/ops/types";

const ROOT = join(__dirname, "..");

type TestCase = { name: string; run: () => void | Promise<void> };

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function readRaw(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function readSrc(rel: string): string {
  return stripComments(readRaw(rel));
}

/** Normalizace mezer a konců řádků na jednu mezeru (přeformátování SQL test neshodí). */
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const AUTH = "requireAuth";
const MGMT = "requireManagementRole";

/** Očekávaný guard per akce (arch 5.1 po Z3 a Z4, sloupec Guard je závazný). */
const GUARD_TABLE: Record<string, string> = {
  saveOfferAction: AUTH,
  confirmOfferAction: AUTH,
  removeOfferAction: AUTH,
  recordHelpForAction: MGMT,
  removeHelpAction: AUTH,
  setHelpUsedAction: AUTH,
  saveContactItemAction: AUTH,
  removeContactItemAction: AUTH,
  setContactUsedAction: AUTH,
  removeContactUseAction: MGMT,
};

/** Každá exportovaná akce a první guard v jejím těle. Chybějící guard = prázdný řetězec. */
function actionGuards(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /export async function (\w+)\(/g;
  const starts: Array<{ name: string; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1], at: m.index });
  starts.forEach((s, i) => {
    const body = src.slice(s.at, i + 1 < starts.length ? starts[i + 1].at : src.length);
    const first = /await (requireAuth|requireManagementRole|requireAdmin)\(/.exec(body);
    out[s.name] = first ? first[1] : "";
  });
  return out;
}

function guardMismatches(src: string): string[] {
  const found = actionGuards(src);
  const problems: string[] = [];
  for (const [name, guard] of Object.entries(found)) {
    if (!(name in GUARD_TABLE)) problems.push(`akce ${name} není v tabulce guardů`);
    else if (guard !== GUARD_TABLE[name]) {
      problems.push(`${name}: guard ${guard || "žádný"}, očekáváno ${GUARD_TABLE[name]}`);
    }
  }
  for (const name of Object.keys(GUARD_TABLE)) {
    if (!(name in found)) problems.push(`akce ${name} z tabulky chybí v actions/burza.ts`);
  }
  return problems;
}

/** Tělo jedné exportované funkce z queries (od jejího názvu do další exportované). */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}`);
  assert.ok(start >= 0, `funkce ${name} chybí`);
  const rest = src.slice(start + 10);
  const next = rest.search(/export (async )?(function|interface|type)/);
  return next < 0 ? src.slice(start) : src.slice(start, start + 10 + next);
}

// ── Pomocná data (repo je veřejné: žádná skutečná jména ani nabídky) ──

const A: Actor = { memberId: "m-a", isManagement: false };
const B: Actor = { memberId: "m-b", isManagement: false };
const M: Actor = { memberId: "m-mgmt", isManagement: true };

const ctxOf = (actor: Actor): BurzaEventCtx => ({
  runId: "run-1",
  actor: "Člen A",
  actorId: actor.memberId,
  isManagement: actor.isManagement,
});

const cases: TestCase[] = [
  // ── 1. Validace vstupu ──
  {
    name: "1a. validateOfferInput: povinné „s čím“, limity 400 / 200 / 300, trim, prázdné = null",
    run: () => {
      const bad = (i: unknown) => validateOfferInput(i as never);
      assert.deepEqual(bad({ offer: "" }), { ok: false, error: MESSAGES.offerEmpty });
      assert.deepEqual(bad({ offer: "   \n " }), { ok: false, error: MESSAGES.offerEmpty });
      assert.equal(bad({ offer: "a".repeat(OFFER_MAX) }).ok, true);
      assert.deepEqual(bad({ offer: "a".repeat(OFFER_MAX + 1) }), { ok: false, error: MESSAGES.invalidInput });
      assert.deepEqual(bad({ offer: "x", contact: "c".repeat(CONTACT_MAX + 1) }), { ok: false, error: MESSAGES.invalidInput });
      assert.equal(bad({ offer: "x", contact: "c".repeat(CONTACT_MAX) }).ok, true);
      assert.deepEqual(bad({ offer: "x", note: "n".repeat(NOTE_MAX + 1) }), { ok: false, error: MESSAGES.invalidInput });
      assert.equal(bad({ offer: "x", note: "n".repeat(NOTE_MAX) }).ok, true);
      assert.deepEqual(bad({ offer: "  Nabídka 1  ", contact: "  ", note: "" }), {
        ok: true,
        value: { offer: "Nabídka 1", contact: null, note: null },
      });
      assert.deepEqual(bad({ offer: "x", contact: "  tel   123  ", note: " pozn " }), {
        ok: true,
        value: { offer: "x", contact: "tel 123", note: "pozn" },
      });
      // jiný typ než řetězec
      assert.equal(bad({ offer: 5 }).ok, false);
      assert.equal(bad({ offer: "x", contact: 5 }).ok, false);
      assert.equal(bad({ offer: "x", note: {} }).ok, false);
      assert.equal(bad(null).ok, false);
      assert.equal(bad(undefined).ok, false);
    },
  },
  {
    name: "1b. validateBoolean: jen boolean (Z3, Z12), cokoli jiného neprojde, alias validateIsNew neexistuje",
    run: () => {
      assert.equal(validateBoolean(true), true);
      assert.equal(validateBoolean(false), true);
      for (const v of ["x", "true", 1, 0, null, undefined, {}, []]) assert.equal(validateBoolean(v), false, String(v));
      assert.ok(!readSrc("lib/burza/rules.ts").includes("validateIsNew"));
    },
  },
  {
    name: "1c. mapDbError: 23503, 23514, 22P02, jiný kód",
    run: () => {
      assert.equal(mapDbError("23503"), "Člen už v aplikaci není.");
      assert.equal(mapDbError("23514"), MESSAGES.invalidInput);
      assert.equal(mapDbError("22P02"), MESSAGES.invalidInput);
      assert.equal(mapDbError("42P01"), MESSAGES.generic);
      assert.equal(mapDbError(null), MESSAGES.generic);
      assert.equal(mapDbError(undefined), MESSAGES.generic);
    },
  },

  // ── 2. Poznámka k pomoci ──
  {
    name: "2. validateHelpNote: 300 projde, 301 ne, prázdná = null",
    run: () => {
      assert.deepEqual(validateHelpNote("n".repeat(HELP_NOTE_MAX)), { ok: true, value: "n".repeat(HELP_NOTE_MAX) });
      assert.deepEqual(validateHelpNote("n".repeat(HELP_NOTE_MAX + 1)), { ok: false, error: MESSAGES.invalidInput });
      assert.deepEqual(validateHelpNote(""), { ok: true, value: null });
      assert.deepEqual(validateHelpNote("   "), { ok: true, value: null });
      assert.deepEqual(validateHelpNote(null), { ok: true, value: null });
      assert.deepEqual(validateHelpNote(undefined), { ok: true, value: null });
      assert.deepEqual(validateHelpNote(" věta "), { ok: true, value: "věta" });
      assert.equal(validateHelpNote(5).ok, false);
    },
  },

  // ── 3. Revize 90 dní (Z4) ──
  {
    name: "3. isStale: 89 dní ne, 90 dní ano, přes přelom roku, neplatné datum ne",
    run: () => {
      assert.equal(REVIEW_DAYS, 90);
      // 2026-07-15 + 90 dní = 2026-10-13
      assert.equal(isStale("2026-07-15", "2026-10-12"), false); // 89
      assert.equal(isStale("2026-07-15", "2026-10-13"), true); // 90
      assert.equal(isStale("2026-07-15", "2026-10-14"), true);
      assert.equal(isStale("2026-10-16", "2026-10-16"), false);
      // přelom roku: 2026-11-01 + 90 dní = 2027-01-30
      assert.equal(isStale("2026-11-01", "2027-01-29"), false);
      assert.equal(isStale("2026-11-01", "2027-01-30"), true);
      // přestupný rok: 2028-01-01 + 90 dní = 2028-03-31
      assert.equal(isStale("2028-01-01", "2028-03-30"), false);
      assert.equal(isStale("2028-01-01", "2028-03-31"), true);
      assert.equal(isStale("nesmysl", "2026-10-16"), false);
    },
  },
  {
    name: "4. monthStart a formatMonthYear",
    run: () => {
      assert.equal(monthStart("2026-10-16"), "2026-10-01");
      assert.equal(monthStart("2026-12-31"), "2026-12-01");
      assert.equal(monthStart("2026-01-01"), "2026-01-01");
      assert.throws(() => monthStart("2026-13-01"));
      assert.equal(formatMonthYear("2026-10-16"), "10/2026");
    },
  },

  // ── 5. Kdo smí co ──
  {
    name: "5. canEditOffer: vlastník ano, cizí člen bez role ne, vedení kohokoli (bez předvyplnění kontaktu, Z1)",
    run: () => {
      assert.equal(canEditOffer(A, A.memberId), true);
      assert.equal(canEditOffer(A, B.memberId), false);
      assert.equal(canEditOffer(M, A.memberId), true);
      assert.equal(canEditOffer(M, M.memberId), true);
      const rules = readSrc("lib/burza/rules.ts");
      assert.ok(!/canPrefillContact|getOwnEmail/.test(rules), "Z1: bez předvyplnění");
    },
  },
  {
    name: "6. canRecordHelp: cizí karta přepínač, vlastní nic (helpButtonState odpadl)",
    run: () => {
      assert.equal(canRecordHelp(A.memberId, B.memberId), true);
      assert.equal(canRecordHelp(A.memberId, A.memberId), false);
      assert.ok(!readSrc("lib/burza/rules.ts").includes("helpButtonState"));
    },
  },
  {
    name: "7. canRemoveHelp: příjemce svůj ano, cizí ne, vedení ano, příjemce null jen vedení",
    run: () => {
      assert.equal(canRemoveHelp(A, A.memberId), true);
      assert.equal(canRemoveHelp(A, B.memberId), false);
      assert.equal(canRemoveHelp(M, B.memberId), true);
      assert.equal(canRemoveHelp(A, null), false);
      assert.equal(canRemoveHelp(M, null), true);
    },
  },

  // ── 8. Řazení a hledání ──
  {
    name: "8a. sortOffers: česká kolace, „Č“ za „C“, „Ch“ za „H“, shoda jména podle id, vstup se nemění",
    run: () => {
      const rows = [
        { memberId: "5", name: "Hana" },
        { memberId: "4", name: "Chytrý" },
        { memberId: "3", name: "Čeněk" },
        { memberId: "2", name: "Cecílie" },
        { memberId: "9", name: "Adam" },
        { memberId: "7", name: "Adam" },
      ];
      const snapshot = JSON.stringify(rows);
      const sorted = sortOffers(rows).map((r) => `${r.name}:${r.memberId}`);
      assert.deepEqual(sorted, ["Adam:7", "Adam:9", "Cecílie:2", "Čeněk:3", "Hana:5", "Chytrý:4"]);
      assert.equal(JSON.stringify(rows), snapshot);
    },
  },
  {
    name: "8b. matchesQuery: bez diakritiky a velikosti písmen, víc slov, kontakt se neprohledává, prázdný dotaz = vše",
    run: () => {
      const row = {
        name: "Člen A",
        company: "Firma 1",
        obor: "Účetnictví",
        offer: "Nabídka 1: daňové poradenství",
        note: "Volat odpoledne",
      };
      assert.equal(matchesQuery(row, ""), true);
      assert.equal(matchesQuery(row, "   "), true);
      assert.equal(matchesQuery(row, "ucetn"), true);
      assert.equal(matchesQuery(row, "UČETNICTVÍ"), true);
      assert.equal(matchesQuery(row, "clen"), true);
      assert.equal(matchesQuery(row, "firma"), true);
      assert.equal(matchesQuery(row, "danove"), true);
      assert.equal(matchesQuery(row, "odpoledne"), true);
      assert.equal(matchesQuery(row, "ucetn danove"), true);
      assert.equal(matchesQuery(row, "ucetn pravo"), false);
      assert.equal(matchesQuery(row, "neexistuje"), false);
      // typ SearchableOffer kontakt vůbec nenese, prohledat ho nejde
      assert.equal(matchesQuery({ ...row, ...({ contact: "clen-a@example.invalid" } as object) }, "example"), false);
    },
  },

  // ── 9. Ops log (Z6) ──
  {
    name: "9a. events: 5 druhů burza.* v TERMINAL_KINDS a v KIND_LABELS, popisky s diakritikou, burza.help-recorded neexistuje",
    run: () => {
      assert.deepEqual([...BURZA_EVENT_KINDS], [
        "burza.offer-by-management",
        "burza.offer-removed",
        "burza.help-removed",
        "burza.contact-by-management",
        "burza.contact-use-removed",
      ]);
      const table = readSrc("app/(app)/status/EventTable.tsx");
      for (const kind of BURZA_EVENT_KINDS) {
        assert.ok(TERMINAL_KINDS.includes(kind), `${kind} v TERMINAL_KINDS`);
        const m = new RegExp(`"${kind}":\\s*"([^"]+)"`).exec(table);
        assert.ok(m, `${kind} v KIND_LABELS na /status`);
        assert.ok(/[řáéíěšžýčůúó]/i.test(m[1]), `${kind}: popisek s diakritikou (${m[1]})`);
      }
      const types = readSrc("lib/ops/types.ts");
      assert.ok(!types.includes("burza.help-recorded"));
      assert.ok(!readSrc("lib/burza/events.ts").includes("helpRecordedEvent"));
    },
  },
  {
    name: "9b. offerEvent: null pro vlastní řádek (i vedoucí), událost pro vedení a cizí řádek, smazání má vlastní druh",
    run: () => {
      const target = { memberId: A.memberId, memberName: "Člen A" };
      assert.equal(offerEvent(ctxOf(A), target, "update"), null, "člen sám");
      assert.equal(offerEvent(ctxOf(B), target, "update"), null, "člen bez role na cizím řádku se nelogí");
      assert.equal(offerEvent(ctxOf(M), { memberId: M.memberId, memberName: "Vedení" }, "create"), null, "vedoucí vlastní řádek");
      const created = offerEvent(ctxOf(M), target, "create");
      assert.ok(created);
      assert.equal(created.kind, "burza.offer-by-management");
      assert.equal(created.severity, "info");
      assert.deepEqual(created.detail, { action: "create" });
      assert.equal(created.memberId, A.memberId);
      assert.equal(offerEvent(ctxOf(M), target, "update")?.detail?.action, "update");
      const removed = offerEvent(ctxOf(M), target, "remove");
      assert.equal(removed?.kind, "burza.offer-removed");
    },
  },
  {
    name: "9c. helpRemovedEvent: vedení a cizí záznam warn, i s recipient null, vlastní záznam a příjemce bez logu",
    run: () => {
      const removed = { helpId: "h-1", helperId: "m-x", helperName: "Člen X", recipientId: "m-b" as string | null };
      const warn = helpRemovedEvent(ctxOf(M), removed);
      assert.ok(warn);
      assert.equal(warn.kind, "burza.help-removed");
      assert.equal(warn.severity, "warn");
      assert.equal(warn.memberName, "Člen X");
      assert.deepEqual(warn.detail, { helpId: "h-1" });
      assert.equal(helpRemovedEvent(ctxOf(M), { ...removed, recipientId: null })?.severity, "warn");
      assert.equal(helpRemovedEvent(ctxOf(M), { ...removed, recipientId: M.memberId }), null, "vedoucí jako příjemce");
      assert.equal(helpRemovedEvent(ctxOf(B), removed), null, "příjemce svůj");
      assert.equal(helpRemovedEvent(ctxOf(A), removed), null, "člen bez role");
    },
  },
  {
    name: "9d. statická kontrola: do detail a message nejde email, contact, note ani offer",
    run: () => {
      for (const rel of ["lib/burza/events.ts", "actions/burza.ts"]) {
        const src = readSrc(rel);
        for (const m of src.matchAll(/detail\s*:\s*(\{[^}]*\}|null)/g)) {
          assert.ok(!/\b(email|contact|note|offer)\b/i.test(m[1]), `${rel}: detail ${m[1]}`);
        }
        for (const m of src.matchAll(/message\s*:\s*([^\n]*)/g)) {
          assert.ok(!/\b(email|contact|note|offer)\b/i.test(m[1]), `${rel}: message ${m[1]}`);
        }
      }
    },
  },

  // ── 10. Tabulka guardů (statický test) ──
  {
    name: "10a. tabulka guardů: každá exportovaná akce v actions/burza.ts má očekávaný guard, nic navíc, nic nechybí",
    run: () => {
      const src = readSrc("actions/burza.ts");
      assert.deepEqual(guardMismatches(src), []);
      assert.equal(Object.keys(actionGuards(src)).length, 10);
      assert.ok(!("recordHelpAction" in actionGuards(src)), "recordHelpAction odpadl");
    },
  },
  {
    name: "10b. test testu: akce vedení s requireAuth místo requireManagementRole test shodí (řetězec v paměti)",
    run: () => {
      const src = readSrc("actions/burza.ts");
      const broken = src.replace(
        /(export async function recordHelpForAction[\s\S]*?)await requireManagementRole\(/,
        "$1await requireAuth("
      );
      assert.notEqual(broken, src, "záměna se musela provést");
      const problems = guardMismatches(broken);
      assert.ok(problems.some((p) => p.startsWith("recordHelpForAction")), problems.join("; "));
      const extra = src + "\nexport async function neznamaAkce() { await requireAuth(); }\n";
      assert.ok(guardMismatches(extra).some((p) => p.includes("neznamaAkce")));
      const missing = src.replace(/await requireManagementRole\(MANAGEMENT_ROLES\)/, "undefined");
      assert.ok(guardMismatches(missing).length > 0);
    },
  },
  {
    name: "10c. akce berou memberId aktéra ze session, confirmOfferAction nemá vstup a je jen vlastník",
    run: () => {
      const src = readSrc("actions/burza.ts");
      assert.ok(src.includes("actor.memberId"));
      assert.ok(!/(session|actor)MemberId\s*:/.test(src));
      assert.ok(/export async function confirmOfferAction\(\)/.test(src));
      assert.ok(/confirmOfferGuarded\(actor\.memberId\)/.test(src));
      assert.ok(src.includes("validateBoolean(input.isNew)"));
      assert.ok(src.includes("input.isNew"));
    },
  },

  // ── 11. Statické kontroly stránek ──
  {
    name: "11a. každá page.tsx pod app/(app)/burza volá await requirePageSession(, /burza/pomoc s role management, middleware bez burza",
    run: () => {
      const pages = walk(join(ROOT, "app", "(app)", "burza")).filter((f) => f.endsWith("page.tsx"));
      assert.equal(pages.length, 5, pages.map((p) => relative(ROOT, p)).join(", "));
      for (const f of pages) {
        assert.ok(/await requirePageSession\(/.test(stripComments(readFileSync(f, "utf8"))), relative(ROOT, f));
      }
      const pomoc = readSrc("app/(app)/burza/pomoc/page.tsx");
      assert.ok(pomoc.includes('requirePageSession({ role: "management", denyTo: "/burza" })'));
      assert.ok(!/burza/i.test(readRaw("middleware.ts")));
    },
  },
  {
    name: "11b. edit page: isUuid před canEditOffer a canEditOffer před getOfferForEdit, notFound a redirect",
    run: () => {
      const edit = readSrc("app/(app)/burza/[memberId]/edit/page.tsx");
      const uuid = edit.indexOf("isUuid(memberId)");
      const can = edit.indexOf("canEditOffer(");
      const load = edit.indexOf("getOfferForEdit(");
      assert.ok(uuid > 0 && uuid < can && can < load, `pořadí: ${uuid}, ${can}, ${load}`);
      assert.ok(edit.includes("notFound()"));
      assert.ok(edit.includes('redirect("/burza")'));
    },
  },
  {
    name: "11c. Z1: burza nečte e-mail člena nikde (queries, akce, stránky, komponenty, pravidla)",
    run: () => {
      const files = [
        "lib/db/queries/burza.ts",
        "actions/burza.ts",
        "lib/burza/rules.ts",
        "lib/burza/events.ts",
        ...walk(join(ROOT, "components", "burza")).map((f) => relative(ROOT, f)),
        ...walk(join(ROOT, "app", "(app)", "burza")).map((f) => relative(ROOT, f)),
      ];
      for (const rel of files) {
        const src = readSrc(rel);
        assert.ok(!/\bemail\b/i.test(src.replace(/placeholder\s*=\s*\{[^}]*\}/g, "")), `${rel}: email`);
        assert.ok(!/\bgetOwnEmail\b|canPrefillContact/.test(src), `${rel}: předvyplnění`);
      }
      const q = readSrc("lib/db/queries/burza.ts");
      assert.ok(!/\bemail\b/i.test(q));
    },
  },
  {
    name: "11d. nové soubory nepoužívají db.transaction (LL-003) ani dangerouslySetInnerHTML",
    run: () => {
      const files = [
        "actions/burza.ts",
        "lib/db/queries/burza.ts",
        "lib/burza/rules.ts",
        "lib/burza/events.ts",
        ...walk(join(ROOT, "components", "burza")).map((f) => relative(ROOT, f)),
        ...walk(join(ROOT, "app", "(app)", "burza")).map((f) => relative(ROOT, f)),
      ];
      for (const rel of files) {
        const src = readSrc(rel);
        assert.ok(!/\.transaction\(/.test(src), `${rel}: transaction`);
        assert.ok(!/dangerouslySetInnerHTML/.test(src), `${rel}: dangerouslySetInnerHTML`);
      }
    },
  },

  // ── 12. Dotazy, statická kontrola ──
  {
    name: "12a. queries: založení má ON CONFLICT (member_id) DO NOTHING a ne DO UPDATE, úprava je UPDATE bez INSERT, nikde version",
    run: () => {
      const src = readSrc("lib/db/queries/burza.ts");
      const create = norm(fnBody(src, "createOfferGuarded"));
      const update = norm(fnBody(src, "updateOfferGuarded"));
      assert.ok(create.includes("INSERT INTO burza_offer"));
      assert.ok(create.includes("ON CONFLICT (member_id) DO NOTHING"));
      assert.ok(!create.includes("DO UPDATE"));
      assert.ok(update.includes("UPDATE burza_offer"));
      assert.ok(!update.includes("INSERT"));
      assert.ok(/WHERE member_id = \$\{args\.targetId\}::uuid AND \(/.test(update), "autorita ve WHERE");
      assert.ok(update.includes("confirmed_at = now()"));
      assert.ok(!/\bversion\b/i.test(norm(src)), "Z3: bez version");
      // autorita ve WHERE (založení, úprava, smazání)
      for (const fn of ["createOfferGuarded", "updateOfferGuarded", "removeOfferGuarded"]) {
        assert.ok(/::boolean/.test(norm(fnBody(src, fn))), `${fn}: $isManagement`);
        assert.ok(/ OR \$\{args\.isManagement\}/.test(norm(fnBody(src, fn))), `${fn}: OR isManagement`);
      }
    },
  },
  {
    name: "12b. queries: „Platí dál“ jen vlastník (member_id = $me), bez IS DISTINCT FROM a bez updated_by",
    run: () => {
      const confirm = norm(fnBody(readSrc("lib/db/queries/burza.ts"), "confirmOfferGuarded"));
      assert.ok(/UPDATE burza_offer SET confirmed_at = now\(\) WHERE member_id = \$\{me\}::uuid RETURNING member_id/.test(confirm), confirm);
      assert.ok(!confirm.includes("updated_by"));
    },
  },
  {
    name: "12c. queries: zápis pomoci čte FROM burza_offer, hlídá pomocník <> příjemce a ON CONFLICT; mazání pomoci má recipient_id =, OR a JOIN member",
    run: () => {
      const src = readSrc("lib/db/queries/burza.ts");
      const rec = norm(fnBody(src, "recordHelpGuarded"));
      assert.ok(rec.includes("FROM burza_offer o"));
      assert.ok(rec.includes("o.member_id <> ${args.recipientId}::uuid"));
      assert.ok(rec.includes("ON CONFLICT (helper_id, recipient_id, used_month) DO NOTHING"));
      assert.ok(rec.includes("RETURNING id"));
      const rem = norm(fnBody(src, "removeHelpGuarded"));
      assert.ok(rem.includes("recipient_id = ${args.actorId}::uuid OR ${args.isManagement}::boolean"));
      assert.ok(rem.includes("JOIN member"));
      const list = norm(fnBody(src, "getHelpRecordsForManagement"));
      assert.ok(list.includes("LIMIT ${HELP_RECORDS_LIMIT}"));
      assert.equal(HELP_RECORDS_LIMIT, 200);
    },
  },

  // ── 12d. Opravy po review a security (T-006r) ──
  {
    name: "12d. m1: výzva k revizi má jedno znění (TEXTS.staleOwn) v MyOfferBox i dashboardu, bez natvrdo psaného textu",
    run: () => {
      for (const rel of ["components/burza/MyOfferBox.tsx", "components/burza/DashboardBurza.tsx"]) {
        const src = readSrc(rel);
        assert.ok(src.includes("TEXTS.staleOwn"), rel);
        assert.ok(!src.includes("Platí pořád?"), `${rel}: natvrdo psaný text`);
      }
      assert.equal(TEXTS.staleOwn, "Tvůj řádek v burze je starší než 3 měsíce. Platí pořád?");
    },
  },
  {
    name: "12e. m2: /burza/pomoc nečte celé řádky burzy, výběr jmen jen id a jméno (bez contact a note)",
    run: () => {
      const page = readSrc("app/(app)/burza/pomoc/page.tsx");
      assert.ok(!page.includes("getOffersForOverview"));
      assert.ok(page.includes("getOfferHolderNames()"));
      const body = norm(fnBody(readSrc("lib/db/queries/burza.ts"), "getOfferHolderNames"));
      assert.ok(body.includes("SELECT m.id, m.name FROM member m"));
      assert.ok(body.includes("EXISTS (SELECT 1 FROM burza_offer o WHERE o.member_id = m.id)"));
      assert.ok(!/\b(contact|note|offer)\b\s*[,\n]/i.test(body.replace(/burza_offer o/g, "")), body);
      assert.ok(!/o\.(contact|note|offer)\b/.test(body));
    },
  },
  {
    name: "12f. L-1: recordHelpForAction odmítne helperId = aktér (hláška), SQL hlídá o.member_id <> createdBy",
    run: () => {
      const src = readSrc("actions/burza.ts");
      const fn = src.slice(src.indexOf("export async function recordHelpForAction"));
      const check = fn.indexOf("helperId === actor.memberId");
      const call = fn.indexOf("recordHelp(");
      assert.ok(check > 0 && check < call, `pořadí: ${check}, ${call}`);
      assert.ok(fn.includes("MESSAGES.helperIsActor"));
      assert.equal(
        MESSAGES.helperIsActor,
        "Pomoc, kterou jsi poskytl(a) ty, zapíše někdo jiný z vedení nebo ten, komu jsi pomohl(a)."
      );
      const rec = norm(fnBody(readSrc("lib/db/queries/burza.ts"), "recordHelpGuarded"));
      assert.ok(rec.includes("o.member_id <> ${args.createdBy}::uuid"));
    },
  },
  {
    name: "12g. L-2: deleteMemberAction nuluje note příjemce před deleteMemberGuarded, selhání čištění smazání zastaví, bez transakce",
    run: () => {
      const act = readSrc("actions/members.ts");
      const fn = act.slice(act.indexOf("export async function deleteMemberAction"));
      const clear = fn.indexOf("clearHelpNotesForRecipient(memberId)");
      const del = fn.indexOf("deleteMemberGuarded(memberId, actorId)");
      assert.ok(clear > 0 && clear < del, `pořadí: ${clear}, ${del}`);
      const between = fn.slice(clear, del);
      assert.ok(/catch/.test(between) && /return \{ success: false/.test(between), between);
      assert.ok(!/db\.transaction|\.transaction\(/.test(act));
      const q = norm(fnBody(readSrc("lib/db/queries/burza.ts"), "clearHelpNotesForRecipient"));
      assert.ok(q.includes("UPDATE burza_help SET note = NULL WHERE recipient_id = ${memberId}::uuid"), q);
    },
  },

  // ── 13. Migrace, schema ──
  {
    name: "13a. migrace: v DO $$ blocích žádné ${ (LL-006), lock_timeout doslova, bez ALTER TABLE a DROP TABLE",
    run: () => {
      const raw = readRaw("scripts/migrate-iter-035-burza.ts");
      const blocks = [...raw.matchAll(/DO \$\$ BEGIN([\s\S]*?)END \$\$/g)].map((m) => m[1]);
      assert.equal(blocks.length, 4, "2 smoke testy a 2 skutečné tabulky");
      for (const b of blocks) {
        assert.ok(!b.includes("${"), "interpolace uvnitř DO bloku");
        assert.ok(b.includes("PERFORM set_config('lock_timeout', '5s', true);"));
      }
      const code = raw.replace(/\/\*[\s\S]*?\*\//g, "");
      assert.ok(!/ALTER TABLE/i.test(code), "bez ALTER TABLE");
      assert.ok(!/DROP TABLE/i.test(code), "migrace nic nemaže (rollback jen v komentáři)");
    },
  },
  {
    name: "13b. migrace: smoke testy mají stejné sloupce a CHECK jako skutečné tabulky, bez FK, ON COMMIT DROP, bh_month s used_on::timestamp",
    run: () => {
      const raw = readRaw("scripts/migrate-iter-035-burza.ts");
      const blocks = [...raw.matchAll(/DO \$\$ BEGIN([\s\S]*?)END \$\$/g)].map((m) => m[1]);
      const [smokeOffer, smokeHelp, realOffer, realHelp] = blocks;
      const columns = (s: string) =>
        s
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^[a-z_]+\s+(UUID|TEXT|DATE|TIMESTAMPTZ)\b/.test(l))
          .map((l) => norm(l.replace(/\s+REFERENCES[^,]*/g, "").replace(/,$/, "")));
      const constraints = (s: string) =>
        s
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("CONSTRAINT"))
          .map((l) => norm(l.replace(/,$/, "")));
      for (const smoke of [smokeOffer, smokeHelp]) {
        assert.ok(smoke.includes("CREATE TEMPORARY TABLE") && smoke.includes("ON COMMIT DROP"));
        assert.ok(!/REFERENCES/.test(smoke), "smoke bez cizích klíčů");
      }
      assert.deepEqual(columns(smokeOffer), columns(realOffer));
      assert.deepEqual(columns(smokeHelp), columns(realHelp));
      assert.equal(columns(realOffer).length, 8);
      assert.equal(columns(realHelp).length, 8);
      assert.deepEqual(constraints(smokeOffer), constraints(realOffer));
      assert.deepEqual(constraints(smokeHelp), constraints(realHelp));
      assert.equal(constraints(realOffer).length, 3);
      assert.equal(constraints(realHelp).length, 4);
      assert.ok(realHelp.includes("date_trunc('month', used_on::timestamp)::date"));
      assert.ok(!/\bversion\b/i.test(raw.replace(/\/\*[\s\S]*?\*\//g, "")), "Z3: bez version");
    },
  },
  {
    name: "13c. migrace: indexy, kontrolní kroky volají fail, runner je exit 1; schema.ts má obě tabulky a member beze změny",
    run: () => {
      const raw = readRaw("scripts/migrate-iter-035-burza.ts");
      assert.ok(raw.includes("CREATE INDEX IF NOT EXISTS idx_bh_helper_used ON burza_help (helper_id, used_on)"));
      assert.ok(raw.includes("CREATE INDEX IF NOT EXISTS idx_bh_recipient ON burza_help (recipient_id)"));
      assert.ok(raw.includes("confdeltype"));
      assert.ok(/process\.exit\(1\)/.test(raw));
      for (const name of ["bo_offer_len", "bh_not_self", "bh_month", "bh_once_per_month", "burza_offer_pkey"]) {
        assert.ok(raw.includes(name), name);
      }
      const schema = readSrc("lib/db/schema.ts");
      assert.ok(schema.includes("export const burzaOffer = pgTable("));
      assert.ok(schema.includes("export const burzaHelp = pgTable("));
      const offerDef = schema.slice(schema.indexOf("export const burzaOffer"), schema.indexOf("export const burzaHelp"));
      assert.ok(!/version/.test(offerDef), "Z3");
    },
  },

  // ── 14. Dashboard (Z4) ──
  {
    name: "14. summarizeDashboardBurza: bez řádku nic, čerstvý nic, starý výzva, vedení nemá nic navíc",
    run: () => {
      const today = "2026-10-16";
      assert.equal(summarizeDashboardBurza({ ownConfirmedDay: null }, today), null);
      assert.equal(summarizeDashboardBurza({ ownConfirmedDay: "2026-10-01" }, today), null);
      assert.equal(summarizeDashboardBurza({ ownConfirmedDay: "2026-07-19" }, today), null, "89 dní");
      assert.deepEqual(summarizeDashboardBurza({ ownConfirmedDay: "2026-07-18" }, today), { kind: "own-stale" }, "90 dní");
      assert.deepEqual(summarizeDashboardBurza({ ownConfirmedDay: "2026-07-17" }, today), { kind: "own-stale" }, "91 dní");
      // komponenta dashboardu bere jen memberId, nic o vedení
      const comp = readSrc("components/burza/DashboardBurza.tsx");
      assert.ok(!/isManagement/.test(comp));
      assert.ok(comp.includes("catch"), "selhání dotazu dashboard nesrazí");
    },
  },

  // ── 15. Existující testy ──
  {
    name: "15. package.json: test:iter-035 spouští i test:iter-033 a test:iter-032-access, Master mind a existující testy beze změny souborů",
    run: () => {
      const pkg = JSON.parse(readRaw("package.json")) as { scripts: Record<string, string> };
      const s = pkg.scripts;
      assert.equal(s["test:iter-035-burza"], "tsx scripts/test-iter-035-burza.ts");
      assert.ok(s["test:iter-035"].includes("test:iter-035-burza"));
      assert.ok(s["test:iter-035"].includes("test:iter-033"));
      assert.ok(s["test:iter-035"].includes("test:iter-032-access"));
      for (const f of ["lib/mastermind/rules.ts", "lib/mastermind/events.ts", "actions/mastermind.ts"]) {
        assert.ok(readRaw(f).length > 0, f);
      }
    },
  },

  // ── 16. Popisky záznamů pomoci ──
  {
    name: "16. helpPartyLabel: příjemce null, sám/sama, autor už není členem, jinak jméno",
    run: () => {
      const base = { recipientId: "m-r", recipientName: "Člen R", createdBy: "m-c", createdByName: "Člen C" };
      assert.deepEqual(helpPartyLabel(base), { recipient: "Člen R", createdBy: "Člen C" });
      assert.deepEqual(helpPartyLabel({ ...base, recipientId: null, recipientName: null }), {
        recipient: "příjemce už není členem",
        createdBy: "Člen C",
      });
      assert.equal(helpPartyLabel({ ...base, createdBy: "m-r", createdByName: "Člen R" }).createdBy, "sám/sama");
      assert.equal(helpPartyLabel({ ...base, createdBy: null, createdByName: null }).createdBy, "autor už není členem");
      assert.deepEqual(
        helpPartyLabel({ recipientId: null, recipientName: null, createdBy: null, createdByName: null }),
        { recipient: "příjemce už není členem", createdBy: "autor už není členem" }
      );
    },
  },

  // ── 17. Texty, navigace, mobil ──
  {
    name: "17a. texty z gate Z7 slovo od slova a diakritika v nových komponentách",
    run: () => {
      assert.equal(
        TEXTS.boundary,
        "Pomoc z burzy je nezištná: rada nebo krátká konzultace. Když z ní vznikne zakázka, je to běžný obchod a patří do doporučení."
      );
      assert.equal(TEXTS.boundaryField, "Rada nebo krátká konzultace. Zakázka patří do doporučení.");
      assert.equal(TEXTS.noteHint, "Třeba kdy se hodí volat.");
      assert.equal(TEXTS.helpMissingMember, "Kdo tu chybí, nemá řádek v burze. Napřed mu ho zapiš, pak pomoc.");
      assert.equal(TEXTS.noOffer, "Ještě nemáš řádek v burze.");
      assert.equal(MESSAGES.alreadyCreated, "Řádek mezitím někdo založil. Načti stránku znovu.");
      assert.equal(MESSAGES.deletedMeanwhile, "Řádek mezitím někdo smazal. Načti stránku znovu.");
      assert.equal(MESSAGES.offerGone, "Řádek už v burze není.");
      const ui = [
        ...walk(join(ROOT, "components", "burza")),
        ...walk(join(ROOT, "app", "(app)", "burza")),
      ].map((f) => stripComments(readFileSync(f, "utf8")));
      const all = ui.join("\n");
      for (const bad of ["Zapsalo vedení", "K potvrzení", "Zapisuješ za člena"]) {
        assert.ok(!all.includes(bad), `Z2/Z4: ${bad}`);
      }
      for (const bad of ["Zapsat pomoc", "Platí dál", "Přidat svůj řádek"]) {
        assert.ok(all.includes(bad), `chybí text: ${bad}`);
      }
      // iter-035 doplnění: „Využil(a) jsem“ nahradil „Pomohl(a) mi“ (gate T-012 K15, Z13)
      assert.equal(TEXTS.usedToggle, "Využil(a) jsem");
      assert.ok(!all.includes("Pomohl(a) mi"), "Pomohl(a) mi už v UI není");
      assert.ok(!all.includes("Využil/a jsem"), "lomítko nikde");
      assert.ok(!("helpHint" in TEXTS), "TEXTS.helpHint neexistuje");
      assert.ok(!all.includes("window.confirm(\"Opravdu zrušit zápis"), "zrušení bez potvrzení");
      const toggle = stripComments(readRaw("components/burza/HelpUsedToggle.tsx"));
      assert.ok(!toggle.includes("window.confirm") && !toggle.includes("Pomohl(a) mi"));
      assert.ok(readSrc("components/burza/UsedToggleButton.tsx").includes("TEXTS.usedToggle"));
      for (const bad of ["Hoste", "Schuzky", "Pridat", "Smazat radek", "Upravit radek"]) {
        assert.ok(!all.includes(bad), `bez diakritiky: ${bad}`);
      }
    },
  },
  {
    name: "17b. navigace: Burza pomoci v layout.tsx i MobileNav.tsx hned za Master mind, pro všechny",
    run: () => {
      const layout = readSrc("app/(app)/layout.tsx");
      const mm = layout.indexOf('href="/mastermind"');
      const bz = layout.indexOf('href="/burza"');
      assert.ok(mm > 0 && bz > mm, "layout");
      assert.ok(layout.includes("Burza pomoci"));
      assert.ok(!/isManagement && <NavLink href="\/burza"/.test(layout));
      const nav = readSrc("components/layout/MobileNav.tsx");
      const mmN = nav.indexOf('href="/mastermind"');
      const bzN = nav.indexOf('href="/burza"');
      assert.ok(mmN > 0 && bzN > mmN, "MobileNav");
      assert.ok(nav.includes("Burza pomoci"));
      assert.ok(readSrc("app/(app)/dashboard/page.tsx").includes("<DashboardBurza"));
    },
  },
  {
    name: "17c. mobil: žádné tlačítko uvnitř Link (iter-033 T-009r), interaktivní prvky mají min-h-[44px]",
    run: () => {
      const files = [
        ...walk(join(ROOT, "components", "burza")),
        ...walk(join(ROOT, "app", "(app)", "burza")),
      ].filter((f) => f.endsWith(".tsx"));
      assert.ok(files.length > 10, "našly se soubory");
      for (const f of files) {
        const src = stripComments(readFileSync(f, "utf8"));
        const re = /<Link\b[^>]*>([\s\S]*?)<\/Link>/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          assert.ok(!/<Button\b|<button\b/.test(m[1]), `${relative(ROOT, f)}: tlačítko uvnitř Link`);
        }
        // každý <Link> a <Button> nese min-h-[44px] (hrubá kontrola počtem v souboru)
        const interactive = (src.match(/<(Link|Button)\b/g) ?? []).length;
        const tall = (src.match(/min-h-\[44px\]/g) ?? []).length;
        assert.ok(tall >= interactive, `${relative(ROOT, f)}: ${interactive} Link/Button, ${tall} x min-h-[44px]`);
      }
    },
  },
  {
    name: "17d. help: nové sekce v MemberHelp a ModeratorHelp, bez štítků povinné/doporučené, věta o heslu",
    run: () => {
      const member = readSrc("components/help/sections/MemberHelp.tsx");
      const mod = readSrc("components/help/sections/ModeratorHelp.tsx");
      assert.ok(member.includes("Burza pomoci"));
      assert.ok(mod.includes("Burza pomoci"));
      assert.ok(mod.includes("Akce vedení fungují jen po přihlášení heslem"));
      assert.ok(mod.includes("Uložení posune"));
      assert.ok(member.includes("Pomoc z burzy je nezištná: rada nebo krátká konzultace."));
      const burzaMember = member.slice(member.indexOf("Burza pomoci"));
      // iter-035 doplnění (gate T-012, sekce 5)
      assert.ok(burzaMember.includes("Využil(a) jsem"));
      assert.ok(burzaMember.includes("Kontakty"));
      assert.ok(!burzaMember.includes("Pomohl(a) mi"));
      assert.ok(!burzaMember.includes("Zapsal(a) jsem to omylem"));
      for (const bad of ["Zapsalo vedení", "K potvrzení", "povinné", "doporučené"]) {
        assert.ok(!burzaMember.includes(bad), bad);
      }
    },
  },
];

let passed = 0;
let failed = 0;

async function main() {
  for (const testCase of cases) {
    try {
      await testCase.run();
      console.log(`OK   ${testCase.name}`);
      passed++;
    } catch (error) {
      failed++;
      console.error(`FAIL ${testCase.name}`);
      console.error(`     ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed (of ${cases.length})`);
  if (failed > 0) process.exitCode = 1;
}

void main();
