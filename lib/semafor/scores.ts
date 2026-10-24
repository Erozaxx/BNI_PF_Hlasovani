/**
 * iter-041 (arch 5.5, 4.2): mapování hlaviček listu Scores a převod hodnot.
 *
 * Čistý modul. Sloupce se hledají podle textu hlavičky (pořadí nehraje roli),
 * aliasy jsou bod rozšíření pro jiný formát od regionu. Čísla projdou jen
 * v přísném tvaru (`^-?\d+([.,]\d+)?$` po odstranění mezer), `%` jen u
 * `Attendance Rate`. Exponent, `NaN`, `Infinity` a záporná čísla v textu jsou
 * chyba řádku. Rozsahy odpovídají CHECK v `semafor_score`.
 *
 * Chyby řádku nikdy nenesou obsah buněk, jen kód a název sloupce z pevné
 * tabulky.
 */
import { SemaforFileError } from "@/lib/semafor/errors";
import type { SheetRow } from "@/lib/semafor/xlsx";

/** Veřejný údaj: název chapteru v souboru (kontrola, že soubor není cizí). */
export const CHAPTER_NAME = "Pilsner Fountains";

export const VALUE_KEYS = [
  "totalScore",
  "attendanceRate",
  "attendanceScore",
  "ceuRate",
  "ceuScore",
  "oneToOneRate",
  "oneToOneScore",
  "referralsGivenRate",
  "referralsGivenScore",
  "tyfcb",
  "tyfcbScore",
  "visitors",
  "visitorScore",
  "sponsors",
  "sponsorScore",
] as const;

export type ValueKey = (typeof VALUE_KEYS)[number];
export type ScoreValues = Record<ValueKey, number | null>;

interface ColumnSpec {
  /** Název sloupce do hlášek. */
  label: string;
  aliases: string[];
  min: number;
  max: number;
  /** Počet desetinných míst v DB (zaokrouhlení v TS, ať `IS DISTINCT FROM` nelže). */
  scale: number;
  percent?: boolean;
}

const SCORE = { min: 0, max: 100, scale: 2 } as const;
const RATE_WEEK = { min: 0, max: 1000, scale: 3 } as const;
const COUNT = { min: 0, max: 1_000_000, scale: 3 } as const;

export const COLUMN_SPECS: Record<ValueKey, ColumnSpec> = {
  totalScore: { label: "Total Score", aliases: ["total score"], ...SCORE },
  attendanceRate: {
    label: "Attendance Rate",
    aliases: ["attendance rate"],
    min: 0,
    max: 1,
    scale: 4,
    percent: true,
  },
  attendanceScore: { label: "Attendance Score", aliases: ["attendance score"], ...SCORE },
  ceuRate: { label: "CEU Rate", aliases: ["ceu rate"], ...RATE_WEEK },
  ceuScore: { label: "CEU Score", aliases: ["ceu score"], ...SCORE },
  oneToOneRate: {
    label: "121 Rate",
    aliases: ["121 rate", "1-2-1 rate", "one to one rate"],
    ...RATE_WEEK,
  },
  oneToOneScore: {
    label: "121 Score",
    aliases: ["121 score", "1-2-1 score", "one to one score"],
    ...SCORE,
  },
  referralsGivenRate: {
    label: "Referrals Given Rate",
    aliases: ["referrals given rate"],
    ...RATE_WEEK,
  },
  referralsGivenScore: {
    label: "Referrals Given Score",
    aliases: ["referrals given score"],
    ...SCORE,
  },
  tyfcb: { label: "TYFCB", aliases: ["tyfcb"], min: 0, max: 999_999_999_999, scale: 2 },
  tyfcbScore: { label: "TYFCB Score", aliases: ["tyfcb score"], ...SCORE },
  visitors: { label: "Visitors", aliases: ["visitors"], ...COUNT },
  visitorScore: {
    label: "Visitor Score",
    aliases: ["visitor score", "visitors score"],
    ...SCORE,
  },
  sponsors: { label: "Sponsors", aliases: ["sponsors"], ...COUNT },
  sponsorScore: {
    label: "Sponsor Score",
    aliases: ["sponsor score", "sponsors score"],
    ...SCORE,
  },
};

const IGNORED_HEADERS = new Set(["rank", "region"]);

/** Normalizace hlavičky: trim, mezery (i nezlomitelné) na jednu, malá písmena. */
export function normalizeHeader(s: string): string {
  return s.replace(/[\s  ]+/g, " ").trim().toLowerCase();
}

const ALIAS_TO_KEY: ReadonlyMap<string, ValueKey | "name" | "chapter"> = (() => {
  const map = new Map<string, ValueKey | "name" | "chapter">();
  map.set("name", "name");
  map.set("chapter", "chapter");
  for (const key of VALUE_KEYS) {
    for (const alias of COLUMN_SPECS[key].aliases) map.set(alias, key);
  }
  return map;
})();

const REQUIRED_KEYS: readonly (ValueKey | "name")[] = ["name", ...VALUE_KEYS];

function keyLabel(key: ValueKey | "name"): string {
  return key === "name" ? "Name" : COLUMN_SPECS[key].label;
}

export type RowErrorCode =
  | "noName"
  | "missingValue"
  | "badValue"
  | "otherChapter";

export interface RowError {
  code: RowErrorCode;
  /** Název sloupce z pevné tabulky (`badValue`, `missingValue`). */
  column?: string;
}

export interface ParsedScoreRow {
  /** Číslo řádku v listu. */
  r: number;
  /** Jméno ze souboru po ořezu (může být prázdné u `noName`). */
  name: string;
  values: ScoreValues | null;
  error: RowError | null;
}

export interface ParsedScores {
  rows: ParsedScoreRow[];
  /** Hlavičky, které se neimportují (zkrácené, bez řídicích znaků). */
  unknownColumns: string[];
}

const NUMBER_RE = /^-?\d+([.,]\d+)?$/;
const PERCENT_RE = /^(\d+([.,]\d+)?)%$/;

function roundTo(n: number, scale: number): number {
  const f = 10 ** scale;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
}

export type NumberParse =
  | { ok: true; value: number | null }
  | { ok: false };

/** Přísný převod textu buňky na číslo. Prázdná buňka je `value: null`. */
export function parseCellNumber(raw: string, spec: ColumnSpec): NumberParse {
  const t = raw.replace(/[\s  ]+/g, "");
  if (t.length === 0) return { ok: true, value: null };
  let n: number;
  const pct = spec.percent ? PERCENT_RE.exec(t) : null;
  if (pct) {
    n = Number(pct[1].replace(",", ".")) / 100;
  } else if (NUMBER_RE.test(t)) {
    n = Number(t.replace(",", "."));
  } else {
    return { ok: false };
  }
  if (!Number.isFinite(n)) return { ok: false };
  const rounded = roundTo(n, spec.scale);
  if (rounded < spec.min || rounded > spec.max) return { ok: false };
  return { ok: true, value: rounded };
}

function cleanLabel(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "").slice(0, 60);
}

/**
 * Převede řádky listu na hodnoty. Souborové chyby (chybějící nebo zdvojené
 * sloupce, soubor cizího chapteru) vyhazuje jako `SemaforFileError`.
 */
export function parseScoresSheet(sheet: readonly SheetRow[]): ParsedScores {
  if (sheet.length === 0) throw new SemaforFileError("columns", { list: REQUIRED_KEYS.map(keyLabel) });
  const header = sheet[0];

  const colOf = new Map<ValueKey | "name" | "chapter", number>();
  const unknown: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < header.cells.length; i++) {
    const raw = header.cells[i] ?? "";
    const h = normalizeHeader(raw);
    if (h.length === 0) continue;
    if (IGNORED_HEADERS.has(h)) continue;
    const key = ALIAS_TO_KEY.get(h);
    if (!key) {
      unknown.push(cleanLabel(raw));
      continue;
    }
    if (seen.has(key)) {
      throw new SemaforFileError("dupColumn", { list: [cleanLabel(raw)] });
    }
    seen.add(key);
    colOf.set(key, i);
  }

  const missing = REQUIRED_KEYS.filter((k) => !colOf.has(k));
  if (missing.length > 0) {
    throw new SemaforFileError("columns", { list: missing.map(keyLabel) });
  }

  const chapterCol = colOf.get("chapter");
  const nameCol = colOf.get("name")!;
  const expectedChapter = normalizeHeader(CHAPTER_NAME);
  const rows: ParsedScoreRow[] = [];
  let withChapter = 0;
  let otherChapter = 0;

  for (let ri = 1; ri < sheet.length; ri++) {
    const row = sheet[ri];
    const name = (row.cells[nameCol] ?? "").replace(/[\s  ]+/g, " ").trim();
    const anyValue = VALUE_KEYS.some((k) => (row.cells[colOf.get(k)!] ?? "").trim().length > 0);
    if (name.length === 0 && !anyValue) continue;

    if (name.length === 0) {
      rows.push({ r: row.r, name: "", values: null, error: { code: "noName" } });
      continue;
    }
    // Vzorec nebo jiný text začínající operátorem není jméno.
    if (/^[=+\-@]/.test(name)) {
      rows.push({ r: row.r, name: "", values: null, error: { code: "noName" } });
      continue;
    }

    if (chapterCol !== undefined) {
      const ch = normalizeHeader(row.cells[chapterCol] ?? "");
      if (ch.length > 0) {
        withChapter++;
        if (ch !== expectedChapter) {
          otherChapter++;
          rows.push({ r: row.r, name, values: null, error: { code: "otherChapter" } });
          continue;
        }
      }
    }

    const values = {} as ScoreValues;
    let error: RowError | null = null;
    for (const key of VALUE_KEYS) {
      const spec = COLUMN_SPECS[key];
      const parsed = parseCellNumber(row.cells[colOf.get(key)!] ?? "", spec);
      if (!parsed.ok) {
        error = { code: "badValue", column: spec.label };
        break;
      }
      if (parsed.value === null && key === "totalScore") {
        error = { code: "missingValue", column: spec.label };
        break;
      }
      values[key] = parsed.value;
    }
    rows.push({ r: row.r, name, values: error ? null : values, error });
  }

  if (withChapter > 0 && otherChapter === withChapter) {
    throw new SemaforFileError("allOtherChapter");
  }
  return { rows, unknownColumns: unknown };
}
