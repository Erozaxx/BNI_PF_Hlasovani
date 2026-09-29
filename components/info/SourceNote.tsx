/**
 * Zdroje kroku v nativním `<details>` (arch 7.4, 7.5). Bez JS funguje.
 * V tisku se tiskne jen `<summary>`, citace jsou v příloze `PrintSources`.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { formatSourcesSummary, uniqueSources } from "@/lib/info-pages/format";
import { SOURCE_DOCS, sourceHref, sourceLinkText } from "@/lib/info-pages/sources";
import type { Fact, SourceRef } from "@/lib/info-pages/types";

export function sourceHeading(ref: SourceRef): string {
  const parts = [SOURCE_DOCS[ref.doc].labelCs, `strana ${ref.page}`];
  if (ref.rule) parts.push(ref.rule);
  return parts.join(", ");
}

export function SourceQuote({
  source,
  withLink,
  prefix,
}: {
  source: SourceRef;
  withLink: boolean;
  /** Číslo citace v tiskové příloze („[3]"). */
  prefix?: string;
}) {
  return (
    <>
      <p className="text-sm font-medium text-text-main">
        {prefix ? `${prefix} ${sourceHeading(source)}` : sourceHeading(source)}
      </p>
      <blockquote
        lang="en"
        className="info-quote mt-1 border-l-2 border-border-strong pl-3 text-sm italic leading-relaxed text-text-main"
      >
        {source.quoteEn}
      </blockquote>
      {source.noteCs && <p className="mt-1 text-sm text-text-main">{source.noteCs}</p>}
      {withLink && (
        <a
          href={sourceHref(source)}
          target="_blank"
          rel="noopener"
          className="mt-1 inline-block rounded text-sm font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
        >
          {sourceLinkText(source)}
        </a>
      )}
    </>
  );
}

export function SourceNote({ facts, summary }: { facts: Fact[]; summary?: string }) {
  return <SourceDetails sources={uniqueSources(facts)} summary={summary} />;
}

/** Zdroje v `<details>` (fakta kroku, řádek tabulky situací, položka práv). */
export function SourceDetails({
  sources,
  summary,
  spacing = "mt-6",
}: {
  sources: SourceRef[];
  summary?: string;
  /** Odsazení nad rámečkem (Tailwind třída). */
  spacing?: string;
}) {
  if (sources.length === 0) return null;
  return (
    <details className={`info-sources ${spacing} rounded-card border border-border bg-surface px-4 py-3`}>
      <summary className="cursor-pointer rounded text-sm font-medium text-text-main focus:outline-none focus-visible:shadow-focus">
        {TEMPLATE_TEXTS.sources.summaryPrefix}
        {summary ?? formatSourcesSummary(sources)}
      </summary>
      <ul className="mt-3 space-y-4">
        {sources.map((source, i) => (
          <li key={i}>
            <SourceQuote source={source} withLink />
          </li>
        ))}
      </ul>
    </details>
  );
}
