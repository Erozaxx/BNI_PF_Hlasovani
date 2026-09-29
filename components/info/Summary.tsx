/** Shrnutí, „Kde to najdeš" a legenda osy (arch 2 scéna 9, 11). */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { createRoleLinker, type RoleLinkOptions } from "@/lib/info-pages/glossary";
import { sourceHref, sourceLinkText, sourceShortRef } from "@/lib/info-pages/sources";
import type { InfoPage, VisualKind } from "@/lib/info-pages/types";
import { SUMMARY_ANCHOR } from "@/lib/info-pages/types";
import { RichText } from "./RichText";
import { renderLegend } from "./visuals/registry";

export function Summary<K extends VisualKind>({
  page,
  links,
}: {
  page: InfoPage<K>;
  links: RoleLinkOptions;
}) {
  const { summary } = page;
  const link = createRoleLinker(links);
  const points = summary.points.map((point) => link(point.text));
  const legend = renderLegend(page.visual, 3);
  return (
    <section
      id={SUMMARY_ANCHOR}
      aria-labelledby={`${SUMMARY_ANCHOR}-title`}
      className="info-summary mt-10 rounded-card border border-border bg-background px-4 py-6 sm:px-6"
    >
      <h2 id={`${SUMMARY_ANCHOR}-title`} className="text-2xl font-semibold leading-tight text-text-main">
        {summary.title}
      </h2>
      {summary.subtitle && <p className="mt-1 text-lg text-text-main">{summary.subtitle}</p>}
      <ol className="mt-5 list-decimal space-y-3 pl-6 text-lg leading-relaxed text-text-main">
        {points.map((segments, i) => (
          <li key={i}>
            <RichText segments={segments} />
          </li>
        ))}
      </ol>

      <h3 className="mt-8 text-xl font-semibold text-text-main">
        {TEMPLATE_TEXTS.sources.whereToFindTitle}
      </h3>
      <ul className="mt-3 space-y-3 text-base leading-relaxed text-text-main">
        {summary.whereToFind.map((ref, i) => (
          <li key={i}>
            <span className="font-medium">{sourceShortRef(ref)}</span>
            {ref.labelCs && (
              <>
                :{" "}
                {ref.href ? (
                  <a
                    href={ref.href}
                    className="rounded text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
                  >
                    {ref.labelCs}
                  </a>
                ) : (
                  ref.labelCs
                )}
              </>
            )}
            <br />
            <a
              href={sourceHref(ref)}
              target="_blank"
              rel="noopener"
              className="info-pdf-link rounded text-sm font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
            >
              {sourceLinkText(ref)}
            </a>
          </li>
        ))}
      </ul>

      {legend && <div className="mt-8">{legend}</div>}
    </section>
  );
}
