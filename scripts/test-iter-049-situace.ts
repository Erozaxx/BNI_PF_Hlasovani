/**
 * Testy iter-049 (klientské situace), část bez DB. Číslování podle
 * arch_iter-049_T-001 kap. 10: 1 až 5 (import), 6 až 8 (export JSON, nečitelné,
 * CSV), 9 až 11 (validace, práva, statika akcí), 12 (statika export route),
 * 13 až 15 (statika), 16 a 17 (serializeForHtml, findMissingRefs), 18
 * (DeleteMemberButton). 19 až 26 jsou v test-iter-049-sql.ts.
 * Jména jsou smyšlená, žádná data ze situace.json.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { assertApplyAllowed, assertOutsideRepo, PalmsError } from "../lib/attendance/palms";
import {
  SESSION_PROBE_URL,
  backToOverviewDecision,
  canRetry,
  clearsErrorOnEdit,
  columnDirtyState,
  failedCardPatch,
  failureFromProbe,
  headDirtyState,
  headNeedsResave,
  isActionResult,
  resolveThrownFailure,
  runSituationAction,
} from "../lib/situations/card-state";
import {
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  PERMISSIONS,
  can,
  expandFunctionPermissions,
  permissionsFor,
  roleGrants,
} from "../lib/auth/permissions";
import {
  CSV_HEADER,
  buildCsv,
  buildSituaceJson,
  csvCell,
  csvFilename,
  findMissingRefs,
  isUnreadableSituation,
  serializeForHtml,
  type ExportData,
  type ExportItem,
  type ExportKind,
  type ExportSituation,
} from "../lib/situations/export";
import { CLIENT_SITUATION_DDL, CLIENT_SITUATION_ITEM_DDL, CLIENT_SITUATION_SOURCE_DDL, doBlock } from "../lib/situations/ddl";
import {
  ImportError,
  buildImportPlan,
  canApply,
  isUnreadableName,
  parseAliasJson,
  parseSituaceJson,
  planToParams,
} from "../lib/situations/import";
import {
  DEADLINE_ISO,
  MESSAGES,
  SECTION_TEXTS,
  UI_TEXTS,
  canEditSituations,
  cardsLabel,
  decideAddMiss,
  decideHeadMiss,
  decideRemoveMiss,
  decideUpdateMiss,
  isDeadlineActive,
  isHeadField,
  isItemKind,
  isSlot,
  isUuid,
  missToResult,
  readOriginal,
  situationHeading,
  situationStatus,
  validateHeadValue,
  validateItemText,
  type ItemRow,
  type WriteState,
} from "../lib/situations/rules";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf-8");
/** Zdroj bez komentářů (statické kontroly nemají hlídat prózu v hlavičkách). */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

let n = 0;
const ok = (m: string) => console.log(`ok ${++n}. ${m}`);

const ID1 = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const ID3 = "33333333-3333-4333-8333-333333333333";
const ID4 = "44444444-4444-4444-8444-444444444444";

const members = [
  { id: ID1, name: "Karel Zkouška", active: true },
  { id: ID2, name: "Jana Pokusná", active: true },
  { id: ID3, name: "Eva Test", active: false },
];

function sourceFile(overrides: { situace?: unknown[]; clenove?: unknown[] } = {}): string {
  return JSON.stringify({
    situace: overrides.situace ?? [
      {
        id: "S-5-1",
        clen: "Karel Zkouška",
        nazev: "Majitel firmy",
        puvodni_q1: "Původní text jedna",
        puvodni_q2: "Původní text dva",
        problem: "Popis situace",
        cil: "Klid ve firmě",
        obavy: ["Odejdou lidé", "Bude to drahé"],
        navazne_potreby: ["Školení vedoucích"],
        jmenovani_clenove: ["Jana Pokusná"],
        k_overeni: true,
        k_overeni_duvod: "špatně čitelné",
      },
      {
        id: "S-5-2",
        clen: "Karel Zkouška",
        nazev: "Nečitelná situace",
        puvodni_q1: "[nečitelné]",
        puvodni_q2: "",
        problem: "",
        cil: "",
        obavy: [],
        navazne_potreby: [],
      },
      {
        id: "S-6-3",
        clen: "Jana Pokusná",
        nazev: "Eshop",
        puvodni_q1: "Q1",
        puvodni_q2: "Q2",
        problem: "Jiný popis",
        cil: "",
        obavy: ["Strach"],
        navazne_potreby: [],
      },
    ],
    clenove: overrides.clenove ?? [
      {
        jmeno: "Karel Zkouška",
        firma: "Zkouška s.r.o.",
        obor: "IT",
        vyplnil_formular: true,
        situace: ["S-5-1", "S-5-2"],
        kompetence: [{ kompetence: "web", zdroj: "karel" }],
      },
      { jmeno: "Jana Pokusná", firma: "Eshop", obor: "Obchod", vyplnil_formular: true, situace: ["S-6-3"], kompetence: [] },
      { jmeno: "Eva Test", firma: "", obor: "", vyplnil_formular: false, situace: [], kompetence: [] },
    ],
  });
}

const noAliases = new Map<string, string>();

// ── 1. buildImportPlan: mapování z tabulky 5.1 ──
{
  const file = parseSituaceJson(sourceFile());
  const plan = buildImportPlan(file, members, noAliases);
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.unmatched, []);
  assert.equal(plan.complete, true);
  assert.equal(plan.situations.length, 3);
  const s1 = plan.situations.find((s) => s.sourceId === "S-5-1")!;
  assert.equal(s1.memberId, ID1);
  assert.equal(s1.slot, 1);
  assert.equal(s1.title, "Majitel firmy", "nazev do title");
  assert.equal(s1.description, "Popis situace", "problem do description");
  assert.deepEqual(s1.original, file.situace[0], "original beze změny, včetně polí, která aplikace nečte");
  const s2 = plan.situations.find((s) => s.sourceId === "S-5-2")!;
  assert.equal(s2.title, "", "Nečitelná situace do prázdného title (M5)");
  assert.equal(s2.slot, 2);
  const items1 = plan.items.filter((i) => i.sourceId === "S-5-1");
  assert.deepEqual(
    items1.map((i) => [i.kind, i.text, i.ord]),
    [
      ["fear", "Odejdou lidé", 0],
      ["fear", "Bude to drahé", 1],
      ["desire", "Klid ve firmě", 0],
      ["related", "Školení vedoucích", 0],
    ],
    "obavy, cíl jako jedna touha, související potřeby, pořadí v poli"
  );
  assert.equal(plan.items.filter((i) => i.sourceId === "S-5-2").length, 0, "prázdný cil a prázdná pole nic");
  assert.equal(plan.items.filter((i) => i.kind === ("need" as never)).length, 0, "potřeby (B) zůstávají prázdné");
  assert.equal(plan.items.filter((i) => i.kind === ("trait" as never)).length, 0, "lístečky se neimportují");
  assert.equal(plan.sources.length, 3);
  assert.deepEqual(plan.sources[0].competences, [{ kompetence: "web", zdroj: "karel" }]);
  assert.deepEqual(plan.stats.items, { fear: 3, desire: 1, related: 1 });
  assert.equal(isUnreadableName("Nečitelná situace"), true);
  assert.equal(isUnreadableName("Necitelna situace"), true);
  assert.equal(isUnreadableName("Majitel"), false);
  assert.deepEqual(canApply(plan), { ok: true });
  const params = planToParams(plan);
  assert.equal(JSON.parse(params.situations).length, 3);
  assert.deepEqual(JSON.parse(params.situations)[0].original, file.situace[0]);
  ok("1. buildImportPlan: title, description, obavy, cíl jako touha, související potřeby, B prázdné, original beze změny, pořadí");
}

// ── 2. slot z id, chyby ──
{
  const base = JSON.parse(sourceFile());
  const bad = (situace: unknown[]) => buildImportPlan(parseSituaceJson(sourceFile({ situace })), members, noAliases);
  const one = base.situace[0];
  assert.equal(bad([{ ...one, id: "S-5-4" }]).errors.length, 1, "slot 4");
  assert.equal(bad([{ ...one, id: "X-5-1" }]).errors.length, 1, "špatný tvar id");
  assert.equal(bad([{ ...one, id: "S-5-1" }, { ...one, id: "S-9-1" }]).errors.length, 1, "opakovaný slot stejného člena");
  assert.equal(bad([{ ...one, id: "S-5-1" }, { ...one, id: "S-5-1" }]).errors.length, 1, "opakované id");
  assert.equal(bad([{ ...one, clen: "Nikdo Jiný" }]).errors.length, 1, "clen mimo clenove");
  assert.equal(buildImportPlan(parseSituaceJson(sourceFile()), members, noAliases).situations[2].slot, 3);
  assert.throws(() => parseSituaceJson("nejde"), ImportError);
  assert.throws(() => parseSituaceJson(JSON.stringify({ situace: "x", clenove: [] })), ImportError);
  ok("2. slot z id, špatné id, opakovaný slot, opakované id a clen mimo clenove jsou chyby");
}

// ── 3. párování, alias, --apply s nespárovanými ──
{
  const withNames = (names: string[]) =>
    parseSituaceJson(
      JSON.stringify({
        situace: [],
        clenove: names.map((jmeno) => ({ jmeno, vyplnil_formular: true, situace: [], kompetence: [] })),
      })
    );
  const run = (names: string[], aliases = noAliases, mem = members) =>
    buildImportPlan(withNames(names), mem, aliases);
  assert.equal(run(["Karel Zkouška"]).stats.matchedMembers, 1, "exact");
  assert.equal(run(["karel zkouska"]).stats.matchedMembers, 1, "bez diakritiky a velikosti");
  assert.equal(run(["Zkouška Karel"]).stats.matchedMembers, 1, "prohozené pořadí");
  const aliasNfd = parseAliasJson(JSON.stringify({ ["KAREL ZKOUŠKA-ALIAS".normalize("NFD")]: ID1 }), isUuid);
  const viaAlias = run(["Karel Zkouška-Alias"], aliasNfd);
  assert.equal(viaAlias.stats.matchedMembers, 1, "alias s jinou velikostí písmen a rozloženou diakritikou (nameKey)");
  assert.equal(viaAlias.sources[0].memberId, ID1);
  const ambiguous = run(["Karel Zkouška"], noAliases, [...members, { id: ID4, name: "Karel Zkouška", active: true }]);
  assert.equal(ambiguous.unmatched[0].kind, "ambiguous");
  const none = run(["Nikdo Neznámý"]);
  assert.equal(none.unmatched[0].kind, "none");
  assert.equal(canApply(none).ok, false, "--apply s nespárovaným končí");
  assert.equal(canApply(ambiguous).ok, false);
  const twice = run(["Karel Zkouška", "Zkouška Karel"]);
  assert.ok(twice.errors.length > 0 || twice.unmatched.length > 0, "dva zdrojoví členové na jednoho = problém");
  assert.equal(canApply(twice).ok, false);
  assert.throws(() => parseAliasJson(JSON.stringify({ x: "neuuid" }), isUuid), ImportError);
  const partialPlan = buildImportPlan(parseSituaceJson(sourceFile()), members.slice(0, 2), noAliases);
  assert.equal(partialPlan.unmatched.length, 1, "Eva Test chybí v členech");
  assert.equal(partialPlan.complete, true);
  assert.equal(canApply(partialPlan).ok, false);
  const missingMember = buildImportPlan(parseSituaceJson(sourceFile()), [members[1], members[2]], noAliases);
  assert.equal(missingMember.complete, false, "situace nespárovaného člena nejsou v plánu");
  ok("3. párování exact, loose, prohozené, alias přes nameKey; ambiguous a none jsou nespárovaní, apply s nimi končí");
}

// ── 4. oříznutí a NFC ──
{
  const long = "á".repeat(1001);
  const file = parseSituaceJson(
    sourceFile({
      situace: [
        {
          id: "S-1-1",
          clen: "Karel Zkouška",
          nazev: "N".repeat(130),
          problem: long,
          cil: "",
          obavy: ["o".repeat(301), "  Café  "],
          navazne_potreby: [],
        },
      ],
      clenove: [{ jmeno: "Karel Zkouška", vyplnil_formular: true, situace: ["S-1-1"], kompetence: [] }],
    })
  );
  const plan = buildImportPlan(file, members, noAliases);
  assert.equal([...plan.situations[0].description].length, 1000);
  assert.equal([...plan.situations[0].title].length, 120);
  assert.equal([...plan.items[0].text].length, 300);
  assert.equal(plan.items[1].text, "Café", "NFC a trim");
  assert.equal(plan.stats.truncated, 3);
  ok("4. oříznutí dlouhých textů (3 hlášené) a NFC");
}

// ── 5. mimo repo a EXPECT_DB_HOST ──
{
  assert.throws(() => assertOutsideRepo(path.join(ROOT, "tmp", "situace.json"), [ROOT]), PalmsError);
  assert.throws(() => assertOutsideRepo(path.join(ROOT, "alias.json"), [ROOT]), PalmsError);
  assert.doesNotThrow(() => assertOutsideRepo("/tmp/mimo-repo/situace.json", [ROOT]));
  assert.throws(() => assertApplyAllowed(true, undefined, "ep-abc.neon.tech"), PalmsError, "--apply bez EXPECT_DB_HOST");
  assert.throws(() => assertApplyAllowed(true, "jiny-host", "ep-abc.neon.tech"), PalmsError);
  assert.doesNotThrow(() => assertApplyAllowed(true, "ep-abc", "ep-abc.neon.tech"));
  const script = code("scripts/import-iter-049-situace.ts");
  assert.ok(script.includes("readOutsideRepo(args.file"), "soubor mimo repo");
  assert.ok(script.includes("readOutsideRepo(args.alias"), "alias mimo repo");
  assert.ok(script.includes("assertApplyAllowed(args.apply"), "EXPECT_DB_HOST");
  assert.ok(!script.includes("--skip-unmatched"), "bez přeskočení nespárovaných");
  assert.ok(!script.includes("db.transaction("), "bez transakcí");
  ok("5. assertOutsideRepo odmítá repo (soubor i alias), --apply bez EXPECT_DB_HOST končí, skript bez --skip-unmatched");
}

// ── 9. validace vstupu akcí ──
{
  assert.equal(isItemKind("need"), true);
  assert.equal(isItemKind("x"), false, "kind mimo výčet");
  assert.equal(isSlot(0), false);
  assert.equal(isSlot(4), false);
  assert.equal(isSlot(1) && isSlot(2) && isSlot(3), true);
  assert.equal(isUuid("neuuid"), false);
  assert.equal(isUuid(ID1), true);
  assert.equal(isHeadField("client") && isHeadField("title") && isHeadField("description"), true);
  assert.equal(isHeadField("original"), false, "original se přes akci nepíše");
  assert.deepEqual(validateItemText("need", "   "), { ok: false, error: MESSAGES.textEmpty });
  assert.deepEqual(validateItemText("need", "a".repeat(301)), { ok: false, error: MESSAGES.textTooLong });
  assert.deepEqual(validateItemText("need", "a".repeat(300)), { ok: true, value: "a".repeat(300) });
  assert.deepEqual(validateItemText("trait", "a".repeat(41)), { ok: false, error: MESSAGES.traitTooLong });
  assert.deepEqual(validateItemText("trait", "a".repeat(40)), { ok: true, value: "a".repeat(40) });
  assert.deepEqual(validateItemText("need", "​‮﻿"), { ok: false, error: MESSAGES.textEmpty }, "jen neviditelné znaky = prázdné");
  assert.deepEqual(validateItemText("need", "a​b\u0000c"), { ok: true, value: "abc" }, "neviditelné a řídicí znaky se odstraní");
  assert.deepEqual(validateItemText("need", "řádek 1\r\nřádek 2"), { ok: true, value: "řádek 1\nřádek 2" });
  assert.deepEqual(validateItemText("trait", "B2B,\n ČR"), { ok: true, value: "B2B, ČR" }, "lísteček je jednořádkový");
  assert.deepEqual(validateItemText("need", 5), { ok: false, error: MESSAGES.invalidInput });
  assert.equal(validateHeadValue("client", "").ok, true, "prázdné pole hlavičky = vymazání");
  assert.equal(validateHeadValue("client", "a".repeat(81)).ok, false);
  assert.equal(validateHeadValue("title", "a".repeat(121)).ok, false);
  assert.equal(validateHeadValue("description", "a".repeat(1001)).ok, false);
  assert.equal(validateHeadValue("description", "a".repeat(1000)).ok, true);
  ok("9. validace vstupu: kind, slot, prázdný text, 301 a 41 znaků, neviditelné znaky, itemId není UUID");
}

// ── 9b. rozhodnutí při 0 řádcích ──
{
  const item: ItemRow = { id: ID1, kind: "need", text: "text", importedText: null, createdAt: "", updatedAt: "" };
  const st = (p: Partial<WriteState> = {}): WriteState => ({
    allowed: true,
    active: true,
    item: null,
    kindCount: 0,
    headUnchanged: false,
    ...p,
  });
  assert.equal(decideHeadMiss(st({ allowed: false })).type, "denied");
  assert.equal(decideHeadMiss(st({ active: false })).type, "inactive");
  assert.equal(decideHeadMiss(st({ headUnchanged: true })).type, "ok");
  assert.equal(decideAddMiss(st({ item }), "need").type, "ok", "dvojí odeslání vrátí existující kartičku");
  assert.equal(decideAddMiss(st({ kindCount: 30 }), "need").type, "limit");
  assert.equal(decideAddMiss(st({ kindCount: 12 }), "trait").type, "limit");
  assert.equal(decideAddMiss(st({ kindCount: 29 }), "need").type, "failed");
  assert.equal(decideUpdateMiss(st(), "need", "x").type, "gone", "neexistující nebo cizí kartička");
  assert.equal(decideUpdateMiss(st({ item }), "fear", "x").type, "gone", "jiný typ");
  assert.equal(decideUpdateMiss(st({ item }), "need", "text").type, "ok", "stejný text");
  assert.equal(decideRemoveMiss(st()).type, "ok", "už smazáno");
  assert.equal(decideRemoveMiss(st({ active: false })).type, "inactive");
  assert.deepEqual(missToResult({ type: "denied" }), { code: "denied", error: "Na tuhle akci nemáš oprávnění." });
  assert.deepEqual(missToResult({ type: "inactive" }), {
    code: "inactive",
    error: "Tento člen je neaktivní, jeho situace už upravit nejde.",
  });
  assert.equal(missToResult({ type: "gone" })?.error, "Kartička už neexistuje nebo ji nemůžeš upravit.");
  assert.equal(missToResult({ type: "limit" }, "need")?.error, "Do jednoho sloupce můžeš dát nejvýš 30 kartiček.");
  assert.equal(missToResult({ type: "limit" }, "trait")?.error, "Vlastností můžeš mít nejvýš 12.");
  assert.equal(missToResult({ type: "ok", item: null }), null);
  assert.equal(MESSAGES.sessionExpired, "Přihlášení vypršelo. Zkopíruj si text, přihlas se znovu a vlož ho.");
  assert.equal(MESSAGES.saveFailed, "Nepodařilo se uložit.");
  assert.equal(UI_TEXTS.retry, "Zkusit znovu");
  ok("9b. rozhodnutí při 0 řádcích a texty hlášek doslova podle gate");
}

// ── 10. práva ──
{
  assert.equal(PERMISSIONS.includes("situations.manage"), true);
  assert.equal(roleGrants("moderator", "situations.manage"), true, "moderátor");
  assert.equal(MODERATOR_ROLE_PERMISSIONS.includes("situations.manage"), true);
  assert.equal(DEFAULT_FUNCTION_PERMISSIONS.includes("situations.manage"), true, "výchozí sada funkce (Člen výboru)");
  assert.equal(expandFunctionPermissions(["admin-delegable"]).includes("situations.manage"), true, "značka (Prezident, Viceprezident)");
  const pw = (role: "admin" | "moderator" | null, fns: { name: string; permissions: string[] | null }[] = []) =>
    permissionsFor({ authMethod: "password", managementRole: role, functions: fns, attendanceManager: false });
  assert.equal(pw("admin").has("situations.manage"), true, "admin");
  assert.equal(pw("moderator").has("situations.manage"), true);
  assert.equal(pw(null, [{ name: "Člen výboru", permissions: null }]).has("situations.manage"), true);
  assert.equal(pw(null, [{ name: "Prezident", permissions: ["admin-delegable"] }]).has("situations.manage"), true);
  assert.equal(pw(null, [{ name: "Ruční", permissions: ["guests.manage"] }]).has("situations.manage"), false, "ruční seznam právo nedostane");
  assert.equal(pw(null).has("situations.manage"), false, "běžný člen");
  for (const role of ["admin", "moderator"] as const) {
    const viaLink = permissionsFor({ authMethod: "magic_link", managementRole: role, functions: [], attendanceManager: false });
    assert.equal(viaLink.has("situations.manage"), false, `přihlášení odkazem (${role}) nemá nic`);
  }
  const actorOwn = { memberId: ID1, canManage: false };
  assert.equal(canEditSituations(actorOwn, ID1), true, "vlastní");
  assert.equal(canEditSituations(actorOwn, ID2), false, "cizí bez práva");
  assert.equal(canEditSituations({ memberId: ID1, canManage: true }, ID2), true, "cizí s právem");
  assert.equal(canEditSituations(null, ID1), false);
  assert.equal(can({ permissions: ["situations.manage"] }, "situations.manage"), true);
  assert.equal(situationStatus({ touched: true, hasOriginal: true }), "edited");
  assert.equal(situationStatus({ touched: false, hasOriginal: true }), "workshop");
  assert.equal(situationStatus({ touched: false, hasOriginal: false }), "notStarted");
  assert.equal(situationHeading({ client: "", title: "", description: "" } as never), "–");
  assert.equal(situationHeading({ client: "Majitel", title: "Název" }), "Majitel");
  assert.equal(cardsLabel(1), "1 kartička");
  assert.equal(cardsLabel(3), "3 kartičky");
  assert.equal(cardsLabel(14), "14 kartiček");
  assert.equal(isDeadlineActive(DEADLINE_ISO), true);
  assert.equal(isDeadlineActive("2026-12-02"), false, "po termínu věta o termínu zmizí");
  assert.deepEqual(readOriginal({ nazev: "N", puvodni_q1: "A", puvodni_q2: 5 }), { name: "N", q1: "A", q2: "" });
  assert.deepEqual(readOriginal(JSON.stringify({ nazev: "N" })), { name: "N", q1: "", q2: "" });
  assert.equal(readOriginal(null), null);
  ok("10. situations.manage: moderátor, výchozí sada funkce, značka, admin; odkaz nic; canEditSituations; situationStatus; termín");
}

// ── 11. statika akcí ──
{
  const src = code("actions/situations.ts");
  assert.ok(src.startsWith('"use server";'));
  const chunks = src.split("export async function ").slice(1);
  assert.equal(chunks.length, 4, "čtyři exportované akce");
  for (const c of chunks) {
    const name = c.slice(0, c.indexOf("("));
    assert.ok(
      /^\w+\(\s*input: \w+\s*\): Promise<[\s\S]*?>\s*\{\n  const auth = await requireAuth\(\);/.test(c),
      `${name} začíná requireAuth()`
    );
  }
  const inputTypes = [...src.matchAll(/export type \w+Input = \{[\s\S]*?\n\};/g)].map((m) => m[0]);
  assert.equal(inputTypes.length, 4);
  for (const t of inputTypes) {
    assert.ok(!/situationId|situation_id/i.test(t), "žádné situationId ve vstupu akce");
    assert.ok(/memberId: string/.test(t));
  }
  assert.ok(!/actorId|memberId:\s*actor/.test(inputTypes.join("")), "aktér se z klienta neposílá");
  assert.ok(src.includes("session_expired"), "vypršelé přihlášení má rozlišitelný kód");
  assert.ok(!src.includes("db.transaction("));
  assert.ok(!src.includes("router.refresh"));
  assert.ok(!/console\.(log|error)\([^)]*\.text/.test(src), "text kartičky do logu nejde");
  ok("11. každá akce začíná requireAuth(), žádné situationId ve vstupu, kód session_expired");
}

// ── 11b. L-2: migrace vyžaduje EXPECT_DB_HOST a porovnává přesně ──
{
  const migrate = code("scripts/migrate-iter-049-situace.ts");
  assert.ok(migrate.includes("assertApplyAllowed(true, process.env.EXPECT_DB_HOST"), "povinná kontrola hostu");
  assert.ok(!migrate.includes(".includes(expectHost)"), "žádná podřetězcová kontrola");
  const check = migrate.indexOf("assertApplyAllowed(");
  const firstDb = Math.min(...["await sql`", "await sql(", "sql`"].map((t) => migrate.indexOf(t)).filter((i) => i >= 0));
  assert.ok(check > 0 && check < firstDb, "kontrola hostu je před prvním příkazem do DB");
  assert.throws(() => assertApplyAllowed(true, undefined, "ep-abc-pooler.eu.neon.tech"), PalmsError, "bez EXPECT_DB_HOST");
  assert.throws(() => assertApplyAllowed(true, "neon.tech", "ep-abc.eu.neon.tech"), PalmsError, "podřetězec");
  assert.throws(() => assertApplyAllowed(true, "ep-xyz", "ep-abc.eu.neon.tech"), PalmsError, "jiný host");
  assert.doesNotThrow(() => assertApplyAllowed(true, "ep-abc", "ep-abc.eu.neon.tech"));
  ok("11b. migrace: EXPECT_DB_HOST povinná a přesná, kontrola před prvním dotazem");
}

// ── 27. chování editoru: čisté funkce (gate změny 10 až 13, review M-1, m-1 až m-5) ──
async function test27(): Promise<void> {
  // gate 12 a 13: rozlišení po výjimce z akce
  assert.deepEqual(failureFromProbe(401), { error: MESSAGES.sessionExpired, code: "session_expired" });
  assert.equal(failureFromProbe(200).code, "failed");
  assert.equal(failureFromProbe(200).error, MESSAGES.saveFailed);
  assert.equal(failureFromProbe(500).code, "failed");
  assert.equal(failureFromProbe(null).code, "failed");
  assert.equal(MESSAGES.saveFailed, "Nepodařilo se uložit.");
  assert.equal(canRetry("session_expired"), false, "u vypršelého přihlášení bez Zkusit znovu");
  assert.equal(canRetry("failed"), true);
  assert.equal(canRetry(null), true);
  assert.equal(canRetry("invalid"), false, "u chyby validace bez Zkusit znovu (QA7)");
  const calls: string[] = [];
  const expired = await resolveThrownFailure(async (url) => {
    calls.push(url);
    return { status: 401 };
  });
  assert.equal(expired.code, "session_expired");
  assert.deepEqual(calls, [SESSION_PROBE_URL]);
  assert.equal((await resolveThrownFailure(async () => ({ status: 200 }))).code, "failed");
  assert.equal(
    (await resolveThrownFailure(async () => {
      throw new TypeError("network");
    })).code,
    "failed",
    "výpadek sítě při sondě nevyhodí"
  );
  // N-R3: visící sonda skončí timeoutem jako obecná chyba uložení
  let aborted = false;
  const hung = await resolveThrownFailure(
    (_url, init) =>
      new Promise<{ status: number }>(() => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
        });
      }),
    20
  );
  assert.equal(hung.code, "failed", "timeout sondy = obecná chyba uložení");
  assert.equal(aborted, true, "sonda se po timeoutu přeruší");

  // M-1: po chybě zůstane text v poli a stav není „ukládám“, m-4: bez krádeže fokusu
  const patch = failedCardPatch({ error: MESSAGES.saveFailed, code: "failed" });
  assert.equal(patch.status, "error");
  assert.equal(patch.editing, true);
  assert.equal(patch.focus, false);

  // m-2: po chybě validace se chyba smaže při psaní, jiné chyby ne
  assert.equal(clearsErrorOnEdit("error", "invalid"), true);
  assert.equal(clearsErrorOnEdit("error", "failed"), false);
  assert.equal(clearsErrorOnEdit("error", "session_expired"), false);
  assert.equal(clearsErrorOnEdit("idle", "invalid"), false);

  // m-1: úprava během ukládání se uloží znovu
  assert.equal(headNeedsResave("Nový text  ", "Nový text", false), false);
  assert.equal(headNeedsResave("Nový text 2", "Nový text", false), true);
  assert.equal(headNeedsResave("", "Nový text", false), true);

  // dirty stavy a „Zpět na přehled“ (gate 11, m-3)
  const card = (over: Partial<Parameters<typeof columnDirtyState>[0][number]> = {}) => ({
    status: "idle" as const,
    editing: false,
    persisted: true,
    text: "a",
    draftText: "a",
    ...over,
  });
  assert.equal(columnDirtyState([card()], true), "clean");
  assert.equal(columnDirtyState([card({ editing: true, draftText: "ab" })], true), "typing");
  assert.equal(columnDirtyState([card({ editing: true, persisted: false, text: "", draftText: "  " })], true), "clean");
  assert.equal(columnDirtyState([card({ status: "error" }), card()], true), "error");
  assert.equal(columnDirtyState([card({ status: "error" }), card({ status: "saving" })], true), "saving");
  assert.equal(headDirtyState("idle", "x", "x"), "clean");
  assert.equal(headDirtyState("idle", "xy", "x"), "typing");
  assert.equal(headDirtyState("error", "x", "x"), "error");
  assert.equal(headDirtyState("saving", "x", "x"), "saving");
  assert.equal(backToOverviewDecision([], false), "go");
  assert.equal(backToOverviewDecision(["clean"], false), "go");
  assert.equal(backToOverviewDecision(["saving", "error"], false), "wait");
  assert.equal(backToOverviewDecision(["saving"], true), "block", "po limitu se přestane čekat");
  assert.equal(backToOverviewDecision(["error"], false), "block", "chyba se sama nespraví, nečeká se");
  assert.equal(backToOverviewDecision(["typing"], false), "block");

  // QA17: výsledek, který není očekávaný objekt, a timeout jdou cestou selhání
  assert.equal(isActionResult(undefined), false);
  assert.equal(isActionResult(null), false);
  assert.equal(isActionResult({}), false);
  assert.equal(isActionResult({ success: true }), false, "úspěch bez data");
  assert.equal(isActionResult({ success: false, error: "x" }), false, "chyba bez kódu");
  assert.equal(isActionResult("<html>"), false);
  assert.equal(isActionResult({ success: true, data: { changed: true } }), true);
  assert.equal(isActionResult({ success: false, error: "x", code: "invalid" }), true);
  const probe401 = async () => ({ status: 401 });
  const probe200 = async () => ({ status: 200 });
  const undef = await runSituationAction(async () => undefined as never, { fetchFn: probe401 });
  assert.deepEqual(undef, { success: false, error: MESSAGES.sessionExpired, code: "session_expired" }, "undefined + 401");
  const nul = await runSituationAction(async () => null as never, { fetchFn: probe200 });
  assert.deepEqual(nul, { success: false, error: MESSAGES.saveFailed, code: "failed" }, "null + sonda 200");
  const shapeless = await runSituationAction(async () => ({ foo: 1 }) as never, { fetchFn: probe401 });
  assert.equal(shapeless.success === false && shapeless.code, "session_expired", "objekt bez polí");
  const thrown = await runSituationAction(async () => {
    throw new Error("x");
  }, { fetchFn: probe401 });
  assert.equal(thrown.success === false && thrown.code, "session_expired", "výjimka");
  const good = { success: true as const, data: { changed: true } };
  assert.deepEqual(await runSituationAction(async () => good, { fetchFn: probe401 }), good, "platný výsledek beze změny");
  const bad = { success: false as const, error: "Nejvýš 40.", code: "invalid" as const };
  assert.deepEqual(await runSituationAction(async () => bad, { fetchFn: probe401 }), bad, "chyba akce se nepřepisuje a sonda se nevolá");
  let probeCalls = 0;
  await runSituationAction(async () => good, { fetchFn: async () => { probeCalls += 1; return { status: 401 }; } });
  assert.equal(probeCalls, 0, "sonda jen při selhání");
  const t0 = Date.now();
  const timedOut = await runSituationAction(() => new Promise<never>(() => undefined), { timeoutMs: 20, fetchFn: probe401 });
  assert.equal(timedOut.success === false && timedOut.code, "session_expired", "timeout + 401");
  const timedOut2 = await runSituationAction(() => new Promise<never>(() => undefined), { timeoutMs: 20, fetchFn: probe200 });
  assert.equal(timedOut2.success === false && timedOut2.code, "failed", "timeout + sonda 200");
  assert.ok(Date.now() - t0 < 2000, "timeout neblokuje");
  const hungProbe = await runSituationAction(() => new Promise<never>(() => undefined), {
    timeoutMs: 20,
    probeTimeoutMs: 20,
    fetchFn: () => new Promise<{ status: number }>(() => undefined),
  });
  assert.equal(hungProbe.success === false && hungProbe.code, "failed", "visí akce i sonda");

  // statika: každé volání akce v components/situations jde přes runSituationAction (M-1, QA17)
  const actionCall = /await runSituationAction\(\(\) =>\s*(add|update|remove|save)Situation(Item|Head)Action\(/g;
  let calls2 = 0;
  for (const f of ["ItemColumn.tsx", "HeadField.tsx"]) {
    const src = code(`components/situations/${f}`);
    calls2 += [...src.matchAll(actionCall)].length;
    assert.ok(!/await (add|update|remove|save)Situation(Item|Head)Action\(/.test(src), `${f}: holé volání akce bez runSituationAction`);
    assert.ok(src.includes("runSituationAction"), `${f} rozlišuje výjimku`);
  }
  assert.equal(calls2, 4, "čtyři volání akcí v editoru");
  for (const f of readdirSync(path.join(ROOT, "components/situations"))) {
    const src = code(`components/situations/${f}`);
    assert.ok(!/await \w+Action\(/.test(src) || f === "ItemColumn.tsx" || f === "HeadField.tsx", `${f}: neznámé volání akce`);
  }

  // route sondy a middleware (LL-005): bez session 401 JSON, ne redirect
  const route = code("app/api/situace/session/route.ts");
  assert.ok(route.includes("requireAuth()") && route.includes("status: 401"));
  assert.ok(!/redirect|email|memberId/i.test(route), "sonda nic neprozradí");
  const mw = read("middleware.ts");
  assert.ok(mw.includes('pathname === "/api/situace/session"'), "výjimka v middleware");
  assert.ok(mw.indexOf('"/api/situace/session"') < mw.indexOf("NextResponse.redirect(loginUrl)"));
  // QA12: i oba exporty, jen přesnými cestami
  for (const p of ["/api/situace/export/json", "/api/situace/export/csv"]) {
    assert.ok(mw.includes(`pathname === "${p}"`), `401 pro ${p}`);
    assert.ok(mw.indexOf(`"${p}"`) < mw.indexOf("NextResponse.redirect(loginUrl)"));
  }
  assert.ok(!/pathname\.startsWith\("\/api\/situace/.test(mw), "žádné prefixové zpřístupnění /api/situace");

  // m-4: fokus jen na pokyn uživatele, ne při návratu z chyby
  const col = code("components/situations/ItemColumn.tsx");
  assert.ok(col.includes("card.editing && card.focus"));
  // QA7: Esc po chybě zavře pole i bez fokusu; QA13: cíle × a položky aspoň 44 px
  assert.ok(col.includes('document.addEventListener("keydown"') && col.includes('card.status === "error"'), "Esc po chybě");
  assert.ok(!/min-h-\[28px\]|min-w-\[28px\]/.test(col), "žádný cíl 28 px");
  assert.ok(col.includes("min-h-[44px] min-w-[44px]"), "× aspoň 44 px");
  // m-3: editor nečeká na chybu
  assert.ok(code("components/situations/SituationEditor.tsx").includes("backToOverviewDecision("));
  ok("27. editor: rozlišení vypršelého přihlášení, text zůstane, bez krádeže fokusu, opravený text se uloží, Zpět na přehled nečeká na chybu, každé volání akce v try");
}

// ── 13. statika: LL-017 ──
{
  assert.equal(existsSync(path.join(ROOT, "app/(app)/situace/loading.tsx")), false);
  assert.equal(existsSync(path.join(ROOT, "app/(app)/situace/[memberId]/loading.tsx")), false);
  for (const f of readdirSync(path.join(ROOT, "components/situations"))) {
    const src = code(`components/situations/${f}`);
    assert.ok(!src.includes("router.refresh"), `${f} nevolá router.refresh`);
  }
  assert.ok(!code("actions/situations.ts").includes('revalidatePath("/situace/'), "revalidace jen přehledu");
  ok("13. v app/(app)/situace není loading.tsx a editor nevolá router.refresh()");
}

// ── 14. statika: original, transakce, ddl ──
{
  const q = code("lib/db/queries/client-situations.ts");
  const sets = [...q.matchAll(/\bSET\b([\s\S]*?)(?=\bWHERE\b|\bFROM\b|\bRETURNING\b|`)/g)].map((m) => m[1]);
  assert.ok(sets.length >= 4, `našel jsem SET klauzule (${sets.length})`);
  for (const s of sets) assert.ok(!/original/i.test(s), `original v SET: ${s.trim()}`);
  assert.ok(!/DO UPDATE[\s\S]{0,200}original/.test(q), "original v DO UPDATE SET");
  assert.ok(!/\.set\(/.test(q), "žádné drizzle .set(");
  assert.ok(!/db\.transaction\(/.test(q));
  for (const f of ["actions/situations.ts"]) assert.ok(!/db\.transaction\(/.test(code(f)));
  const ddl = code("lib/situations/ddl.ts");
  assert.ok(!ddl.slice(0, ddl.indexOf("export function doBlock")).includes("${"), "v konstantách ddl.ts žádná JS interpolace");
  for (const text of [CLIENT_SITUATION_DDL, CLIENT_SITUATION_ITEM_DDL, CLIENT_SITUATION_SOURCE_DDL]) {
    assert.ok(!text.includes("$$") && !text.includes("${"));
    assert.ok(doBlock(text).includes("set_config('lock_timeout', '5s', true)"), "lock_timeout doslova");
  }
  assert.throws(() => doBlock("$$"));
  const schemaTs = read("lib/db/schema.ts");
  assert.ok(!/\.set\([^)]*clientSituation/.test(schemaTs));
  const migrate = code("scripts/migrate-iter-049-situace.ts");
  assert.ok(!migrate.includes("db.transaction("));
  assert.ok(migrate.includes("EXPECT_DB_HOST"));
  ok("14. original není v SET ani v DO UPDATE, bez transakcí, ddl.ts bez ${ a bez $$, lock_timeout '5s' doslova");
}

// ── 15. statika: stránky ──
{
  for (const f of ["app/(app)/situace/page.tsx", "app/(app)/situace/[memberId]/page.tsx"]) {
    assert.ok(read(f).includes("requirePageSession("), `${f} volá requirePageSession(`);
    assert.ok(read(f).includes('export const dynamic = "force-dynamic"'));
  }
  const detail = read("app/(app)/situace/[memberId]/page.tsx");
  assert.ok(detail.includes("notFound()"));
  assert.ok(detail.includes("isUuid(params.memberId)"));
  const layout = read("app/(app)/layout.tsx");
  assert.ok(layout.includes('href="/situace"') && layout.includes("Klientské situace"));
  const mobile = read("components/layout/MobileNav.tsx");
  assert.ok(mobile.includes('href="/situace"') && mobile.includes("Klientské situace"));
  assert.ok(layout.indexOf('href="/burza"') < layout.indexOf('href="/situace"'), "hned za Burzou");
  ok("15. obě page.tsx volají requirePageSession(, 404 pro neplatné id, navigace v layoutu i MobileNav");
}

// ── 16b. texty a gate (nejde o export) ──
{
  assert.equal(SECTION_TEXTS.need.title, "Potřeby");
  assert.equal(SECTION_TEXTS.need.question, "Co klient potřebuje?");
  assert.equal(SECTION_TEXTS.need.add, "+ Přidat potřebu");
  assert.equal(SECTION_TEXTS.fear.add, "+ Přidat obavu");
  assert.equal(SECTION_TEXTS.desire.add, "+ Přidat touhu");
  assert.equal(SECTION_TEXTS.related.add, "+ Přidat související potřebu");
  assert.equal(SECTION_TEXTS.head.title, "Kdo je klient a v jaké situaci se nachází?");
  assert.equal(UI_TEXTS.fillMine, "Vyplnit své situace");
  assert.equal(UI_TEXTS.backToOverview, "Zpět na přehled");
  assert.equal(UI_TEXTS.fillingFor("Karel Zkouška"), "Vyplňuješ za člena: Karel Zkouška");
  assert.equal(UI_TEXTS.traitPlaceholder, "např. B2B, cca 100 lidí, ČR");
  assert.equal(UI_TEXTS.intro, "Z tvých situací skládáme mapu společných potřeb klientů v chapteru.");
  assert.equal(UI_TEXTS.deadline, "Doplň je prosím do 1. 12.");
  assert.equal(UI_TEXTS.empty, "–");
  assert.equal(UI_TEXTS.leadershipViaLink, "Vyplnit situace za jiného člena a stáhnout data pro mapu jde jen po přihlášení heslem.");
  const files = [
    "lib/situations/rules.ts",
    "lib/situations/ddl.ts",
    "lib/situations/import.ts",
    "lib/situations/import-sql.ts",
    "lib/db/queries/client-situations.ts",
    "actions/situations.ts",
    "scripts/import-iter-049-situace.ts",
    "scripts/migrate-iter-049-situace.ts",
    "scripts/test-iter-049-situace.ts",
    "scripts/test-iter-049-sql.ts",
    "scripts/check-iter-049-export.ts",
    "lib/situations/export.ts",
    "app/api/situace/export/json/route.ts",
    "app/api/situace/export/csv/route.ts",
    "app/(app)/situace/page.tsx",
    "app/(app)/situace/[memberId]/page.tsx",
    ...readdirSync(path.join(ROOT, "components/situations")).map((f) => `components/situations/${f}`),
    "components/help/sections/MemberHelp.tsx",
    "components/help/sections/ModeratorHelp.tsx",
  ];
  const dash = String.fromCharCode(0x2014);
  for (const f of files) assert.ok(!read(f).includes(dash), `${f}: em dash`);
  const rules = read("lib/situations/rules.ts");
  assert.ok(!rules.includes("Zatím nic") && !rules.includes("zatím nevyplněno"), "vatové věty u prázdných polí");
  assert.ok(!rules.includes("Pokračovat ve vyplňování"));
  ok("T. texty podle gate doslova, bez em dash, bez vatových vět u prázdných polí");
}

// ── 18. DeleteMemberButton ──
{
  const del = read("app/(app)/admin/members/DeleteMemberButton.tsx");
  assert.ok(del.includes("klientské situace"), "potvrzení mazání zmiňuje situace");
  assert.ok(del.includes("Deaktivovat"));
  ok("18. potvrzení v DeleteMemberButton.tsx obsahuje klientské situace");
}

// ── nápověda ──
{
  const member = read("components/help/sections/MemberHelp.tsx");
  assert.ok(member.includes('title="Klientské situace"'));
  const mod = read("components/help/sections/ModeratorHelp.tsx");
  assert.ok(mod.includes("situations") && mod.includes("Klientské situace pro vedení"));
  const page = read("app/(app)/help/page.tsx");
  assert.ok(page.includes('can(session, "situations.manage")'));
  ok("H. nápověda členů a vedení obsahuje sekci Klientské situace");
}

// ── Export: smyšlená data ──
const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
const U2 = "bbbbbbbb-2222-4222-8222-222222222222";
const U3 = "cccccccc-3333-4333-8333-333333333333";
const U4 = "dddddddd-4444-4444-8444-444444444444";
let itemSeq = 0;
function item(kind: ExportKind, text: string, over: Partial<ExportItem> = {}): ExportItem {
  itemSeq += 1;
  const pad = String(itemSeq).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${pad}`,
    kind,
    text,
    importedText: null,
    createdAt: `2026-11-20T10:00:00.${String(itemSeq % 1000).padStart(3, "0")}Z`,
    updatedAt: "2026-11-23T08:00:00.000Z",
    ...over,
  };
}
function sit(over: Partial<ExportSituation> & { memberId: string; slot: number }): ExportSituation {
  return {
    sourceId: null,
    client: "",
    title: "",
    description: "",
    original: null,
    touched: false,
    updatedAt: "2026-11-23T08:00:00.000Z",
    items: [],
    ...over,
  };
}
const ORIG_KAREL = {
  id: "S-7-1",
  clen: "Karel Zkouška",
  nazev: "Majitel firmy",
  puvodni_q1: "Původní odpověď Q1",
  puvodni_q2: "Původní odpověď Q2",
  problem: "Problém z workshopu",
  cil: "Cíl z workshopu",
  obavy: ["Obava z workshopu"],
  navazne_potreby: ["Navazující z workshopu"],
  jmenovani_clenove: ["Jana Pokusná"],
  k_overeni: true,
  k_overeni_duvod: "Špatně čitelné",
};
const ORIG_UNREADABLE = {
  id: "S-7-2",
  clen: "Karel Zkouška",
  nazev: "Nečitelná situace",
  puvodni_q1: "[nečitelné]",
  puvodni_q2: "",
  problem: "",
  cil: "",
  obavy: [],
  navazne_potreby: [],
  jmenovani_clenove: [],
  k_overeni: true,
  k_overeni_duvod: "Nečitelný přepis",
};
const exportData = (): ExportData => ({
  members: [
    { memberId: U1, name: "Karel Zkouška (přejmenovaný)", company: "Firma Zkouška", obor: "Web", active: true, sourceName: "Karel Zkouška", competences: [{ kompetence: "web", zdroj: "karel" }] },
    { memberId: U2, name: "Jana Pokusná", company: null, obor: null, active: true, sourceName: null, competences: null },
    { memberId: U3, name: "Eva Test", company: "Test s.r.o.", obor: "Účetnictví", active: false, sourceName: "Eva Test", competences: [] },
    { memberId: U4, name: "Bez Situace", company: "X", obor: "Y", active: true, sourceName: null, competences: null },
  ],
  situations: [
    sit({
      memberId: U1,
      slot: 1,
      sourceId: "S-7-1",
      title: "Majitel firmy",
      description: "Problém z workshopu",
      original: ORIG_KAREL,
      items: [item("fear", "Obava z workshopu", { importedText: "Obava z workshopu" }), item("desire", "Cíl z workshopu", { importedText: "Cíl z workshopu" }), item("need", "Nová potřeba")],
    }),
    sit({ memberId: U1, slot: 2, sourceId: "S-7-2", original: ORIG_UNREADABLE }),
    sit({ memberId: U1, slot: 3 }),
    sit({
      memberId: U2,
      slot: 1,
      client: "Zubař",
      description: "Hledá recepci",
      touched: true,
      items: [item("trait", "B2B"), item("trait", "ČR"), item("need", "Recepční"), item("related", "Web")],
    }),
    sit({ memberId: U3, slot: 1, sourceId: "S-7-9", title: "Neaktivní situace", original: { id: "S-7-9", nazev: "Neaktivní situace", puvodni_q1: "Text Q1" } }),
  ],
});

// ── 6. buildSituaceJson ──
{
  const now = new Date("2026-11-23T12:00:00.000Z");
  const out = buildSituaceJson(exportData(), now);
  // členové: Jana, Karel (jméno ze zdroje), Eva (neaktivní se zdrojem), Bez Situace
  assert.deepEqual(out.clenove.map((c) => c.jmeno), ["Bez Situace", "Eva Test", "Jana Pokusná", "Karel Zkouška"]);
  const byId = new Map(out.situace.map((x) => [x.id as string, x]));
  const k1 = byId.get("S-7-1");
  assert.ok(k1, "id ze source_id zachované");
  assert.equal(k1.clen, "Karel Zkouška", "clen ze zdroje i po přejmenování člena");
  // všechny klíče, které build čte, se stejným typem
  for (const s of out.situace) {
    for (const key of ["id", "clen", "nazev", "puvodni_q1", "puvodni_q2", "k_overeni_duvod"]) assert.equal(typeof s[key], "string", key);
    assert.equal(typeof s.k_overeni, "boolean");
    assert.ok(Array.isArray(s.obavy) && Array.isArray(s.navazne_potreby) && Array.isArray(s.jmenovani_clenove));
    assert.equal(typeof s.cil, "string");
    assert.equal(typeof s.problem, "string");
    assert.equal(typeof s.z_workshopu, "boolean");
    assert.ok(Array.isArray(s.vlastnosti) && Array.isArray(s.potreby) && Array.isArray(s.touhy));
    assert.equal(typeof s.klient, "string");
  }
  for (const c of out.clenove) {
    assert.equal(typeof c.jmeno, "string");
    assert.equal(typeof c.firma, "string");
    assert.equal(typeof c.obor, "string");
    assert.equal(typeof c.vyplnil_formular, "boolean");
    assert.ok(Array.isArray(c.situace) && Array.isArray(c.kompetence));
  }
  assert.deepEqual(out.clenove.find((c) => c.jmeno === "Karel Zkouška")?.kompetence, [{ kompetence: "web", zdroj: "karel" }], "kompetence z importu");
  assert.equal(out.clenove.find((c) => c.jmeno === "Karel Zkouška")?.firma, "Firma Zkouška");
  assert.equal(out.clenove.find((c) => c.jmeno === "Jana Pokusná")?.firma, "", "null firma je prázdný řetězec");
  // nová situace: id S-N..., prázdná situace (slot 3 Karla) v exportu chybí
  const jana = out.situace.find((x) => x.clen === "Jana Pokusná");
  assert.ok(jana);
  assert.equal(jana.id, "S-Nbbbbbbbb-1");
  assert.equal(out.situace.filter((x) => x.clen === "Karel Zkouška").length, 2, "prázdný slot 3 chybí");
  assert.equal(jana.z_workshopu, false);
  assert.equal(jana.klient, "Zubař");
  assert.deepEqual(jana.vlastnosti, ["B2B", "ČR"]);
  assert.equal(jana.upraveno, "2026-11-23T08:00:00.000Z");
  assert.equal(k1.upraveno, null);
  assert.equal(k1.z_workshopu, true);
  // rovnost situace + prazdne = 3 x členové s formulářem
  const withForm = out.clenove.filter((c) => c.vyplnil_formular).length;
  assert.equal(out.situace.length + out.prazdne_situace, 3 * withForm);
  assert.equal(out.clenove.find((c) => c.jmeno === "Bez Situace")?.vyplnil_formular, false);
  // k_overeni vždy z original, i po úpravě
  assert.equal(k1.k_overeni, true);
  assert.equal(k1.k_overeni_duvod, "Špatně čitelné");
  assert.deepEqual(k1.jmenovani_clenove, ["Jana Pokusná"]);
  assert.equal(jana.k_overeni, false);
  assert.equal(jana.k_overeni_duvod, "");
  assert.deepEqual(jana.jmenovani_clenove, []);
  // nazev: title, pak client, pak popis, pak Bez názvu
  const mk = (over: Partial<ExportSituation>): string => {
    const d = exportData();
    d.situations = [sit({ memberId: U2, slot: 1, ...over })];
    return String(buildSituaceJson(d, now).situace[0].nazev);
  };
  assert.equal(mk({ title: "T", client: "C", description: "D" }), "T");
  assert.equal(mk({ client: "C", description: "D" }), "C");
  assert.equal(mk({ description: "D".repeat(60) }), "D".repeat(40));
  assert.equal(mk({ items: [item("need", "x")] }), "Bez názvu");
  // kolize id: S-N se zdrojem i mezi sebou
  const dup = exportData();
  dup.situations = [
    sit({ memberId: U2, slot: 1, sourceId: "S-Nbbbbbbbb-1", title: "A" }),
    sit({ memberId: U2, slot: 2, title: "B" }),
    sit({ memberId: U1, slot: 1, sourceId: "S-Nbbbbbbbb-2", title: "C" }),
  ];
  const ids = buildSituaceJson(dup, now).situace.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, "id jsou jedinečná");
  assert.ok(ids.includes("S-Nbbbbbbbb-2-2"), "kolize dostane příponu -2");
  assert.equal(out.export.verze, 2);
  assert.equal(out.export.vytvoreno, now.toISOString());
  ok("6. buildSituaceJson: klíče a typy z buildu, id a clen ze zdroje, S-N id, kolize, rovnost prazdne_situace, k_overeni z original, nazev, kompetence");
}

// ── 7. nečitelné situace a složený puvodni_q1 ──
{
  const now = new Date("2026-11-23T12:00:00.000Z");
  const unreadable = (s: Record<string, unknown>) => isUnreadableSituation({ nazev: s.nazev, puvodni_q1: s.puvodni_q1 });
  // kopie jednořádkové logiky z body_a.js:32 pro srovnání
  const bodyA = (s: { nazev: string; puvodni_q1: string }) => /nečitelná/i.test(s.nazev) || !String(s.puvodni_q1 || "").replace(/\[nečitelné\]|\s/g, "");
  const base = exportData();
  const out = buildSituaceJson(base, now);
  for (const s of out.situace) assert.equal(unreadable(s), bodyA({ nazev: String(s.nazev), puvodni_q1: String(s.puvodni_q1) }));
  // nevyplněná nečitelná zůstane nečitelná
  const still = out.situace.find((x) => x.id === "S-7-2");
  assert.ok(still);
  assert.equal(unreadable(still), true);
  assert.equal(still.puvodni_q1, "[nečitelné]", "puvodni_q1 z original");
  assert.equal(still.k_overeni, true);
  // doplněný popis nebo kartička: žádná situace není nečitelná, ani původně nečitelná
  for (const patch of [{ description: "Doplněný popis" }, { items: [item("need", "Jen potřeba")] }, { client: "Jen klient" }]) {
    const d = exportData();
    d.situations = d.situations.map((s) => (s.sourceId === "S-7-2" ? { ...s, ...patch } : s));
    const r = buildSituaceJson(d, now);
    const x = r.situace.find((y) => y.id === "S-7-2");
    assert.ok(x);
    assert.equal(unreadable(x), false, `doplněná nečitelná situace (${Object.keys(patch)[0]}) už není nečitelná`);
    assert.ok(String(x.puvodni_q1).length > 0);
    for (const y of r.situace) assert.equal(unreadable(y), false, "žádná situace v datech není nečitelná");
  }
  // název z original pro nevyplněnou nečitelnou zůstane
  assert.equal(still.nazev, "Nečitelná situace");
  // nová situace jen s lístečkem má neprázdný puvodni_q1
  const d2 = exportData();
  d2.situations = [sit({ memberId: U2, slot: 1, items: [item("trait", "B2B")] })];
  const only = buildSituaceJson(d2, now).situace[0];
  assert.equal(only.puvodni_q1, "Vlastnosti: B2B.");
  assert.equal(unreadable(only), false);
  // složený text: popis, vlastnosti, potřeby, obavy, touhy; q2 ze souvisejících
  const d3 = exportData();
  d3.situations = [
    sit({
      memberId: U2,
      slot: 1,
      description: "Hledá recepci.",
      items: [item("trait", "B2B"), item("trait", "ČR"), item("need", "Recepční"), item("fear", "Cena"), item("desire", "Klid"), item("related", "Web"), item("related", "Logo")],
    }),
  ];
  const c = buildSituaceJson(d3, now).situace[0];
  assert.equal(c.puvodni_q1, "Popis: Hledá recepci. Vlastnosti: B2B, ČR. Potřeby: Recepční. Obavy: Cena. Touhy: Klid.");
  assert.equal(c.puvodni_q2, "Web; Logo");
  // čitelný original zůstane beze změny i po úpravě
  const d4 = exportData();
  d4.situations = d4.situations.map((s) => (s.sourceId === "S-7-1" ? { ...s, description: "Přepsáno", touched: true } : s));
  const keep = buildSituaceJson(d4, now).situace.find((y) => y.id === "S-7-1");
  assert.ok(keep);
  assert.equal(keep.puvodni_q1, "Původní odpověď Q1");
  assert.equal(keep.puvodni_q2, "Původní odpověď Q2");
  assert.equal(keep.problem, "Přepsáno");
  ok("7. unreadable(): doplněná situace není nečitelná, nevyplněná zůstane, nová situace jen s lístečkem má puvodni_q1");
}

// ── 8. buildCsv ──
{
  const csv = buildCsv(exportData());
  assert.ok(csv.startsWith("﻿"), "BOM");
  assert.ok(csv.endsWith("\r\n"));
  const lines = csv.slice(1).split("\r\n");
  assert.equal(lines[0], CSV_HEADER.map((h) => `"${h}"`).join(";"), "hlavička s ; a uvozovkami");
  assert.ok(!csv.includes("Neaktivní situace"), "neaktivní člen není v CSV (jen to, co je na /situace)");
  assert.ok(lines.some((l) => l.includes('"Popis situace"')), "řádek Popis situace");
  // Karel: popis + fear + desire + need, Jana: popis + 2 trait + need + related
  const jana = lines.filter((l) => l.startsWith('"Jana Pokusná"'));
  assert.equal(jana.length, 1 + 2 + 1 + 1);
  const traits = jana.filter((l) => l.includes('"Vlastnost klienta"'));
  assert.deepEqual(traits.map((l) => l.split(";")[6]), ['"1"', '"2"'], "Pořadí podle created_at");
  assert.ok(jana[0].includes('"upraveno"') || jana[0].includes('"ne"'));
  // pořadí podle created_at i při opačném pořadí na vstupu
  const d = exportData();
  const jsit = d.situations.find((s) => s.memberId === U2);
  assert.ok(jsit);
  jsit.items = [...jsit.items].reverse();
  const reordered = buildCsv(d).slice(1).split("\r\n").filter((l) => l.startsWith('"Jana Pokusná"') && l.includes('"Vlastnost klienta"'));
  assert.deepEqual(reordered.map((l) => l.split(";")[7]), ['"B2B"', '"ČR"']);
  // z workshopu: ano / upraveno / ne
  const karelLines = lines.filter((l) => l.startsWith('"Karel Zkouška"'));
  assert.ok(karelLines.some((l) => l.includes('"Obava"') && l.includes('"ano"')));
  assert.ok(karelLines.some((l) => l.includes('"Potřeba"') && l.includes('"ne"')));
  // buňky
  assert.equal(csvCell('a "b"'), '"a ""b"""');
  assert.equal(csvCell("řádek\nřádek"), '"řádek\nřádek"');
  for (const v of ["=1+1", "+1", "-1", "@SUM(A1)", " =1+1", "\t=1", "\r=1"]) assert.ok(csvCell(v).startsWith(`"'`), `předpona ' u ${JSON.stringify(v)}`);
  assert.equal(csvCell("běžný text"), '"běžný text"');
  assert.equal(csvCell("a=b"), '"a=b"');
  assert.equal(csvFilename(new Date("2026-11-23T12:00:00Z")), "klientske-situace-2026-11-23.csv");
  // text s novým řádkem a uvozovkou prochází celým CSV
  const d5 = exportData();
  d5.situations = [sit({ memberId: U2, slot: 1, client: "Klient", items: [item("need", '=HYPERLINK("x")\nDruhý řádek')] })];
  const out5 = buildCsv(d5);
  assert.ok(out5.includes(`"'=HYPERLINK(""x"")\nDruhý řádek"`));
  ok("8. buildCsv: BOM, ;, \\r\\n, uvozovky, předpona ' u vzorců, Popis situace, Pořadí podle created_at, jen aktivní členové");
}

// ── 12. statika: export route ──
{
  const json = code("app/api/situace/export/json/route.ts");
  assert.ok(json.includes('requirePermissionForRoute("situations.manage"'), "JSON za situations.manage");
  assert.ok(json.includes("splitStatus: true"), "401 bez session, 403 bez práva");
  assert.ok(json.includes("serializeForHtml("));
  assert.ok(json.includes("no-store"));
  const csv = code("app/api/situace/export/csv/route.ts");
  assert.ok(csv.includes("await requireAuth()"), "CSV hlídá jen přihlášení");
  assert.ok(!csv.includes("requirePermissionForRoute") && !csv.includes("situations.manage"), "CSV nevyžaduje situations.manage");
  assert.ok(csv.includes("status: 401"));
  assert.ok(csv.includes("no-store"));
  const overview = read("components/situations/SituationsOverview.tsx");
  assert.ok(overview.includes('href="/api/situace/export/csv"') && overview.includes("UI_TEXTS.downloadCsv"));
  assert.ok(overview.includes('href="/api/situace/export/json"'));
  assert.ok(overview.indexOf("downloadCsv") < overview.indexOf("{canManage && ("), "CSV odkaz je pro všechny, mimo blok Pro vedení");
  assert.ok(overview.indexOf("downloadJson") > overview.indexOf("{canManage && ("), "JSON odkaz jen v bloku Pro vedení");
  assert.equal(UI_TEXTS.downloadCsv, "Stáhnout tabulku (CSV)");
  ok("12. JSON route volá requirePermissionForRoute(situations.manage), CSV route jen requireAuth (401), odkazy v přehledu");
}

// ── 16. serializeForHtml ──
{
  const text = "<!-- <script> alert(1) </script> --> a\u2028b\u2029c";
  const out = serializeForHtml({ situace: [{ puvodni_q1: text }] });
  assert.ok(!out.includes("<"), "žádné < ve výstupu");
  assert.ok(!out.includes("\u2028") && !out.includes("\u2029"), "U+2028 a U+2029 escapované");
  assert.ok(out.includes("\\u003c") && out.includes("\\u2028") && out.includes("\\u2029"));
  assert.equal(JSON.parse(out).situace[0].puvodni_q1, text, "JSON.parse vrátí původní text");
  const full = serializeForHtml(buildSituaceJson(exportData(), new Date("2026-11-23T12:00:00Z")));
  assert.ok(!full.includes("<"));
  ok("16. serializeForHtml: bez <, U+2028 a U+2029 escapované, JSON.parse vrátí původní text");
}

// ── 17. findMissingRefs ──
{
  const exp = buildSituaceJson(exportData(), new Date("2026-11-23T12:00:00Z"));
  const vztahy = {
    vazby: [{ id: "V1", od: "S-7-1", do: "S-Nbbbbbbbb-1", typ: "A" }],
    predavky: [{ id: "P1", situace: "S-7-1", od_clena: "Karel Zkouška", clen_ktery_pokryje: "Jana Pokusná", potreba: "x" }],
    shluky: [{ id: "K1", situace: ["S-7-1", "S-7-2"] }],
  };
  const pozice = {
    pozice: [{ id: "PZ1", potreby: [{ situace: "S-7-1" }, { situace: "S-7-9" }] }],
    bez_pozice: [{ situace: "S-Nbbbbbbbb-1", potreba: "y" }],
  };
  const full = findMissingRefs(exp, vztahy, pozice);
  assert.deepEqual(full, { situationIds: [], memberNames: [] }, "úplný export nic nehlásí");

  // export bez jedné situace ji nahlásí
  const cut = { ...exp, situace: exp.situace.filter((s) => s.id !== "S-7-2") };
  assert.deepEqual(findMissingRefs(cut, vztahy, pozice).situationIds, ["S-7-2"]);
  // každé z míst odkazu
  const probes: Array<[string, unknown, unknown]> = [
    ["vazby.od", { vazby: [{ od: "X-1", do: "S-7-1" }] }, {}],
    ["vazby.do", { vazby: [{ od: "S-7-1", do: "X-1" }] }, {}],
    ["predavky.situace", { predavky: [{ situace: "X-1" }] }, {}],
    ["shluky.situace", { shluky: [{ situace: ["S-7-1", "X-1"] }] }, {}],
    ["pozice.potreby.situace", {}, { pozice: [{ potreby: [{ situace: "X-1" }] }] }],
    ["bez_pozice.situace", {}, { bez_pozice: [{ situace: "X-1" }] }],
  ];
  for (const [where, v, p] of probes) {
    assert.deepEqual(findMissingRefs(exp, v, p).situationIds, ["X-1"], where);
  }
  // chybějící jméno
  const names = findMissingRefs(exp, { predavky: [{ od_clena: "Karel Zkouška", clen_ktery_pokryje: "Petr Neexistující" }, { od_clena: "Smyšlený Host" }] }, {});
  assert.deepEqual(names.memberNames, ["Petr Neexistující", "Smyšlený Host"]);
  // odolnost proti špatnému tvaru
  assert.deepEqual(findMissingRefs(null, null, null), { situationIds: [], memberNames: [] });
  assert.deepEqual(findMissingRefs({}, { vazby: "x", predavky: [null, 5] }, []), { situationIds: [], memberNames: [] });
  // skript: mimo repo, nic nezapisuje
  const script = code("scripts/check-iter-049-export.ts");
  assert.ok(script.includes("assertOutsideRepo"));
  assert.ok(!/writeFile|appendFile|createWriteStream|\.env|DATABASE_URL/.test(script), "skript nic nezapisuje a nesahá na DB");
  ok("17. findMissingRefs: chybějící id ve všech místech, chybějící jméno, úplný export prázdný; skript mimo repo bez zápisu");
}

test27()
  .then(() => console.log(`\n${n}/${n} testů prošlo`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
