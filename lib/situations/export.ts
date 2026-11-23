/**
 * iter-049 (arch 8, gate T-004 změna 1): čisté sestavení exportů klientských
 * situací. `buildSituaceJson` dává `situace.json` pro build mapy (jen
 * `situations.manage`), `buildCsv` tabulku pro každého přihlášeného,
 * `findMissingRefs` kontrolu odkazů z `vztahy.json` a `pozice.json`.
 *
 * Čistý modul: žádný import DB, Next ani souborů, jde spustit v holém Node
 * (tsx) a testuje ho scripts/test-iter-049-situace.ts na smyšlených datech.
 */

export type ExportKind = "trait" | "need" | "fear" | "desire" | "related";

export interface ExportMember {
  memberId: string;
  name: string;
  company: string | null;
  obor: string | null;
  active: boolean;
  /** Jméno člena tak, jak je v `situace.json` z workshopu (`null` = člen ze souboru nepochází). */
  sourceName: string | null;
  competences: unknown[] | null;
}

export interface ExportItem {
  id: string;
  kind: ExportKind;
  text: string;
  importedText: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportSituation {
  memberId: string;
  slot: number;
  sourceId: string | null;
  client: string;
  title: string;
  description: string;
  /** Snímek z workshopu (objekt nebo JSON text), `null` = situace nepochází z workshopu. */
  original: unknown;
  /** `updated_by IS NOT NULL`: od importu někdo něco změnil. */
  touched: boolean;
  updatedAt: string;
  items: ExportItem[];
}

export interface ExportData {
  members: ExportMember[];
  situations: ExportSituation[];
}

// ── Pomocné ──

const KINDS_ORDER: readonly ExportKind[] = ["trait", "need", "fear", "desire", "related"];

function byCreated(a: ExportItem, b: ExportItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function textsOf(items: readonly ExportItem[], kind: ExportKind): string[] {
  return items
    .filter((i) => i.kind === kind)
    .sort(byCreated)
    .map((i) => i.text);
}

/** `original` jako objekt (JSONB může dorazit i jako řetězec), jinak `null`. */
export function originalObject(raw: unknown): Record<string, unknown> | null {
  let obj: unknown = raw;
  if (typeof obj === "string") {
    try {
      obj = JSON.parse(obj);
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  return obj as Record<string, unknown>;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Stejná logika jako `unreadable(s)` v `body_a.js:32` (build mapy). */
export function isUnreadableSituation(s: { nazev?: unknown; puvodni_q1?: unknown }): boolean {
  return /nečitelná/i.test(str(s.nazev)) || !String(s.puvodni_q1 ?? "").replace(/\[nečitelné\]|\s/g, "");
}

function hasContent(s: ExportSituation): boolean {
  return (
    s.original != null ||
    s.client.trim() !== "" ||
    s.title.trim() !== "" ||
    s.description.trim() !== "" ||
    s.items.length > 0
  );
}

function sentence(label: string, value: string): string {
  const v = value.trim();
  return `${label}: ${/[.!?…]$/.test(v) ? v : `${v}.`}`;
}

/** „Popis: …. Vlastnosti: …. Potřeby: …. Obavy: …. Touhy: ….“, prázdné části vynechá (8.2). */
export function composeQ1(s: ExportSituation): string {
  const parts: string[] = [];
  if (s.description.trim()) parts.push(sentence("Popis", s.description));
  const groups: Array<[string, ExportKind, string]> = [
    ["Vlastnosti", "trait", ", "],
    ["Potřeby", "need", "; "],
    ["Obavy", "fear", "; "],
    ["Touhy", "desire", "; "],
  ];
  for (const [label, kind, sep] of groups) {
    const t = textsOf(s.items, kind);
    if (t.length > 0) parts.push(sentence(label, t.join(sep)));
  }
  return parts.join(" ");
}

export function composeQ2(s: ExportSituation): string {
  return textsOf(s.items, "related").join("; ");
}

/** Pražské datum z ISO okamžiku (`YYYY-MM-DD`). */
export function pragueDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Prague" });
}

// ── Společná příprava (výběr členů, situací, id) ──

interface Prepared {
  member: ExportMember;
  /** Jméno v exportu (shoda s `vztahy.json`). */
  displayName: string;
  situations: Array<{ s: ExportSituation; id: string }>;
}

/** Členové: aktivní, plus neaktivní se zdrojem z workshopu. Situace: s `original` nebo neprázdným údajem. */
export function prepareExport(data: ExportData): Prepared[] {
  const members = data.members
    .filter((m) => m.active || m.sourceName !== null)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "cs") || (a.memberId < b.memberId ? -1 : 1));

  const bySource = new Set<string>();
  for (const s of data.situations) if (s.sourceId) bySource.add(s.sourceId);
  const used = new Set<string>(bySource);

  const out: Prepared[] = [];
  for (const m of members) {
    const mine = data.situations
      .filter((s) => s.memberId === m.memberId && hasContent(s))
      .sort((a, b) => a.slot - b.slot);
    const situations = mine.map((s) => {
      if (s.sourceId) return { s, id: s.sourceId };
      const base = `S-N${m.memberId.replace(/-/g, "").slice(0, 8)}-${s.slot}`;
      let id = base;
      let k = 2;
      while (used.has(id)) id = `${base}-${k++}`;
      used.add(id);
      return { s, id };
    });
    out.push({ member: m, displayName: m.sourceName ?? m.name, situations });
  }
  return out;
}

// ── JSON pro build mapy (8.1, 8.2) ──

export const EXPORT_VERSION = 2;

export interface SituaceJson {
  situace: Array<Record<string, unknown>>;
  clenove: Array<Record<string, unknown>>;
  prazdne_situace: number;
  export: { vytvoreno: string; verze: number };
}

function nazevOf(s: ExportSituation, orig: Record<string, unknown> | null): string {
  if (s.title.trim()) return s.title.trim();
  if (s.client.trim()) return s.client.trim();
  const d = [...s.description.trim()].slice(0, 40).join("").trim();
  if (d) return d;
  // Nevyplněná situace z workshopu (typicky „Nečitelná situace“) si nechá původní název, ať ji mapa pozná.
  // Doplněná situace ho nepřebírá, jinak by zůstala nečitelná i po doplnění (M5).
  const o = orig && s.items.length === 0 ? str(orig.nazev).trim() : "";
  return o || "Bez názvu";
}

export function buildSituaceJson(data: ExportData, now: Date): SituaceJson {
  const prepared = prepareExport(data);
  const situace: Array<Record<string, unknown>> = [];
  const clenove: Array<Record<string, unknown>> = [];
  let prazdne = 0;

  for (const p of prepared) {
    for (const { s, id } of p.situations) {
      const orig = originalObject(s.original);
      const readable = orig !== null && !isUnreadableSituation({ puvodni_q1: orig.puvodni_q1 });
      const filled =
        s.client.trim() !== "" || s.title.trim() !== "" || s.description.trim() !== "" || s.items.length > 0;

      let q1: string;
      let q2: string;
      if (readable && orig) {
        q1 = str(orig.puvodni_q1);
        q2 = str(orig.puvodni_q2);
      } else if (!filled && orig) {
        q1 = str(orig.puvodni_q1);
        q2 = str(orig.puvodni_q2);
      } else {
        q1 = composeQ1(s) || s.title.trim() || s.client.trim() || (orig ? str(orig.puvodni_q1) : "");
        q2 = composeQ2(s);
      }

      situace.push({
        id,
        clen: p.displayName,
        nazev: nazevOf(s, orig),
        puvodni_q1: q1,
        puvodni_q2: q2,
        problem: s.description,
        cil: textsOf(s.items, "desire").join("; "),
        obavy: textsOf(s.items, "fear"),
        navazne_potreby: textsOf(s.items, "related"),
        jmenovani_clenove: orig && Array.isArray(orig.jmenovani_clenove) ? orig.jmenovani_clenove : [],
        k_overeni: orig ? orig.k_overeni === true : false,
        k_overeni_duvod: orig ? str(orig.k_overeni_duvod) : "",
        klient: s.client,
        vlastnosti: textsOf(s.items, "trait"),
        potreby: textsOf(s.items, "need"),
        touhy: textsOf(s.items, "desire"),
        upraveno: s.touched ? s.updatedAt : null,
        z_workshopu: s.original != null,
      });
    }

    if (p.situations.length > 0) prazdne += Math.max(0, 3 - p.situations.length);
    clenove.push({
      jmeno: p.displayName,
      firma: p.member.company ?? "",
      obor: p.member.obor ?? "",
      vyplnil_formular: p.situations.length > 0,
      situace: p.situations.map((x) => x.id),
      kompetence: p.member.competences ?? [],
    });
  }

  return {
    situace,
    clenove,
    prazdne_situace: prazdne,
    export: { vytvoreno: now.toISOString(), verze: EXPORT_VERSION },
  };
}

/**
 * Serializace pro vložení doslova do `<script type="application/json">` (R13):
 * platný JSON bez `<` (nahrazeno `<`), U+2028 a U+2029 escapované. Text
 * člena tak nemůže otevřít ani zavřít značku.
 */
export function serializeForHtml(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// ── Kontrola odkazů (8.1, M1) ──

export interface MissingRefs {
  situationIds: string[];
  memberNames: string[];
}

function asList(v: unknown): unknown[] {
  return Array.isArray(v) ? v : v === undefined || v === null ? [] : [v];
}

function objs(v: unknown): Record<string, unknown>[] {
  return asList(v).filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x));
}

function ids(v: unknown): string[] {
  return asList(v).filter((x): x is string => typeof x === "string" && x !== "");
}

/**
 * Id situací z `vztahy.json` (`vazby[].od`, `vazby[].do`, `predavky[].situace`,
 * `shluky[].situace[]`) a `pozice.json` (`pozice[].potreby[].situace`,
 * `bez_pozice[].situace`), která v exportu chybí, a jména z `predavky[].od_clena`
 * a `clen_ktery_pokryje`, která nejsou v `clenove[].jmeno`.
 */
export function findMissingRefs(exportJson: unknown, vztahy: unknown, pozice: unknown): MissingRefs {
  const ex = (typeof exportJson === "object" && exportJson !== null ? exportJson : {}) as Record<string, unknown>;
  const v = (typeof vztahy === "object" && vztahy !== null ? vztahy : {}) as Record<string, unknown>;
  const p = (typeof pozice === "object" && pozice !== null ? pozice : {}) as Record<string, unknown>;

  const haveIds = new Set(objs(ex.situace).map((s) => str(s.id)));
  const haveNames = new Set(objs(ex.clenove).map((c) => str(c.jmeno)));

  const wantIds = new Set<string>();
  for (const x of objs(v.vazby)) {
    for (const id of [...ids(x.od), ...ids(x.do)]) wantIds.add(id);
  }
  for (const x of objs(v.predavky)) for (const id of ids(x.situace)) wantIds.add(id);
  for (const x of objs(v.shluky)) for (const id of ids(x.situace)) wantIds.add(id);
  for (const pos of objs(p.pozice)) {
    for (const need of objs(pos.potreby)) for (const id of ids(need.situace)) wantIds.add(id);
  }
  for (const x of objs(p.bez_pozice)) for (const id of ids(x.situace)) wantIds.add(id);

  const wantNames = new Set<string>();
  for (const x of objs(v.predavky)) {
    for (const name of [...ids(x.od_clena), ...ids(x.clen_ktery_pokryje)]) wantNames.add(name);
  }

  return {
    situationIds: [...wantIds].filter((id) => !haveIds.has(id)).sort(),
    memberNames: [...wantNames].filter((n) => !haveNames.has(n)).sort(),
  };
}

// ── CSV (8.3, gate změna 1) ──

export const CSV_HEADER = [
  "Člen",
  "Situace (id)",
  "Číslo situace",
  "Kdo je klient",
  "Název situace",
  "Sekce",
  "Pořadí",
  "Text",
  "Z workshopu (ano / upraveno / ne)",
  "Upraveno (datum)",
] as const;

export const CSV_SECTIONS: Record<ExportKind, string> = {
  trait: "Vlastnost klienta",
  need: "Potřeba",
  fear: "Obava",
  desire: "Touha",
  related: "Související potřeba",
};

/** Buňka v uvozovkách, `"` zdvojené, vzorec (po `trimStart()` `=`, `+`, `-`, `@`, tab, CR) dostane předponu `'`. */
export function csvCell(value: string): string {
  const v = /^[=+\-@\t\r]/.test(value.trimStart()) ? `'${value}` : value;
  return `"${v.replace(/"/g, '""')}"`;
}

export function csvRow(cells: readonly string[]): string {
  return cells.map(csvCell).join(";");
}

/**
 * CSV pro každého přihlášeného: obsah jen aktivních členů (to, co je na
 * `/situace`). UTF-8 s BOM, `;`, `\r\n`. Jeden řádek na kartičku a jeden řádek
 * „Popis situace“ na situaci. `Pořadí` je pořadí v sekci podle `created_at, id`.
 */
export function buildCsv(data: ExportData): string {
  const rows: string[] = [csvRow(CSV_HEADER)];
  for (const p of prepareExport(data)) {
    if (!p.member.active) continue;
    for (const { s, id } of p.situations) {
      const head = [p.displayName, id, String(s.slot), s.client, nazevOf(s, originalObject(s.original))];
      const descStatus = s.original != null ? (s.touched ? "upraveno" : "ano") : "ne";
      rows.push(
        csvRow([
          ...head,
          "Popis situace",
          "1",
          s.description,
          descStatus,
          s.touched ? pragueDate(s.updatedAt) : "",
        ])
      );
      for (const kind of KINDS_ORDER) {
        const items = s.items.filter((i) => i.kind === kind).sort(byCreated);
        items.forEach((it, idx) => {
          const status = it.importedText === null ? "ne" : it.text === it.importedText ? "ano" : "upraveno";
          rows.push(
            csvRow([
              ...head,
              CSV_SECTIONS[kind],
              String(idx + 1),
              it.text,
              status,
              status === "ano" ? "" : pragueDate(it.updatedAt),
            ])
          );
        });
      }
    }
  }
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

export function csvFilename(now: Date): string {
  return `klientske-situace-${pragueDate(now.toISOString())}.csv`;
}
