/**
 * Testy iter-043 (T-003a, arch 6, gate K1 až K4): označení omluvených, chybějících
 * a náhradníků v exportu seznamu schůzky. Bez DATABASE_URL, bez sítě.
 *
 * Spuštění: npx tsx scripts/test-iter-043-export-omluvy.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import {
  EXPORT_NOTES,
  GREY_STYLES,
  MEMBER_STYLES,
  addGreyStyles,
  buildRowXml,
  columnBWidth,
  escapeXml,
  memberMark,
  memberRowXml,
  needsTallRow,
  type MarkSource,
} from "../lib/attendance/export-marks";
import {
  effectiveStatus,
  summarizeSheet,
  type PresenceStatus,
} from "../lib/attendance/sheet";

const ROOT = join(__dirname, "..");
type TestCase = { name: string; run: () => void | Promise<void> };
const cases: TestCase[] = [];
const test = (name: string, run: TestCase["run"]) => cases.push({ name, run });

const row = (p: Partial<MarkSource>): MarkSource => ({
  status: null,
  excused: false,
  announcedName: null,
  substituteName: null,
  ...p,
});

async function loadStyles(): Promise<string> {
  const buf = readFileSync(join(ROOT, "lib/templates/Vystup_schuzka_template.xlsx"));
  const zip = await JSZip.loadAsync(buf);
  return zip.file("xl/styles.xml")!.async("text");
}

function xfsOf(stylesXml: string): string[] {
  const inner = stylesXml.match(/<cellXfs count="\d+">([\s\S]*?)<\/cellXfs>/)![1];
  return inner.match(/<xf\b[^>]*?\/>|<xf\b[^>]*?>[\s\S]*?<\/xf>/g) ?? [];
}

// 1. memberMark, všech 5 stavů + bez řádku
test("1a. bez řádku = beze změny", () => {
  assert.deepEqual(memberMark(undefined, "Jan Novák"), {
    kind: "present", nameCell: "Jan Novák", note: "", grey: false,
  });
});
test("1b. přítomen (zápis nebo bez omluvy) = beze změny", () => {
  assert.equal(memberMark(row({ status: "present" }), "Jan Novák").grey, false);
  assert.equal(memberMark(row({}), "Jan Novák").note, "");
});
test("1c. omluven(a): zápis absent s excused i omluva bez zápisu a bez jména", () => {
  for (const r of [row({ status: "absent", excused: true }), row({ excused: true })]) {
    assert.deepEqual(memberMark(r, "Jan Novák"), {
      kind: "excused", nameCell: "Jan Novák", note: "Omluven(a)", grey: true,
    });
  }
});
test("1d. náhradník: jméno ve tvaru 'X (za Y)', bez šedé a bez poznámky (K1)", () => {
  const m = memberMark(row({ status: "substitute", substituteName: "Petr Svoboda" }), "Jan Novák");
  assert.deepEqual(m, {
    kind: "substitute", nameCell: "Petr Svoboda (za Jan Novák)", note: "", grey: false,
  });
  const ann = memberMark(row({ excused: true, announcedName: " Eva Dvořáková " }), "Jan Novák");
  assert.equal(ann.nameCell, "Eva Dvořáková (za Jan Novák)");
  assert.equal(ann.grey, false);
});
test("1e. chybí bez omluvy: poznámka jednotně Omluven(a), kind zůstává (Tom 28. 10.)", () => {
  assert.deepEqual(memberMark(row({ status: "unexcused" }), "Jan Novák"), {
    kind: "unexcused", nameCell: "Jan Novák", note: "Omluven(a)", grey: true,
  });
});
test("1f. chybí: absent bez omluvy: poznámka jednotně Omluven(a), kind zůstává (Tom 28. 10.)", () => {
  assert.deepEqual(memberMark(row({ status: "absent" }), "Jan Novák"), {
    kind: "missing", nameCell: "Jan Novák", note: "Omluven(a)", grey: true,
  });
});
test("1g. texty: jen Omluven(a), v exportu není Chybí ani Chybí bez omluvy", () => {
  assert.deepEqual({ ...EXPORT_NOTES }, { excused: "Omluven(a)" });
  const src = readFileSync(join(__dirname, "..", "lib/attendance/export-marks.ts"), "utf8");
  assert.ok(!/["`]Chybí/.test(src), "žádný řetězec Chybí v export-marks.ts");
  const row = (p: Partial<MarkSource>) =>
    memberMark({ status: null, excused: false, announcedName: null, substituteName: null, ...p }, "Jan");
  for (const m of [row({ status: "absent" }), row({ status: "unexcused" }), row({ excused: true })]) {
    assert.equal(m.note, "Omluven(a)");
    assert.equal(m.grey, true);
  }
});

// 2. přednost zápisu
test("2. zápis správce má přednost před ohlášením", () => {
  assert.equal(memberMark(row({ status: "present", excused: true, announcedName: "Eva" }), "Jan").grey, false);
  assert.equal(memberMark(row({ status: "present", excused: true, announcedName: "Eva" }), "Jan").nameCell, "Jan");
  const a = memberMark(row({ status: "absent", excused: true, announcedName: "Eva" }), "Jan");
  assert.equal(a.kind, "excused");
  assert.equal(a.nameCell, "Jan");
  const s = memberMark(row({ status: "substitute", excused: true, announcedName: "Eva", substituteName: "Petr" }), "Jan");
  assert.equal(s.nameCell, "Petr (za Jan)");
  assert.equal(memberMark(row({ status: "unexcused", excused: true }), "Jan").kind, "unexcused");
});

// 3. effectiveStatus = dnešní pravidlo summarizeSheet
test("3. effectiveStatus a summarizeSheet shodné s referenčním pravidlem", () => {
  const statuses: (PresenceStatus | null)[] = [null, "present", "substitute", "absent", "unexcused"];
  const all: { status: PresenceStatus | null; excused: boolean; announcedName: string | null }[] = [];
  for (const status of statuses) for (const excused of [false, true]) for (const announcedName of [null, "Eva"]) {
    all.push({ status, excused, announcedName });
  }
  for (const r of all) {
    const ref: PresenceStatus =
      r.status ?? (r.excused ? (r.announcedName ? "substitute" : "absent") : "present");
    assert.equal(effectiveStatus(r), ref, JSON.stringify(r));
  }
  let present = 0, substitutes = 0, excused = 0;
  for (const r of all) {
    const st = effectiveStatus(r);
    if (st === "present" || st === "substitute") { present++; if (st === "substitute") substitutes++; }
    else if (r.excused && st !== "unexcused") excused++;
  }
  assert.deepEqual(summarizeSheet(all), {
    total: all.length, present, substitutes, missing: all.length - present, excused,
  });
});

// 4. styly na skutečné šabloně
test("4a. addGreyStyles: fills 4, cellXfs 53, 7 klonů s fillId 3 a stejným rámečkem", async () => {
  const src = await loadStyles();
  const out = addGreyStyles(src);
  assert.match(out, /<fills count="4">/);
  assert.equal((out.match(/<fill>/g) ?? []).length, 4);
  assert.match(out, /<fgColor rgb="FFD9D9D9"\/>/);
  assert.match(out, /<cellXfs count="53">/);
  const before = xfsOf(src);
  const after = xfsOf(out);
  assert.equal(before.length, 46);
  assert.equal(after.length, 53);
  assert.deepEqual(after.slice(0, 46), before);
  [13, 14, 15, 16, 17, 18, 19].forEach((srcIdx, k) => {
    const clone = after[46 + k];
    const orig = before[srcIdx];
    assert.match(clone, /fillId="3"/);
    assert.match(clone, /applyFill="1"/);
    assert.equal(clone.match(/borderId="\d+"/)![0], orig.match(/borderId="\d+"/)![0]);
    assert.equal(clone.match(/<alignment[^>]*\/>/)![0], orig.match(/<alignment[^>]*\/>/)![0]);
    assert.equal(clone.match(/fontId="\d+"/)![0], orig.match(/fontId="\d+"/)![0]);
  });
});
test("4b. indexy GREY_STYLES odpovídají klonům 13 až 19", async () => {
  assert.deepEqual({ ...GREY_STYLES.first }, { b: 46, c: 47, d: 48, e: 49 });
  assert.deepEqual({ ...GREY_STYLES.mid }, { b: 50, c: 51, d: 52, e: 49 });
  const after = xfsOf(addGreyStyles(await loadStyles()));
  const border = (i: number) => after[i].match(/borderId="\d+"/)![0];
  assert.equal(border(GREY_STYLES.first.b), border(MEMBER_STYLES.first.b));
  assert.equal(border(GREY_STYLES.first.d), border(MEMBER_STYLES.first.d));
  assert.equal(border(GREY_STYLES.mid.c), border(MEMBER_STYLES.mid.c));
  assert.equal(border(GREY_STYLES.mid.e), border(MEMBER_STYLES.mid.e));
});
test("4c. šedá jen u šedých klonů, původní styly beze změny", async () => {
  const after = xfsOf(addGreyStyles(await loadStyles()));
  for (let i = 0; i < 46; i++) assert.ok(!/fillId="3"/.test(after[i]), `xf ${i}`);
  for (let i = 46; i < 53; i++) assert.match(after[i], /fillId="3"/);
});
test("4d. chybějící kotva nebo změněný počet = chyba, ne tiché přeskočení", async () => {
  const src = await loadStyles();
  assert.throws(() => addGreyStyles(src.replace("<fills count", "<fillz count")));
  assert.throws(() => addGreyStyles(src.replace('<cellXfs count="46">', '<cellXfs count="47">')));
  assert.throws(() => addGreyStyles("<styleSheet/>"));
});

// 5. řádek, escaping, výška
const MEMBER = { company: "Firma & Syn", obor: "Účetnictví <daně>" };
test("5a. escaping & < > \" ' ve jménu člena, náhradníka i poznámce", () => {
  const nasty = `A&B <x> "q" 'z'`;
  const mark = memberMark(row({ status: "substitute", substituteName: nasty }), nasty);
  const xml = memberRowXml(5, MEMBER, mark, false, 50);
  const texts = [...xml.matchAll(/<t>([^<]*)<\/t>/g)].map((m) => m[1]);
  assert.ok(texts.includes(escapeXml(`${nasty} (za ${nasty})`)));
  assert.ok(texts.includes("Firma &amp; Syn"));
  for (const t of texts) assert.ok(!/&(?!amp;|lt;|gt;|quot;|apos;)/.test(t), t);
  const noteXml = buildRowXml(6, { b: "x", c: "", d: "", e: `a&b<c>` }, MEMBER_STYLES.mid, false);
  assert.ok(noteXml.includes("<t>a&amp;b&lt;c&gt;</t>"));
});
test("5b. inlineStr jen u neprázdných buněk, prázdná poznámka beze změny", () => {
  const xml = memberRowXml(5, { company: null, obor: null }, memberMark(undefined, "Jan"), true, 50);
  assert.equal((xml.match(/t="inlineStr"/g) ?? []).length, 1);
  assert.ok(xml.includes('<c r="E5" s="16"/>'));
  assert.ok(xml.includes('<c r="A5" s="9"/>'));
  assert.ok(xml.startsWith('<row r="5" ht="19.5" customHeight="1">'));
});
test("5c. šedé indexy jen pro grey; první řádek 46 až 49, další 50 až 52 a 49", () => {
  const grey = memberMark(row({ status: "unexcused" }), "Jan");
  const first = memberRowXml(5, MEMBER, grey, true, 50);
  assert.ok(first.includes('<c r="B5" s="46"') && first.includes('<c r="C5" s="47"'));
  assert.ok(first.includes('<c r="D5" s="48"') && first.includes('<c r="E5" s="49"'));
  const mid = memberRowXml(6, MEMBER, grey, false, 50);
  assert.ok(mid.includes('<c r="B6" s="50"') && mid.includes('<c r="C6" s="51"'));
  assert.ok(mid.includes('<c r="D6" s="52"') && mid.includes('<c r="E6" s="49"'));
  const plain = memberRowXml(7, MEMBER, memberMark(undefined, "Jan"), true, 50);
  assert.ok(plain.includes('<c r="B7" s="13"') && plain.includes('<c r="E7" s="16"'));
  assert.ok(!/s="(4[6-9]|5[0-2])"/.test(plain));
});
test("5d. šířka B se stropem 50 a dvojitá výška u dlouhého jména (K4)", () => {
  assert.equal(columnBWidth(["Jan"]), 12);
  assert.ok(Math.abs(columnBWidth(["x".repeat(20)]) - 28.8) < 1e-9);
  assert.equal(columnBWidth(["x".repeat(80)]), 50);
  assert.equal(needsTallRow("x".repeat(34), 50), false);
  assert.equal(needsTallRow("x".repeat(36), 50), true);
  const long = "Petr Svoboda-Novotný (za Jan Novák-Dvořák Starší)";
  const xml = memberRowXml(5, MEMBER, memberMark(undefined, long), false, 50);
  assert.ok(xml.startsWith('<row r="5" ht="39" customHeight="1">'));
});

// 6. jedno místo pravdy
test("6. route bere stav jen přes listSheetRows, bez přímého SQL na docházku", () => {
  const src = readFileSync(join(ROOT, "app/api/meetings/[id]/export-list/route.ts"), "utf8");
  assert.match(src, /import \{ listSheetRows \} from "@\/lib\/db\/queries\/attendance"/);
  assert.ok(!/member_absence|attendance_record|memberAbsence|attendanceRecord/.test(src));
  const marks = readFileSync(join(ROOT, "lib/attendance/export-marks.ts"), "utf8");
  assert.ok(!/from "(@\/lib\/db|drizzle-orm|next)/.test(marks));
  const imports = marks.match(/from "[^"]+"/g) ?? [];
  assert.deepEqual(imports, ['from "@/lib/attendance/sheet"']);
});
test("7. texty bez em dash", () => {
  for (const f of ["lib/attendance/export-marks.ts", "scripts/test-iter-043-export-omluvy.ts"]) {
    assert.ok(!readFileSync(join(ROOT, f), "utf8").includes(String.fromCharCode(0x2014)), f);
  }
});

async function main() {
  let failed = 0;
  for (const c of cases) {
    try {
      await c.run();
      console.log(`ok   ${c.name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${c.name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`\n${cases.length - failed}/${cases.length}`);
  if (failed) process.exit(1);
}
main();
