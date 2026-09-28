/** Jedna scéna příběhu (hlavní linka nebo odbočka), arch 5, 6.6, 10. */
import type { ChapterNote, Scene, VisualKind } from "@/lib/info-pages/types";
import { ChapterNotes } from "./ChapterNoteBox";
import { ChapterSide } from "./ChapterSide";
import { ComicStrip } from "./ComicStrip";
import { InlineVisual } from "./InlineVisual";
import { SourceNote } from "./SourceNote";

export function StepScene<K extends VisualKind>({
  scene,
  kind,
  notes,
}: {
  scene: Scene<K>;
  kind: K;
  notes: ChapterNote[];
}) {
  const detour = scene.variant === "detour";
  const titleId = `${scene.id}-title`;
  return (
    <section
      id={scene.id}
      aria-labelledby={titleId}
      data-step={scene.id}
      className={
        detour
          ? "info-step info-step--detour rounded-card bg-background px-4 py-6 sm:ml-6 sm:px-6"
          : "info-step py-6"
      }
    >
      <p className="text-sm font-semibold text-navy">{scene.label}</p>
      <h2 id={titleId} className="mt-1 text-2xl font-semibold leading-tight text-text-main">
        {scene.title}
      </h2>
      {scene.comic && <ComicStrip comic={scene.comic} />}
      <div className="mt-4 space-y-4 text-lg leading-relaxed text-text-main">
        {scene.story.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <InlineVisual kind={kind} state={scene.visual} />
      <ChapterSide facts={scene.chapter} />
      <ChapterNotes ids={scene.chapterNotes} notes={notes} />
      <SourceNote facts={scene.chapter} summary={scene.sourcesSummary} />
    </section>
  );
}
