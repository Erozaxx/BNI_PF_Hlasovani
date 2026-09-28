/**
 * Jediné místo s adresami vystavených PDF (arch_iter-029_T-001 sekce 7.5).
 *
 * Soubory leží v `public/pravidla/zdroje/` (middleware je pouští díky výjimce
 * `/pravidla/`, `next.config.mjs` k nim přidává `X-Robots-Tag: noindex`).
 * Komponenty skládají odkaz jen přes `sourceHref()`.
 */
import type { SourceDocId, SourceLocation } from "./types";

export interface SourceDoc {
  /** Český název dokumentu pro zobrazení (texty T-005). */
  labelCs: string;
  /** Krátké označení do shrnutí zdrojů („manuál str. 55"). */
  shortCs: string;
  href: string;
  sizeLabel: string;
  pageCount: number;
}

export const SOURCE_DOCS: Record<SourceDocId, SourceDoc> = {
  "ops-manual-2022": {
    labelCs: "Manuál pro chod chapteru (BNI Chapter Operations Manual 2022-2023)",
    shortCs: "manuál",
    href: "/pravidla/zdroje/bni-chapter-operations-manual-2022-2023.pdf",
    sizeLabel: "1,7 MB",
    pageCount: 82,
  },
  "general-policies": {
    labelCs: "Pravidla BNI (BNI General Policies)",
    shortCs: "General Policies",
    href: "/pravidla/zdroje/bni-general-policies.pdf",
    sizeLabel: "153 kB",
    pageCount: 4,
  },
};

/** Odkaz na PDF na konkrétní straně (`#page=N` funguje hlavně na desktopu). */
export function sourceHref(ref: Pick<SourceLocation, "doc" | "page">): string {
  return `${SOURCE_DOCS[ref.doc].href}#page=${ref.page}`;
}

/** Text odkazu: „Otevřít PDF, strana 55 (PDF, 1,7 MB)". */
export function sourceLinkText(ref: Pick<SourceLocation, "doc" | "page">): string {
  return `Otevřít PDF, strana ${ref.page} (PDF, ${SOURCE_DOCS[ref.doc].sizeLabel})`;
}

/**
 * Krátké označení místa: u General Policies číslo pravidla, u manuálu
 * „manuál str. N" (texty T-005, „Zdroje, shrnutí u rozbalení").
 */
export function sourceShortRef(ref: SourceLocation): string {
  if (ref.doc === "general-policies" && ref.rule) return ref.rule;
  return `${SOURCE_DOCS[ref.doc].shortCs} str. ${ref.page}`;
}
