/**
 * Celá info stránka (server). Arch_iter-029_T-001 sekce 1, 6, 7, 9.
 *
 * Server vykreslí úplný článek (úvod, kroky, mini osy, fakta, zdroje).
 * `ScrollyStage` jen přidá sticky vizuál, když ho CSS zapne.
 */
import { TEMPLATE_TEXTS } from "@/content/pravidla/texty-sablony";
import { fillTemplate } from "@/lib/info-pages/format";
import type { ChapterNote, InfoPage, VisualKind, VisualStateMap } from "@/lib/info-pages/types";
import { SUMMARY_ANCHOR } from "@/lib/info-pages/types";
import { BranchBlock } from "./BranchBlock";
import { ComicHero } from "./ComicStrip";
import { ContactRoles } from "./ContactRoles";
import { InlineVisual } from "./InlineVisual";
import { PrintButton } from "./PrintButton";
import { PrintSources } from "./PrintSources";
import { ScrollyStage } from "./ScrollyStage";
import { StepScene } from "./StepScene";
import { Summary } from "./Summary";
import { hasVisual, renderLegend } from "./visuals/registry";

function collectStates<K extends VisualKind>(page: InfoPage<K>) {
  const states: { id: string; state: VisualStateMap[K] }[] = [];
  for (const step of page.steps) {
    if (step.type === "scene") states.push({ id: step.id, state: step.visual });
    else for (const option of step.options) states.push({ id: option.id, state: option.visual });
  }
  return states;
}

function Legend({ kind }: { kind: VisualKind }) {
  const L = TEMPLATE_TEXTS.legend;
  const visualLegend = renderLegend(kind, 2);
  return (
    <div className="info-legend-block mt-6 space-y-5 rounded-card border border-border px-4 py-4">
      <ul className="space-y-2 text-base leading-relaxed text-text-main">
        <li>
          <span className="inline-block rounded border-l-4 border-gold bg-gold-light px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-text-main">
            {TEMPLATE_TEXTS.chapterNote.label}
          </span>{" "}
          <span className="ml-1">{L.chapterNote}</span>
        </li>
      </ul>
      {visualLegend}
    </div>
  );
}

export function InfoPageView<K extends VisualKind>({
  page,
  notes,
  baseUrl,
}: {
  page: InfoPage<K>;
  notes: ChapterNote[];
  /** Adresa webu pro tisk (prázdná = jen cesta). */
  baseUrl: string;
}) {
  const withVisual = hasVisual(page.visual);
  const updated = fillTemplate(TEMPLATE_TEXTS.updated, { updated: page.updated });

  return (
    <article className="info-article" aria-labelledby="info-title">
      <header className={page.hero ? "info-header info-header--hero pt-6" : "info-header pt-6"}>
        <h1 id="info-title" className="text-3xl font-bold leading-tight text-text-main">
          {page.title}
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-text-main">{page.description}</p>
        {page.hero && <ComicHero panel={page.hero} />}
        <p className="mt-2 text-sm text-text-main">{updated}</p>
        <p className="info-print-only mt-1 text-sm text-text-main">
          {baseUrl}/pravidla/{page.slug}
        </p>
        <a
          href={`#${SUMMARY_ANCHOR}`}
          className="info-skip mt-4 inline-block rounded text-sm font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
        >
          {TEMPLATE_TEXTS.skipToSummary}
        </a>
      </header>

      <div className={withVisual ? "info-layout mt-6" : "info-layout info-layout--none mt-6"}>
        {withVisual && (
          <ScrollyStage kind={page.visual} initial={page.intro.visual} states={collectStates(page)} />
        )}
        <div className="info-flow min-w-0">
          <section className="info-intro pb-4" aria-label={page.intro.question}>
            <p className="text-xl font-semibold leading-snug text-text-main">{page.intro.question}</p>
            <div className="mt-4 space-y-4 text-lg leading-relaxed text-text-main">
              {page.intro.lead.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            <InlineVisual kind={page.visual} state={page.intro.visual} />
            <Legend kind={page.visual} />
          </section>

          {page.steps.map((step) =>
            step.type === "scene" ? (
              <StepScene key={step.id} scene={step} kind={page.visual} notes={notes} />
            ) : (
              <BranchBlock key={step.id} branch={step} kind={page.visual} notes={notes} />
            )
          )}
        </div>
      </div>

      <Summary page={page} />
      <ContactRoles contacts={page.contacts} />

      <footer className="info-disclaimer mt-10 space-y-2 border-t border-border pt-6 text-sm leading-relaxed text-text-main">
        {page.disclaimer.map((p, i) => (
          <p key={i}>{fillTemplate(p, { updated: page.updated })}</p>
        ))}
        <p className="pt-2 print:hidden">
          <PrintButton label={TEMPLATE_TEXTS.print} />
        </p>
      </footer>

      <PrintSources page={page} baseUrl={baseUrl} />
    </article>
  );
}
