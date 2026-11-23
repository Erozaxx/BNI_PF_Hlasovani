/**
 * iter-049 (arch 5): čistá logika jednorázového importu ze `situace.json`
 * (soubor mimo repo, cesta argumentem skriptu). Čistý modul bez DB a bez
 * souborů, testuje ho scripts/test-iter-049-situace.ts na smyšlených datech.
 *
 * Pravidla: žádné vynechání člena (M1). Import buď spáruje všechny členy ze
 * souboru, nebo `--apply` nezapíše nic. Texty se čistí (NFC, trim) a ořezávají
 * na limity, počet oříznutých se hlásí. Chybové hlášky jména ani texty
 * z dat nevypisují (repo je veřejné, výstup agenta jde do logů).
 */
import { z } from "zod";
import { matchNames, nameKey, looseKey, type MatchKind, type MatchMember } from "../semafor/names";
import { DESCRIPTION_MAX, ITEM_TEXT_MAX, TITLE_MAX, cleanText } from "./rules";

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/** Soubor je malý (50 situací), strop je pojistka proti omylu. */
export const MAX_FILE_BYTES = 1024 * 1024;

const situationSchema = z
  .object({
    id: z.string(),
    clen: z.string(),
    nazev: z.string().optional(),
    puvodni_q1: z.string().optional(),
    puvodni_q2: z.string().optional(),
    problem: z.string().optional(),
    cil: z.string().optional(),
    obavy: z.array(z.string()).optional(),
    navazne_potreby: z.array(z.string()).optional(),
    jmenovani_clenove: z.array(z.unknown()).optional(),
    k_overeni: z.boolean().optional(),
    k_overeni_duvod: z.string().optional(),
  })
  .passthrough();

const memberSchema = z
  .object({
    jmeno: z.string(),
    firma: z.string().optional(),
    obor: z.string().optional(),
    vyplnil_formular: z.boolean(),
    situace: z.array(z.string()).optional(),
    kompetence: z.array(z.unknown()).optional(),
  })
  .passthrough();

const fileSchema = z
  .object({
    situace: z.array(situationSchema),
    clenove: z.array(memberSchema),
  })
  .passthrough();

export type SourceSituation = z.infer<typeof situationSchema>;
export type SourceMember = z.infer<typeof memberSchema>;
export type SourceFile = z.infer<typeof fileSchema>;

/** Parsuje a validuje tvar souboru. Chyba nese jen cestu a typ problému, nikdy hodnotu. */
export function parseSituaceJson(text: string): SourceFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("Soubor není platný JSON.");
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(kořen)"}: ${i.code}`)
      .join("; ");
    throw new ImportError(`Soubor nemá očekávaný tvar (${first}).`);
  }
  return parsed.data;
}

/** Alias soubor `{"jméno ze souboru": "uuid člena"}` na `Map` s klíči přes `nameKey` (stejná normalizace jako `matchNames`). */
export function parseAliasJson(text: string, isUuid: (v: unknown) => boolean): Map<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ImportError("Alias soubor není platný JSON.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ImportError("Alias soubor musí být objekt jméno -> uuid.");
  }
  const map = new Map<string, string>();
  for (const [name, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== "string" || !isUuid(id)) {
      throw new ImportError("Alias soubor obsahuje hodnotu, která není uuid.");
    }
    const key = nameKey(name);
    if (key.length === 0) throw new ImportError("Alias soubor obsahuje prázdné jméno.");
    map.set(key, id);
  }
  return map;
}

// ── Plán ──

export type ImportKind = "fear" | "desire" | "related";

export interface PlannedSituation {
  sourceId: string;
  memberId: string;
  slot: 1 | 2 | 3;
  title: string;
  description: string;
  /** Celý objekt situace ze souboru beze změny. */
  original: Record<string, unknown>;
}

export interface PlannedItem {
  sourceId: string;
  kind: ImportKind;
  text: string;
  /** Pořadí v poli daného typu, určuje `created_at = čas importu + ord × 1 ms`. */
  ord: number;
}

export interface PlannedSource {
  memberId: string;
  sourceName: string;
  filledForm: boolean;
  competences: unknown[];
}

export interface UnmatchedName {
  name: string;
  kind: MatchKind;
}

export interface ImportPlan {
  errors: string[];
  unmatched: UnmatchedName[];
  situations: PlannedSituation[];
  items: PlannedItem[];
  sources: PlannedSource[];
  /** Každé `id` situace ze souboru má v plánu řádek. */
  complete: boolean;
  stats: {
    fileSituations: number;
    plannedSituations: number;
    items: Record<ImportKind, number>;
    members: number;
    matchedMembers: number;
    unmatchedMembers: number;
    truncated: number;
  };
}

const ACCEPTED: ReadonlySet<MatchKind> = new Set(["alias", "exact", "loose", "swapped"]);
const ID_RE = /^S-\d+-([123])$/;

/** „Nečitelná situace“ se nepřenáší do `title`, jinak by mapa situaci blokovala i po doplnění (M5). */
export function isUnreadableName(nazev: string): boolean {
  return looseKey(nazev).includes("necitelna");
}

function fit(text: string, max: number, multiline: boolean, counter: { n: number }): string {
  const clean = cleanText(text, multiline);
  const chars = [...clean];
  if (chars.length <= max) return clean;
  counter.n += 1;
  return chars.slice(0, max).join("").trim();
}

export function buildImportPlan(
  file: SourceFile,
  members: readonly MatchMember[],
  aliases: ReadonlyMap<string, string>
): ImportPlan {
  const errors: string[] = [];
  const truncated = { n: 0 };

  const sourceNames = file.clenove.map((m) => m.jmeno);
  const matches = matchNames(sourceNames, members, aliases);
  const matchedBySource = new Map<string, string>();
  const unmatched: UnmatchedName[] = [];
  const targetUse = new Map<string, number>();
  file.clenove.forEach((m, i) => {
    const match = matches[i];
    if (ACCEPTED.has(match.kind) && match.memberId) {
      matchedBySource.set(m.jmeno, match.memberId);
      targetUse.set(match.memberId, (targetUse.get(match.memberId) ?? 0) + 1);
    } else {
      unmatched.push({ name: m.jmeno, kind: match.kind });
    }
  });
  for (const [, n] of targetUse) {
    if (n > 1) errors.push("Dva členy ze souboru se spárovaly na jednoho člena aplikace.");
  }

  const namesInFile = new Set(sourceNames);
  const seenIds = new Set<string>();
  const seenSlots = new Set<string>();
  const situations: PlannedSituation[] = [];
  const items: PlannedItem[] = [];

  for (const s of file.situace) {
    const idMatch = ID_RE.exec(s.id);
    if (!idMatch) {
      errors.push(`Situace ${s.id}: id nemá tvar S-n-k (k je 1 až 3).`);
      continue;
    }
    if (seenIds.has(s.id)) {
      errors.push(`Situace ${s.id}: id se v souboru opakuje.`);
      continue;
    }
    seenIds.add(s.id);
    if (!namesInFile.has(s.clen)) {
      errors.push(`Situace ${s.id}: člen situace není v seznamu členů souboru.`);
      continue;
    }
    const memberId = matchedBySource.get(s.clen);
    if (!memberId) continue;
    const slot = Number(idMatch[1]) as 1 | 2 | 3;
    const slotKey = `${memberId}:${slot}`;
    if (seenSlots.has(slotKey)) {
      errors.push(`Situace ${s.id}: stejný člen má v souboru dvě situace ve stejném slotu.`);
      continue;
    }
    seenSlots.add(slotKey);

    const nazev = s.nazev ?? "";
    situations.push({
      sourceId: s.id,
      memberId,
      slot,
      title: isUnreadableName(nazev) ? "" : fit(nazev, TITLE_MAX, false, truncated),
      description: fit(s.problem ?? "", DESCRIPTION_MAX, true, truncated),
      original: s as Record<string, unknown>,
    });

    const push = (kind: ImportKind, texts: readonly string[]) => {
      let ord = 0;
      for (const t of texts) {
        const text = fit(t, ITEM_TEXT_MAX, true, truncated);
        if (text === "") continue;
        items.push({ sourceId: s.id, kind, text, ord: ord++ });
      }
    };
    push("fear", s.obavy ?? []);
    push("desire", (s.cil ?? "").trim() === "" ? [] : [s.cil ?? ""]);
    push("related", s.navazne_potreby ?? []);
  }

  const sources: PlannedSource[] = [];
  for (const m of file.clenove) {
    const memberId = matchedBySource.get(m.jmeno);
    if (!memberId) continue;
    sources.push({
      memberId,
      sourceName: m.jmeno,
      filledForm: m.vyplnil_formular,
      competences: m.kompetence ?? [],
    });
  }

  const plannedIds = new Set(situations.map((x) => x.sourceId));
  const complete = file.situace.every((s) => plannedIds.has(s.id));
  const count = (k: ImportKind) => items.filter((i) => i.kind === k).length;

  return {
    errors,
    unmatched,
    situations,
    items,
    sources,
    complete,
    stats: {
      fileSituations: file.situace.length,
      plannedSituations: situations.length,
      items: { fear: count("fear"), desire: count("desire"), related: count("related") },
      members: file.clenove.length,
      matchedMembers: matchedBySource.size,
      unmatchedMembers: unmatched.length,
      truncated: truncated.n,
    },
  };
}

/** `--apply` smí jen úplný plán bez chyb a bez nespárovaných členů (M1, žádné vynechání). */
export function canApply(plan: ImportPlan): { ok: true } | { ok: false; reason: string } {
  if (plan.errors.length > 0) return { ok: false, reason: "Plán obsahuje chyby." };
  if (plan.unmatched.length > 0) {
    return { ok: false, reason: "Někteří členové ze souboru nejsou spárovaní, --apply nic nezapíše." };
  }
  if (!plan.complete) return { ok: false, reason: "Plán nepokrývá všechna id situací ze souboru." };
  return { ok: true };
}

/** Parametry zápisu: JSON pro `jsonb_to_recordset` (bind parametry, ne interpolace). */
export function planToParams(plan: ImportPlan): { situations: string; items: string; sources: string } {
  return {
    situations: JSON.stringify(
      plan.situations.map((s) => ({
        source_id: s.sourceId,
        member_id: s.memberId,
        slot: s.slot,
        title: s.title,
        description: s.description,
        original: s.original,
      }))
    ),
    items: JSON.stringify(
      plan.items.map((i) => ({ source_id: i.sourceId, kind: i.kind, text: i.text, ord: i.ord }))
    ),
    sources: JSON.stringify(
      plan.sources.map((s) => ({
        member_id: s.memberId,
        source_name: s.sourceName,
        filled_form: s.filledForm,
        competences: s.competences,
      }))
    ),
  };
}

