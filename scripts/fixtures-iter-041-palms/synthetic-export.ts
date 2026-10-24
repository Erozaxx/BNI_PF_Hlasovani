/**
 * iter-041 C4: generátor SYNTETICKÉHO exportu PALMS (SpreadsheetML 2003) pro
 * testy a QA. Jména a data jsou smyšlená, žádný soubor se skutečnými daty.
 *
 * Napodobuje strukturu skutečných exportů: list `Report`, parametry `Chapter`,
 * `From:`, `To:` v různých sloupcích podle varianty, hlavička `First Name`,
 * `Last Name` a týdny („dub 23“) s prázdnými sloupci ze sloučených buněk,
 * buňky s `ss:Index` (prázdné se vynechávají).
 *
 * QA: `npx tsx scripts/fixtures-iter-041-palms/synthetic-export.ts /tmp/qa/syn.xls`
 * (výstup MUSÍ ležet mimo repozitář).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

export interface SyntheticRow {
  first: string;
  last: string;
  /** Kód pro každý týden, `""` = prázdná buňka (do XML se nezapíše). */
  codes: string[];
}

export interface SyntheticSpec {
  /** ISO s časem, např. `2026-04-23T00:00:00.000`. */
  from: string;
  /** `null` = parametr To se do souboru nezapíše. */
  to: string | null;
  /** Popisky týdnů, např. `dub 23`. */
  weeks: string[];
  rows: SyntheticRow[];
  /** Varianta rozložení parametrů (jiné sloupce). */
  layout?: "a" | "b";
  /** Kolik sloupců zabírá jeden týden v hlavičce (sloučené buňky), výchozí 2. */
  weekWidth?: number;
  /** UTF-8 BOM na začátku. */
  bom?: boolean;
  /** Název listu, výchozí `Report`. */
  sheetName?: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function cell(text: string, index?: number, mergeAcross?: number): string {
  const attrs =
    (index !== undefined ? ` ss:Index="${index}"` : "") +
    (mergeAcross !== undefined && mergeAcross > 0 ? ` ss:MergeAcross="${mergeAcross}"` : "");
  return `<Cell${attrs}><Data ss:Type="String">${esc(text)}</Data></Cell>`;
}

export function buildSyntheticExport(spec: SyntheticSpec): string {
  const width = spec.weekWidth ?? 2;
  const layout = spec.layout ?? "a";
  const firstWeekCol = 4;
  const colOfWeek = (i: number) => firstWeekCol + i * width;
  const rows: string[] = [];

  // Parametry v jiných sloupcích podle varianty.
  if (layout === "a") {
    rows.push(`<Row>${cell("Chapter", 1)}${cell("Syntetický chapter", 3)}</Row>`);
    rows.push(`<Row>${cell("From:", 1)}${cell(spec.from, 3)}</Row>`);
    if (spec.to !== null) rows.push(`<Row>${cell("To:", 1)}${cell(spec.to, 3)}</Row>`);
  } else {
    rows.push(`<Row>${cell("Chapter", 2)}${cell("Syntetický chapter", 5)}</Row>`);
    rows.push(`<Row>${cell("Report", 1)}${cell("To:", 4, 1)}${spec.to !== null ? cell(spec.to, 7) : ""}</Row>`);
    rows.push(`<Row>${cell("From:", 4, 1)}${cell(spec.from, 7)}</Row>`);
  }
  rows.push(`<Row/>`);

  // Hlavička: sloučené buňky týdnů a další buňky přes ss:Index.
  const header: string[] = [cell("First Name"), cell("Last Name")];
  spec.weeks.forEach((w, i) => header.push(cell(w, colOfWeek(i), width - 1)));
  rows.push(`<Row>${header.join("")}</Row>`);

  for (const r of spec.rows) {
    const cells: string[] = [cell(r.first), cell(r.last)];
    r.codes.forEach((code, i) => {
      if (code !== "") cells.push(cell(code, colOfWeek(i)));
    });
    rows.push(`<Row>${cells.join("")}</Row>`);
  }

  const xml =
    `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
    `xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
    `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n` +
    `<Worksheet ss:Name="${esc(spec.sheetName ?? "Report")}"><Table>\n${rows.join("\n")}\n</Table></Worksheet>\n</Workbook>\n`;
  return (spec.bom ? "﻿" : "") + xml;
}

/** Týdenní popisky (čtvrtky) od data: `weekLabels("2026-04-23", 3)` = `["dub 23", "dub 30", "kvě 07"]`. */
export function weekLabels(startIso: string, count: number): string[] {
  const abbr = ["led", "úno", "bře", "dub", "kvě", "čer", "čec", "srp", "zář", "říj", "lis", "pro"];
  const [y, m, d] = startIso.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(Date.UTC(y, m - 1, d + 7 * i));
    out.push(`${abbr[t.getUTCMonth()]} ${String(t.getUTCDate()).padStart(2, "0")}`);
  }
  return out;
}

/** Vzorový soubor: 26 týdnů od 2026-04-23, smyšlení členové, všechny kódy. */
export function demoSpec(): SyntheticSpec {
  const weeks = weekLabels("2026-04-23", 26);
  const pattern = ["P", "P", "L", "A", "P", "S", "M", "", "P", "X"];
  const names = [
    ["Jan", "Testovací"],
    ["Eva", "Vzorová"],
    ["Petr", "Fiktivní"],
    ["Marie", "Zkušební"],
  ];
  return {
    from: "2026-04-23T00:00:00.000",
    to: "2026-10-15T00:00:00.000",
    weeks,
    rows: names.map(([first, last], r) => ({
      first,
      last,
      codes: weeks.map((_, i) => pattern[(i + r * 3) % pattern.length]),
    })),
  };
}

function main(): void {
  const out = process.argv[2];
  if (!out) {
    console.error("Použití: npx tsx scripts/fixtures-iter-041-palms/synthetic-export.ts <výstup mimo repo>");
    process.exit(1);
  }
  const resolved = path.resolve(out);
  const rel = path.relative(process.cwd(), resolved);
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    console.error("Výstup musí ležet mimo repozitář.");
    process.exit(1);
  }
  writeFileSync(resolved, buildSyntheticExport(demoSpec()), "utf8");
  console.log(`Zapsáno: ${resolved}`);
}

if (path.basename(process.argv[1] ?? "") === "synthetic-export.ts") main();
