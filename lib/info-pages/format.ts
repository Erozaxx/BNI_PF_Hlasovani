/**
 * Čisté pomocné funkce pro info stránky (iter-029, T-007). Bez importu
 * Reactu, testují se v `scripts/test-info-pages.ts`.
 */
import { SOURCE_DOCS, sourceShortRef } from "./sources";
import type { Fact, SourceRef } from "./types";

/** "2026-09-28" -> "28. 9. 2026". Neplatné datum vrátí beze změny. */
export function formatDateCs(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])}. ${Number(match[2])}. ${match[1]}`;
}

/** Nahradí `{updated}` českým datem, `{n}` číslem. */
export function fillTemplate(text: string, values: { updated?: string; n?: number }): string {
  let out = text;
  if (values.updated !== undefined) out = out.split("{updated}").join(formatDateCs(values.updated));
  if (values.n !== undefined) out = out.split("{n}").join(String(values.n));
  return out;
}

/** Sjednocené zdroje faktů kroku v pořadí prvního výskytu, bez duplicit. */
export function uniqueSources(facts: Fact[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const fact of facts) {
    for (const ref of fact.sources) {
      const key = `${ref.doc}|${ref.page}|${ref.quoteEn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}

/** "39, 54, 55 a 61" */
export function joinCs(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} a ${items[items.length - 1]}`;
}

/**
 * Náhradní text `<summary>` zdrojů, když krok nemá `sourcesSummary`:
 * pravidla General Policies jménem, strany manuálu seřazené v jedné skupině.
 */
export function formatSourcesSummary(sources: SourceRef[]): string {
  const parts: string[] = [];
  const manualPages: number[] = [];
  let manualIndex = -1;
  for (const ref of sources) {
    if (ref.doc === "ops-manual-2022") {
      if (manualIndex === -1) {
        manualIndex = parts.length;
        parts.push("");
      }
      if (!manualPages.includes(ref.page)) manualPages.push(ref.page);
      continue;
    }
    const label = sourceShortRef(ref);
    if (!parts.includes(label)) parts.push(label);
  }
  if (manualIndex !== -1) {
    const pages = [...manualPages].sort((a, b) => a - b).map(String);
    parts[manualIndex] = `${SOURCE_DOCS["ops-manual-2022"].shortCs} str. ${joinCs(pages)}`;
  }
  return parts.join(", ");
}

export interface CounterTemplates {
  /** Do limitu včetně („absence {n} ze 3"). */
  within: string;
  /** Právě o jednu nad limit („absence {n}, o jednu nad limit"). */
  overByOne: string;
  /** Víc než o jednu nad limit („absence {n}, nad limitem 3"). */
  over: string;
}

/** Počitadlo na ose podle vztahu k limitu (T-010r, po BFU T-010). */
export function formatCounter(n: number, templates: CounterTemplates, limit = 3): string {
  const template =
    n <= limit ? templates.within : n === limit + 1 ? templates.overByOne : templates.over;
  return fillTemplate(template, { n });
}
