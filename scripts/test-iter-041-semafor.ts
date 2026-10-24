/**
 * Testy iter-041 (semafor, arch T-001 sekce 13, gate T-002 Z4, Z7 až Z11).
 * Bez DATABASE_URL, bez sítě. Statické kontroly čtou zdrojáky z disku. Žádný
 * soubor se skutečnými daty: fixtures se skládají tady z `jszip` a ručních
 * bajtů, jména jsou smyšlená.
 *
 * Spuštění: npm run test:iter-041 (tento soubor + test-iter-041-attendance + test:iter-040)
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import JSZip from "jszip";
import { SemaforFileError } from "../lib/semafor/errors";
import { crc32, openZip } from "../lib/semafor/zip";
import { decodeEntities, parseXml, XmlError } from "../lib/semafor/xml";
import {
  MAX_ELEMENTS_OTHER,
  MAX_ELEMENTS_SHARED,
  MAX_ELEMENTS_SHEET,
  MAX_SHEETS_READ,
  readXlsxSheet,
} from "../lib/semafor/xlsx";
import { COLUMN_SPECS, parseCellNumber, parseScoresSheet } from "../lib/semafor/scores";
import {
  aliasesToWrite,
  looseKey,
  matchNames,
  nameKey,
  resolveMapping,
  swapKey,
  type MappingRow,
  type MatchMember,
} from "../lib/semafor/names";
import { COLOR_THRESHOLDS, colorFromTotal } from "../lib/semafor/color";
import { analyzeFile, buildPreviewRows, buildSavePlan, ensureNotChanged, matchFile, sha256Hex } from "../lib/semafor/import";
import { buildOverview, parseSort } from "../lib/semafor/overview";
import { bonusForMonth, buildMonthView, type BonusEvent, type ScoreRecord } from "../lib/semafor/mine";
import { MESSAGES, canConfirm, type Actor, type CaseLike } from "../lib/mastermind/rules";
import { summarizeChapter } from "../lib/semafor/summary";
import {
  BONUS_CAP,
  BONUS_POINTS,
  bonusSources,
  bonusWindow,
  computeBonus,
  filterBonusEvents,
  hasBonusSource,
  inBonusWindow,
  internalScore,
} from "../lib/semafor/bonus";
import { DEFAULT_CHAPTER_SETTINGS } from "../lib/chapter/settings";
import { validateImportMonth, parseMonthParam, importMonthOptions, previousMonthStart } from "../lib/semafor/months";
import {
  AREAS_LEGEND_TEXT,
  areaValueText,
  fmtNum,
  helpAttendanceManagerUnexcused,
  helpAttendanceMemberUnexcused,
  helpSemaforLeadership,
  helpSemaforMember,
  matchNeedsAttention,
  myBonusLaterText,
  myIntroText,
  overviewLegendText,
  scoreLegendText,
  sixMonthsText,
  uploadedMonthText,
  HELP_ATTENDANCE_MANAGER_UNEXCUSED,
  HELP_ATTENDANCE_MEMBER_UNEXCUSED,
  HELP_SEMAFOR_LEADERSHIP,
  HELP_SEMAFOR_MEMBER,
  SEMAFOR_TEXTS,
  chapterCountsText,
  colorBadgeText,
  fileErrorMessage,
  importExistingText,
  importSavedText,
  memberCountText,
  monthLabel,
  rowErrorMessage,
} from "../lib/semafor/texts";
import { UNEXCUSED_TEXTS } from "../lib/attendance/texts";
import {
  aliasRemovedEvent,
  importedEvent,
  monthDeletedEvent,
  rowDeletedEvent,
  SEMAFOR_EVENT_KINDS,
} from "../lib/semafor/events";
import {
  ADMIN_DELEGABLE_MARKER,
  ATTENDANCE_MANAGER_PERMISSIONS,
  DEFAULT_FUNCTION_PERMISSIONS,
  MODERATOR_ROLE_PERMISSIONS,
  PERMISSIONS,
  expandFunctionPermissions,
  functionGrants,
  permissionsFor,
  type Permission,
} from "../lib/auth/permissions";
import { TERMINAL_KINDS } from "../lib/ops/types";

const ROOT = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);

type TestCase = { name: string; run: () => void | Promise<void> };

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

// ── Fixtures: xlsx skládané ručně ──────────────────────────────

type Cell = string | number | null | { f: string; v?: string | number } | { err: true } | { rich: string[] };

const HEADER = [
  "Rank", "Region", "Chapter", "Name", "Total Score", "Attendance Rate", "Attendance Score",
  "CEU Rate", "CEU Score", "121 Rate", "121 Score", "Referrals Given Rate", "Referrals Given Score",
  "TYFCB", "TYFCB Score", "Visitors", "Visitor Score", "Sponsors", "Sponsor Score",
];

function dataRow(name: string, total: number, extra: Partial<Record<string, Cell>> = {}): Cell[] {
  const base: Record<string, Cell> = {
    Rank: 1, Region: "Test", Chapter: "Pilsner Fountains", Name: name, "Total Score": total,
    "Attendance Rate": 0.85, "Attendance Score": 80, "CEU Rate": 0.1, "CEU Score": 10,
    "121 Rate": 1.5, "121 Score": 60, "Referrals Given Rate": 0.8, "Referrals Given Score": 70,
    TYFCB: 120000, "TYFCB Score": 50, Visitors: 0.25, "Visitor Score": 40, Sponsors: 0.1, "Sponsor Score": 20,
  };
  return HEADER.map((h) => (h in extra ? (extra[h] as Cell) : base[h]));
}

function colName(i: number): string {
  let n = i + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildSheetXml(rows: Cell[][], opts: { inline: boolean; shared: string[] }): string {
  const rowsXml = rows
    .map((cells, ri) => {
      const cs = cells
        .map((cell, ci) => {
          const ref = `${colName(ci)}${ri + 1}`;
          if (cell === null || cell === undefined) return "";
          if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
          if (typeof cell === "string") {
            if (opts.inline) return `<c r="${ref}" t="inlineStr"><is><t>${esc(cell)}</t></is></c>`;
            opts.shared.push(cell);
            return `<c r="${ref}" t="s"><v>${opts.shared.length - 1}</v></c>`;
          }
          if ("rich" in cell) {
            const parts = cell.rich.map((p) => `<r><t>${esc(p)}</t></r>`).join("");
            if (opts.inline) return `<c r="${ref}" t="inlineStr"><is>${parts}</is></c>`;
            opts.shared.push(`\u0000RICH${parts}`);
            return `<c r="${ref}" t="s"><v>${opts.shared.length - 1}</v></c>`;
          }
          if ("err" in cell) return `<c r="${ref}" t="e"><v>#DIV/0!</v></c>`;
          const v = cell.v === undefined ? "" : `<v>${cell.v}</v>`;
          return `<c r="${ref}"><f>${esc(cell.f)}</f>${v}</c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cs}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

interface XlsxOpts {
  sheetName?: string;
  inline?: boolean;
  extraSheets?: string[];
  /** Obsah extra listů (stejné pořadí jako `extraSheets`); chybí-li, list má jednu buňku. */
  extraRows?: Cell[][][];
  target?: string;
  external?: boolean;
  doctypeSheet?: boolean;
  doctypeShared?: boolean;
  sharedRaw?: string;
  sheetRaw?: string;
  workbookRaw?: string;
  store?: boolean;
}

async function buildXlsx(rows: Cell[][], o: XlsxOpts = {}): Promise<Buffer> {
  const shared: string[] = [];
  let sheet = buildSheetXml(rows, { inline: o.inline ?? false, shared });
  if (o.sheetRaw !== undefined) sheet = o.sheetRaw;
  if (o.doctypeSheet) sheet = sheet.replace("<worksheet", '<!DOCTYPE x [<!ENTITY a "b">]><worksheet');
  const sst = `<?xml version="1.0" encoding="UTF-8"?>${o.doctypeShared ? '<!doctype sst [<!entity a "b">]>' : ""}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
    .map((s) => (s.startsWith("\u0000RICH") ? `<si>${s.slice(5)}</si>` : `<si><t>${esc(s)}</t></si>`))
    .join("")}</sst>`;
  const names = [o.sheetName ?? "Scores", ...(o.extraSheets ?? [])];
  const wb = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
    .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("")}</sheets></workbook>`;
  const rels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${
          i === 0 ? (o.target ?? "worksheets/sheet1.xml") : `worksheets/sheet${i + 1}.xml`
        }"${i === 0 && o.external ? ' TargetMode="External"' : ""}/>`
    )
    .join("")}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`;
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file("xl/workbook.xml", o.workbookRaw ?? wb);
  zip.file("xl/_rels/workbook.xml.rels", rels);
  zip.file("xl/worksheets/sheet1.xml", sheet);
  for (let i = 1; i < names.length; i++) zip.file(`xl/worksheets/sheet${i + 1}.xml`, buildSheetXml(o.extraRows?.[i - 1] ?? [["x"]], { inline: true, shared: [] }));
  if (!o.inline || o.sharedRaw !== undefined) zip.file("xl/sharedStrings.xml", o.sharedRaw ?? sst);
  return zip.generateAsync({
    type: "nodebuffer",
    compression: o.store ? "STORE" : "DEFLATE",
  });
}

const SAMPLE: Cell[][] = [
  HEADER,
  dataRow("Jan Testovací", 74),
  dataRow("Eva Vzorová", 52.5),
  dataRow("Petr Příkladný", 21, { "Attendance Rate": "85 %", TYFCB: "1 234 567" }),
];

function parsedFrom(buf: Buffer) {
  return parseScoresSheet(readXlsxSheet(buf, "Scores").rows);
}

async function expectFileError(fn: () => unknown, code: string) {
  try {
    await fn();
  } catch (e) {
    assert.ok(e instanceof SemaforFileError, `čekána SemaforFileError, přišlo ${(e as Error).constructor.name}: ${(e as Error).message}`);
    assert.equal((e as SemaforFileError).code, code, `kód chyby`);
    return e as SemaforFileError;
  }
  assert.fail(`čekána chyba ${code}`);
}

/** Najde central directory záznam položky a vrátí jeho offset. */
function centralOffset(buf: Buffer, name: string): number {
  for (let i = 0; i < buf.length - 46; i++) {
    if (buf.readUInt32LE(i) === 0x02014b50) {
      const nl = buf.readUInt16LE(i + 28);
      if (buf.toString("utf8", i + 46, i + 46 + nl) === name) return i;
    }
  }
  throw new Error(`central ${name}`);
}

const fn = (name: string, permissions: string[] | null) => ({ name, permissions });
const perms = (
  authMethod: "password" | "magic_link" | "email_link",
  role: "admin" | "moderator" | null,
  functions: ReturnType<typeof fn>[],
  flag = false
) => permissionsFor({ authMethod, managementRole: role, functions, attendanceManager: flag });

const MEMBERS: MatchMember[] = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Jan Testovací", active: true },
  { id: "00000000-0000-4000-8000-000000000002", name: "Eva Vzorová", active: true },
  { id: "00000000-0000-4000-8000-000000000003", name: "Petr Příkladný", active: false },
  { id: "00000000-0000-4000-8000-000000000004", name: "Karel Dvojník", active: true },
  { id: "00000000-0000-4000-8000-000000000005", name: "Karel Dvojník", active: true },
];
const M = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const tests: TestCase[] = [
  {
    name: "1. xlsx se sdílenými řetězci: tři řádky, správné hodnoty",
    run: async () => {
      const p = parsedFrom(await buildXlsx(SAMPLE));
      assert.equal(p.rows.length, 3);
      assert.deepEqual(p.unknownColumns, []);
      const [a, b, c] = p.rows;
      assert.equal(a.name, "Jan Testovací");
      assert.equal(a.values?.totalScore, 74);
      assert.equal(a.values?.attendanceRate, 0.85);
      assert.equal(b.values?.totalScore, 52.5);
      assert.equal(c.values?.attendanceRate, 0.85, "85 % u docházky");
      assert.equal(c.values?.tyfcb, 1234567, "1 234 567 u TYFCB");
      assert.equal(a.r, 2, "číslo řádku v listu");
      assert.equal(a.error, null);
    },
  },
  {
    name: "2. xlsx s inline řetězci a rich textem: totéž",
    run: async () => {
      const rows = SAMPLE.map((r) => [...r]);
      rows[1][3] = { rich: ["Jan ", "Testovací"] };
      const inline = parsedFrom(await buildXlsx(rows, { inline: true }));
      assert.equal(inline.rows[0].name, "Jan Testovací");
      assert.equal(inline.rows[1].values?.totalScore, 52.5);
      const shared = parsedFrom(await buildXlsx(rows, { inline: false }));
      assert.equal(shared.rows[0].name, "Jan Testovací", "rich text ve sdílených řetězcích");
      const stored = parsedFrom(await buildXlsx(rows, { store: true }));
      assert.equal(stored.rows.length, 3, "metoda 0 (STORE)");
    },
  },
  {
    name: "3. sloupce v jiném pořadí: stejný výsledek",
    run: async () => {
      const order = [...HEADER.keys()].reverse();
      const shuffled = SAMPLE.map((r) => order.map((i) => r[i]));
      const p = parsedFrom(await buildXlsx(shuffled));
      assert.equal(p.rows.length, 3);
      assert.equal(p.rows[0].name, "Jan Testovací");
      assert.equal(p.rows[0].values?.totalScore, 74);
      assert.equal(p.rows[2].values?.tyfcb, 1234567);
    },
  },
  {
    name: "4. chybějící povinný sloupec = chyba se seznamem, neznámý sloupec = varování, zdvojená hlavička = chyba",
    run: async () => {
      const missing = SAMPLE.map((r) => r.filter((_, i) => HEADER[i] !== "TYFCB" && HEADER[i] !== "CEU Rate"));
      const err = await expectFileError(async () => parseScoresSheet(readXlsxSheet(await buildXlsx(missing), "Scores").rows), "columns");
      assert.deepEqual(err.params.list, ["CEU Rate", "TYFCB"]);
      assert.ok(fileErrorMessage(err).includes("CEU Rate, TYFCB"));
      const extra = SAMPLE.map((r, i) => [...r, i === 0 ? "Poznámka" : "x"]);
      const p = parseScoresSheet(readXlsxSheet(await buildXlsx(extra), "Scores").rows);
      assert.deepEqual(p.unknownColumns, ["Poznámka"]);
      assert.equal(SEMAFOR_TEXTS.importKeeps.length > 0, true);
      const dup = SAMPLE.map((r, i) => [...r, i === 0 ? "total score" : 1]);
      const d = await expectFileError(async () => parseScoresSheet(readXlsxSheet(await buildXlsx(dup), "Scores").rows), "dupColumn");
      assert.ok(fileErrorMessage(d).includes("dvakrát"));
      // aliasy 1-2-1 a ostatní varianty hlaviček
      const alias = SAMPLE.map((r, i) => r.map((c, ci) => (i === 0 && HEADER[ci] === "121 Rate" ? "1-2-1 rate " : c)));
      assert.equal(parseScoresSheet(readXlsxSheet(await buildXlsx(alias), "Scores").rows).rows.length, 3);
    },
  },
  {
    name: "5. vzorec s <v> bere hodnotu, vzorec bez <v> je prázdný (povinná = chyba řádku), t=e je prázdná",
    run: async () => {
      const rows = SAMPLE.map((r) => [...r]);
      rows[1][4] = { f: "SUM(A1:A2)", v: 61 };
      rows[2][4] = { f: "SUM(A1:A2)" };
      rows[3][8] = { err: true };
      const p = parsedFrom(await buildXlsx(rows));
      assert.equal(p.rows[0].values?.totalScore, 61);
      assert.equal(p.rows[1].values, null);
      assert.equal(p.rows[1].error?.code, "missingValue");
      assert.equal(p.rows[2].values?.ceuScore, null, "chybová buňka = prázdná, nepovinná hodnota projde");
      assert.equal(p.rows[2].error, null);
      const msg = rowErrorMessage(p.rows[1].error!, p.rows[1].r);
      assert.ok(msg.startsWith("Řádek 3: Total Score není číslo"));
      assert.ok(!msg.includes("SUM"), "hláška neobsahuje obsah buňky");
    },
  },
  {
    name: "6. DOCTYPE v listu i ve sdílených řetězcích je chyba, neznámá entita a &#0; taky",
    run: async () => {
      await expectFileError(async () => readXlsxSheet(await buildXlsx(SAMPLE, { doctypeSheet: true }), "Scores"), "broken");
      await expectFileError(async () => readXlsxSheet(await buildXlsx(SAMPLE, { doctypeShared: true }), "Scores"), "broken");
      assert.throws(() => parseXml('<a>&foo;</a>'), XmlError);
      assert.throws(() => parseXml('<a>&#0;</a>'), XmlError);
      assert.throws(() => parseXml('<a>&#x110000;</a>'), XmlError);
      assert.throws(() => parseXml('<a>&#1;</a>'), XmlError);
      assert.throws(() => parseXml('<!DOCTYPE a><a/>'), XmlError);
      assert.throws(() => parseXml('<a><!ENTITY x "y"></a>'), XmlError);
      assert.throws(() => parseXml('<a x="&bad;"/>'), XmlError);
      assert.equal(decodeEntities("&lt;&gt;&amp;&quot;&apos;&#65;&#x42;"), "<>&\"'AB");
      assert.equal(parseXml("<a>&lt;b&gt;</a>").text, "<b>");
      assert.equal(parseXml("<a><![CDATA[<x>]]></a>").text, "<x>");
    },
  },
  {
    name: "7. zip bomba: 64 MiB nul je odmítnutá, lhaní o velikosti skončí dřív, než se alokuje",
    run: async () => {
      const zip = new JSZip();
      zip.file("a.xml", Buffer.alloc(64 * 1024 * 1024));
      zip.file("b.xml", "<x/>");
      const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 9 } });
      assert.ok(bomb.length < 512 * 1024, `bomba ${bomb.length} B se vejde pod limit souboru`);
      assert.equal(bomb.readUInt32LE(0), 0x04034b50);
      const z = openZip(bomb);
      await expectFileError(async () => z.read("a.xml"), "broken");
      // deklarovaná velikost ve skutečnosti menší než obsah: RangeError z maxOutputLength
      const small = new JSZip();
      small.file("c.xml", Buffer.alloc(3 * 1024 * 1024));
      const buf = await small.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const off = centralOffset(buf, "c.xml");
      buf.writeUInt32LE(100, off + 24);
      await expectFileError(async () => openZip(buf).read("c.xml"), "broken");
      const zipSrc = read("lib/semafor/zip.ts");
      assert.ok(/inflateRawSync\([^)]*maxOutputLength/.test(zipSrc), "inflateRawSync dostává maxOutputLength");
      assert.ok(!/inflateSync|gunzip|unzip/i.test(stripComments(zipSrc).replace(/inflateRawSync/g, "")));
    },
  },
  {
    name: "8. deklarovaná velikost jiná než skutečná a špatné CRC jsou chyba",
    run: async () => {
      const mk = async () => {
        const zip = new JSZip();
        zip.file("x.xml", "<root>0123456789</root>");
        return zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
      };
      const wrongSize = await mk();
      wrongSize.writeUInt32LE(5, centralOffset(wrongSize, "x.xml") + 24);
      await expectFileError(async () => openZip(wrongSize).read("x.xml"), "broken");
      const bigger = await mk();
      bigger.writeUInt32LE(9999, centralOffset(bigger, "x.xml") + 24);
      await expectFileError(async () => openZip(bigger).read("x.xml"), "broken");
      const badCrc = await mk();
      const c = centralOffset(badCrc, "x.xml");
      badCrc.writeUInt32LE((badCrc.readUInt32LE(c + 16) ^ 0xff) >>> 0, c + 16);
      await expectFileError(async () => openZip(badCrc).read("x.xml"), "broken");
      const good = await mk();
      assert.equal(openZip(good).read("x.xml").toString(), "<root>0123456789</root>");
      assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926, "CRC32 kontrolní hodnota");
      // položka nad 4 MiB (deklarace) a součet nad 8 MiB
      const over = await mk();
      over.writeUInt32LE(4 * 1024 * 1024 + 1, centralOffset(over, "x.xml") + 24);
      await expectFileError(async () => openZip(over).read("x.xml"), "broken");
      const total = new JSZip();
      for (const n of ["a", "b", "c"]) total.file(`${n}.xml`, Buffer.alloc(3 * 1024 * 1024));
      const tz = openZip(await total.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
      tz.read("a.xml");
      tz.read("b.xml");
      await expectFileError(async () => tz.read("c.xml"), "broken");
    },
  },
  {
    name: "9. 65 položek, šifrovaný příznak, zip64 a metoda 12 jsou chyba",
    run: async () => {
      const many = new JSZip();
      for (let i = 0; i < 65; i++) many.file(`f${i}.xml`, "<a/>");
      await expectFileError(async () => openZip(await many.generateAsync({ type: "nodebuffer", compression: "STORE" })), "broken");
      const fine = new JSZip();
      for (let i = 0; i < 64; i++) fine.file(`f${i}.xml`, "<a/>");
      assert.equal(openZip(await fine.generateAsync({ type: "nodebuffer", compression: "STORE" })).names().length, 64);
      const one = async () => {
        const z = new JSZip();
        z.file("x.xml", "<a/>");
        return z.generateAsync({ type: "nodebuffer", compression: "STORE" });
      };
      const enc = await one();
      enc.writeUInt16LE(enc.readUInt16LE(centralOffset(enc, "x.xml") + 8) | 1, centralOffset(enc, "x.xml") + 8);
      await expectFileError(async () => openZip(enc), "broken");
      const z64 = await one();
      z64.writeUInt32LE(0xffffffff, centralOffset(z64, "x.xml") + 20);
      await expectFileError(async () => openZip(z64), "broken");
      const m12 = await one();
      m12.writeUInt16LE(12, centralOffset(m12, "x.xml") + 10);
      await expectFileError(async () => openZip(m12), "broken");
      const dupName = await one();
      assert.ok(dupName.length > 0);
      // duplicitní jméno: stejná položka dvakrát v central directory
      const dz = new JSZip();
      dz.file("aa.xml", "<a/>");
      dz.file("bb.xml", "<a/>");
      const dbuf = await dz.generateAsync({ type: "nodebuffer", compression: "STORE" });
      const o2 = centralOffset(dbuf, "bb.xml");
      dbuf.write("aa.xml", o2 + 46, "utf8");
      await expectFileError(async () => openZip(dbuf), "broken");
    },
  },
  {
    name: "10. ne-zip: .xls hlavička, text, příliš velký soubor",
    run: async () => {
      await expectFileError(async () => openZip(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...new Array(40).fill(0)])), "notXlsx");
      await expectFileError(async () => openZip(Buffer.from("name,score\nJan,5\n".repeat(5))), "notXlsx");
      await expectFileError(async () => openZip(Buffer.alloc(0)), "notXlsx");
      await expectFileError(async () => openZip(Buffer.alloc(512 * 1024 + 1)), "tooBig");
      assert.equal(fileErrorMessage(new SemaforFileError("notXlsx")), SEMAFOR_TEXTS.errNotXlsx);
      assert.equal(fileErrorMessage(new SemaforFileError("tooBig")), "Soubor je moc velký. Limit je 512 kB.");
      // useknutý zip bez EOCD
      await expectFileError(async () => openZip(Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(100)])), "broken");
    },
  },
  {
    name: "11. cíl listu mimo xl/worksheets/ a TargetMode External jsou chyba",
    run: async () => {
      for (const target of ["../../x.xml", "/etc/passwd", "worksheets/../sheet1.xml", "worksheets/sheet 1.xml"]) {
        await expectFileError(async () => readXlsxSheet(await buildXlsx(SAMPLE, { target }), "Scores"), "broken");
      }
      await expectFileError(async () => readXlsxSheet(await buildXlsx(SAMPLE, { external: true }), "Scores"), "broken");
      assert.equal(readXlsxSheet(await buildXlsx(SAMPLE, { target: "/xl/worksheets/sheet1.xml" }), "Scores").rows.length, 4);
    },
  },
  {
    name: "12. chybí list Scores = chyba se seznamem listů, SCORES velkými písmeny projde",
    run: async () => {
      const e = await expectFileError(async () => readXlsxSheet(await buildXlsx(SAMPLE, { sheetName: "Report", extraSheets: ["Chapter"] }), "Scores"), "noSheet");
      assert.deepEqual(e.params.list, ["Report", "Chapter"]);
      assert.ok(fileErrorMessage(e).includes("Listy v souboru: Report, Chapter."));
      assert.equal(readXlsxSheet(await buildXlsx(SAMPLE, { sheetName: "SCORES" }), "Scores").rows.length, 4);
      assert.equal(readXlsxSheet(await buildXlsx(SAMPLE, { sheetName: " scores " }), "Scores").rows.length, 4);
    },
  },
  {
    name: "12c. T-009: list se vybírá podle obsahu, ne podle názvu",
    run: async () => {
      const legend: Cell[][] = [["Color", "Range"], ["Green", "75+"]];
      // list s jiným názvem + legenda jako druhý list
      const july = analyzeFile(await buildXlsx(SAMPLE, { sheetName: "Member Traffic Lights", extraSheets: ["Scoring Legend"], extraRows: [legend] }));
      assert.equal(july.rows.length, 3);
      assert.equal(july.rows[0].name, "Jan Testovací");
      // legenda první, data až druhý list
      const second = analyzeFile(await buildXlsx(legend, { sheetName: "Scoring Legend", extraSheets: ["Member Traffic Lights"], extraRows: [SAMPLE] }));
      assert.equal(second.rows.length, 3);
      // "Scores" má přednost, i když stojí až za jiným vhodným listem
      const other: Cell[][] = [HEADER, dataRow("Ondra Jiný", 10)];
      const pref = analyzeFile(await buildXlsx(other, { sheetName: "Member Traffic Lights", extraSheets: ["Scores"], extraRows: [SAMPLE] }));
      assert.equal(pref.rows.length, 3);
      assert.equal(pref.rows[0].name, "Jan Testovací");
      // "Scores" bez sloupců semaforu nevyhrává
      const noCols = analyzeFile(await buildXlsx(legend, { sheetName: "Scores", extraSheets: ["Data"], extraRows: [SAMPLE] }));
      assert.equal(noCols.rows.length, 3);
      // původní soubor (jediný list Scores) funguje dál
      assert.equal(analyzeFile(await buildXlsx(SAMPLE)).rows.length, 3);
      // hash a deduplikace se nemění: hash jsou surové bajty
      const buf = await buildXlsx(SAMPLE, { sheetName: "Member Traffic Lights" });
      assert.equal(analyzeFile(buf).sha256, sha256Hex(buf));
    },
  },
  {
    name: "12d. T-009: sešit bez vhodného listu = noSheet s omezeným výpisem, limit počtu čtených listů",
    run: async () => {
      const legend: Cell[][] = [["Color", "Range"]];
      const many = Array.from({ length: 55 }, (_, i) => `List ${i}`);
      const e = await expectFileError(
        async () => analyzeFile(await buildXlsx(legend, { sheetName: "Y".repeat(90), extraSheets: many })),
        "noSheet"
      );
      assert.equal(e.params.list?.length, 5);
      assert.ok((e.params.list ?? []).every((n) => n.length <= 40));
      assert.equal(e.params.more, 51);
      const msg = fileErrorMessage(e);
      assert.ok(msg.includes("chybí list se sloupci semaforu") && msg.includes("a další 51."), msg);
      assert.ok(!msg.includes(EM_DASH));
      // vhodný list až za limitem čtených listů se nenajde
      const names = Array.from({ length: MAX_SHEETS_READ }, (_, i) => `Pozn ${i}`);
      await expectFileError(
        async () => analyzeFile(await buildXlsx(legend, { sheetName: "Prvni", extraSheets: [...names], extraRows: [...names.map(() => legend), SAMPLE] })),
        "noSheet"
      );
      // těsně v limitu se najde
      const within = Array.from({ length: MAX_SHEETS_READ - 2 }, (_, i) => `Pozn ${i}`);
      const found = analyzeFile(await buildXlsx(legend, { sheetName: "Prvni", extraSheets: [...within, "Data"], extraRows: [...within.map(() => legend), SAMPLE] }));
      assert.equal(found.rows.length, 3);
      // limity XML platí pro čtený list i mimo "Scores"
      const bigSheet = await buildXlsx(SAMPLE, { sheetName: "Member Traffic Lights", sheetRaw: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${"<row/>".repeat(MAX_ELEMENTS_SHEET + 10)}</sheetData></worksheet>` });
      await expectFileError(async () => analyzeFile(bigSheet), "broken");
    },
  },
  {
    name: "12b. L-3: chybí list Scores s tisíci listy: nejvýš 5 názvů po 40 znacích a „a další N“",
    run: async () => {
      const many = Array.from({ length: 55 }, (_, i) => `List ${i}`);
      const e = await expectFileError(
        async () => readXlsxSheet(await buildXlsx(SAMPLE, { sheetName: "X".repeat(90), extraSheets: many }), "Scores"),
        "noSheet"
      );
      assert.equal(e.params.list?.length, 5);
      assert.ok((e.params.list ?? []).every((n) => n.length <= 40));
      assert.equal(e.params.more, 51);
      const msg = fileErrorMessage(e);
      assert.ok(msg.includes("a další 51."), msg);
      assert.ok(msg.length < 250, `krátká hláška, ${msg.length}`);
      // fileErrorMessage se brání i sám, kdyby chybu složil někdo jiný
      const raw = fileErrorMessage(new SemaforFileError("noSheet", { list: Array.from({ length: 50 }, () => "Y".repeat(500)) }));
      assert.ok(raw.length < 400 && raw.includes("a další 45."), raw.length.toString());
    },
  },
  {
    name: "12c. L-2: strop prvků podle části souboru, 16 KB soubor nespotřebuje stovky MB",
    run: async () => {
      // parseXml: strop jde předat, výchozí zůstává vysoký (PALMS)
      assert.throws(() => parseXml("<a>" + "<b/>".repeat(20) + "</a>", { maxElements: 10 }), XmlError);
      assert.doesNotThrow(() => parseXml("<a>" + "<b/>".repeat(20) + "</a>", { maxElements: 100 }));
      assert.doesNotThrow(() => parseXml("<a>" + "<b/>".repeat(60_000) + "</a>"));
      const cells = (n: number) => `<c r="A1"/>`.repeat(n);
      const sheetWith = (n: number) =>
        `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1">${cells(n)}</row></sheetData></worksheet>`;
      // list: nad stropem (50 000 prvků) je chyba, a soubor je přitom malý
      const bigSheet = await buildXlsx(SAMPLE, { sheetRaw: sheetWith(MAX_ELEMENTS_SHEET) });
      assert.ok(bigSheet.length < 16 * 1024, `soubor ${bigSheet.length} B`);
      await expectFileError(async () => readXlsxSheet(bigSheet, "Scores"), "broken");
      // sdílené řetězce: nad stropem 25 000 prvků
      const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${"<si/>".repeat(MAX_ELEMENTS_SHARED)}</sst>`;
      await expectFileError(async () => readXlsxSheet(await buildXlsx(SAMPLE, { sharedRaw: sst }), "Scores"), "broken");
      // workbook: nad stropem 2 000 listů
      const wbMany = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Scores" sheetId="1" r:id="rId1"/>${'<sheet name="x" sheetId="2" r:id="rIdX"/>'.repeat(MAX_ELEMENTS_OTHER)}</sheets></workbook>`;
      await expectFileError(async () => readXlsxSheet(await buildXlsx(SAMPLE, { workbookRaw: wbMany }), "Scores"), "broken");
      // rezerva: skutečný tvar (30 řádků x 19 sloupců) i horní mez (200 x 40) projdou
      const grid = (r: number, c: number): Cell[][] => Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => `v${i}_${j}`));
      assert.equal(readXlsxSheet(await buildXlsx(grid(31, 19)), "Scores").rows.length, 31);
      assert.equal(readXlsxSheet(await buildXlsx(grid(200, 40)), "Scores").rows.length, 200);
      assert.equal(readXlsxSheet(await buildXlsx(grid(200, 40), { inline: true }), "Scores").rows.length, 200);
    },
  },
  {
    name: "13. čísla: 74, 0,85, 85 %, 1 234 567, 1e3, NaN, -5, 101",
    run: () => {
      const total = COLUMN_SPECS.totalScore;
      const rate = COLUMN_SPECS.attendanceRate;
      const money = COLUMN_SPECS.tyfcb;
      assert.deepEqual(parseCellNumber("74", total), { ok: true, value: 74 });
      assert.deepEqual(parseCellNumber("74,5", total), { ok: true, value: 74.5 });
      assert.deepEqual(parseCellNumber("0,85", rate), { ok: true, value: 0.85 });
      assert.deepEqual(parseCellNumber("85 %", rate), { ok: true, value: 0.85 });
      assert.deepEqual(parseCellNumber("85 %", rate), { ok: true, value: 0.85 });
      assert.deepEqual(parseCellNumber("1 234 567", money), { ok: true, value: 1234567 });
      assert.deepEqual(parseCellNumber("", total), { ok: true, value: null });
      assert.deepEqual(parseCellNumber("   ", total), { ok: true, value: null });
      for (const bad of ["1e3", "NaN", "Infinity", "-5", "101", "=1+1", "1.2.3", "5 %", "abc", "1,2,3"]) {
        assert.equal(parseCellNumber(bad, total).ok, false, `${bad} u Total Score`);
      }
      assert.equal(parseCellNumber("100", total).ok, true);
      assert.equal(parseCellNumber("100,01", total).ok, false);
      assert.equal(parseCellNumber("1,2", rate).ok, false, "docházka nad 1 bez %");
      assert.equal(parseCellNumber("85 %", total).ok, false, "% jen u Attendance Rate");
      assert.deepEqual(parseCellNumber("74,126", total), { ok: true, value: 74.13 }, "zaokrouhlení na měřítko sloupce");
    },
  },
  {
    name: "14. 201 řádků, 41 sloupců a buňka 1 001 znaků jsou chyba",
    run: async () => {
      const okRows: Cell[][] = [HEADER];
      for (let i = 0; i < 199; i++) okRows.push(dataRow(`Člen ${i}`, 50));
      assert.equal(readXlsxSheet(await buildXlsx(okRows), "Scores").rows.length, 200);
      okRows.push(dataRow("Další", 50));
      await expectFileError(async () => readXlsxSheet(await buildXlsx(okRows), "Scores"), "broken");
      const wide: Cell[][] = [[...HEADER, ...new Array(21).fill(null), "Daleko"]];
      assert.equal(wide[0].length, 41);
      await expectFileError(async () => readXlsxSheet(await buildXlsx(wide), "Scores"), "broken");
      const longCell = SAMPLE.map((r) => [...r]);
      longCell[1][3] = "x".repeat(1001);
      await expectFileError(async () => readXlsxSheet(await buildXlsx(longCell), "Scores"), "broken");
      const edge = SAMPLE.map((r) => [...r]);
      edge[1][3] = "x".repeat(1000);
      assert.equal(readXlsxSheet(await buildXlsx(edge), "Scores").rows.length, 4);
    },
  },
  {
    name: "15. patologický vstup 4 MiB dokončí do 1 s",
    run: () => {
      const t0 = Date.now();
      const inputs = [
        "<a>" + "<c".repeat(2 * 1024 * 1024),
        "<a>" + "&amp;".repeat(800_000) + "</a>",
        "<a>" + '<b x="'.repeat(700_000),
        "<a" + " b=\"1\"".repeat(500_000) + ">",
        "<a>" + "<b>".repeat(99) + "</b>".repeat(99) + "<!--".repeat(10),
      ];
      for (const x of inputs) {
        try {
          parseXml(x);
        } catch (e) {
          assert.ok(e instanceof XmlError, "jen XmlError");
        }
      }
      assert.ok(Date.now() - t0 < 1000, `trvalo ${Date.now() - t0} ms`);
      assert.throws(() => parseXml("<a>".repeat(101)), XmlError, "hloubka nad 100");
    },
  },
  {
    name: "16. nameKey: NFC a NFD stejné, nezlomitelná mezera, dvojitá mezera, neviditelný znak",
    run: () => {

      assert.equal(nameKey("Jan Testovací"), nameKey("Jan Testovaci" + String.fromCharCode(0x301)));
      assert.equal(nameKey("Jan Testovací"), "jan testovací");
      assert.equal(nameKey("  Jan   Testovací "), "jan testovací");
      assert.equal(nameKey("Jan​ Testovací﻿"), "jan testovací");
      assert.equal(looseKey("Příliš Žluťoučký"), "prilis zlutoucky");
      assert.equal(swapKey("Testovací Jan"), swapKey("Jan Testovací"));
    },
  },
  {
    name: "17. párování: alias, exact, loose, swapped, jmenovci = ambiguous, nic = none, dvakrát = duplicate",
    run: () => {
      const aliases = new Map<string, string>([[nameKey("J. Testovací"), M(2)]]);
      const names = ["J. Testovací", "jan testovací", "Eva Vzorova", "Příkladný Petr", "Karel Dvojník", "Nikdo Neznámý"];
      const r = matchNames(names, MEMBERS, aliases);
      assert.deepEqual(r.map((x) => x.kind), ["alias", "exact", "loose", "swapped", "ambiguous", "none"]);
      assert.equal(r[0].memberId, M(2));
      assert.equal(r[1].memberId, M(1));
      assert.equal(r[2].memberId, M(2));
      assert.equal(r[3].memberId, M(3), "neaktivní člen se páruje také");
      assert.equal(r[4].memberId, null);
      assert.deepEqual(r[4].candidates, [M(4), M(5)]);
      // alias má přednost před exact
      const pri = matchNames(["Jan Testovací"], MEMBERS, new Map([[nameKey("Jan Testovací"), M(2)]]));
      assert.equal(pri[0].kind, "alias");
      assert.equal(pri[0].memberId, M(2));
      // dvakrát stejné jméno v souboru
      const dup = matchNames(["Jan Testovací", "JAN  testovací"], MEMBERS, new Map());
      assert.deepEqual(dup.map((x) => x.kind), ["duplicate", "duplicate"]);
      assert.deepEqual(dup.map((x) => x.memberId), [null, null]);
      // alias na neexistujícího člena se přeskočí
      const stale = matchNames(["Jan Testovací"], MEMBERS, new Map([[nameKey("Jan Testovací"), "ffffffff-0000-4000-8000-000000000000"]]));
      assert.equal(stale[0].kind, "exact");
      // prázdné jméno
      assert.equal(matchNames([""], MEMBERS, new Map())[0].kind, "none");
    },
  },
  {
    name: "18. validace mappingu: člen dvakrát, neznámé uuid, řádek s chybou s členem, ambiguous bez rozhodnutí",
    run: () => {
      const names = ["Jan Testovací", "Eva Vzorova", "Karel Dvojník", "Nikdo", "Chybný"];
      const matches = matchNames(names, MEMBERS, new Map());
      const rows: MappingRow[] = matches.map((match, index) => ({ index, match, hasError: index === 4 }));
      const ids = new Set(MEMBERS.map((m) => m.id));
      const decide = (o: Record<number, string>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
      // ambiguous a none bez rozhodnutí
      let r = resolveMapping(rows, decide({}), ids);
      assert.deepEqual(r.ok ? null : r.code, "undecided");
      r = resolveMapping(rows, decide({ 2: M(4), 3: "skip" }), ids);
      assert.equal(r.ok, true, "chybný řádek bez rozhodnutí se přeskočí");
      if (r.ok) {
        assert.equal(r.resolved.get(0), M(1));
        assert.equal(r.resolved.get(1), M(2));
        assert.equal(r.resolved.get(2), M(4));
        assert.equal(r.resolved.has(3), false);
        assert.equal(r.resolved.has(4), false);
      }
      r = resolveMapping(rows, decide({ 2: M(1), 3: "skip" }), ids);
      assert.deepEqual(r.ok ? null : r.code, "twice");
      r = resolveMapping(rows, decide({ 2: "ffffffff-0000-4000-8000-000000000000", 3: "skip" }), ids);
      assert.deepEqual(r.ok ? null : r.code, "unknownMember");
      r = resolveMapping(rows, decide({ 2: "není uuid", 3: "skip" }), ids);
      assert.deepEqual(r.ok ? null : r.code, "unknownMember");
      r = resolveMapping(rows, decide({ 2: M(4), 3: "skip", 4: M(5) }), ids);
      assert.deepEqual(r.ok ? null : r.code, "errorRowSelected");
      // aliasy: jen ruční volba a potvrzená nepřesná shoda, ne exact
      const okr = resolveMapping(rows, decide({ 2: M(4), 3: "skip" }), ids);
      assert.ok(okr.ok);
      if (okr.ok) {
        const al = aliasesToWrite(names, rows, okr.resolved);
        assert.deepEqual(al.map((a) => a.nameKey).sort(), [nameKey("Eva Vzorova"), nameKey("Karel Dvojník")].sort());
      }
    },
  },
  {
    name: "20. colorFromTotal: 70 zelená, 69,99 žlutá, 50 žlutá, 49,99 červená, 30 červená, 29,99 šedá, 0 a 100; bere jen číslo",
    run: () => {
      assert.equal(colorFromTotal(70), "green");
      assert.equal(colorFromTotal(69.99), "yellow");
      assert.equal(colorFromTotal(50), "yellow");
      assert.equal(colorFromTotal(49.99), "red");
      assert.equal(colorFromTotal(30), "red");
      assert.equal(colorFromTotal(29.99), "grey");
      assert.equal(colorFromTotal(0), "grey");
      assert.equal(colorFromTotal(100), "green");
      assert.equal(colorFromTotal.length, 1, "jediný parametr");
      assert.deepEqual(COLOR_THRESHOLDS, { green: 70, yellow: 50, red: 30 });
      assert.deepEqual(SEMAFOR_TEXTS.colors, { green: "Zelená", yellow: "Žlutá", red: "Červená", grey: "Šedá" }, "K4 B: Červená");
    },
  },
  {
    name: "21. summarizeChapter (Z4): přesné počty bez potlačení a bez průměru",
    run: () => {
      const rows = (g: number, y: number, r: number, s: number) => [
        ...new Array(g).fill({ internalScore: 80 }),
        ...new Array(y).fill({ internalScore: 55 }),
        ...new Array(r).fill({ internalScore: 35 }),
        ...new Array(s).fill({ internalScore: 10 }),
      ];
      assert.deepEqual(summarizeChapter(rows(10, 9, 6, 2)), { green: 10, yellow: 9, red: 6, grey: 2 });
      assert.deepEqual(summarizeChapter(rows(12, 10, 5, 0)), { green: 12, yellow: 10, red: 5, grey: 0 }, "nula se ukáže");
      assert.deepEqual(summarizeChapter(rows(0, 0, 1, 0)), { green: 0, yellow: 0, red: 1, grey: 0 }, "n = 1 vrátí počty");
      assert.deepEqual(summarizeChapter([]), { green: 0, yellow: 0, red: 0, grey: 0 });
      assert.deepEqual(
        summarizeChapter([...rows(1, 1, 1, 1), { internalScore: 99, active: false }]),
        { green: 1, yellow: 1, red: 1, grey: 1 },
        "deaktivovaný se nezapočte"
      );
      assert.deepEqual(Object.keys(summarizeChapter(rows(1, 0, 0, 0))).sort(), ["green", "grey", "red", "yellow"], "žádný průměr");
      assert.equal(chapterCountsText("2026-09-01", { green: 3, yellow: 6, red: 4, grey: 2 }), "Za září 2026: zelení 3, žlutí 6, červení 4, šedí 2.");
      assert.equal(chapterCountsText("2026-09-01", { green: 0, yellow: 0, red: 0, grey: 0 }), "Za září 2026: zelení 0, žlutí 0, červení 0, šedí 0.");
    },
  },
  {
    name: "22. validace měsíce: budoucí, 25 měsíců zpět, 15. den, neplatné; výchozí minulý měsíc; 13 voleb",
    run: () => {
      const today = "2026-10-23";
      assert.equal(validateImportMonth("2026-10-01", today), true);
      assert.equal(validateImportMonth("2026-09-01", today), true);
      assert.equal(validateImportMonth("2024-10-01", today), true, "24 měsíců zpět");
      assert.equal(validateImportMonth("2024-09-01", today), false, "25 měsíců zpět");
      assert.equal(validateImportMonth("2026-11-01", today), false, "budoucí");
      assert.equal(validateImportMonth("2026-09-15", today), false, "15. den");
      assert.equal(validateImportMonth("2026-13-01", today), false);
      assert.equal(validateImportMonth(undefined, today), false);
      assert.equal(validateImportMonth("2026-9-1", today), false);
      assert.equal(previousMonthStart(today), "2026-09-01");
      assert.equal(previousMonthStart("2026-01-15"), "2025-12-01");
      const opts = importMonthOptions(today);
      assert.equal(opts.length, 13);
      assert.equal(opts[0], "2026-10-01");
      assert.equal(opts[12], "2025-10-01");
      assert.equal(parseMonthParam("2026-09"), "2026-09-01");
      assert.equal(parseMonthParam("2026-9"), null);
      assert.equal(parseMonthParam("2026-09-01"), null);
      assert.equal(parseMonthParam("2026-13"), null);
      assert.equal(parseMonthParam(["2026-09"]), null);
      assert.equal(parseMonthParam("'; DROP"), null);
    },
  },
  {
    name: "23. práva (Z7): moderátor bez funkce nemá view_all, funkce NULL ano, import jen admin a značka, odkaz nic",
    run: () => {
      const VIEW: Permission = "semafor.view_all";
      const IMP: Permission = "semafor.import";
      assert.ok(PERMISSIONS.includes(VIEW) && PERMISSIONS.includes(IMP));
      // 23a moderátor bez funkce, heslo
      assert.ok(!perms("password", "moderator", []).has(VIEW));
      assert.ok(!perms("password", "moderator", []).has(IMP));
      // 23b funkce NULL bez role, heslo
      const clen = fn("Člen výboru", null);
      assert.ok(perms("password", null, [clen]).has(VIEW));
      assert.ok(!perms("password", null, [clen]).has(IMP), "funkce NULL nemá import");
      // 23c moderátor + funkce NULL
      assert.ok(perms("password", "moderator", [clen]).has(VIEW));
      // 23d funkce s ručním seznamem bez view_all
      assert.ok(!perms("password", null, [fn("Vlastní", ["guests.manage"])]).has(VIEW));
      assert.ok(perms("password", null, [fn("Vlastní", ["guests.manage", VIEW])]).has(VIEW));
      // 23e značka
      const pres = fn("Prezident", [ADMIN_DELEGABLE_MARKER]);
      assert.ok(perms("password", null, [pres]).has(VIEW) && perms("password", null, [pres]).has(IMP));
      // admin
      assert.ok(perms("password", "admin", []).has(VIEW) && perms("password", "admin", []).has(IMP));
      // 23g odkaz: i Člen výboru, i se správcem docházky
      for (const method of ["magic_link", "email_link"] as const) {
        for (const fns of [[clen], [pres], []]) {
          const p = perms(method, null, fns, true);
          assert.ok(!p.has(VIEW) && !p.has(IMP), `${method} nemá semafor`);
        }
        assert.ok(!perms(method, "admin", [], false).has(VIEW));
      }
      // 23h konstanty
      assert.ok(!MODERATOR_ROLE_PERMISSIONS.some((p) => p.startsWith("semafor.")), "role moderátor bez semafor.*");
      assert.ok(!ATTENDANCE_MANAGER_PERMISSIONS.some((p) => p.startsWith("semafor.")));
      assert.deepEqual([...DEFAULT_FUNCTION_PERMISSIONS].sort(), [...MODERATOR_ROLE_PERMISSIONS, VIEW].sort());
      assert.ok(!DEFAULT_FUNCTION_PERMISSIONS.includes(IMP));
      assert.equal(functionGrants(null, VIEW), true);
      assert.equal(functionGrants(null, IMP), false);
      assert.equal(functionGrants([ADMIN_DELEGABLE_MARKER], IMP), true);
      assert.equal(functionGrants(["guests.manage"], VIEW), false);
      assert.ok(expandFunctionPermissions(null).includes(VIEW));
      // SQL protějšek ve shodě s TS
      const sqlSrc = read("lib/db/queries/member-active.ts");
      assert.ok(sqlSrc.includes("DEFAULT_FUNCTION_PERMISSIONS.includes(permission)"), "functionGrantsSql čte výchozí sadu funkce");
      assert.ok(!sqlSrc.includes("MODERATOR_ROLE_PERMISSIONS"), "SQL funkce nečte sadu role");
      const permSrc = stripComments(read("lib/auth/permissions.ts"));
      assert.ok(/managementRole === "moderator" \? MODERATOR_ROLE_PERMISSIONS/.test(permSrc), "basePermissions čte sadu role");
      assert.ok(!/ATTENDANCE_MANAGER_PERMISSIONS[^\]]*semafor/.test(permSrc));
    },
  },
  {
    name: "24. ops události semafor.*: bez memberId, memberName, skóre a hashe; v TERMINAL_KINDS",
    run: () => {
      const ctx = { runId: "11111111-1111-4111-8111-111111111111", actor: "Vedoucí Test" };
      const events = [
        importedEvent(ctx, { month: "2026-09-01", rows: 30, inserted: 20, updated: 5, unchanged: 5 }),
        monthDeletedEvent(ctx, { month: "2026-09-01", rows: 30 }),
        rowDeletedEvent(ctx, { month: "2026-09-01" }),
        aliasRemovedEvent(ctx),
      ];
      assert.deepEqual(events.map((e) => e.kind), [...SEMAFOR_EVENT_KINDS]);
      for (const e of events) {
        assert.equal(e.memberId, undefined);
        assert.equal(e.memberName, undefined);
        assert.equal(e.email, undefined);
        const json = JSON.stringify(e.detail ?? {});
        assert.ok(!/member|name|score|sha|hash|total/i.test(json), `detail ${json}`);
        assert.ok(TERMINAL_KINDS.includes(e.kind), `${e.kind} je terminální`);
        assert.equal(e.actor, "Vedoucí Test");
      }
      assert.deepEqual(events[0].detail, { month: "2026-09", rows: 30, inserted: 20, updated: 5, unchanged: 5 });
    },
  },
  {
    name: "26. texty: doslova podle gate, bez U+2014 v kódu semaforu a v nápovědě",
    run: () => {
      assert.equal(SEMAFOR_TEXTS.myIntro, "Skóre počítá BNI za posledních 6 měsíců, vedení ho sem nahrává jednou měsíčně. Za Master mind a pomoc v Burze pomoci k němu dostaneš bonus.");
      assert.equal(SEMAFOR_TEXTS.bonusCap, "Bonus je nejvýš 20 bodů, posune barvu nejvýš o jednu.");
      assert.equal(SEMAFOR_TEXTS.mmOwnCase, "Vlastní případ potvrdí jiný člen vedení.");
      assert.equal(SEMAFOR_TEXTS.errNotXlsx, "Soubor není xlsx. Ulož ho v Excelu jako .xlsx.");
      assert.equal(UNEXCUSED_TEXTS.option, "Chyběl(a) bez omluvy");
      assert.equal(UNEXCUSED_TEXTS.tooEarly, "Chyběl(a) bez omluvy jde zapsat od 7:30. Do té doby se člen může omluvit.");
      assert.equal(UNEXCUSED_TEXTS.tooEarlyHint, "Od 7:30. Do té doby se člen může omluvit.");
      assert.equal(UNEXCUSED_TEXTS.excusedConflict, "Člen má na ten den omluvu. Nejdřív zruš omluvu.");
      assert.equal(UNEXCUSED_TEXTS.unexcusedConflict, "Člen je zapsaný jako Chyběl(a) bez omluvy. Nejdřív změň zápis.");
      assert.equal(UNEXCUSED_TEXTS.substitutePlaceholder, "neuvedeno");
      assert.equal(colorBadgeText("green", 74), "Zelená · 74");
      assert.equal(importSavedText(3, 2, 25), "Uloženo: nových 3, změněných 2, beze změny 25.");
      assert.equal(memberCountText(1), "1 člen");
      assert.equal(memberCountText(3), "3 členové");
      assert.equal(memberCountText(7), "7 členů");
      assert.equal(
        importExistingText("2026-09-01", 28, "2026-10-03"),
        "Za září 2026 už je nahráno 28 členů (naposledy 3. 10. 2026). Členům ze souboru se hodnoty přepíšou, ostatním zůstanou."
      );
      assert.ok(importExistingText("2026-09-01", 3, "2026-10-03").includes("už jsou nahraní 3 členové"));
      assert.ok(importExistingText("2026-09-01", 1, "2026-10-03").includes("už je nahraný 1 člen "));
      assert.equal(monthLabel("2026-09-01"), "září 2026");
      assert.equal(HELP_SEMAFOR_MEMBER.length, 5);
      assert.equal(HELP_SEMAFOR_LEADERSHIP.length, 5);
      assert.deepEqual(HELP_SEMAFOR_LEADERSHIP.map((h) => h.importOnly), [true, true, true, false, false]);
      // tykání v UI, vykání v nápovědě: UI texty neobsahují "vás" ani "vaše"
      assert.ok(!/\bvaš|\bvás\b/i.test(JSON.stringify(SEMAFOR_TEXTS)), "UI tyká");
      assert.ok(/vaše skóre/.test(HELP_SEMAFOR_MEMBER[0]), "nápověda vyká");
      const files = [
        ...walk("lib/semafor"),
        "scripts/migrate-iter-041-semafor.ts",
        ...(existsSync(join(ROOT, "app/(app)/semafor")) ? walk("app/(app)/semafor") : []),
        ...(existsSync(join(ROOT, "components/semafor")) ? walk("components/semafor") : []),
        "actions/semafor.ts",
        "lib/db/queries/semafor.ts",
      ].filter((f) => existsSync(join(ROOT, f)));
      for (const f of files) assert.ok(!read(f).includes(EM_DASH), `${f} bez U+2014`);
      for (const t of [HELP_ATTENDANCE_MANAGER_UNEXCUSED, HELP_ATTENDANCE_MEMBER_UNEXCUSED]) assert.ok(!t.includes(EM_DASH));
      assert.ok(fileErrorMessage(new SemaforFileError("columns", { list: ["A", "B"] })).includes("A, B"));
    },
  },
  // ── Bonus (Z8 až Z11) ───────────────────────────────────────
  {
    name: "28. computeBonus: 0 událostí = 0, Master mind 1x = 7, Burza pomoc + kontakt = 10, 2x + 2x = 24 -> 20",
    run: () => {
      assert.deepEqual(BONUS_POINTS, { mastermind: 7, burza: 5 });
      assert.equal(BONUS_CAP, 20);
      assert.equal(computeBonus({ mastermind: 0, burza: 0 }).bonus, 0);
      assert.equal(computeBonus({ mastermind: 1, burza: 0 }).bonus, 7);
      assert.equal(computeBonus({ mastermind: 0, burza: 2 }).bonus, 10);
      const big = computeBonus({ mastermind: 2, burza: 2 });
      assert.equal(big.raw, 24);
      assert.equal(big.bonus, 20);
      assert.equal(big.capped, true);
      assert.equal(computeBonus({ mastermind: 2, burza: 1 }).bonus, 19, "Master mind 2x a Burza 1x");
      assert.equal(computeBonus({ mastermind: 1, burza: 2 }).bonus, 17);
      assert.equal(computeBonus({ mastermind: 0, burza: 4 }).bonus, 20);
      assert.equal(computeBonus({ mastermind: 0, burza: 5 }).bonus, 20, "pět pomocí = 20, ne 25");
      assert.equal(computeBonus({ mastermind: 0, burza: 4 }).capped, false);
      assert.equal(computeBonus({ mastermind: 2, burza: 1 }).lines[0].points, 14);
      for (const bad of [-3, NaN, Infinity]) {
        assert.ok(computeBonus({ mastermind: bad, burza: bad }).bonus >= 0, "bonus nikdy záporný");
      }
    },
  },
  {
    name: "29. internalScore a barvy: 95 + 20 -> 100; 49 + 20 = 69 žlutá; 29 + 20 = 49 červená; nikdy nižší než Total",
    run: () => {
      assert.equal(internalScore(95, 20), 100);
      assert.equal(internalScore(49, 20), 69);
      assert.equal(colorFromTotal(internalScore(49, 20)), "yellow");
      assert.equal(colorFromTotal(49), "red");
      assert.equal(internalScore(29, 20), 49);
      assert.equal(colorFromTotal(internalScore(29, 20)), "red");
      assert.equal(colorFromTotal(29), "grey");
      assert.equal(colorFromTotal(internalScore(65, 7)), "green");
      for (let t = 0; t <= 100; t += 0.5) {
        for (const b of [0, 5, 7, 12, 20, -4, NaN]) {
          assert.ok(internalScore(t, b) >= t, `interní skóre ${t} + ${b}`);
          assert.ok(internalScore(t, b) <= 100);
        }
      }
      // bonus posune nejvýš o jednu barvu
      const order = ["grey", "red", "yellow", "green"];
      for (let t = 0; t <= 100; t += 0.5) {
        const jump = order.indexOf(colorFromTotal(internalScore(t, BONUS_CAP))) - order.indexOf(colorFromTotal(t));
        assert.ok(jump <= 1 && jump >= 0, `${t}: posun ${jump}`);
      }
    },
  },
  {
    name: "30. bonusWindow: 2026-09 = (2026-03-30, 2026-09-30], únor a přestupný rok; hranice",
    run: () => {
      assert.deepEqual(bonusWindow("2026-09-01"), { after: "2026-03-30", to: "2026-09-30" });
      assert.deepEqual(bonusWindow("2026-02-01"), { after: "2025-08-28", to: "2026-02-28" });
      assert.deepEqual(bonusWindow("2028-02-01"), { after: "2027-08-29", to: "2028-02-29" });
      assert.deepEqual(bonusWindow("2026-12-01"), { after: "2026-06-30", to: "2026-12-31" });
      const w = bonusWindow("2026-09-01");
      assert.equal(inBonusWindow(w, "2026-03-30"), false, "dolní mez je ostrá");
      assert.equal(inBonusWindow(w, "2026-03-31"), true);
      assert.equal(inBonusWindow(w, "2026-09-30"), true);
      assert.equal(inBonusWindow(w, "2026-10-01"), false, "po konci měsíce snímku se nezapočte");
      const src = stripComments(read("lib/semafor/bonus.ts"));
      assert.ok(src.includes("addMonthsClamped"), "okno přes addMonthsClamped");
    },
  },
  {
    name: "31. statický: colorFromTotal dostává jen skóre; BONUS_POINTS a BONUS_CAP jen v bonus.ts; barva jen z jedné funkce",
    run: () => {
      const files = walk("lib").concat(walk("app"), walk("components"), walk("actions")).filter((f) => /\.(ts|tsx)$/.test(f));
      for (const f of files) {
        const src = stripComments(read(f));
        for (const m of src.matchAll(/colorFromTotal\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
          if (f.endsWith("color.ts")) continue;
          const arg = m[1].trim();
          assert.ok(
            /^(internal|total|bni|row\.|r\.|s\.|my\.|score|snapshot|t\b|n\b|value|v\b|s\b|sc\b)/i.test(arg) || /internalScore|totalScore|\.total\b|\.internal\b/.test(arg),
            `${f}: colorFromTotal(${arg})`
          );
        }
        if (f.endsWith("lib/semafor/bonus.ts")) continue;
        assert.ok(!/BONUS_CAP\s*=|BONUS_POINTS\s*=|const BONUS_/.test(src) || f.endsWith("scripts"), `${f} nedefinuje bonus`);
        assert.ok(!/>=\s*70\b[^\n]*green|"green"[^\n]*>=\s*70/.test(src) || f.endsWith("color.ts"), `${f}: práh barvy mimo color.ts`);
      }
      const bonus = read("lib/semafor/bonus.ts");
      assert.ok(/export const BONUS_POINTS/.test(bonus) && /export const BONUS_CAP = 20/.test(bonus));
      assert.ok(!/Math\.min\(BONUS_CAP/.test(stripComments(files.filter((f) => !f.endsWith("bonus.ts")).map((f) => read(f)).join("\n"))), "strop jen v jedné funkci");
    },
  },
  // ── Migrace a schéma ────────────────────────────────────────
  {
    name: "32. migrace (LL-006): smoke test stejného tvaru, žádné ${ uvnitř DO $$, lock_timeout, EXPECT_DB_HOST, kontroly",
    run: () => {
      const src = read("scripts/migrate-iter-041-semafor.ts");
      const code = stripComments(src);
      const blocks = [...code.matchAll(/DO \$\$([\s\S]*?)END \$\$/g)].map((m) => m[1]);
      assert.ok(blocks.length >= 5, `DO bloků ${blocks.length}`);
      for (const b of blocks) assert.ok(!b.includes("${"), "uvnitř DO $$ žádná JS interpolace");
      for (const b of blocks) assert.ok(b.includes("set_config('lock_timeout', '5s', true)"), "lock_timeout doslova");
      assert.ok(code.indexOf("[0/5] smoke test OK") < code.indexOf("[2/5] semafor_import"), "smoke test před DDL");
      const smoke = blocks[0];
      for (const piece of ["PRIMARY KEY", "ON DELETE CASCADE", "ON DELETE SET NULL", "date_trunc('month'", "~ '^[0-9a-f]{64}$'", "DROP CONSTRAINT IF EXISTS ar_status", "ADD CONSTRAINT ar_status", "pg_get_constraintdef"]) {
        assert.ok(smoke.includes(piece), `smoke test má tvar ${piece}`);
      }
      assert.ok(code.includes("EXPECT_DB_HOST") && code.includes("process.exit(1)"));
      assert.ok(code.includes("'unexcused'") && code.includes("'palms'") && code.includes("pg_get_constraintdef(oid) AS def"));
      assert.ok(!/transaction\(/.test(code));
      assert.ok(code.includes("CREATE INDEX IF NOT EXISTS") && !/DROP TABLE/.test(code));
      // vypíše funkce s permissions NULL a počet s ručním seznamem (Z7)
      assert.ok(code.includes("permissions IS NULL") && code.includes("semafor.view_all"));
      // nic nemaže data
      assert.ok(!/DELETE FROM|TRUNCATE|UPDATE /.test(code.replace(/ON DELETE|DO UPDATE/g, "")));
    },
  },
  {
    name: "33. schéma: ar_status a ar_source v schema.ts, tabulky semaforu, žádný ${ v migraci mimo parametry",
    run: () => {
      const schema = read("lib/db/schema.ts");
      assert.ok(schema.includes("IN ('absent', 'present', 'substitute', 'unexcused')"));
      assert.ok(schema.includes("IN ('manager', 'auto', 'palms')"));
      for (const t of ["semafor_import", "semafor_score", "semafor_name_alias"]) assert.ok(schema.includes(`"${t}"`), t);
      assert.ok(read("lib/db/schema.sql").includes("semafor_score"));
      assert.ok(!stripComments(read("lib/semafor/events.ts")).includes("memberName"));
    },
  },
  // ── Import: plán uložení, hash ─────────────────────────────
  {
    name: "19. hash: jiný soubor při commitu = changed, sha256 sedí s node:crypto, plán uložení z fixture",
    run: async () => {
      const buf = await buildXlsx(SAMPLE);
      const sha = createHash("sha256").update(buf).digest("hex");
      assert.equal(sha256Hex(buf), sha);
      assert.doesNotThrow(() => ensureNotChanged(sha, sha256Hex(buf)));
      const other = await buildXlsx([...SAMPLE, dataRow("Další Člen", 33)]);
      await expectFileError(async () => ensureNotChanged(sha, sha256Hex(other)), "changed");
      await expectFileError(async () => ensureNotChanged("zzz", sha), "changed");
      assert.equal(fileErrorMessage(new SemaforFileError("changed")), "Soubor se od náhledu změnil. Zobraz náhled znovu.");
      // plán: Jan (exact), Eva (exact), Petr (neaktivní, exact)
      const file = analyzeFile(buf);
      assert.equal(file.sha256, sha);
      const members = MEMBERS.slice(0, 3);
      const plan = buildSavePlan(file, members, new Map(), new Map());
      assert.ok(plan.ok);
      if (plan.ok) {
        assert.equal(plan.plan.rows.length, 3);
        assert.deepEqual(plan.plan.aliases, [], "přesná shoda se do aliasu nezapisuje");
        const jan = plan.plan.rows.find((r) => r.member_id === M(1))!;
        assert.equal(jan.total_score, 74);
        assert.equal(jan.attendance_rate, 0.85);
        assert.equal(Object.keys(jan).length, 16, "member_id + 15 hodnot");
      }
      // přeskočení a ruční výběr -> alias; prázdný plán = chyba
      const skipAll = buildSavePlan(file, members, new Map(), new Map([[0, "skip"], [1, "skip"], [2, "skip"]]));
      assert.ok(!skipAll.ok && skipAll.error.code === "empty");
      const manual = analyzeFile(await buildXlsx([HEADER, dataRow("Přezdívka", 40)]));
      const noDecision = buildSavePlan(manual, members, new Map(), new Map());
      assert.ok(!noDecision.ok && noDecision.error.code === "undecided");
      const chosen = buildSavePlan(manual, members, new Map(), new Map([[0, M(2)]]));
      assert.ok(chosen.ok);
      if (chosen.ok) assert.deepEqual(chosen.plan.aliases, [{ nameKey: "přezdívka", memberId: M(2) }]);
      const twice = buildSavePlan(analyzeFile(await buildXlsx([HEADER, dataRow("A Aa", 1), dataRow("B Bb", 2)])), members, new Map(), new Map([[0, M(1)], [1, M(1)]]));
      assert.ok(!twice.ok && twice.error.code === "twice");
      if (!twice.ok) assert.equal(twice.error.message, "Člen Jan Testovací je přiřazený ke dvěma řádkům.");
      // řádek s chybou nejde přiřadit
      const bad = analyzeFile(await buildXlsx([HEADER, dataRow("Jan Testovací", 500)]));
      assert.equal(bad.rows[0].error?.code, "badValue");
      const sel = buildSavePlan(bad, members, new Map(), new Map([[0, M(1)]]));
      assert.ok(!sel.ok && sel.error.code === "errorRowSelected");
      const skipBad = buildSavePlan(bad, members, new Map(), new Map());
      assert.ok(!skipBad.ok && skipBad.error.code === "empty", "chybný řádek bez rozhodnutí se přeskočí");
      // náhled
      const matches = matchFile(file.rows, members, new Map());
      const rows = buildPreviewRows(file.rows, matches);
      assert.equal(rows[0].color, "green");
      assert.equal(rows[1].color, "yellow");
      assert.equal(rows[2].color, "grey");
      assert.equal(rows[0].label, "Shoda");
    },
  },
  {
    name: "34. přehled (Z5): neaktivní s řádkem označený, aktivní bez řádku na konci s pomlčkou, řazení podle skóre a jména",
    run: () => {
      const rec = (id: string, total: number): ScoreRecord => ({
        month: "2026-09-01", memberId: id, totalScore: total, attendanceRate: null, attendanceScore: null, ceuRate: null, ceuScore: null,
        oneToOneRate: null, oneToOneScore: null, referralsGivenRate: null, referralsGivenScore: null, tyfcb: null, tyfcbScore: null,
        visitors: null, visitorScore: null, sponsors: null, sponsorScore: null,
      });
      const rows = [
        { memberId: "a", name: "Čeněk", active: true, record: null, updatedOn: null },
        { memberId: "b", name: "Alena", active: true, record: rec("b", 45), updatedOn: "2026-10-03" },
        { memberId: "c", name: "Božena", active: false, record: rec("c", 80), updatedOn: "2026-10-03" },
        { memberId: "d", name: "Dana", active: true, record: rec("d", 60), updatedOn: "2026-10-03" },
      ];
      const events: BonusEvent[] = [
        { memberId: "b", category: "mastermind", date: "2026-08-10" },
        { memberId: "b", category: "burza", date: "2026-09-02" },
        { memberId: "b", category: "burza", date: "2026-10-02" },
        { memberId: "d", category: "burza", date: "2026-03-30" },
      ];
      const byScore = buildOverview("2026-09-01", rows, events, "score");
      assert.deepEqual(byScore.map((r) => r.memberId), ["c", "d", "b", "a"], "bez řádku na konci");
      const b = byScore.find((r) => r.memberId === "b")!;
      assert.equal(b.bonus?.bonus, 12, "Master mind 7 + Burza 5; říjnová událost mimo okno");
      assert.equal(b.internal, 57);
      assert.equal(b.internalColor, "yellow");
      assert.equal(b.bniColor, "red", "oficiální barva beze změny");
      const d = byScore.find((r) => r.memberId === "d")!;
      assert.equal(d.bonus?.bonus, 0, "dolní mez okna je ostrá");
      const a = byScore.find((r) => r.memberId === "a")!;
      assert.equal(a.hasData, false);
      assert.equal(a.total, null);
      assert.equal(a.internal, null);
      assert.deepEqual(buildOverview("2026-09-01", rows, events, "name").map((r) => r.memberId), ["b", "c", "d", "a"].sort((x, y) => rows.find((r) => r.memberId === x)!.name.localeCompare(rows.find((r) => r.memberId === y)!.name, "cs")));
      assert.equal(parseSort("name"), "name");
      assert.equal(parseSort("x"), "score");
      assert.equal(parseSort(undefined), "score");
      const c = byScore.find((r) => r.memberId === "c")!;
      assert.equal(c.active, false);
      // pohled člena
      const view = buildMonthView(rec("b", 45), events);
      assert.equal(view.internal, 57);
      assert.equal(bonusForMonth("2026-09-01", "b", events).bonus, 12);
      assert.equal(bonusForMonth("2026-10-01", "b", events).bonus, 17, "říjen: okno (30. 4., 31. 10.], říjnová pomoc se počítá, srpnový Master mind taky");
    },
  },
  {
    name: "35. Master mind (Z10): vedení nepotvrdí vlastní případ, jiný člen vedení ano; hláška shodná se semaforem; SQL má podmínku",
    run: () => {
      const mgmt: Actor = { memberId: "m-1", isManagement: true };
      const sched = (memberId: string): CaseLike => ({ memberId, status: "scheduled", internalDate: "2026-10-15" });
      assert.equal(canConfirm(mgmt, sched("m-1"), "2026-10-15"), false);
      assert.equal(canConfirm(mgmt, sched("m-2"), "2026-10-15"), true);
      assert.equal(canConfirm({ memberId: "m-2", isManagement: false }, sched("m-3"), "2026-10-15"), false);
      assert.equal(MESSAGES.ownCase, SEMAFOR_TEXTS.mmOwnCase);
      const q = stripComments(read("lib/db/queries/mastermind.ts"));
      const confirm = q.slice(q.indexOf("export async function confirmPresentedGuarded"), q.indexOf("export async function undoPresentedGuarded"));
      assert.ok(/AND member_id <> \$\{opts\.actorId\}::uuid/.test(confirm), "podmínka v SQL potvrzení");
      const undo = q.slice(q.indexOf("export async function undoPresentedGuarded"), q.indexOf("// ── Dashboard"));
      assert.ok(!/member_id <> \$\{/.test(undo), "vrácení Proběhlo zůstává bez omezení");
      const act = stripComments(read("actions/mastermind.ts"));
      assert.ok(act.includes("MESSAGES.ownCase"));
    },
  },
  {
    name: "25. statický: stránky semaforu volají requirePageSession jako první řádek s právem, RSC nepředává cizí řádky",
    run: () => {
      const pages = walk("app/(app)/semafor").filter((f) => f.endsWith("page.tsx"));
      assert.deepEqual(pages.sort(), ["app/(app)/semafor/import/page.tsx", "app/(app)/semafor/page.tsx", "app/(app)/semafor/prehled/page.tsx"]);
      for (const f of pages) {
        const src = stripComments(read(f));
        assert.ok(src.includes('export const dynamic = "force-dynamic"') || read(f).includes('export const dynamic = "force-dynamic"'), `${f} force-dynamic`);
        const body = src.slice(src.indexOf("export default async function"));
        const first = body.slice(body.indexOf("{", body.indexOf(")")) + 1).trim();
        assert.ok(/^const (session|\w+) = await requirePageSession\(/.test(first), `${f}: requirePageSession první příkaz`);
      }
      assert.ok(read("app/(app)/semafor/prehled/page.tsx").includes('permission: "semafor.view_all"'));
      assert.ok(read("app/(app)/semafor/import/page.tsx").includes('permission: "semafor.import"'));
      const mine = stripComments(read("app/(app)/semafor/page.tsx"));
      // členská stránka čte jen vlastní data a souhrn
      for (const forbidden of ["listOverviewRows", "listMembersForMatch", "listAliases", "getMonthState", "listMonths"]) {
        assert.ok(!mine.includes(forbidden), `/semafor nesmí volat ${forbidden}`);
      }
      assert.ok(/listMyScores\(session\.memberId/.test(mine) && /listMyBonusEvents\(session\.memberId/.test(mine));
      assert.ok(!/searchParams|params/.test(mine), "memberId nikdy z URL");
      assert.ok(/<ChapterSummaryCard month=\{latest\} counts=\{counts\} \/>/.test(mine), "do souhrnu jen měsíc a čtyři počty");
      assert.ok(!/rows=/.test(mine), "žádné pole řádků v props");
      const q = stripComments(read("lib/db/queries/semafor.ts"));
      const chapter = q.slice(q.indexOf("export async function getChapterCounts"), q.indexOf("export interface OverviewRow"));
      assert.ok(!/\bname\b/.test(chapter.replace(/internalScore|summarizeChapter/g, "")), "souhrn nečte jména");
      assert.ok(!/m\.name|SELECT[^;]*\bname\b/i.test(chapter));
      // prehled: ?m= se validuje
      assert.ok(read("app/(app)/semafor/prehled/page.tsx").includes("parseMonthParam(searchParams?.m)"));
      // akce: requirePermission("semafor.import") jako první krok každé exportované akce
      const act = stripComments(read("actions/semafor.ts"));
      const chunks = act.split(/export async function /).slice(1);
      const fns = chunks
        .filter((c) => c.slice(c.indexOf("await ")).startsWith('await requirePermission("semafor.import");'))
        .map((c) => c.slice(0, c.indexOf("(")));
      assert.deepEqual(fns.sort(), ["commitSemaforImportAction", "deleteSemaforMonthAction", "deleteSemaforRowAction", "previewSemaforImportAction", "removeSemaforAliasAction"]);
      assert.equal((act.match(/export async function/g) ?? []).length, 5);
      // klientské komponenty nevidí cizí data
      assert.ok(!read("components/semafor/MyScoreCard.tsx").includes('"use client"'));
      // chybové hlášky bez obsahu buněk
      assert.ok(!/console\.error\([^)]*(err\.message|String\(err\)|\$\{err\}|JSON\.stringify)/.test(act), "console.error jen třída chyby");
    },
  },
  {
    name: "27. SQL tvar uložení: jsonb_to_recordset, ON CONFLICT, IS DISTINCT FROM přes všech 15 hodnot, bez transaction a DO $$",
    run: () => {
      const q = stripComments(read("lib/db/queries/semafor.ts"));
      const save = q.slice(q.indexOf("export async function saveSemaforImport"), q.indexOf("export async function deleteSemaforMonth"));
      assert.ok(save.includes("jsonb_to_recordset"));
      assert.ok(!/transaction\(/.test(q) && !/DO \$\$/.test(q));
      assert.ok(save.includes("ON CONFLICT (month, member_id) DO UPDATE"));
      assert.ok(save.includes("IS DISTINCT FROM"));
      assert.equal((save.match(/EXCLUDED\.(?:total_score|attendance_rate|attendance_score|ceu_rate|ceu_score|one_to_one_rate|one_to_one_score|referrals_given_rate|referrals_given_score|tyfcb|tyfcb_score|visitors|visitor_score|sponsors|sponsor_score)/g) ?? []).length, 30, "15 hodnot v SET a 15 v porovnání");
      assert.equal((save.match(/semafor_score\.(?:total_score|attendance_rate|attendance_score|ceu_rate|ceu_score|one_to_one_rate|one_to_one_score|referrals_given_rate|referrals_given_score|tyfcb|tyfcb_score|visitors|visitor_score|sponsors|sponsor_score)/g) ?? []).length, 15);
      assert.ok(save.includes("if (opts.rows.length === 0)") || save.includes("opts.rows.length === 0"), "prázdný seznam se do SQL neposílá");
      assert.ok(save.includes("(xmax = 0) AS inserted"));
      assert.ok(save.includes("JOIN member m ON m.id = i.member_id"));
      // jediný příkaz: jeden execute v saveSemaforImport
      assert.equal((save.match(/\.execute</g) ?? []).length, 1);
      // bonus dotaz: UNION ALL přes tři zdroje s bind parametry okna
      const bonus = q.slice(q.indexOf("export function bonusEventsSql"), q.indexOf("export async function listMyBonusEvents"));
      assert.equal((bonus.match(/UNION ALL/g) ?? []).length, 2);
      for (const t of ["mastermind_case", "burza_help", "burza_contact_use"]) assert.ok(bonus.includes(t), t);
      assert.ok(bonus.includes("c.status = 'presented'"));
      // L-1: využitý kontakt nejvýš jednou na dvojici (pomocník, příjemce) a měsíc
      assert.ok(/DISTINCT ON \(u\.helper_id, u\.recipient_id, date_trunc\('month', u\.used_on::timestamp\)\)/.test(bonus));
      assert.ok(/\$\{opts\.after\}::date/.test(bonus) && /\$\{opts\.to\}::date/.test(bonus));
      // žádný INSERT/UPDATE do zdrojů bonusu
      assert.ok(!/(INSERT INTO|UPDATE|DELETE FROM)\s+(mastermind_case|burza_help|burza_contact_use)/.test(q), "bonus se nikam nezapisuje");
      assert.ok(!/semafor_bonus|bonus_points/i.test(read("scripts/migrate-iter-041-semafor.ts")), "bonus se neukládá");
    },
  },
  {
    name: "36. navigace, nápověda a log: odkaz Semafor v menu, nápověda ze sekce 5, popisky událostí",
    run: () => {
      assert.ok(read("app/(app)/layout.tsx").includes('<NavLink href="/semafor">Semafor</NavLink>'));
      assert.ok(read("components/layout/MobileNav.tsx").includes('href="/semafor"'));
      const member = read("components/help/sections/MemberHelp.tsx");
      // iter-042 (C7): nápověda bere texty z funkcí s nastavením (konstanty jsou jen výchozí stav).
      assert.ok(member.includes("semaforMemberFaq(bonus)") && member.includes("helpAttendanceMemberUnexcused(settings.meetingTime)"));
      const mod = read("components/help/sections/ModeratorHelp.tsx");
      assert.ok(mod.includes("helpSemaforLeadership(sources)") && mod.includes("helpAttendanceManagerUnexcused(settings.meetingTime)") && mod.includes("semaforImport"));
      const help = read("app/(app)/help/page.tsx");
      assert.ok(help.includes('can(session, "semafor.view_all")') && help.includes('can(session, "semafor.import")'));
      const labels = read("app/(app)/status/EventTable.tsx");
      for (const k of SEMAFOR_EVENT_KINDS) assert.ok(labels.includes(`"${k}"`), k);
      const ops = read("lib/ops/types.ts");
      for (const k of SEMAFOR_EVENT_KINDS) assert.ok(ops.includes(`| "${k}"`), k);
      assert.ok(!stripComments(read("actions/semafor.ts")).includes("memberName"), "akce nelogují jména členů");
    },
  },
  {
    name: "37. částečná shoda jmen: Karla Nová vs Karla Nová Svobodová = partial, exact má přednost, jednoslovné ne, dva kandidáti = ambiguous",
    run: () => {
      const ms: MatchMember[] = [
        { id: M(1), name: "Karla Nová", active: true },
        { id: M(2), name: "Jan Novák", active: true },
        { id: M(3), name: "Jana Nováková", active: true },
        { id: M(4), name: "Petr", active: true },
        { id: M(5), name: "Eva Dlouhá Krátká", active: true },
        { id: M(6), name: "Eva Dlouhá Úzká", active: true },
      ];
      const r = matchNames(
        ["Karla Nová Svobodová", "Jan Novák", "Jana Nováková", "Petr Veliký", "Eva Dlouhá", "Nová", "Karla Svobodová"],
        ms,
        new Map()
      );
      assert.deepEqual(r.map((x) => x.kind), ["partial", "exact", "exact", "none", "ambiguous", "none", "none"]);
      assert.equal(r[0].memberId, M(1));
      assert.equal(r[1].memberId, M(2), "Jan Novák není partial k Jana Nováková");
      assert.equal(r[2].memberId, M(3));
      assert.deepEqual(r[4].candidates, [M(5), M(6)]);
      // opačný směr: jméno v aplikaci je delší než v souboru
      const rev = matchNames(["Karla Nová"], [{ id: M(1), name: "Karla Nová Svobodová", active: true }], new Map());
      assert.equal(rev[0].kind, "partial");
      // diakritika a velikost písmen se ignorují
      const loose = matchNames(["KARLA NOVA SVOBODOVA"], [{ id: M(1), name: "Karla Nová", active: true }], new Map());
      assert.equal(loose[0].kind, "partial");
      // partial se uloží jako alias, i když se nezměnil
      const rows = [{ index: 0, match: r[0], hasError: false }];
      const resolved = resolveMapping(rows, new Map(), new Set(ms.map((m) => m.id)));
      assert.ok(resolved.ok);
      if (resolved.ok) {
        assert.deepEqual(aliasesToWrite(["Karla Nová Svobodová"], rows, resolved.resolved), [
          { nameKey: nameKey("Karla Nová Svobodová"), memberId: M(1) },
        ]);
      }
      assert.equal(SEMAFOR_TEXTS.matchLabels.partial, "Částečná shoda jména, ověř");
    },
  },
  {
    name: "38. e-mail má přednost před jménem i aliasem, jiný e-mail nespáruje, bez e-mailu se páruje jménem",
    run: () => {
      const ms: MatchMember[] = [
        { id: M(1), name: "Marta Vzorná", active: true, email: "marta.vzorna@example.test" },
        { id: M(2), name: "Eva Vzorová", active: true, email: "eva@example.test" },
        { id: M(3), name: "Bez Mailu", active: true, email: null },
      ];
      const aliases = new Map([[nameKey("Eva Vzorová"), M(3)]]);
      const r = matchNames(
        ["Marta Vzorná Pokusná", "Eva Vzorová", "Eva Vzorová", "Marta Vzorná Testovací", "Bez Mailu", "Nikdo Neznámý"],
        ms,
        aliases,
        [" marta.vzorna@EXAMPLE.test ", "EVA@example.test", null, "jiny@example.test", "", "neznamy@example.test"]
      );
      // řádky 2 a 3 mají stejné jméno: duplicate by platilo, ale e-mail rozhoduje první
      assert.equal(r[0].kind, "email");
      assert.equal(r[0].memberId, M(1));
      assert.equal(r[1].kind, "email");
      assert.equal(r[1].memberId, M(2), "e-mail přebije alias");
      assert.equal(r[2].kind, "duplicate", "stejné jméno bez e-mailu zůstává duplicate");
      assert.equal(r[3].kind, "partial", "cizí e-mail nespáruje, rozhodne částečná shoda jména");
      assert.equal(r[3].memberId, M(1));
      assert.equal(r[4].kind, "exact");
      assert.equal(r[5].kind, "none", "neznámý e-mail a neznámé jméno");
      // e-mail, který je v souboru dvakrát, se nepoužije
      const twice = matchNames(["A B", "C D"], [{ id: M(1), name: "Xx Yy", active: true, email: "x@example.test" }], new Map(), [
        "x@example.test",
        "X@example.test",
      ]);
      assert.deepEqual(twice.map((x) => x.kind), ["none", "none"]);
      // bez čtvrtého parametru funguje jako dřív
      assert.equal(matchNames(["Eva Vzorová"], ms, new Map())[0].kind, "exact");
      // e-mail se uloží jako alias jen při ručně změněné volbě, nezměněná shoda alias nezapisuje
      const rows = [{ index: 0, match: r[0], hasError: false }];
      const resolved = resolveMapping(rows, new Map(), new Set(ms.map((m) => m.id)));
      assert.ok(resolved.ok);
      if (resolved.ok) assert.deepEqual(aliasesToWrite(["Marta Vzorná Pokusná"], rows, resolved.resolved), []);
    },
  },
  {
    name: "39. import skóre: volitelný sloupec e-mailu (Email, E-mail, Email Address) se páruje, není mezi neznámými sloupci, bez něj vše jako dřív",
    run: async () => {
      const mkRows = (head: string): Cell[][] => [
        [...HEADER, head],
        [...dataRow("Marta Vzorná Pokusná", 60), "marta.vzorna@example.test"],
        [...dataRow("Eva Vzorová", 50), ""],
      ];
      const ms: MatchMember[] = [
        { id: M(1), name: "Marta Vzorná", active: true, email: "marta.vzorna@example.test" },
        { id: M(2), name: "Eva Vzorová", active: true, email: "eva@example.test" },
      ];
      for (const head of ["Email", "E-mail", "EMAIL ADDRESS", " e-mail address "]) {
        const file = analyzeFile(await buildXlsx(mkRows(head)));
        assert.deepEqual(file.unknownColumns, [], `${head} není neznámý sloupec`);
        assert.equal(file.rows[0].email, "marta.vzorna@example.test");
        assert.equal(file.rows[1].email, null);
        const m = matchFile(file.rows, ms, new Map());
        assert.deepEqual(m.map((x) => x.kind), ["email", "exact"], head);
        assert.equal(m[0].memberId, M(1));
        // náhled: DTO nenese e-mail
        const preview = buildPreviewRows(file.rows, m);
        assert.equal(JSON.stringify(preview).includes("example.test"), false, "e-mail není v náhledu");
        assert.equal(preview[0].label, SEMAFOR_TEXTS.matchLabels.email);
      }
      // bez sloupce e-mailu: jen částečná shoda jména
      const plain = analyzeFile(await buildXlsx([HEADER, dataRow("Marta Vzorná Pokusná", 60)]));
      assert.equal(plain.rows[0].email, null);
      assert.equal(matchFile(plain.rows, ms, new Map())[0].kind, "partial");
      // dva sloupce e-mailu = zdvojená hlavička
      await expectFileError(async () => analyzeFile(await buildXlsx([[...HEADER, "Email", "E-mail"]])), "dupColumn");
      // uložení: plán se řádky spárovanými podle e-mailu a částečné shody
      const file = analyzeFile(await buildXlsx(mkRows("Email")));
      const plan = buildSavePlan(file, ms, new Map(), new Map());
      assert.ok(plan.ok);
      if (plan.ok) {
        assert.deepEqual(plan.plan.rows.map((x) => x.member_id), [M(1), M(2)]);
        assert.deepEqual(plan.plan.aliases, [], "shoda podle e-mailu ani exact se neukládá jako alias");
        assert.equal(JSON.stringify(plan.plan).includes("example.test"), false, "plán uložení neobsahuje e-mail");
      }
    },
  },
  {
    name: "40. e-mail se nedostane ven: listMembersForMatch jen na serveru, props stránky importu, DTO náhledu, události a logy bez e-mailu",
    run: () => {
      const queries = stripComments(read("lib/db/queries/semafor.ts"));
      const body = queries.slice(queries.indexOf("export async function listMembersForMatch"), queries.indexOf("export interface AliasRow"));
      assert.ok(body.includes("m.email"), "dotaz čte e-mail pro párování");
      // volající: akce a nikdo jiný (stránky a komponenty ho nevolají)
      const users: string[] = [];
      for (const dir of ["app", "components", "actions", "lib"]) {
        for (const f of walk(dir)) {
          if (!/\.(ts|tsx)$/.test(f)) continue;
          if (read(f).includes("listMembersForMatch")) users.push(f);
        }
      }
      assert.deepEqual(users.sort(), ["actions/semafor.ts", "lib/db/queries/semafor.ts"]);
      const page = stripComments(read("app/(app)/semafor/import/page.tsx"));
      assert.equal(/email/i.test(page), false, "stránka importu nezná e-mail");
      assert.equal(/email/i.test(stripComments(read("components/semafor/ImportSemaforForm.tsx"))), false, "formulář nezná e-mail");
      const act = stripComments(read("actions/semafor.ts"));
      assert.ok(act.includes("members: members.map((m) => ({ id: m.id, name: m.name, active: m.active }))"), "klient dostane jen id, jméno, aktivitu");
      assert.equal(/email/i.test(act), false, "akce e-mail nikam nepředává ani nelogují");
      const imp = stripComments(read("lib/semafor/import.ts"));
      const dto = imp.slice(imp.indexOf("export interface PreviewRowDto"), imp.indexOf("export function matchFile"));
      assert.equal(/email/i.test(dto), false, "DTO náhledu bez e-mailu");
      assert.equal(/email/i.test(stripComments(read("lib/semafor/events.ts"))), false, "události bez e-mailu");
      assert.equal(/email/i.test(stripComments(read("lib/semafor/errors.ts"))), false);
    },
  },
  {
    name: "40. iter-042 (BK2, Z3): bonus jen ze zapnutých částí; texty bonusu podle zdrojů; obě vypnuté = skóre je skóre z BNI",
    run: () => {
      const on = { ...DEFAULT_CHAPTER_SETTINGS };
      assert.deepEqual(bonusSources(on), { mastermind: true, burza: true });
      assert.deepEqual(bonusSources({ ...on, burzaEnabled: false }), { mastermind: true, burza: false });
      assert.deepEqual(bonusSources({ ...on, semaforEnabled: false }), { mastermind: false, burza: false }, "bez semaforu žádný bonus");
      assert.equal(hasBonusSource(bonusSources({ ...on, mastermindEnabled: false, burzaEnabled: false })), false);
      const events: BonusEvent[] = [
        { memberId: "m1", category: "mastermind", date: "2026-09-10" },
        { memberId: "m1", category: "burza", date: "2026-09-11" },
        { memberId: "m1", category: "burza", date: "2026-09-12" },
      ];
      assert.equal(filterBonusEvents(events, { mastermind: true, burza: true }).length, 3);
      assert.deepEqual(filterBonusEvents(events, { mastermind: false, burza: true }).map((e) => e.category), ["burza", "burza"]);
      assert.equal(filterBonusEvents(events, { mastermind: false, burza: false }).length, 0);
      const record = { month: "2026-09-01", memberId: "m1", totalScore: 66 } as ScoreRecord;
      const full = buildMonthView(record, events);
      assert.equal(full.bonus.bonus, 17);
      const burzaOnly = buildMonthView(record, filterBonusEvents(events, { mastermind: false, burza: true }));
      assert.equal(burzaOnly.bonus.bonus, 10);
      const none = buildMonthView(record, filterBonusEvents(events, { mastermind: false, burza: false }));
      assert.equal(none.bonus.bonus, 0);
      assert.equal(none.internal, none.total, "obě části vypnuté: skóre = BNI");
      assert.equal(none.internalColor, none.bniColor);
      // listBonusEvents je jediná cesta a filtruje podle nastavení
      const q = stripComments(read("lib/db/queries/semafor.ts"));
      const list = q.slice(q.indexOf("export async function listBonusEvents"), q.indexOf("export async function listMyBonusEvents"));
      assert.ok(list.includes("sources: BonusSources") && list.includes("filterBonusEvents(events, opts.sources)"));
      assert.ok(!q.includes("chapter-settings"), "dotazy semaforu nečtou nastavení samy (holý Node)");
      // každý volající předá zdroje z nastavení
      assert.ok(/sources\)/.test(stripComments(read("app/(app)/semafor/page.tsx"))));
      assert.ok(read("app/(app)/semafor/prehled/page.tsx").includes("listBonusEvents({ after: w.after, to: w.to, sources })"));
      for (const f of ["app/(app)/semafor/page.tsx", "app/(app)/semafor/prehled/page.tsx"]) {
        assert.ok(read(f).includes("bonusSources(await getChapterSettings())"), f);
      }
      // karta, legendy a úvod
      const all = { mastermind: true, burza: true };
      assert.equal(
        scoreLegendText(all),
        "Skóre je skóre z BNI plus tvůj bonus za Master mind a Burzu pomoci. Zelená od 70, žlutá od 50, červená od 30, šedá pod 30. Řádek BNI ukazuje skóre bez bonusu."
      );
      assert.ok(scoreLegendText({ mastermind: false, burza: true }).startsWith("Skóre je skóre z BNI plus tvůj bonus za Burzu pomoci. "));
      assert.equal(
        scoreLegendText({ mastermind: false, burza: false }),
        "Skóre je skóre z BNI. Zelená od 70, žlutá od 50, červená od 30, šedá pod 30."
      );
      assert.equal(
        overviewLegendText(all),
        "Skóre a Barva jsou s bonusem, BNI je skóre bez bonusu, Bonus jsou body za Master mind a Burzu pomoci. Zelená od 70, žlutá od 50, červená od 30, šedá pod 30."
      );
      assert.equal(overviewLegendText({ mastermind: false, burza: false }), "Zelená od 70, žlutá od 50, červená od 30, šedá pod 30.");
      assert.ok(overviewLegendText({ mastermind: true, burza: false }).includes("Bonus jsou body za Master mind. "));
      assert.equal(myIntroText(all), SEMAFOR_TEXTS.myIntro);
      assert.ok(!/bonus|Burz|Master/.test(myIntroText({ mastermind: false, burza: false })));
      assert.equal(
        myBonusLaterText("2026-09-30", "2026-10-01", { mastermind: true, burza: false }),
        "Master mind po 30. 9. 2026 se započtou s daty za říjen 2026."
      );
      // prahy ze COLOR_THRESHOLDS, ne natvrdo
      assert.ok(scoreLegendText(all).includes(`od ${COLOR_THRESHOLDS.green},`) && scoreLegendText(all).includes(`pod ${COLOR_THRESHOLDS.red}.`));
      const texts = stripComments(read("lib/semafor/texts.ts"));
      assert.ok(texts.includes("COLOR_THRESHOLDS"));
    },
  },
  {
    name: "41. iter-042 (K3, Z2, Z6): Hosté a Sponzoři za 6 měsíců, legenda oblastí bez „ze 100“",
    run: () => {
      assert.equal(sixMonthsText(fmtNum(3)), "3 za 6 měsíců");
      assert.equal(sixMonthsText(fmtNum(2.5)), "2,5 za 6 měsíců");
      const area = (key: "visitors" | "sponsors", value: number | null) => ({ key, score: 10, value });
      assert.equal(areaValueText(area("visitors", 3)), "3 za 6 měsíců");
      assert.equal(areaValueText(area("sponsors", 1)), "1 za 6 měsíců");
      assert.equal(areaValueText(area("sponsors", null)), null, "bez hodnoty se ukáže jen pomlčka u skóre");
      assert.equal(areaValueText({ key: "ceu", score: 5, value: 1.5 }), "1,5 za týden");
      assert.ok(AREAS_LEGEND_TEXT.includes("Body všech oblastí dohromady dávají skóre z BNI."));
      assert.ok(!/ze 100/.test(AREAS_LEGEND_TEXT), "ze 100 je jen součet");
      assert.ok(AREAS_LEGEND_TEXT.includes("Hosté: hosté, které jsi přivedl(a), za 6 měsíců."));
      assert.ok(AREAS_LEGEND_TEXT.includes("Sponzoři: noví členové, které jsi do chapteru přivedl(a), za 6 měsíců."));
      assert.ok(AREAS_LEGEND_TEXT.includes("TYFCB: obchody uzavřené díky doporučení, v Kč."));
      assert.ok(read("components/semafor/MyScoreCard.tsx").includes("AREAS_LEGEND_TEXT"));
    },
  },
  {
    name: "42. iter-042 (#8, #16, #17, #18): import, přehled a náhled importu",
    run: () => {
      assert.equal(SEMAFOR_TEXTS.importFile, "Soubor .xlsx z BNI (list se skóre členů)");
      assert.deepEqual([...SEMAFOR_TEXTS.importSteps], [
        "Vyber měsíc, za který soubor je. Soubor sám měsíc nezná.",
        "Vyber soubor .xlsx z BNI s listem skóre členů.",
        "Zobrazit náhled zatím nic neuloží.",
        "Zkontroluj párování jmen a klikni na Uložit.",
      ]);
      assert.equal(SEMAFOR_TEXTS.importSaveNote, "Členům ze souboru se hodnoty za vybraný měsíc přepíšou, ostatním zůstanou.");
      assert.equal(SEMAFOR_TEXTS.myNone, "Zatím není nahraný žádný měsíc. Data nahrává vedení z BNI.");
      assert.equal(SEMAFOR_TEXTS.myNoneImport, "Zatím není nahraný žádný měsíc. Nahraj ho v záložce Import.");
      assert.equal(SEMAFOR_TEXTS.importMonthsTitle, "Nahrané měsíce");
      assert.equal(
        SEMAFOR_TEXTS.aliasesIntro,
        "Tato jména ze souboru aplikace příště spáruje sama. Po Zapomenout párování potvrdíš znovu ručně."
      );
      assert.equal(SEMAFOR_TEXTS.importPreviewHint, "Zkontroluj řádky označené ověř nebo vyber. Přeskočený řádek se neuloží.");
      assert.equal(uploadedMonthText("2026-09-01", 12, "2026-10-03", "Člen A"), "září 2026: 12 členů, nahráno 3. 10. 2026, Člen A");
      assert.equal(uploadedMonthText("2026-09-01", 1, null, null), "září 2026: 1 člen");
      // štítky „ověř“ a „vyber“ se zvýrazní, ostatní ne
      for (const kind of ["partial", "loose", "swapped", "ambiguous", "none", "duplicate"] as const) {
        assert.equal(matchNeedsAttention(kind), true, kind);
      }
      for (const kind of ["email", "exact", "alias"] as const) assert.equal(matchNeedsAttention(kind), false, kind);
      const form = read("components/semafor/ImportSemaforForm.tsx");
      assert.ok(form.includes("text-warning") && form.includes("matchNeedsAttention(row.kind)"));
      assert.ok(form.includes("SEMAFOR_TEXTS.importSaveNote") && form.includes("SEMAFOR_TEXTS.importPreviewHint"));
      const imp = read("app/(app)/semafor/import/page.tsx");
      assert.ok(imp.includes("SEMAFOR_TEXTS.importSteps") && imp.includes("uploadedMonthText(") && imp.includes("SEMAFOR_TEXTS.aliasesIntro"));
      const overview = read("app/(app)/semafor/prehled/page.tsx");
      assert.ok(overview.includes("canImport ? SEMAFOR_TEXTS.myNoneImport : SEMAFOR_TEXTS.myNone"));
      assert.ok(overview.includes("overviewLegendText(sources)"));
    },
  },
  {
    name: "43. iter-042 (B7/5, Z10): vypnutý semafor: stránky featureOff po session, akce requireFeature za guardem, nápověda jako funkce s časem a zdroji",
    run: () => {
      for (const f of ["app/(app)/semafor/page.tsx", "app/(app)/semafor/prehled/page.tsx", "app/(app)/semafor/import/page.tsx"]) {
        const src = stripComments(read(f));
        const session = src.indexOf("await requirePageSession(");
        const off = src.indexOf('await featureOff("semafor")');
        assert.ok(session > 0 && off > session, `${f}: featureOff hned po session`);
        assert.ok(src.includes("<FeatureOff"), f);
      }
      const act = stripComments(read("actions/semafor.ts"));
      const chunks = act.split(/export async function /).slice(1);
      assert.equal(chunks.length, 5);
      for (const c of chunks) {
        const guard = c.indexOf('await requirePermission("semafor.import")');
        const feature = c.indexOf('await requireFeature("semafor")');
        assert.ok(guard >= 0 && feature > guard, `${c.slice(0, 30)}: requireFeature za guardem`);
      }
      // Z5: čas z nastavení, ne natvrdo
      assert.ok(helpAttendanceMemberUnexcused("08:15").includes("do 8:15 se neomluvíte"));
      assert.ok(helpAttendanceManagerUnexcused("08:15").includes("Jde to od 8:15"));
      assert.equal(helpAttendanceMemberUnexcused(), HELP_ATTENDANCE_MEMBER_UNEXCUSED);
      assert.equal(helpAttendanceManagerUnexcused(), HELP_ATTENDANCE_MANAGER_UNEXCUSED);
      const texts = stripComments(read("lib/semafor/texts.ts"));
      assert.ok(!/7:30|čtvrt/i.test(texts), "texts.ts bez natvrdo času a dne");
      // Z3: nápověda podle zdrojů
      assert.deepEqual(helpSemaforMember(), [...HELP_SEMAFOR_MEMBER]);
      assert.equal(helpSemaforMember().length, 5);
      const none = helpSemaforMember({ mastermind: false, burza: false });
      assert.equal(none.length, 4);
      assert.ok(!none.join(" ").includes("bonus") && !none.join(" ").includes("Master mind"));
      assert.ok(helpSemaforMember({ mastermind: true, burza: false }).join(" ").includes("7 bodů za odprezentovaný Master mind"));
      assert.ok(!helpSemaforMember({ mastermind: true, burza: false }).join(" ").includes("Burz"));
      assert.equal(helpSemaforLeadership().length, 5);
      assert.equal(helpSemaforLeadership({ mastermind: false, burza: true }).length, 4);
      assert.ok(!helpSemaforLeadership({ mastermind: false, burza: true }).map((h) => h.text).join(" ").includes("Master mind"));
      assert.ok(helpSemaforMember().every((t) => !t.includes(EM_DASH)));
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
void createHash;
void deflateRawSync;
