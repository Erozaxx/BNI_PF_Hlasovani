/**
 * Rozcestí (arch 7.1). Možnosti pod sebou v pořadí z dat, dobrý konec
 * první (hlídá validátor). Barvu levého okraje řídí `tone`, ne `Card`
 * varianta `highlighted` (ta má pevně červený okraj).
 */
import { Card } from "@/components/ui/Card";
import type { Branch, BranchOption, ChapterNote, VisualKind } from "@/lib/info-pages/types";
import { ChapterNotes } from "./ChapterNoteBox";
import { ChapterSide } from "./ChapterSide";
import { ComicStrip } from "./ComicStrip";
import { InlineVisual } from "./InlineVisual";
import { SourceNote } from "./SourceNote";

const TONE_BORDER: Record<BranchOption<VisualKind>["tone"], string> = {
  good: "border-l-4 border-l-success",
  neutral: "border-l-4 border-l-border-strong",
  serious: "border-l-4 border-l-border-strong",
};

function NextLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="mt-4 inline-flex items-center gap-1.5 rounded text-base font-medium text-navy underline underline-offset-2 focus:outline-none focus-visible:shadow-focus"
    >
      {label}
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
        <path
          d="M6 2v7M3 6l3 3 3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

function OptionCard<K extends VisualKind>({
  option,
  kind,
  notes,
}: {
  option: BranchOption<K>;
  kind: K;
  notes: ChapterNote[];
}) {
  const titleId = `${option.id}-title`;
  // Možnost jen s odkazem dál (A2, A4): krátká karta bez mini osy.
  const linkOnly = option.chapter.length === 0 && Boolean(option.next);
  return (
    <div id={option.id} data-step={option.id} className="info-option" aria-labelledby={titleId} role="group">
      <Card className={TONE_BORDER[option.tone]}>
        <p className="text-sm font-semibold text-navy">{option.label}</p>
        <h3 id={titleId} className="mt-1 text-xl font-semibold leading-snug text-text-main">
          {option.title}
        </h3>
        {option.comic && <ComicStrip comic={option.comic} />}
        <div className="mt-3 space-y-4 text-lg leading-relaxed text-text-main">
          {option.story.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {!linkOnly && <InlineVisual kind={kind} state={option.visual} />}
        <ChapterSide facts={option.chapter} />
        <ChapterNotes ids={option.chapterNotes} notes={notes} />
        <SourceNote facts={option.chapter} summary={option.sourcesSummary} />
        {option.next && <NextLink href={`#${option.next}`} label={option.nextLabel ?? option.title} />}
      </Card>
    </div>
  );
}

export function BranchBlock<K extends VisualKind>({
  branch,
  kind,
  notes,
}: {
  branch: Branch<K>;
  kind: K;
  notes: ChapterNote[];
}) {
  const titleId = `${branch.id}-title`;
  return (
    <section id={branch.id} aria-labelledby={titleId} className="info-branch py-6">
      <h2 id={titleId} className="text-2xl font-semibold leading-tight text-text-main">
        {branch.question}
      </h2>
      <div className="mt-5 space-y-5">
        {branch.options.map((option) => (
          <OptionCard key={option.id} option={option} kind={kind} notes={notes} />
        ))}
      </div>
    </section>
  );
}
