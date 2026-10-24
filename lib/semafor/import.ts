/**
 * iter-041 (arch 5.1, 5.6 až 5.8, gate Z4): rozbor nahraného souboru a plán
 * uložení. Čistý modul, bez DB. Akce `actions/semafor.ts` do něj posílá členy
 * a aliasy načtené z DB, výsledek (`SavePlan`) předá dotazu `saveSemaforImport`.
 *
 * Klientovi se nevěří nic kromě volby člena: při uložení se soubor zpracuje
 * znovu ze surových bajtů a hash musí sedět s hashem z náhledu.
 */
import { createHash } from "node:crypto";
import { SemaforFileError } from "@/lib/semafor/errors";
import { readFirstMatchingSheet } from "@/lib/semafor/xlsx";
import { hasScoreColumns, parseScoresSheet, VALUE_KEYS, type ParsedScoreRow, type ScoreValues } from "@/lib/semafor/scores";
import {
  aliasesToWrite,
  matchNames,
  nameKey,
  resolveMapping,
  type AliasToWrite,
  type MappingRow,
  type MatchKind,
  type MatchMember,
  type NameMatch,
  type RowDecision,
} from "@/lib/semafor/names";
import { colorFromTotal, type SemaforColor } from "@/lib/semafor/color";
import { SEMAFOR_TEXTS, errTwiceText, rowErrorMessage } from "@/lib/semafor/texts";

/** Přednostní název listu; skutečný list se vybírá podle hlavičky. */
export const SHEET_NAME = "Scores";

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface AnalyzedFile {
  sha256: string;
  unknownColumns: string[];
  rows: ParsedScoreRow[];
}

/** Zpracuje soubor od uživatele. Chyby souboru jsou `SemaforFileError`. */
export function analyzeFile(bytes: Uint8Array): AnalyzedFile {
  // List se hledá podle obsahu (hlavička); "Scores" má přednost.
  const sheet = readFirstMatchingSheet(bytes, SHEET_NAME, hasScoreColumns);
  const parsed = parseScoresSheet(sheet.rows);
  return { sha256: sha256Hex(bytes), unknownColumns: parsed.unknownColumns, rows: parsed.rows };
}

export interface PreviewRowDto {
  index: number;
  r: number;
  name: string;
  error: string | null;
  kind: MatchKind;
  label: string;
  suggested: string | null;
  candidates: string[];
  total: number | null;
  /** Oficiální barva BNI z Total Score. */
  color: SemaforColor | null;
}

export function matchFile(
  rows: readonly ParsedScoreRow[],
  members: readonly MatchMember[],
  aliases: ReadonlyMap<string, string>
): NameMatch[] {
  return matchNames(
    rows.map((r) => r.name),
    members,
    aliases,
    rows.map((r) => r.email)
  );
}

export function buildPreviewRows(rows: readonly ParsedScoreRow[], matches: readonly NameMatch[]): PreviewRowDto[] {
  return rows.map((row, index) => {
    const match = matches[index];
    const total = row.values?.totalScore ?? null;
    return {
      index,
      r: row.r,
      name: row.name,
      error: row.error ? rowErrorMessage(row.error, row.r) : null,
      kind: match.kind,
      label: SEMAFOR_TEXTS.matchLabels[match.kind],
      suggested: row.error ? null : match.memberId,
      candidates: match.candidates,
      total,
      color: total === null ? null : colorFromTotal(total),
    };
  });
}

export function mappingRows(rows: readonly ParsedScoreRow[], matches: readonly NameMatch[]): MappingRow[] {
  return rows.map((row, index) => ({ index, match: matches[index], hasError: row.error !== null }));
}

export interface SaveRow {
  member_id: string;
  total_score: number;
  attendance_rate: number | null;
  attendance_score: number | null;
  ceu_rate: number | null;
  ceu_score: number | null;
  one_to_one_rate: number | null;
  one_to_one_score: number | null;
  referrals_given_rate: number | null;
  referrals_given_score: number | null;
  tyfcb: number | null;
  tyfcb_score: number | null;
  visitors: number | null;
  visitor_score: number | null;
  sponsors: number | null;
  sponsor_score: number | null;
}

const SNAKE: Record<(typeof VALUE_KEYS)[number], Exclude<keyof SaveRow, "member_id">> = {
  totalScore: "total_score",
  attendanceRate: "attendance_rate",
  attendanceScore: "attendance_score",
  ceuRate: "ceu_rate",
  ceuScore: "ceu_score",
  oneToOneRate: "one_to_one_rate",
  oneToOneScore: "one_to_one_score",
  referralsGivenRate: "referrals_given_rate",
  referralsGivenScore: "referrals_given_score",
  tyfcb: "tyfcb",
  tyfcbScore: "tyfcb_score",
  visitors: "visitors",
  visitorScore: "visitor_score",
  sponsors: "sponsors",
  sponsorScore: "sponsor_score",
};

export function toSaveRow(memberId: string, v: ScoreValues): SaveRow {
  const out = { member_id: memberId } as SaveRow;
  for (const key of VALUE_KEYS) (out as unknown as Record<string, number | null>)[SNAKE[key]] = v[key];
  return out;
}

export type PlanError =
  | { code: "changed" }
  | { code: "undecided" | "unknownMember" | "errorRowSelected" | "twice"; index: number; message: string }
  | { code: "empty"; message: string };

export interface SavePlan {
  rows: SaveRow[];
  aliases: AliasToWrite[];
  /** Spárované členy (id) pro výpočet „zůstane z dřívějška“ a „chybí“. */
  memberIds: string[];
}

export type PlanResult = { ok: true; plan: SavePlan } | { ok: false; error: PlanError };

/**
 * Z rozboru souboru, členů, aliasů a rozhodnutí vedení udělá plán uložení.
 * `decisions` klíčuje index řádku, hodnota je id člena nebo `skip`.
 */
export function buildSavePlan(
  file: AnalyzedFile,
  members: readonly MatchMember[],
  aliases: ReadonlyMap<string, string>,
  decisions: ReadonlyMap<number, RowDecision>
): PlanResult {
  const matches = matchFile(file.rows, members, aliases);
  const mapped = mappingRows(file.rows, matches);
  const resolved = resolveMapping(mapped, decisions, new Set(members.map((m) => m.id)));
  if (!resolved.ok) {
    const index = resolved.index ?? 0;
    const r = file.rows[index]?.r ?? index + 2;
    const text =
      resolved.code === "undecided"
        ? SEMAFOR_TEXTS.errUndecided
        : resolved.code === "unknownMember"
          ? SEMAFOR_TEXTS.errUnknownMember
          : resolved.code === "errorRowSelected"
            ? SEMAFOR_TEXTS.errErrorRowSelected
            : "";
    return {
      ok: false,
      error: {
        code: resolved.code,
        index,
        message:
          resolved.code === "twice"
            ? errTwiceText(members.find((m) => m.id === resolved.memberId)?.name ?? "")
            : text.replace("{r}", String(r)),
      },
    };
  }
  const rows: SaveRow[] = [];
  for (const [index, memberId] of resolved.resolved) {
    const values = file.rows[index].values;
    if (!values) continue;
    rows.push(toSaveRow(memberId, values));
  }
  if (rows.length === 0) {
    return { ok: false, error: { code: "empty", message: SEMAFOR_TEXTS.errNothingToSave } };
  }
  return {
    ok: true,
    plan: {
      rows,
      aliases: aliasesToWrite(
        file.rows.map((r) => r.name),
        mapped,
        resolved.resolved
      ),
      memberIds: rows.map((r) => r.member_id),
    },
  };
}

/** Stejné jméno ze souboru v klíči aliasu (jen pro testy a UI). */
export { nameKey };

export function ensureNotChanged(previewHash: string, actualHash: string): void {
  if (!/^[0-9a-f]{64}$/.test(previewHash) || previewHash !== actualHash) {
    throw new SemaforFileError("changed");
  }
}
