/**
 * Testy iter-041 C4 (PALMS, arch T-001 sekce 13 testy 34 až 40, gate K7, K8, Z2, Z3).
 * Bez DATABASE_URL a bez sítě. Fixtures se generují tady
 * (`scripts/fixtures-iter-041-palms/synthetic-export.ts`), jména jsou smyšlená.
 *
 * Část A (čisté funkce a statika) běží vždy. Část B (SQL scénáře) běží nad
 * PGlite in-process s falešným hostem; modul se hledá v `PGLITE_MODULE_DIR`
 * (adresář s `node_modules/@electric-sql/pglite`) nebo v cwd. Bez něj se část B
 * přeskočí s hlasitou hláškou, `REQUIRE_PGLITE=1` z toho udělá chybu.
 *
 * Spuštění: npm run test:iter-041-palms (součást test:iter-041)
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import { pragueInstant } from "../lib/attendance/rules";
import { bonusEventsSql } from "../lib/db/queries/semafor";
import { computeBonus } from "../lib/semafor/bonus";
import {
  PalmsError,
  HELP_TEXT,
  SQL_ANALYSIS,
  SQL_PREFIX,
  SQL_STATS_COLUMNS,
  assertApplyAllowed,
  assertExpectHostGiven,
  hostMatchesExpect,
  assertOutsideRepo,
  buildBackfillSql,
  buildPlan,
  decodeFileBytes,
  formatReport,
  hostOfUrl,
  mapCode,
  matchRows,
  parseAliasFile,
  parseArgs,
  parseCounts,
  parsePalmsFile,
  parsePalmsXml,
  planToJson,
  resolveWeekDates,
} from "../lib/attendance/palms";
import { runBackfill, type QueryFn } from "./backfill-iter-041-palms";
import {
  buildSyntheticExport,
  demoSpec,
  weekLabels,
  type SyntheticRow,
  type SyntheticSpec,
} from "./fixtures-iter-041-palms/synthetic-export";

const ROOT = path.join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);
const NAMES = ["Jan Testovací", "Eva Vzorová", "Petr Fiktivní", "Marie Zkušební", "Nikdo Neznámý"];

let n = 0;
const ok = (m: string) => console.log(`ok ${++n}. ${m}`);
const enc = (s: string) => new TextEncoder().encode(s);
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

function throwsPalms(fn: () => unknown, label: string) {
  assert.throws(fn, (e: unknown) => e instanceof PalmsError, label);
}

// ── Společný soubor pro scénáře ──────────────────────────────

const SEP_WEEKS = ["zář 10", "zář 17", "zář 24", "říj 01", "říj 08", "říj 15"];
const SEP_DATES = ["2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15"];

function row(name: string, codes: string[]): SyntheticRow {
  const [first, last] = name.split(" ");
  return { first, last, codes };
}

function baseSpec(overrides: Partial<SyntheticSpec> = {}): SyntheticSpec {
  return {
    from: "2026-09-10T00:00:00.000",
    to: "2026-10-15T00:00:00.000",
    weeks: SEP_WEEKS,
    rows: [
      row("Jan Testovací", ["P", "L", "S", "A", "M", ""]),
      row("Eva Vzorová", ["P", "A", "A", "P", "X", "A"]),
      row("Petr Fiktivní", ["P", "P", "P", "P", "P", "P"]),
      row("Marie Zkušební", ["p", " a ", "l", "s", "", "m"]),
      row("Nikdo Neznámý", ["P", "P", "P", "P", "P", "P"]),
    ],
    ...overrides,
  };
}

const fileOf = (spec: SyntheticSpec) => enc(buildSyntheticExport(spec));

// ═════════════════════════════════════════════════════════════
// Část A: čisté funkce a statika
// ═════════════════════════════════════════════════════════════

function partA() {
  // 34. parser
  {
    const sheet = parsePalmsXml(buildSyntheticExport(baseSpec()));
    assert.equal(sheet.weeks.length, 6);
    assert.deepEqual(
      sheet.weeks.map((w) => w.date),
      SEP_DATES
    );
    assert.equal(sheet.from, "2026-09-10");
    assert.equal(sheet.to, "2026-10-15");
    assert.equal(sheet.rows.length, 5);
    assert.equal(sheet.rows[0].name, "Jan Testovací");
    assert.deepEqual(sheet.rows[0].codes, ["P", "L", "S", "A", "M", ""]);
    assert.deepEqual(sheet.rows[3].codes, ["P", "A", "L", "S", "", "M"], "malá písmena a mezery");
    assert.equal(sheet.nonThursdayWeeks, 0);
    // čísla řádků odpovídají listu: Chapter, From, To, prázdný, hlavička, data od 6
    assert.deepEqual(
      sheet.rows.map((r) => r.rowNo),
      [6, 7, 8, 9, 10]
    );
    ok("34a. parser: ss:Index, ss:MergeAcross, prázdné sloupce hlavičky, kódy a čísla řádků");

    for (const width of [1, 2, 3]) {
      const s = parsePalmsXml(buildSyntheticExport(baseSpec({ weekWidth: width })));
      assert.deepEqual(
        s.weeks.map((w) => w.date),
        SEP_DATES,
        `šířka týdne ${width}`
      );
      assert.deepEqual(s.rows[1].codes, ["P", "A", "A", "P", "X", "A"]);
    }
    const sb = parsePalmsXml(buildSyntheticExport(baseSpec({ layout: "b" })));
    assert.equal(sb.from, "2026-09-10");
    assert.equal(sb.to, "2026-10-15");
    ok("34b. From a To v jiných sloupcích (varianta b) a různé šířky sloučených buněk");

    const bom = parsePalmsXml(buildSyntheticExport(baseSpec({ bom: true })));
    assert.equal(bom.rows.length, 5);
    const xml = buildSyntheticExport(baseSpec());
    const u16le = Buffer.from("﻿" + xml, "utf16le");
    assert.equal(parsePalmsFile(u16le).rows.length, 5, "UTF-16 LE s BOM");
    const u16be = Buffer.from(u16le);
    u16be.swap16();
    assert.equal(decodeFileBytes(u16be).includes("Workbook"), true, "UTF-16 BE s BOM");
    const u16bare = Buffer.from(xml, "utf16le");
    assert.equal(parsePalmsFile(u16bare).rows.length, 5, "UTF-16 LE bez BOM");
    assert.equal(parsePalmsFile(Buffer.from("﻿" + xml, "utf8")).rows.length, 5, "UTF-8 s BOM");
    throwsPalms(() => decodeFileBytes(new Uint8Array([0xff, 0x41, 0xc3, 0x28])), "neplatné UTF-8");
    ok("34c. BOM UTF-8, UTF-16 LE/BE s BOM i bez něj");

    const base = buildSyntheticExport(baseSpec());
    throwsPalms(() => parsePalmsXml(base.replace("<Workbook", '<!DOCTYPE x [<!ENTITY a "b">]><Workbook')), "DOCTYPE");
    throwsPalms(() => parsePalmsXml(base.replace('ss:Name="Report"', 'ss:Name="Jiný"')), "jiný list");
    throwsPalms(() => parsePalmsXml(base.replace("urn:schemas-microsoft-com:office:spreadsheet", "x").replace(/xmlns:ss="[^"]*"/, 'xmlns:ss="x"')), "jiný jmenný prostor");
    throwsPalms(() => parsePalmsXml(base.replace(">From:<", ">Odkdy:<")), "chybí From");
    throwsPalms(() => parsePalmsXml(base.replace(">First Name<", ">Jméno<")), "chybí hlavička");
    throwsPalms(() => parsePalmsXml(base.replace("<Table>", "<Table><Row>")), "rozbité XML");
    throwsPalms(() => parsePalmsXml(base.replace('ss:Index="4"', 'ss:Index="0"')), "index 0");
    throwsPalms(() => parsePalmsFile(new Uint8Array(5 * 1024 * 1024 + 1)), "nad 5 MB");
    // sheet name bez ohledu na velikost písmen a mezery
    assert.equal(parsePalmsXml(buildSyntheticExport(baseSpec({ sheetName: " REPORT " }))).rows.length, 5);
    ok("34d. odmítnutí: DOCTYPE, jiný list, jiný formát, chybějící From a hlavička, rozbité XML, 5 MB");

    // data From a To
    for (const [raw, iso] of [
      ["2026-09-10", "2026-09-10"],
      ["2026-09-10T00:00:00", "2026-09-10"],
      ["2026-09-10T00:00:00.000", "2026-09-10"],
      ["10.9.2026", "2026-09-10"],
      ["10. 09. 2026", "2026-09-10"],
    ] as const) {
      const s = parsePalmsXml(buildSyntheticExport(baseSpec({ from: raw })));
      assert.equal(s.from, iso, raw);
    }
    throwsPalms(() => parsePalmsXml(buildSyntheticExport(baseSpec({ from: "9/10/2026" }))), "M/D/YYYY se nehádá");
    throwsPalms(() => parsePalmsXml(buildSyntheticExport(baseSpec({ from: "2026-02-30" }))), "neexistující datum");
    ok("34e. From a To: ISO, DateTime, D.M.YYYY; jiný tvar je chyba");
  }

  // 35. rok týdnů
  {
    const s1 = parsePalmsXml(
      buildSyntheticExport({
        from: "2026-04-23T00:00:00.000",
        to: "2026-10-15T00:00:00.000",
        weeks: weekLabels("2026-04-23", 26),
        rows: [row("Jan Testovací", Array(26).fill("P"))],
      })
    );
    assert.equal(s1.weeks.length, 26);
    assert.equal(s1.weeks[0].date, "2026-04-23");
    assert.equal(s1.weeks[25].date, "2026-10-15");
    assert.equal(s1.nonThursdayWeeks, 0);

    const labels2 = [
      { col: 4, label: "lis 06" },
      { col: 6, label: "pro 25" },
      { col: 8, label: "led 01" },
      { col: 10, label: "úno 26" },
    ];
    const s2 = parsePalmsXml(
      buildSyntheticExport({
        from: "2025-11-06T00:00:00.000",
        to: "2026-02-26T00:00:00.000",
        weeks: labels2.map((l) => l.label),
        rows: [row("Jan Testovací", ["P", "P", "P", "P"])],
      })
    );
    assert.deepEqual(
      s2.weeks.map((w) => w.date),
      ["2025-11-06", "2025-12-25", "2026-01-01", "2026-02-26"],
      "přes Nový rok"
    );
    assert.equal(s2.nonThursdayWeeks, 0, "2025-11-06, 2025-12-25, 2026-01-01 a 2026-02-26 jsou čtvrtky");
    ok("35a. rok týdnů: jedno období, přechod přes Nový rok");

    const mk = (labels: string[], from: string, to: string | null) =>
      resolveWeekDates(
        labels.map((l, i) => {
          const [a, b] = l.split(" ");
          const month = ({ led: 1, úno: 2, bře: 3, dub: 4, říj: 10, lis: 11, pro: 12, čer: 6, čvn: 6 } as Record<string, number>)[a];
          return { col: 4 + i, month, day: Number(b) };
        }),
        from,
        to
      );
    throwsPalms(() => mk(["pro 31"], "2026-01-01", "2026-06-30"), "týden mimo rozsah");
    throwsPalms(() => mk(["dub 23", "dub 16"], "2026-04-01", "2026-06-30"), "neseřazené");
    throwsPalms(() => mk(["dub 23", "dub 23"], "2026-04-01", "2026-06-30"), "dvakrát stejný týden");
    throwsPalms(() => mk(["dub 23"], "2025-04-23", "2026-04-23"), "dva kandidáti");
    throwsPalms(() => mk(["dub 23"], "2026-06-30", "2026-04-01"), "To před From");
    assert.deepEqual(
      mk(["lis 06", "pro 25", "led 01"], "2025-11-06", null).map((w) => w.date),
      ["2025-11-06", "2025-12-25", "2026-01-01"],
      "bez To se rok dopočte dopředu"
    );
    ok("35b. rok týdnů: mimo rozsah, neseřazené, duplicita, dvojznačnost, bez To");

    const cervenec = (label: string) =>
      parsePalmsXml(
        buildSyntheticExport({ from: "2026-06-01T00:00:00.000", to: "2026-07-31T00:00:00.000", weeks: [label], rows: [row("Jan Testovací", ["P"])] })
      ).weeks[0].date;
    assert.equal(cervenec("čer 04"), "2026-06-04");
    assert.equal(cervenec("čvn 04"), "2026-06-04");
    assert.equal(cervenec("čec 09"), "2026-07-09");
    assert.equal(cervenec("čvc 09"), "2026-07-09");
    assert.equal(cervenec("čer. 11"), "2026-06-11", "volitelná tečka");
    throwsPalms(() => cervenec("xyz 04"), "neznámá zkratka");
    // nečtvrtek je jen varování
    const nt = parsePalmsXml(
      buildSyntheticExport({ from: "2026-06-01T00:00:00.000", to: "2026-07-31T00:00:00.000", weeks: ["čer 04", "čer 11", "čer 12"], rows: [row("Jan Testovací", ["P", "P", "P"])] })
    );
    assert.equal(nt.nonThursdayWeeks, 1);
    ok("35c. čer i čvn, čec i čvc, tečka, neznámá zkratka je chyba, nečtvrtek je varování");
  }

  // 36. kódy
  {
    assert.deepEqual(mapCode("P"), { kind: "write", status: "present", sub: null, excused: false });
    assert.deepEqual(mapCode("L"), { kind: "write", status: "present", sub: null, excused: false });
    assert.deepEqual(mapCode("S"), { kind: "write", status: "substitute", sub: "neuvedeno", excused: false }, "K7");
    assert.deepEqual(mapCode("A"), { kind: "write", status: "absent", sub: null, excused: true });
    assert.deepEqual(mapCode("M"), { kind: "medical" }, "K8");
    assert.deepEqual(mapCode(""), { kind: "empty" });
    assert.deepEqual(mapCode("  "), { kind: "empty" });
    assert.deepEqual(mapCode(" a "), mapCode("A"));
    assert.deepEqual(mapCode("p"), mapCode("P"));
    assert.deepEqual(mapCode("X"), { kind: "unknown", code: "X" });
    assert.deepEqual(mapCode("U"), { kind: "unknown", code: "U" }, "unexcused se z PALMS nezapisuje");
    ok("36a. kódy: P a L přítomen, S náhradník 'neuvedeno' (K7), A omluva, M nic (K8), prázdné nic, neznámý");

    const sheet = parsePalmsXml(buildSyntheticExport(baseSpec()));
    const members = [
      { id: "11111111-1111-1111-1111-111111111111", name: "Jan Testovací", active: true },
      { id: "22222222-2222-2222-2222-222222222222", name: "Eva Vzorová", active: true },
      { id: "33333333-3333-3333-3333-333333333333", name: "Petr Fiktivní", active: true },
      { id: "44444444-4444-4444-4444-444444444444", name: "Marie Zkušební", active: false },
    ];
    const matching = matchRows(sheet, members, new Map());
    const plan = buildPlan(sheet, matching);
    const s = plan.stats;
    assert.deepEqual(s.codeCounts, { P: 10, L: 2, S: 2, A: 5 });
    assert.equal(s.medicalSkipped, 2);
    assert.deepEqual(s.unknown, { X: 1 });
    assert.equal(s.emptyCells, 2);
    assert.equal(s.matchedRows, 4);
    assert.equal(plan.rows.length, 19);
    assert.equal(plan.rows.filter((r) => r.excused).length, 5);
    assert.equal(plan.rows.filter((r) => r.status === "substitute" && r.sub === "neuvedeno").length, 2);
    assert.equal(plan.rows.every((r) => r.status !== "absent" || r.sub === null), true);
    assert.equal(plan.rows.some((r) => r.memberId === undefined), false);
    ok("36b. plán: počty P, L, S, A, M, prázdných a neznámých kódů, 19 řádků k zápisu");
  }

  // 37. plán, nespárované řádky, výpis bez jmen
  {
    const sheet = parsePalmsXml(buildSyntheticExport(baseSpec()));
    const members = [
      { id: "11111111-1111-1111-1111-111111111111", name: "Jan Testovací", active: true },
      { id: "22222222-2222-2222-2222-222222222222", name: "Eva Vzorová", active: true },
    ];
    const matching = matchRows(sheet, members, new Map());
    assert.deepEqual(matching.unmatchedRowNos, [8, 9, 10]);
    const plan = buildPlan(sheet, matching);
    assert.equal(plan.rows.some((r) => r.rowNo === 10), false, "nespárovaný řádek se nezapíše");
    const counts = parseCounts({
      app_start: "2026-10-22",
      total_rows: 12,
      eligible: 12,
      skip_no_member: 0,
      skip_after_start: 0,
      skip_deactivated: 0,
      new_records: 12,
      same_records: 0,
      conflicts: 1,
      conflict_rows: [["2026-09-17", 7]],
      new_absences: 4,
      days_to_close: 6,
      before_joined: 0,
      limit_now: 2,
      limit_after: 5,
      gaining: 3,
    });
    const text = formatReport(plan.stats, counts, false).join("\n");
    for (const name of NAMES) assert.equal(text.includes(name), false, "výpis nesmí obsahovat jméno");
    for (const part of ["Testovací", "Vzorová", "Fiktivní", "Zkušební", "Nikdo"]) assert.equal(text.includes(part), false);
    assert.match(text, /Nespárováno 3 \(řádky 8, 9, 10\)/);
    assert.match(text, /Konflikty \(nepřepsáno\): 2026-09-17 řádek 7/);
    assert.match(text, /Členů se 3 a více absencemi za 6 měsíců: dnes 2, po doplnění 5\./, "Z3");
    assert.match(text, /Členů, kterým doplnění přidá absenci: 3\./, "Z3");
    assert.match(text, /v době deaktivace přeskočeno: 0/, "Z2");
    assert.match(text, /M přeskočeno 1/, "K8");
    assert.match(text, /Neznámý kód X: 1\./);
    assert.match(text, /Režim: dry-run, nic se nezapsalo\./);
    assert.equal(text.includes(EM_DASH), false);
    ok("37a. nespárovaný řádek se nezapíše a vypíše se bez jména; výpis obsahuje Z2, Z3, K8");

    // párování: bez diakritiky, prohozeně, jmenovci, duplicity, alias
    const m2 = [
      { id: "11111111-1111-1111-1111-111111111111", name: "Jan Testovací", active: true },
      { id: "55555555-5555-5555-5555-555555555555", name: "Eva Dvojí", active: true },
      { id: "66666666-6666-6666-6666-666666666666", name: "Eva Dvoji", active: true },
    ];
    const mk = (names: string[]) =>
      parsePalmsXml(
        buildSyntheticExport({
          from: "2026-09-10T00:00:00.000",
          to: "2026-09-17T00:00:00.000",
          weeks: ["zář 10"],
          rows: names.map((nm) => row(nm, ["P"])),
        })
      );
    const m3 = [m2[0], { id: "22222222-2222-2222-2222-222222222222", name: "Eva Vzorová", active: true }];
    const m = matchRows(mk(["Jan Testovaci", "Vzorová Eva"]), m3, new Map());
    assert.equal(m.byKind.loose, 1, "bez diakritiky se přijme");
    assert.equal(m.byKind.swapped, 1, "prohozené pořadí se přijme");
    const dup = matchRows(mk(["Eva Dvojí"]), m2, new Map());
    assert.deepEqual(dup.unmatchedRowNos.length, 0, "přesná shoda má přednost před bez diakritiky");
    const amb = matchRows(mk(["Eva Dvoji "]), [m2[1], m2[2]].map((x) => ({ ...x, name: "Eva Dvojí" })), new Map());
    assert.equal(amb.unmatchedRowNos.length, 1, "dva jmenovci jsou nespárováni");
    throwsPalms(
      () => matchRows(mk(["Jan Testovací", "Janek Jiný"]), m2.slice(0, 1), new Map(), new Map([[7, m2[0].id]])),
      "dva řádky na stejného člena"
    );
    throwsPalms(() => matchRows(mk(["Jan Testovací"]), m2.slice(0, 1), new Map(), new Map([[99, m2[0].id]])), "alias na neexistující řádek");
    const viaFile = matchRows(mk(["Cizí Jméno"]), m2.slice(0, 1), new Map(), new Map([[6, m2[0].id]]));
    assert.equal(viaFile.byKind.file, 1);
    const unknownFile = matchRows(mk(["Cizí Jméno"]), m2.slice(0, 1), new Map(), new Map([[6, "99999999-9999-9999-9999-999999999999"]]));
    assert.equal(unknownFile.unmatchedRowNos.length, 1, "alias na neznámého člena je nespárováno");
    assert.deepEqual([...parseAliasFile('{"řádek 14": "AAAAAAAA-1111-2222-3333-444444444444"}')], [[14, "aaaaaaaa-1111-2222-3333-444444444444"]]);
    throwsPalms(() => parseAliasFile("[]"), "pole");
    throwsPalms(() => parseAliasFile('{"x": "11111111-1111-1111-1111-111111111111"}'), "klíč");
    throwsPalms(() => parseAliasFile('{"řádek 1": "ne-uuid"}'), "hodnota");
    throwsPalms(() => parseAliasFile("{"), "JSON");
    ok("37b. párování: bez diakritiky, prohozeně, jmenovci, alias ze souboru, chyby souboru aliasů");
  }

  // 38. cesta a --apply
  {
    const repo = "/work/repo";
    throwsPalms(() => assertOutsideRepo("/work/repo/export.xls", [repo]), "uvnitř repa");
    throwsPalms(() => assertOutsideRepo("/work/repo/sub/../export.xls", [repo]), "uvnitř repa přes ..");
    throwsPalms(() => assertOutsideRepo(path.join("sub", "export.xls"), [process.cwd()]), "relativní cesta v cwd");
    throwsPalms(() => assertOutsideRepo("/work/repo", [repo]), "samotný kořen");
    assert.equal(assertOutsideRepo("/work/repo-jiny/export.xls", [repo]), "/work/repo-jiny/export.xls", "sourozenec se stejnou předponou je mimo");
    assert.equal(assertOutsideRepo("/tmp/export.xls", [repo]), "/tmp/export.xls");
    throwsPalms(() => assertApplyAllowed(true, undefined, null), "--apply bez EXPECT_DB_HOST");
    throwsPalms(() => assertApplyAllowed(true, "", "ep-abc.neon.tech"), "prázdné EXPECT_DB_HOST");
    throwsPalms(() => assertApplyAllowed(true, "ab", "ep-abc.neon.tech"), "příliš krátké");
    throwsPalms(() => assertApplyAllowed(true, "ep-xyz", "ep-abc.neon.tech"), "jiný host");
    // L-4: shoda celého hostu nebo jeho prvního labelu, ne podřetězec; neznámý host = konec
    assertApplyAllowed(true, "ep-abc.neon.tech", "ep-abc.neon.tech");
    assertApplyAllowed(true, "EP-ABC.neon.tech", "ep-abc.neon.tech:5432");
    assertApplyAllowed(true, "ep-abc-123456", "ep-abc-123456.eu-central-1.aws.neon.tech");
    assertApplyAllowed(true, "ep-raspy-sound-a1b2c3d4", "ep-raspy-sound-a1b2c3d4-pooler.eu-central-1.aws.neon.tech");
    assertApplyAllowed(true, "ep-raspy-sound-a1b2c3d4-pooler", "ep-raspy-sound-a1b2c3d4-pooler.eu-central-1.aws.neon.tech");
    throwsPalms(() => assertApplyAllowed(true, "ep-abc", null), "apply bez zjištěného hostu končí");
    throwsPalms(() => assertApplyAllowed(true, "ep-abc-123456", null), "apply bez zjištěného hostu končí i s platným EXPECT");
    assertApplyAllowed(true, "ep-abc", "ep-abc.neon.tech");
    throwsPalms(() => assertApplyAllowed(true, "ep-ab", "ep-abc.neon.tech"), "příliš krátké a navíc předpona labelu");
    throwsPalms(() => assertApplyAllowed(true, "neon.tech", "ep-abc.neon.tech"), "neon.tech je podřetězec, ne host");
    throwsPalms(() => assertApplyAllowed(true, "raspy-sound", "ep-raspy-sound-a1b2c3d4.eu-central-1.aws.neon.tech"), "podřetězec labelu");
    throwsPalms(() => assertApplyAllowed(true, "ep-raspy-sound", "ep-raspy-sound-a1b2c3d4.eu-central-1.aws.neon.tech"), "předpona labelu");
    throwsPalms(() => assertApplyAllowed(true, "ep-abc-123456", "xep-abc-123456.neon.tech"), "jiný label");
    throwsPalms(() => assertApplyAllowed(false, "neon.tech", "ep-abc.neon.tech"), "dry-run se zadaným EXPECT hlídá stejně");
    assertApplyAllowed(false, undefined, null);
    assert.equal(hostMatchesExpect("a.b.c", "a"), true);
    assert.equal(hostMatchesExpect("a.b.c", ""), false);
    throwsPalms(() => assertExpectHostGiven(true, undefined), "předběžná kontrola bez EXPECT");
    throwsPalms(() => assertExpectHostGiven(true, "ep-ab"), "předběžná kontrola, 6 znaků je minimum");
    assertExpectHostGiven(true, "ep-abcd");
    assertExpectHostGiven(false, undefined);
    assertApplyAllowed(false, undefined, "ep-abc.neon.tech");
    // L-5: /mnt/d nerozlišuje velikost písmen
    throwsPalms(() => assertOutsideRepo("/MNT/D/Tne_New/Repo/export.xls", ["/mnt/d/tne_new/repo"]), "jiná velikost písmen je pořád uvnitř repa");
    throwsPalms(() => assertOutsideRepo("/mnt/d/tne_new/repo/export.xls", ["/mnt/D/TNE_NEW/Repo"]), "a naopak");
    assert.equal(assertOutsideRepo("/mnt/d/TNE_NEW/Repo-jiny/export.xls", ["/mnt/d/tne_new/repo"]), "/mnt/d/TNE_NEW/Repo-jiny/export.xls", "sourozenec je mimo");
    throwsPalms(() => assertApplyAllowed(false, "ep-xyz", "ep-abc.neon.tech"), "dry-run s nesedícím EXPECT");
    assert.equal(hostOfUrl("postgres://user:tajne@ep-abc.neon.tech/db?sslmode=require"), "ep-abc.neon.tech", "host bez hesla");
    assert.equal(hostOfUrl("nesmysl"), null);
    const a = parseArgs(["/tmp/x.xls"]);
    assert.deepEqual(a, { help: false, path: "/tmp/x.xls", apply: false, aliasFile: null, showNames: false }, "výchozí je dry-run");
    assert.equal(parseArgs(["/tmp/x.xls", "--apply", "--show-names", "--alias-file", "/tmp/a.json"]).apply, true);
    throwsPalms(() => parseArgs([]), "chybí cesta");
    throwsPalms(() => parseArgs(["/tmp/x.xls", "--force"]), "neznámý přepínač");
    throwsPalms(() => parseArgs(["/tmp/a", "/tmp/b"]), "dvě cesty");
    throwsPalms(() => parseArgs(["/tmp/a", "--alias-file"]), "alias bez cesty");
    assert.equal(parseArgs(["--help"]).help, true);
    ok("38. cesta uvnitř repa je chyba, --apply bez EXPECT_DB_HOST je chyba, host se tiskne bez hesla, výchozí je dry-run");
  }

  // 39. tvar SQL
  {
    const dry = buildBackfillSql("dry");
    const apply = buildBackfillSql("apply");
    const names = buildBackfillSql("names");
    for (const sql of [dry, apply, names]) {
      assert.equal(sql.startsWith(SQL_PREFIX), true, "společný prefix input, bounds, elig");
      assert.equal(sql.startsWith(SQL_PREFIX + SQL_ANALYSIS), true, "společná analýza");
      assert.equal(sql.includes("${"), false, "žádná nerozbalená interpolace");
      assert.equal(sql.includes("DO $$"), false, "žádný DO blok (LL-006)");
      assert.equal(/\btransaction\b|\bBEGIN\b|\bCOMMIT\b/i.test(sql), false, "žádná transakce (LL-003)");
      const params = new Set((sql.match(/\$\d+/g) ?? []).map((p) => p));
      assert.deepEqual([...params].sort(), ["$1", "$2", "$3", "$4"], "jen bind parametry $1 až $4");
    }
    assert.equal(/WITH input AS[\s\S]*bounds AS[\s\S]*elig AS/.test(SQL_PREFIX), true);
    // Z2: podmínka deaktivace v elig
    const elig = SQL_PREFIX.slice(SQL_PREFIX.indexOf("elig AS"));
    assert.match(elig, /m\.deactivated_at IS NOT NULL/);
    assert.match(elig, /\(m\.deactivated_at AT TIME ZONE 'Europe\/Prague'\)::date <= i\.d/);
    assert.match(elig, /m\.inactive_until IS NULL OR i\.d <= m\.inactive_until/);
    // apply: tři inserty, všechny ON CONFLICT DO NOTHING; dry-run nic nepíše
    assert.equal((apply.match(/INSERT INTO/g) ?? []).length, 3);
    assert.equal((apply.match(/ON CONFLICT[^)]*\) DO NOTHING/g) ?? []).length, 3);
    assert.equal(/\b(INSERT|UPDATE|DELETE)\b/.test(dry), false, "dry-run jen čte");
    assert.equal(/\b(INSERT|UPDATE|DELETE)\b/.test(names), false);
    assert.match(apply, /INSERT INTO attendance_record[\s\S]*'palms'/);
    assert.match(apply, /INSERT INTO member_absence/);
    assert.match(apply, /INSERT INTO attendance_day/);
    // dry-run a apply počítají stejné sloupce
    assert.equal(dry.includes(SQL_STATS_COLUMNS) && apply.includes(SQL_STATS_COLUMNS), true, "stejné sloupce statistik");
    ok("39. SQL: společný prefix a analýza v dry-run i apply, Z2 v elig, tři inserty s ON CONFLICT DO NOTHING, bind parametry");
  }

  // 40. finalized_at a statika
  {
    const apply = buildBackfillSql("apply");
    const insD = apply.slice(apply.indexOf("ins_d AS"), apply.indexOf("SELECT (SELECT app_start", apply.indexOf("ins_d AS")));
    assert.match(insD, /finalized_at/);
    assert.match(insD, /\(r\.attendance_date \+ time '17:00'\) AT TIME ZONE 'Europe\/Prague'/);
    assert.equal(/now\s*\(/i.test(insD), false, "finalized_at není now()");
    assert.match(insD, /'recorded', false/);
    ok("40. finalized_at je 17:00 pražského času v den schůzky, ne now()");

    const lib = read("lib/attendance/palms.ts");
    const script = read("scripts/backfill-iter-041-palms.ts");
    const fixture = read("scripts/fixtures-iter-041-palms/synthetic-export.ts");
    for (const [label, src] of [["palms.ts", lib], ["backfill", script], ["fixtures", fixture], ["test", read("scripts/test-iter-041-palms.ts")]] as const) {
      assert.equal(src.includes(EM_DASH), false, `${label}: bez em dashe`);
    }
    const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const [label, full] of [["palms.ts", lib], ["backfill", script]] as const) {
      const src = stripComments(full);
      assert.equal(/db\.transaction\(|\.transaction\(/.test(src), false, `${label}: bez db.transaction`);
      assert.equal(/resend/i.test(src), false, `${label}: bez Resend`);
      assert.equal(/ops_event|logOpsEvent/.test(src), false, `${label}: bez ops_event`);
      assert.equal(/INSERT INTO member\b|INSERT INTO member \(/.test(src), false, `${label}: nezakládá členy`);
    }
    assert.equal(/from "node:fs"|require\("fs"\)/.test(lib), false, "knihovna nečte soubory");
    assert.equal(/\.env\.local/.test(script) && !script.includes("dotenv"), false);
    assert.match(script, /assertOutsideRepo/);
    assert.match(script, /assertApplyAllowed/);
    assert.match(script, /assertExpectHostGiven/);
    assert.match(HELP_TEXT, /CELÝ host, nebo jeho PRVNÍ label/);
    assert.match(HELP_TEXT, /EXPECT_DB_HOST=ep-raspy-sound-a1b2c3d4/);
    ok("40b. statika: bez em dashe, db.transaction, Resend, ops_event, zakládání členů; cesta a EXPECT_DB_HOST se kontrolují");
  }
}

// ═════════════════════════════════════════════════════════════
// Část B: SQL scénáře nad PGlite
// ═════════════════════════════════════════════════════════════

interface PgLite {
  waitReady: Promise<unknown>;
  exec(sql: string): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  close(): Promise<void>;
}

function loadPglite(): (new () => PgLite) | null {
  const dirs = [process.env.PGLITE_MODULE_DIR, process.cwd()].filter((d): d is string => !!d);
  for (const dir of dirs) {
    try {
      const req = createRequire(path.join(dir, "noop.js"));
      const mod = req("@electric-sql/pglite") as { PGlite: new () => PgLite };
      return mod.PGlite;
    } catch {
      /* zkusit další */
    }
  }
  return null;
}

const DDL = `
CREATE TABLE member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
  joined_at date NOT NULL DEFAULT CURRENT_DATE,
  deactivated_at timestamptz, inactive_until date,
  CONSTRAINT member_inactive_until_needs_deactivation CHECK (inactive_until IS NULL OR deactivated_at IS NOT NULL)
);
CREATE TABLE attendance_record (
  attendance_date date NOT NULL, member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  status text NOT NULL, substitute_name text, source text NOT NULL DEFAULT 'manager', version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES member(id) ON DELETE SET NULL, updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attendance_date, member_id),
  CONSTRAINT ar_status CHECK (status IN ('absent', 'present', 'substitute', 'unexcused')),
  CONSTRAINT ar_source CHECK (source IN ('manager', 'auto', 'palms')),
  CONSTRAINT ar_sub CHECK ((status = 'substitute') = (substitute_name IS NOT NULL)),
  CONSTRAINT ar_sub_len CHECK (substitute_name IS NULL OR char_length(btrim(substitute_name)) BETWEEN 2 AND 80)
);
CREATE TABLE member_absence (
  member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE, absence_date date NOT NULL,
  substitute_name text, created_by uuid REFERENCES member(id) ON DELETE SET NULL, updated_by uuid REFERENCES member(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, absence_date)
);
CREATE TABLE attendance_day (
  attendance_date date PRIMARY KEY, finalized_at timestamptz, mode text, report_late boolean NOT NULL DEFAULT false,
  CONSTRAINT ad_mode CHECK (mode IS NULL OR mode IN ('recorded', 'unrecorded'))
);
CREATE TABLE attendance_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE,
  attendance_date date NOT NULL, UNIQUE (member_id, attendance_date)
);
CREATE TABLE semafor_name_alias (
  name_key text PRIMARY KEY, member_id uuid NOT NULL REFERENCES member(id) ON DELETE CASCADE
);
`;

const TODAY = "2026-10-23";

async function partB(PGlite: new () => PgLite) {
  // Falešný host: DB je in-process, žádná síť. Nic se nepřipojuje na DATABASE_URL.
  const db = new PGlite();
  await db.waitReady;
  await db.exec(DDL);
  const query: QueryFn = async (text, params) => (await db.query(text, params)).rows;
  const q = async (text: string, params: unknown[] = []) => (await db.query(text, params)).rows;
  const count = async (table: string, where = "true") => Number((await q(`SELECT count(*)::int AS c FROM ${table} WHERE ${where}`))[0].c);

  const ids: Record<string, string> = {};
  async function reset(opts: { deactivate?: Record<string, [string, string | null]> } = {}) {
    await db.exec(
      "TRUNCATE semafor_name_alias, attendance_link, member_absence, attendance_record, attendance_day, member CASCADE"
    );
    for (const name of ["Jan Testovací", "Eva Vzorová", "Petr Fiktivní", "Marie Zkušební", "Karel Nepřítomný"]) {
      const d = opts.deactivate?.[name];
      const r = await q(
        `INSERT INTO member (name, joined_at, deactivated_at, inactive_until) VALUES ($1, '2020-01-01', $2, $3) RETURNING id::text AS id`,
        [name, d ? d[0] : null, d ? d[1] : null]
      );
      ids[name] = String(r[0].id);
    }
  }
  const run = (spec: SyntheticSpec, apply: boolean, extra: { aliasFileText?: string; showNames?: boolean } = {}) =>
    runBackfill(query, { fileBytes: fileOf(spec), apply, showNames: extra.showNames ?? false, today: TODAY, ...extra });
  const snapshot = async () =>
    JSON.stringify([
      await q("SELECT attendance_date::text d, member_id::text m, status, substitute_name, source FROM attendance_record ORDER BY 1, 2"),
      await q("SELECT member_id::text m, absence_date::text d, created_by, updated_by FROM member_absence ORDER BY 1, 2"),
      await q("SELECT attendance_date::text d, finalized_at::text f, mode FROM attendance_day ORDER BY 1"),
    ]);

  // Q18 dry-run: počty, v DB nic nového
  await reset();
  const before = await snapshot();
  const dry = await run(baseSpec(), false);
  assert.equal(await snapshot(), before, "dry-run nic nezapsal");
  const c = dry.counts;
  assert.equal(c.totalRows, 19);
  assert.equal(c.eligible, 19);
  assert.equal(c.newRecords, 19);
  assert.equal(c.sameRecords, 0);
  assert.equal(c.conflicts, 0);
  assert.equal(c.newAbsences, 5);
  assert.equal(c.daysToClose, 6);
  assert.equal(c.appStart, "2026-10-22", "bez dat aplikace je hranice dnes minus 1");
  assert.equal(c.skipNoMember + c.skipAfterStart + c.skipDeactivated, 0);
  assert.equal(dry.stats.unmatchedRowNos.length, 1);
  assert.equal(dry.lines[dry.lines.length - 1], "Režim: dry-run, nic se nezapsalo.");
  const dryText = dry.lines.join("\n");
  for (const nm of NAMES) assert.equal(dryText.includes(nm), false, "dry-run bez jmen");
  ok("B1. dry-run: počty 19 záznamů, 5 omluv, 6 dnů, v DB se nic nezměnilo, výpis bez jmen");

  // Q19 apply = stejné počty jako dry-run
  const applied = await run(baseSpec(), true);
  const { inserted, ...appliedCounts } = applied.counts;
  assert.deepEqual(appliedCounts, c, "apply vypíše stejné počty jako dry-run");
  assert.deepEqual(inserted, { records: 19, absences: 5, days: 6 });
  assert.equal(await count("attendance_record", "source = 'palms'"), 19);
  assert.equal(await count("attendance_record"), 19);
  assert.equal(await count("member_absence"), 5);
  assert.equal(await count("member_absence", "created_by IS NULL AND updated_by IS NULL AND substitute_name IS NULL"), 5);
  assert.equal(await count("attendance_day", "mode = 'recorded' AND finalized_at IS NOT NULL AND report_late = false"), 6);
  for (const d of SEP_DATES) {
    const r = await q("SELECT finalized_at FROM attendance_day WHERE attendance_date = $1::date", [d]);
    assert.equal(new Date(String(r[0].finalized_at)).getTime(), pragueInstant(d, "17:00").getTime(), `finalized_at ${d}`);
  }
  assert.equal(await count("attendance_record", "status = 'substitute' AND substitute_name = 'neuvedeno'"), 2, "K7");
  assert.equal(await count("attendance_record", "status = 'unexcused'"), 0);
  // M (K8) a neznámý kód: bez záznamu; nespárovaný řádek: bez záznamu a bez nového člena
  assert.equal(await count("attendance_record", `member_id = '${ids["Jan Testovací"]}' AND attendance_date = '2026-10-08'`), 0, "M nezapsáno");
  assert.equal(await count("attendance_record", `member_id = '${ids["Eva Vzorová"]}' AND attendance_date = '2026-10-08'`), 0, "neznámý kód nezapsán");
  assert.equal(await count("member"), 5, "nic se nezaložilo");
  assert.equal(await count("attendance_record", `member_id = '${ids["Karel Nepřítomný"]}'`), 0, "člen mimo soubor beze změny");
  // A = absent + member_absence, ostatní bez omluvy
  assert.equal(await count("attendance_record r", `r.status = 'absent' AND EXISTS (SELECT 1 FROM member_absence a WHERE a.member_id = r.member_id AND a.absence_date = r.attendance_date)`), 5);
  assert.deepEqual(applied.lines[applied.lines.length - 1].startsWith("Režim: apply. Zapsáno: záznamů 19, omluv 5, dnů 6."), true);
  ok("B2. apply: 19 záznamů source palms, 5 omluv, 6 dnů 17:00 pražského času, S=neuvedeno, M a neznámý kód nic, nikdo nový");

  // Q20 opakování
  const snap = await snapshot();
  const again = await run(baseSpec(), true);
  assert.deepEqual(again.counts.inserted, { records: 0, absences: 0, days: 0 });
  assert.equal(again.counts.newRecords, 0);
  assert.equal(again.counts.sameRecords, 19);
  assert.equal(again.counts.conflicts, 0);
  assert.equal(await snapshot(), snap, "druhý apply nic nezměnil");
  ok("B3. opakování: 0 nových záznamů, 0 omluv, 0 dnů, 19 shodných");

  // Q21 překryv dvou souborů, jeden rozdíl = konflikt, existující zůstane
  const overlapWeeks = ["srp 27", "zář 03", "zář 10", "zář 17", "zář 24", "říj 01"];
  const overlap = baseSpec({
    from: "2026-08-27T00:00:00.000",
    to: "2026-10-01T00:00:00.000",
    weeks: overlapWeeks,
    rows: [
      row("Jan Testovací", ["P", "P", "P", "L", "S", "A"]),
      row("Eva Vzorová", ["P", "P", "P", "A", "A", "P"]),
      row("Petr Fiktivní", ["P", "P", "P", "A", "P", "P"]),
      row("Marie Zkušební", ["P", "P", "P", "A", "L", "S"]),
    ],
  });
  const dryO = await run(overlap, false);
  assert.equal(dryO.counts.conflicts, 1);
  assert.deepEqual(dryO.counts.conflictRows, [["2026-09-17", 8]]);
  assert.equal(dryO.counts.newRecords, 8, "dva nové týdny × 4 členové");
  assert.equal(dryO.counts.sameRecords, 15);
  assert.equal(dryO.counts.daysToClose, 2);
  assert.match(dryO.lines.join("\n"), /Konflikty \(nepřepsáno\): 2026-09-17 řádek 8\./);
  const appO = await run(overlap, true);
  assert.deepEqual(appO.counts.inserted, { records: 8, absences: 0, days: 2 });
  const kept = await q("SELECT status FROM attendance_record WHERE member_id = $1 AND attendance_date = '2026-09-17'", [ids["Petr Fiktivní"]]);
  assert.equal(kept[0].status, "present", "existující hodnota zůstala");
  assert.equal(await count("attendance_record"), 27);
  ok("B4. překryv: nové jen nepřekryté týdny, 1 konflikt vypsaný (datum a řádek), existující hodnota zůstala");

  // Q22 kratší po delším
  const shorter = baseSpec({ from: "2026-09-24T00:00:00.000", weeks: ["zář 24", "říj 01"], rows: baseSpec().rows.map((r) => ({ ...r, codes: r.codes.slice(2, 4) })) });
  const sh = await run(shorter, true);
  assert.equal(sh.counts.newRecords, 0);
  assert.deepEqual(sh.counts.inserted, { records: 0, absences: 0, days: 0 });
  ok("B5. kratší soubor po delším: 0 nových");

  // Z2: deaktivace uprostřed období a návrat (inactive_until je poslední neaktivní den včetně)
  await reset({
    deactivate: {
      "Marie Zkušební": ["2026-09-20T10:00:00+02:00", null],
      "Eva Vzorová": ["2026-09-12T10:00:00+02:00", "2026-09-18"],
      "Petr Fiktivní": ["2026-09-20T10:00:00+02:00", "2026-09-24"],
    },
  });
  const z2spec = baseSpec({
    rows: [
      row("Marie Zkušební", ["P", "A", "L", "S", "", "M"]),
      row("Eva Vzorová", ["P", "A", "A", "P", "P", "P"]),
      row("Petr Fiktivní", ["P", "P", "P", "P", "P", "P"]),
      row("Jan Testovací", ["P", "P", "P", "P", "P", "P"]),
    ],
  });
  const z2dry = await run(z2spec, false);
  assert.equal(z2dry.counts.skipDeactivated, 4, "Marie 2 (24.9., 1.10.) + Eva 1 (17.9.) + Petr 1 (24.9.)");
  assert.match(z2dry.lines.join("\n"), /v době deaktivace přeskočeno: 4/);
  const z2 = await run(z2spec, true);
  assert.equal(z2.counts.inserted?.records, 18, "Marie 2, Eva 5, Petr 5, Jan 6");
  const written = async (nm: string) => (await q("SELECT attendance_date::text d FROM attendance_record WHERE member_id = $1 ORDER BY 1", [ids[nm]])).map((r) => String(r.d));
  assert.deepEqual(await written("Marie Zkušební"), ["2026-09-10", "2026-09-17"], "po deaktivaci se nezapisuje");
  assert.deepEqual(await written("Eva Vzorová"), ["2026-09-10", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15"], "den v době deaktivace přeskočen, po návratu se zapíše");
  assert.deepEqual(await written("Petr Fiktivní"), ["2026-09-10", "2026-09-17", "2026-10-01", "2026-10-08", "2026-10-15"], "inactive_until je včetně");
  assert.equal((await written("Jan Testovací")).length, 6);
  const z2again = await run(z2spec, true);
  assert.equal(z2again.counts.inserted?.records, 0);
  ok("B6. Z2: dny v době deaktivace se přeskočí a vypíšou, po inactive_until (včetně) se zapisuje, opakování 0");

  // Z3: počty členů na limitu před a po doplnění
  await reset({ deactivate: {} });
  await db.exec("DELETE FROM member WHERE name = 'Karel Nepřítomný'");
  const lida = String((await q("INSERT INTO member (name, joined_at, deactivated_at) VALUES ('Lída Pryč', '2020-01-01', '2026-08-30T10:00:00+02:00') RETURNING id::text AS id"))[0].id);
  const karel = String((await q("INSERT INTO member (name, joined_at) VALUES ('Karel Nepřítomný', '2020-01-01') RETURNING id::text AS id"))[0].id);
  ids["Karel Nepřítomný"] = karel;
  const seeded: [string, string][] = [
    [karel, "2026-08-06"], [karel, "2026-08-13"], [karel, "2026-08-20"],
    [lida, "2026-08-06"], [lida, "2026-08-13"], [lida, "2026-08-20"],
    [ids["Petr Fiktivní"], "2026-08-06"], [ids["Petr Fiktivní"], "2026-08-13"],
    [ids["Eva Vzorová"], "2026-08-06"],
  ];
  for (const [m, d] of seeded) {
    await q("INSERT INTO attendance_record (attendance_date, member_id, status, source) VALUES ($1::date, $2, 'absent', 'palms')", [d, m]);
    await q("INSERT INTO attendance_day (attendance_date, finalized_at, mode) VALUES ($1::date, now(), 'recorded') ON CONFLICT DO NOTHING", [d]);
  }
  const z3spec = baseSpec({
    rows: [
      row("Jan Testovací", ["P", "A", "P", "P", "P", "P"]),
      row("Eva Vzorová", ["A", "A", "A", "P", "P", "P"]),
      row("Petr Fiktivní", ["P", "P", "P", "P", "P", "P"]),
      row("Marie Zkušební", ["P", "A", "P", "P", "P", "P"]),
    ],
  });
  const z3 = await run(z3spec, false);
  assert.equal(z3.counts.limitNow, 1, "dnes na limitu jen aktivní Karel, deaktivovaná Lída se nepočítá");
  assert.equal(z3.counts.limitAfter, 2, "po doplnění přibude Eva (1 + 3)");
  assert.equal(z3.counts.gaining, 3, "absenci přibude Janovi, Evě a Marii");
  assert.match(z3.lines.join("\n"), /Členů se 3 a více absencemi za 6 měsíců: dnes 1, po doplnění 2\./);
  assert.match(z3.lines.join("\n"), /Členů, kterým doplnění přidá absenci: 3\./);
  const z3apply = await run(z3spec, true);
  assert.equal(z3apply.counts.limitNow, 1, "apply vypíše stejné počty jako dry-run");
  assert.equal(z3apply.counts.limitAfter, 2);
  const z3next = await run(z3spec, false);
  assert.equal(z3next.counts.limitNow, 2, "po zápisu je dnes stav z dřívějšího 'po doplnění'");
  assert.equal(z3next.counts.limitAfter, 2);
  assert.equal(z3next.counts.gaining, 0);
  const z3names = await run(z3spec, false, { showNames: true });
  assert.deepEqual(
    z3names.names.map((x) => [x.name, x.before, x.after]),
    [["Eva Vzorová", 4, 4], ["Karel Nepřítomný", 3, 3]],
    "jména jen s --show-names (po zápisu již bez změny)"
  );
  assert.equal(z3.lines.join("\n").includes("Karel"), false, "bez --show-names žádná jména");
  const z3namesPre = (await (async () => { await db.exec("DELETE FROM member_absence; DELETE FROM attendance_record WHERE attendance_date >= '2026-09-01'; DELETE FROM attendance_day WHERE attendance_date >= '2026-09-01'"); return run(z3spec, false, { showNames: true }); })());
  assert.deepEqual(
    z3namesPre.names.map((x) => [x.name, x.before, x.after]),
    [["Eva Vzorová", 1, 4], ["Jan Testovací", 0, 1], ["Karel Nepřítomný", 3, 3], ["Marie Zkušební", 0, 1]],
    "před a po pro dotčené členy a členy na limitu"
  );
  assert.match(z3namesPre.lines.join("\n"), /Limit absencí: Eva Vzorová, před 1, po 4\./);
  // M3: nepřesně spárované řádky v běžném výpisu jen jako čísla, jména jen s --show-names
  await reset();
  const inexactSpec = baseSpec({
    rows: [row("Jan Testovaci", ["P", "P", "P", "P", "P", "P"]), row("Vzorová Eva", ["P", "P", "P", "P", "P", "P"]), row("Petr Fiktivní", ["P", "P", "P", "P", "P", "P"])],
  });
  const inexact = await run(inexactSpec, false);
  const inexactText = inexact.lines.join("\n");
  assert.deepEqual(inexact.stats.looseRowNos, [6]);
  assert.deepEqual(inexact.stats.swappedRowNos, [7]);
  assert.match(inexactText, /Spárováno bez diakritiky: řádky 6\./);
  assert.match(inexactText, /Spárováno prohozeně: řádky 7\./);
  assert.equal(/Testovaci|Vzorová Eva|Nepřesné párování/.test(inexactText), false, "bez --show-names žádná jména");
  const inexactNames = await run(inexactSpec, false, { showNames: true });
  const inexactNamesText = inexactNames.lines.join("\n");
  assert.match(inexactNamesText, /Nepřesné párování, řádek 6 \(bez diakritiky\): Jan Testovaci -> Jan Testovací\./);
  assert.match(inexactNamesText, /Nepřesné párování, řádek 7 \(prohozeně\): Vzorová Eva -> Eva Vzorová\./);
  ok("B7. Z3: dnes 1, po doplnění 2, přibude 3 členům; apply vypíše totéž; jména jen s --show-names; neaktivní se nepočítá");

  // hranice aplikace: ruční zápis, odkaz, den bez palms záznamu
  await reset();
  await q("INSERT INTO attendance_record (attendance_date, member_id, status, source) VALUES ('2026-09-24', $1, 'present', 'manager')", [ids["Jan Testovací"]]);
  const bnd = await run(baseSpec(), true);
  assert.equal(bnd.counts.appStart, "2026-09-24");
  assert.equal(bnd.counts.skipAfterStart, 11, "od 24. 9. přeskočeno 11 řádků plánu");
  assert.equal(bnd.counts.inserted?.records, 8);
  assert.deepEqual(
    (await q("SELECT DISTINCT attendance_date::text d FROM attendance_record WHERE source = 'palms' ORDER BY 1")).map((r) => r.d),
    ["2026-09-10", "2026-09-17"],
    "dny od začátku aplikace se přeskočí celé"
  );
  assert.equal(await count("attendance_record", "attendance_date = '2026-09-24'"), 1, "ruční zápis zůstal jediný");
  await reset();
  await q("INSERT INTO attendance_link (member_id, attendance_date) VALUES ($1, '2026-09-17')", [ids["Jan Testovací"]]);
  assert.equal((await run(baseSpec(), false)).counts.appStart, "2026-09-17", "odkaz správci určuje hranici");
  await reset();
  await q("INSERT INTO attendance_day (attendance_date, finalized_at, mode) VALUES ('2026-09-10', now(), 'recorded')");
  const none = await run(baseSpec(), true);
  assert.equal(none.counts.appStart, "2026-09-10", "den bez palms záznamu určuje hranici");
  assert.equal(none.counts.inserted?.records, 0);
  await reset();
  await q("INSERT INTO attendance_record (attendance_date, member_id, status, source) VALUES ('2026-10-15', $1, 'absent', 'auto')", [ids["Jan Testovací"]]);
  assert.equal((await run(baseSpec(), false)).counts.appStart, "2026-10-15", "automatický zápis určuje hranici");
  ok("B8. hranice aplikace: ruční zápis, odkaz, den bez palms záznamu i automatický zápis; nic se nepřepisuje");

  // alias: paměť jmen a soubor aliasů
  await reset();
  const memKey = "nikdo neznámý";
  await q("INSERT INTO semafor_name_alias (name_key, member_id) VALUES ($1, $2)", [memKey, ids["Karel Nepřítomný"]]);
  const viaMem = await run(baseSpec(), false);
  assert.equal(viaMem.stats.byKind.alias, 1);
  assert.equal(viaMem.stats.unmatchedRowNos.length, 0);
  assert.equal(viaMem.counts.newRecords, 25);
  await reset();
  const viaFile = await run(baseSpec(), true, { aliasFileText: JSON.stringify({ "řádek 10": ids["Karel Nepřítomný"] }) });
  assert.equal(viaFile.stats.byKind.file, 1);
  assert.equal(await count("attendance_record", `member_id = '${ids["Karel Nepřítomný"]}'`), 6);
  assert.equal(await count("semafor_name_alias"), 0, "skript paměť jmen nezapisuje");
  await assert.rejects(() => run(baseSpec(), false, { aliasFileText: JSON.stringify({ "řádek 99": ids["Jan Testovací"] }) }), PalmsError);
  ok("B9. párování: paměť jmen i soubor aliasů, paměť se nezapisuje, alias na neexistující řádek je chyba");

  // soubor s chybou se do DB nedostane
  await reset();
  const s0 = await snapshot();
  await assert.rejects(() => runBackfill(query, { fileBytes: enc("<html/>"), apply: true, showNames: false, today: TODAY }), PalmsError);
  assert.equal(await snapshot(), s0);
  ok("B10. chybný soubor: PalmsError a v DB nic");

  // SQL tvar proti skutečnému Postgresu: apply je atomický, CHECK nepustí vadný řádek
  await reset();
  await assert.rejects(
    () => query(buildBackfillSql("apply"), [JSON.stringify([{ d: "2026-09-10", member_id: ids["Jan Testovací"], status: "substitute", sub: null, excused: false, row_no: 1 }, { d: "2026-09-17", member_id: ids["Jan Testovací"], status: "present", sub: null, excused: false, row_no: 1 }]), TODAY, "2026-04-23", 3]),
  );
  assert.equal(await count("attendance_record"), 0, "vadný řádek zruší celý příkaz, nevznikne polovina");
  assert.equal(await count("attendance_day"), 0);
  ok("B11. apply je jeden příkaz: porušení CHECK nechá DB beze změny (záznamy ani dny)");

  await db.close();

  // B12 (security L-1): využitý kontakt burzy se do bonusu počítá nejvýš jednou na
  // dvojici (pomocník, příjemce) a měsíc. SQL je skutečný dotaz bonusu z aplikace.
  const bdb = new PGlite();
  await bdb.waitReady;
  await bdb.exec(`
    CREATE TABLE member (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL);
    CREATE TABLE mastermind_case (member_id uuid, status text, internal_date date);
    CREATE TABLE burza_help (helper_id uuid, used_on date);
    CREATE TABLE burza_contact_use (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), contact_id uuid, helper_id uuid NOT NULL, recipient_id uuid, used_on date NOT NULL);
  `);
  const mk = async (name: string) => String((await bdb.query("INSERT INTO member (name) VALUES ($1) RETURNING id::text AS id", [name])).rows[0].id);
  const helper = await mk("Pomocník Fiktivní");
  const r1 = await mk("Příjemce Jedna");
  const r2 = await mk("Příjemce Dvě");
  const markContactUsed = (h: string, r: string, d: string) =>
    bdb.query("INSERT INTO burza_contact_use (contact_id, helper_id, recipient_id, used_on) VALUES (gen_random_uuid(), $1, $2, $3)", [h, r, d]);
  for (const d of ["2026-10-01", "2026-10-05", "2026-10-12", "2026-10-20"]) await markContactUsed(helper, r1, d);
  const dialect = new PgDialect();
  const bonusOf = async (memberId?: string) => {
    const qq = dialect.sqlToQuery(bonusEventsSql({ after: "2026-04-30", to: "2026-10-31", memberId }));
    const rows = (await bdb.query(qq.sql, qq.params as unknown[])).rows as { member_id: string; category: string }[];
    const mine = rows.filter((x) => x.member_id === helper);
    return computeBonus({ mastermind: 0, burza: mine.length });
  };
  assert.equal((await bonusOf(helper)).bonus, 5, "jeden kolega zaškrtne 4 kontakty = 5 bodů, ne 20");
  assert.equal((await bonusOf()).bonus, 5, "stejně pro přehled všech členů");
  await markContactUsed(helper, r1, "2026-09-03");
  await markContactUsed(helper, r2, "2026-10-03");
  assert.equal((await bonusOf(helper)).bonus, 15, "jiný měsíc a jiný příjemce se počítají zvlášť (3 události)");
  await bdb.close();
  ok("B12. kontakty burzy: 4 využití od jednoho příjemce v měsíci = 5 bodů, jiný měsíc a příjemce zvlášť");
}

async function main() {
  partA();
  const PGlite = loadPglite();
  if (!PGlite) {
    const msg = "PGlite nenalezen (nastav PGLITE_MODULE_DIR na adresář s node_modules/@electric-sql/pglite). SQL scénáře B1 až B11 PŘESKOČENY.";
    if (process.env.REQUIRE_PGLITE === "1") {
      console.error(msg);
      process.exit(1);
    }
    console.log(`UPOZORNĚNÍ: ${msg}`);
  } else {
    await partB(PGlite);
  }
  console.log(`\nVšech ${n} kontrol prošlo.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
