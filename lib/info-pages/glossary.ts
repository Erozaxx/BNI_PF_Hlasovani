/**
 * Automatické odkazy na role (iter-030, T-007a, arch_iter-030_T-001 sekce 7.3,
 * varianta G). Čistá funkce bez Reactu, testuje ji `scripts/test-info-pages.ts`.
 *
 * Text se nikdy nemění: výstup jsou úseky, které po spojení dají přesně
 * vstupní řetězec. Odkaz dostane jen první výskyt role v rámci jednoho
 * `seen` (komponenta ho zakládá pro krok, kartu, řádek tabulky, položku
 * seznamu nebo sekci). Uvnitř uvozovek a adres se neodkazuje.
 */
import { ROLE_GLOSSARY, ROLE_NO_LINK, type RoleGlossaryEntry } from "@/content/pravidla/role-glosar";
import type { RoleId } from "./types";

/** Slug stránky s kartami rolí. */
export const ROLE_PAGE_SLUG = "role";

export type Segment =
  | { text: string; role?: undefined; href?: undefined }
  | { text: string; role: RoleId; href: string; title?: string }
  /** Odkaz na kotvu stránky z `Fact.link` (ne role). */
  | { text: string; role?: undefined; href: string };

export interface RoleLinkOptions {
  /** Slug stránky, na které se text vykresluje (na stránce `role` vedou odkazy na `#…`). */
  selfSlug: string;
  /** `false` = text beze změny (stránka `role` v registru není, nebo `glossary: false`). */
  enabled: boolean;
}

export interface LinkRolesOptions extends RoleLinkOptions {
  /** Role, které už v tomhle celku odkaz dostaly. Funkce ji doplňuje. */
  seen: Set<RoleId>;
  glossary?: RoleGlossaryEntry[];
  noLink?: string[];
}

export function roleHref(id: RoleId, selfSlug: string): string {
  return selfSlug === ROLE_PAGE_SLUG ? `#${id}` : `/pravidla/${ROLE_PAGE_SLUG}#${id}`;
}

/** Odkazy rolí jen když stránka `role` je v registru a stránka je nevypnula. */
export function roleLinksEnabled(
  pages: { slug: string }[],
  page: { glossary?: false }
): boolean {
  return page.glossary !== false && pages.some((p) => p.slug === ROLE_PAGE_SLUG);
}

/** Tvar pro porovnání: malá písmena, jedna mezera. */
export function normalizeForm(form: string): string {
  return form.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Vzor tvaru: první písmeno bez ohledu na velikost, mezery jako `\s+`. */
function formPattern(form: string): string {
  const [first, ...rest] = Array.from(form.trim());
  const head =
    first.toLowerCase() === first.toUpperCase()
      ? escapeRe(first)
      : `[${escapeRe(first.toLowerCase())}${escapeRe(first.toUpperCase())}]`;
  const tail = rest
    .join("")
    .split(/\s+/)
    .map(escapeRe)
    .join("\\s+");
  return head + tail;
}

interface Compiled {
  re: RegExp;
  byForm: Map<string, RoleGlossaryEntry>;
}

const compiledCache = new WeakMap<RoleGlossaryEntry[], Compiled>();

function compile(glossary: RoleGlossaryEntry[]): Compiled {
  const cached = compiledCache.get(glossary);
  if (cached) return cached;
  const byForm = new Map<string, RoleGlossaryEntry>();
  for (const entry of glossary) {
    for (const form of entry.forms) {
      if (form.trim() !== "") byForm.set(normalizeForm(form), entry);
    }
  }
  // Nejdelší tvar první: „členský výbor" před „výbor".
  const forms = Array.from(byForm.keys()).sort((a, b) => b.length - a.length);
  const body = forms.length > 0 ? forms.map(formPattern).join("|") : "(?!)";
  const re = new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, "gu");
  const compiled = { re, byForm };
  compiledCache.set(glossary, compiled);
  return compiled;
}

/**
 * Rozsahy, kde se neodkazuje: text v uvozovkách („…", “…”, "…"), adresy
 * a výrazy ze seznamu `noLink`.
 */
function excludedRanges(text: string, noLink: string[]): [number, number][] {
  const ranges: [number, number][] = [];
  const patterns = [/„[^“”"]*[“”"]/g, /“[^”]*”/g, /"[^"]*"/g, /(?:https?:\/\/|\/pravidla\/)\S+/g];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) ranges.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  }
  const lower = text.toLowerCase();
  for (const phrase of noLink) {
    const p = phrase.toLowerCase();
    if (p === "") continue;
    for (let i = lower.indexOf(p); i !== -1; i = lower.indexOf(p, i + p.length)) {
      ranges.push([i, i + p.length]);
    }
  }
  return ranges;
}

/**
 * Rozdělí text na úseky s odkazy na role. Odkaz dostane jen první výskyt
 * role, která ještě není v `seen`. Spojení `text` všech úseků = vstup.
 */
export function linkRoles(text: string, options: LinkRolesOptions): Segment[] {
  if (!options.enabled || text === "") return [{ text }];
  const { re, byForm } = compile(options.glossary ?? ROLE_GLOSSARY);
  const excluded = excludedRanges(text, options.noLink ?? ROLE_NO_LINK);
  const segments: Segment[] = [];
  let last = 0;
  re.lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (excluded.some(([a, b]) => start < b && end > a)) continue;
    const entry = byForm.get(normalizeForm(match[0]));
    if (!entry || options.seen.has(entry.id)) continue;
    options.seen.add(entry.id);
    if (start > last) segments.push({ text: text.slice(last, start) });
    segments.push({
      text: match[0],
      role: entry.id,
      href: roleHref(entry.id, options.selfSlug),
      ...(entry.en ? { title: entry.en } : {}),
    });
    last = end;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments.length > 0 ? segments : [{ text }];
}

export type RoleLinker = (text: string) => Segment[];

/**
 * Text faktu: odkazy rolí a navíc `Fact.link` (první výskyt frázi v prostém
 * úseku se stane odkazem na kotvu). Bez `link` stejné jako `link(text)`.
 */
export function linkFact(link: RoleLinker, fact: { text: string; link?: { text: string; href: string } }): Segment[] {
  const segments = link(fact.text);
  const phrase = fact.link;
  if (!phrase || phrase.text === "") return segments;
  const out: Segment[] = [];
  let done = false;
  for (const segment of segments) {
    const at = done || segment.href !== undefined ? -1 : segment.text.indexOf(phrase.text);
    if (at === -1) {
      out.push(segment);
      continue;
    }
    if (at > 0) out.push({ text: segment.text.slice(0, at) });
    out.push({ text: phrase.text, href: phrase.href });
    const rest = segment.text.slice(at + phrase.text.length);
    if (rest) out.push({ text: rest });
    done = true;
  }
  return out;
}

/**
 * Linker pro jeden celek (krok, kartu, řádek, sekci): sdílí `seen`.
 * `preseen` = role, které se v celku neodkazují (karta role sama na sebe).
 */
export function createRoleLinker(options: RoleLinkOptions, preseen: RoleId[] = []): RoleLinker {
  const seen = new Set<RoleId>(preseen);
  return (text) => linkRoles(text, { ...options, seen });
}
