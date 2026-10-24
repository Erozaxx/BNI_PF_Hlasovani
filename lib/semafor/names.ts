/**
 * iter-041 (arch 5.6): normalizace a párování jmen ze souboru na členy.
 *
 * Čistý modul. Sdílí ho import semaforu i skript PALMS.
 *
 * Pořadí pro každé jméno (kandidáti = všichni členové, i neaktivní):
 *   1. alias (`semafor_name_alias`) -> člen,
 *   2. právě jeden člen se shodným `nameKey` -> `exact`,
 *   3. právě jeden se shodným `looseKey` (bez diakritiky) -> `loose`,
 *   4. právě jeden se shodným `swapKey` (jiné pořadí slov) -> `swapped`,
 *   5. víc kandidátů v krocích 2 až 4 -> `ambiguous` (nic se nepředvyplní),
 *   6. nic -> `none`.
 * Dva řádky souboru se stejným `nameKey` jsou oba `duplicate`.
 */

// eslint-disable-next-line no-control-regex
const STRIP_RE = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
const SPACE_RE = /[\s  ]+/g;

export const NAME_KEY_MIN = 2;
export const NAME_KEY_MAX = 120;

/** NFC, bez neviditelných a řídicích znaků, mezery sloučené, malá písmena (cs). */
export function nameKey(s: string): string {
  return s
    .normalize("NFC")
    .replace(STRIP_RE, "")
    .replace(SPACE_RE, " ")
    .trim()
    .toLocaleLowerCase("cs");
}

/** `nameKey` bez diakritiky. */
export function looseKey(s: string): string {
  return nameKey(s).normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

/** `looseKey` se slovy seřazenými podle abecedy (Jméno Příjmení i Příjmení Jméno). */
export function swapKey(s: string): string {
  return looseKey(s).split(" ").filter(Boolean).sort().join(" ");
}

/** Jméno ze souboru je použitelné jako klíč: 2 až 120 znaků po normalizaci. */
export function isUsableNameKey(key: string): boolean {
  const len = [...key].length;
  return len >= NAME_KEY_MIN && len <= NAME_KEY_MAX;
}

export interface MatchMember {
  id: string;
  name: string;
  active: boolean;
}

export type MatchKind =
  | "alias"
  | "exact"
  | "loose"
  | "swapped"
  | "ambiguous"
  | "none"
  | "duplicate";

export interface NameMatch {
  kind: MatchKind;
  /** Předvyplněný člen (jen alias, exact, loose, swapped). */
  memberId: string | null;
  /** Kandidáti u `ambiguous`. */
  candidates: string[];
}

function groupBy(members: readonly MatchMember[], keyFn: (s: string) => string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const m of members) {
    const k = keyFn(m.name);
    const list = map.get(k);
    if (list) list.push(m.id);
    else map.set(k, [m.id]);
  }
  return map;
}

/**
 * Spáruje jména ze souboru. `aliases` mapuje `nameKey` na id člena (jen
 * existující členové se berou, alias na neznámé id se přeskočí).
 */
export function matchNames(
  fileNames: readonly string[],
  members: readonly MatchMember[],
  aliases: ReadonlyMap<string, string>
): NameMatch[] {
  const known = new Set(members.map((m) => m.id));
  const exact = groupBy(members, nameKey);
  const loose = groupBy(members, looseKey);
  const swapped = groupBy(members, swapKey);

  const counts = new Map<string, number>();
  for (const n of fileNames) {
    const k = nameKey(n);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return fileNames.map((raw): NameMatch => {
    const key = nameKey(raw);
    if (key.length === 0) return { kind: "none", memberId: null, candidates: [] };
    if ((counts.get(key) ?? 0) > 1) return { kind: "duplicate", memberId: null, candidates: [] };

    const aliased = aliases.get(key);
    if (aliased !== undefined && known.has(aliased)) {
      return { kind: "alias", memberId: aliased, candidates: [] };
    }

    const steps: [MatchKind, string[] | undefined][] = [
      ["exact", exact.get(key)],
      ["loose", loose.get(looseKey(raw))],
      ["swapped", swapped.get(swapKey(raw))],
    ];
    for (const [kind, list] of steps) {
      if (!list || list.length === 0) continue;
      if (list.length === 1) return { kind, memberId: list[0], candidates: [] };
      return { kind: "ambiguous", memberId: null, candidates: [...list] };
    }
    return { kind: "none", memberId: null, candidates: [] };
  });
}

/** Rozhodnutí vedení pro jeden řádek souboru: id člena, nebo `skip`. */
export type RowDecision = string | "skip";

export interface MappingRow {
  /** Index řádku v náhledu. */
  index: number;
  match: NameMatch;
  hasError: boolean;
}

export type MappingResult =
  | { ok: true; resolved: Map<number, string> }
  | { ok: false; code: "twice" | "unknownMember" | "errorRowSelected" | "undecided"; index?: number; memberId?: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validuje rozhodnutí klienta proti tomu, co spočítal server. Klientovi se
 * nevěří nic kromě volby člena: řádek bez rozhodnutí dostane návrh (alias,
 * exact, loose, swapped), řádek `ambiguous`, `none` nebo `duplicate` bez
 * rozhodnutí je chyba, řádek s chybou se přeskakuje. Vybraný člen musí
 * existovat a nesmí být přiřazený dvěma řádkům.
 */
export function resolveMapping(
  rows: readonly MappingRow[],
  decisions: ReadonlyMap<number, RowDecision>,
  memberIds: ReadonlySet<string>
): MappingResult {
  const resolved = new Map<number, string>();
  const used = new Map<string, number>();
  for (const row of rows) {
    const decision = decisions.get(row.index);
    let target: string | null;
    if (decision === undefined) {
      if (row.hasError) continue;
      const k = row.match.kind;
      if (k === "ambiguous" || k === "none" || k === "duplicate") {
        return { ok: false, code: "undecided", index: row.index };
      }
      target = row.match.memberId;
      if (target === null) return { ok: false, code: "undecided", index: row.index };
    } else if (decision === "skip") {
      continue;
    } else {
      if (!UUID_RE.test(decision) || !memberIds.has(decision)) {
        return { ok: false, code: "unknownMember", index: row.index };
      }
      if (row.hasError) return { ok: false, code: "errorRowSelected", index: row.index };
      target = decision;
    }
    if (used.has(target)) return { ok: false, code: "twice", index: row.index, memberId: target };
    used.set(target, row.index);
    resolved.set(row.index, target);
  }
  return { ok: true, resolved };
}

export interface AliasToWrite {
  nameKey: string;
  memberId: string;
}

/**
 * Aliasy k zapsání: ruční výběr nebo potvrzená nepřesná shoda (`loose`,
 * `swapped`) se zapamatuje, `exact` a nezměněný `alias` ne. Nepoužitelný
 * klíč (příliš krátký nebo dlouhý) se nezapisuje.
 */
export function aliasesToWrite(
  fileNames: readonly string[],
  rows: readonly MappingRow[],
  resolved: ReadonlyMap<number, string>
): AliasToWrite[] {
  const out: AliasToWrite[] = [];
  for (const row of rows) {
    const memberId = resolved.get(row.index);
    if (!memberId) continue;
    const { kind, memberId: suggested } = row.match;
    // Dvakrát stejné jméno v souboru: alias by vázal jedno jméno na dva členy.
    if (kind === "duplicate") continue;
    const unchanged = suggested === memberId;
    if (unchanged && (kind === "exact" || kind === "alias")) continue;
    const key = nameKey(fileNames[row.index] ?? "");
    if (!isUsableNameKey(key)) continue;
    out.push({ nameKey: key, memberId });
  }
  return out;
}
