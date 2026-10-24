/**
 * iter-041 (arch 5.3, 8.2): minimální XML čtečka bez DTD a bez entit.
 *
 * Čistý modul, sdílí ho import xlsx i skript PALMS (SpreadsheetML 2003).
 *
 * Bezpečnost:
 *   - text obsahující `<!DOCTYPE` nebo `<!ENTITY` (bez ohledu na velikost
 *     písmen) je chyba, jiná `<!...>` konstrukce kromě komentáře a CDATA taky,
 *   - entity se nikdy nerozbalují mimo `&lt; &gt; &amp; &quot; &apos;` a
 *     číselné `&#NN;` `&#xHH;` (platný rozsah Unicode, ne 0, ne řídicí znaky),
 *     jiná entita je chyba,
 *   - tokenizer je lineární (indexOf, žádné vnořené regexy), hloubka nejvýš
 *     100 a počet prvků nejvýš 500 000, strom se staví iterativně,
 *   - výsledek jsou prosté objekty s `Map` pro atributy (žádný klíč ze
 *     souboru se nestane vlastností objektu).
 *
 * Chyby se vyhazují jako `XmlError`, volající je převede na `broken`.
 */

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlError";
  }
}

export interface XmlNode {
  /** Název prvku tak, jak je v souboru (s předponou). */
  name: string;
  /** Název bez předpony jmenného prostoru. */
  local: string;
  attrs: Map<string, string>;
  children: XmlNode[];
  /** Přímý text prvku (spojený, bez trimu). */
  text: string;
}

const MAX_DEPTH = 100;
/** Výchozí strop prvků pro dokument (PALMS). Čtečka xlsx předává nižší strop podle části. */
export const DEFAULT_MAX_ELEMENTS = 500_000;
const FORBIDDEN_DECL = /<!(?:doctype|entity)/i;

function localName(name: string): string {
  const i = name.indexOf(":");
  return i < 0 ? name : name.slice(i + 1);
}

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeCodePoint(cp: number): string {
  if (!Number.isInteger(cp) || cp <= 0 || cp > 0x10ffff) throw new XmlError("entity");
  if (cp >= 0xd800 && cp <= 0xdfff) throw new XmlError("entity");
  if (cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13) throw new XmlError("entity");
  return String.fromCodePoint(cp);
}

/** Rozbalí jen povolené entity, jakákoli jiná `&` je chyba. */
export function decodeEntities(s: string): string {
  let at = s.indexOf("&");
  if (at < 0) return s;
  let out = "";
  let last = 0;
  while (at >= 0) {
    const semi = s.indexOf(";", at + 1);
    if (semi < 0 || semi - at > 12) throw new XmlError("entity");
    const body = s.slice(at + 1, semi);
    let ch: string;
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const hex = body.slice(2);
      if (!/^[0-9a-fA-F]{1,6}$/.test(hex)) throw new XmlError("entity");
      ch = decodeCodePoint(parseInt(hex, 16));
    } else if (body.startsWith("#")) {
      const dec = body.slice(1);
      if (!/^[0-9]{1,7}$/.test(dec)) throw new XmlError("entity");
      ch = decodeCodePoint(parseInt(dec, 10));
    } else if (Object.prototype.hasOwnProperty.call(NAMED, body)) {
      ch = NAMED[body];
    } else {
      throw new XmlError("entity");
    }
    out += s.slice(last, at) + ch;
    last = semi + 1;
    at = s.indexOf("&", last);
  }
  return out + s.slice(last);
}

function isSpace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d;
}

function isNameChar(c: number): boolean {
  return !(isSpace(c) || c === 0x3d || c === 0x2f || c === 0x3e || c === 0x3c || c === 0x22 || c === 0x27);
}

export interface ParseXmlOptions {
  /** Nejvyšší počet prvků dokumentu (výchozí `DEFAULT_MAX_ELEMENTS`). */
  maxElements?: number;
}

/** Zparsuje dokument a vrátí kořenový prvek. */
export function parseXml(input: string, options: ParseXmlOptions = {}): XmlNode {
  const maxElements = options.maxElements ?? DEFAULT_MAX_ELEMENTS;
  let src = input;
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  if (FORBIDDEN_DECL.test(src)) throw new XmlError("doctype");

  const len = src.length;
  let pos = 0;
  let elements = 0;
  const stack: XmlNode[] = [];
  let root: XmlNode | null = null;
  const textParts = new Map<XmlNode, string[]>();

  const addText = (node: XmlNode, raw: string) => {
    if (raw.length === 0) return;
    let parts = textParts.get(node);
    if (!parts) {
      parts = [];
      textParts.set(node, parts);
    }
    parts.push(raw);
  };

  while (pos < len) {
    const lt = src.indexOf("<", pos);
    if (lt < 0) {
      const tail = src.slice(pos);
      if (tail.trim().length > 0) {
        if (stack.length === 0) throw new XmlError("text outside root");
        throw new XmlError("unterminated");
      }
      pos = len;
      break;
    }
    if (lt > pos) {
      const raw = src.slice(pos, lt);
      if (stack.length > 0) addText(stack[stack.length - 1], decodeEntities(raw));
      else if (raw.trim().length > 0) throw new XmlError("text outside root");
    }
    pos = lt;

    if (src.startsWith("<!--", pos)) {
      const end = src.indexOf("-->", pos + 4);
      if (end < 0) throw new XmlError("comment");
      pos = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", pos)) {
      const end = src.indexOf("]]>", pos + 9);
      if (end < 0 || stack.length === 0) throw new XmlError("cdata");
      addText(stack[stack.length - 1], src.slice(pos + 9, end));
      pos = end + 3;
      continue;
    }
    if (src.startsWith("<?", pos)) {
      const end = src.indexOf("?>", pos + 2);
      if (end < 0) throw new XmlError("pi");
      pos = end + 2;
      continue;
    }
    if (src.startsWith("<!", pos)) throw new XmlError("declaration");

    if (src.charCodeAt(pos + 1) === 0x2f) {
      // </name>
      const end = src.indexOf(">", pos + 2);
      if (end < 0) throw new XmlError("close tag");
      const name = src.slice(pos + 2, end).trim();
      const top = stack.pop();
      if (!top || top.name !== name) throw new XmlError("mismatched close tag");
      pos = end + 1;
      continue;
    }

    // <name attr="v" ... > nebo />
    let p = pos + 1;
    const nameStart = p;
    while (p < len && isNameChar(src.charCodeAt(p))) p++;
    if (p === nameStart) throw new XmlError("tag name");
    const name = src.slice(nameStart, p);
    const attrs = new Map<string, string>();
    let selfClose = false;
    for (;;) {
      while (p < len && isSpace(src.charCodeAt(p))) p++;
      if (p >= len) throw new XmlError("unterminated tag");
      const c = src.charCodeAt(p);
      if (c === 0x3e) {
        p++;
        break;
      }
      if (c === 0x2f) {
        if (src.charCodeAt(p + 1) !== 0x3e) throw new XmlError("tag");
        selfClose = true;
        p += 2;
        break;
      }
      const aStart = p;
      while (p < len && isNameChar(src.charCodeAt(p))) p++;
      if (p === aStart) throw new XmlError("attribute name");
      const aName = src.slice(aStart, p);
      while (p < len && isSpace(src.charCodeAt(p))) p++;
      if (src.charCodeAt(p) !== 0x3d) throw new XmlError("attribute");
      p++;
      while (p < len && isSpace(src.charCodeAt(p))) p++;
      const quote = src.charCodeAt(p);
      if (quote !== 0x22 && quote !== 0x27) throw new XmlError("attribute quote");
      const close = src.indexOf(quote === 0x22 ? '"' : "'", p + 1);
      if (close < 0) throw new XmlError("attribute value");
      const rawVal = src.slice(p + 1, close);
      if (rawVal.indexOf("<") >= 0) throw new XmlError("attribute value");
      if (attrs.has(aName)) throw new XmlError("duplicate attribute");
      attrs.set(aName, decodeEntities(rawVal));
      p = close + 1;
    }
    pos = p;

    if (++elements > maxElements) throw new XmlError("too many elements");
    const node: XmlNode = { name, local: localName(name), attrs, children: [], text: "" };
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else if (root) throw new XmlError("multiple roots");
    else root = node;
    if (!selfClose) {
      if (stack.length >= MAX_DEPTH) throw new XmlError("too deep");
      stack.push(node);
    }
  }

  if (stack.length > 0 || !root) throw new XmlError("unterminated");
  for (const [node, parts] of textParts) node.text = parts.join("");
  return root;
}

/** Atribut podle lokálního názvu (`ss:Index` i `Index`), `undefined` když chybí. */
export function attrLocal(node: XmlNode, local: string): string | undefined {
  const exact = node.attrs.get(local);
  if (exact !== undefined) return exact;
  for (const [k, v] of node.attrs) {
    if (localName(k) === local) return v;
  }
  return undefined;
}

/** Potomci s daným lokálním názvem (jen přímé děti). */
export function childrenLocal(node: XmlNode, local: string): XmlNode[] {
  return node.children.filter((c) => c.local === local);
}

export function firstChildLocal(node: XmlNode, local: string): XmlNode | undefined {
  return node.children.find((c) => c.local === local);
}

/**
 * Text prvku včetně rich textu: spojí `<t>` potomky v pořadí dokumentu, bez
 * fonetických poznámek `<rPh>`. Nerekurzivně (zásobník), hloubka je omezená
 * už parserem.
 */
export function collectText(node: XmlNode): string {
  const out: string[] = [];
  const stack: XmlNode[] = [node];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur.local === "t" && cur !== node) {
      out.push(cur.text);
      continue;
    }
    if (cur.local === "rPh") continue;
    for (let i = cur.children.length - 1; i >= 0; i--) stack.push(cur.children[i]);
  }
  return out.join("");
}
